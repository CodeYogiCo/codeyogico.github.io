---
date: 2026-06-03
tag: search
title: "How ScaNN works"
read: 9 min
deck: "Google's vector search algorithm from the ground up — with diagrams. Partitioning, approximate scoring, and why compression isn't just compression."
---

You're running an e-commerce search engine. A user types "red running shoes" and you want to find the 10 most relevant products — not just keyword matches, but semantically similar ones. You have 10 million product embeddings. You need a result in under 50 milliseconds.

The obvious approach — compare the query vector to every product, rank by similarity, return top 10 — is too slow at that scale. 10 million dot products, 768 dimensions each, at every query.

ScaNN (Scalable Nearest Neighbors) is Google's solution. It's been open-sourced since 2020 and underlies several of Google's production retrieval systems. It solves the speed problem in three phases, each built on a specific insight about the structure of similarity search.

## the three phases

<div data-widget="scann-pipeline"></div>

ScaNN breaks the search into three stages, each dramatically narrowing the candidate set:

1. **Partitioning** — group the corpus into neighborhoods, search only the most relevant ones.
2. **Approximate scoring** — use compressed vectors for fast similarity estimates.
3. **Exact rescoring** — rerank a small shortlist with precise dot products.

## phase 1: partitioning

The core idea: most of the corpus is irrelevant to any given query. Before scoring anything, figure out *where in the space* the answer probably lives — then only look there.

ScaNN runs k-means clustering on the corpus at index time. This groups all 10 million products into `k` clusters — neighborhoods of similar items. Each cluster has a centroid (its average position).

At query time:

1. Score the query against all `k` centroids. This is cheap: just `k` dot products.
2. Pick the top `t` closest centroids — the most promising neighborhoods.
3. Score only the vectors inside those `t` clusters.

A practical rule of thumb is `k ≈ √N`. With 10M products, that's roughly 3,000 clusters of ~3,000 vectors each. If you search the top 100 clusters, you're scoring 300,000 vectors instead of 10 million — a 33× speedup before any other optimization.

<div data-widget="scann-partition"></div>

Toggle the query above to see how different searches land in different parts of the product space. The key point: vectors outside the searched clusters are never touched — no memory reads, no dot products.

The tradeoff dial is `t` (how many clusters to search). More clusters → better recall, higher latency. Most production systems search 3–10% of clusters.

## phase 2: approximate scoring

After partitioning, you still have ~300,000 vectors to score. Doing exact dot products for all of them is still expensive — 300,000 × 768-dimensional float multiplications, repeated for every query.

ScaNN compresses the vectors. The technique is **quantization**: instead of storing each vector as 768 float32 numbers, store it as a compact code that's fast to compare.

Here's how it works. At index time, ScaNN groups each vector's dimensions into sub-blocks and builds a small "codebook" of reference patterns for each block. A 768-dimensional vector might be split into 8 blocks of 96 dimensions, with a 256-entry codebook per block. Each vector is then encoded as 8 numbers (codebook indices), one per block — instead of 768 floats.

At query time, ScaNN precomputes the dot product between the query and every codebook entry (8 blocks × 256 entries = 2,048 lookups). Then scoring any compressed vector is just 8 table lookups and an addition — dramatically faster than a full dot product.

This is product quantization (PQ), and it's standard. What makes ScaNN different is *how* it trains the compressor.

## the key insight: compress where it matters

Standard PQ trains the codebooks to minimize reconstruction error — the distance between the original vector and its compressed version, averaged uniformly across all directions. That sounds right, but it's the wrong goal for search.

Here's why. When you compress a vector `x` to `x̃`, you introduce an error `e = x̃ − x`. That error shows up in your similarity estimates: instead of computing the true dot product `⟨q, x⟩`, you compute the approximate `⟨q, x̃⟩`. The difference is `⟨q, e⟩`.

Now split the error into two parts: one component pointing in the same direction as `x` (parallel), and one pointing sideways (perpendicular).

<div data-widget="scann-error"></div>

Step through the diagram above. The key observation at step 3: when `q` and `x` are similar (roughly aligned — which they must be for `x` to be a relevant result), the query `q` is approximately parallel to `x`. That means:

- **Parallel error** `e∥` is in a direction `q` is sensitive to — it directly changes the dot product estimate.
- **Perpendicular error** `e⊥` is in a direction `q` is mostly blind to — it largely cancels out.

Standard PQ treats both error types equally. **Anisotropic vector quantization (AVQ)** — ScaNN's approach — penalizes parallel error more during training. The quantizer learns codebooks that are more accurate in the direction that matters for ranking, accepting more perpendicular error in exchange.

Same compression ratio. Better ranking of the results that actually matter.

## phase 3: exact rescoring

After approximate scoring, you have a ranked shortlist of ~200 candidates. Quantization errors can scramble this list slightly — an item that should be rank 3 might appear at rank 11.

The fix is straightforward: take those 200 candidates and compute their exact dot products. Rerank. Return top 10.

This is fast because you're doing exact arithmetic on 200 vectors, not 10 million. The expensive part was finding those 200. Rescoring them is cheap — and it brings accuracy back close to brute-force quality.

The three phases form a cost pyramid:

| phase | candidates | cost |
|---|---|---|
| centroid scoring | 3,000 centroids | cheap |
| AQ scoring | ~300,000 vectors | fast (table lookups) |
| exact rescoring | ~200 candidates | fast (small count) |
| brute force | 10,000,000 vectors | too slow |

## SOAR: the boundary problem

There's a subtle failure mode in the partitioning phase. Each vector is assigned to exactly one cluster — its nearest centroid. But vectors near the boundary between two clusters can fall through the cracks.

Imagine a product that's borderline between "running shoes" and "athletic footwear." Its true nearest centroid says "athletic footwear," but queries for running shoes mostly search the "footwear" cluster. If that cluster isn't in the top-t for the query, the product is never scored.

This is the boundary recall problem: a correct result gets missed because its assigned cluster wasn't selected, even though it's very similar to the query.

**SOAR** (NeurIPS 2023) fixes this by assigning each boundary vector to *two* clusters instead of one. The secondary cluster is chosen so that its centroid is a good proxy for the vector from the perspective of likely queries. Specifically: the residual from the backup centroid should be nearly perpendicular to typical query directions — ensuring queries that would want this vector will find it via the backup cluster.

The cost is roughly 2× storage for boundary vectors. The benefit is meaningfully better recall without searching more clusters.

## pre-filtering: searching a subset

One more thing ScaNN handles cleanly. Suppose the user adds a filter: "red running shoes, under $100." You need similar products *and* matching the price constraint.

The naive approach (post-filter): find the 10 most similar products, then apply the filter. If only 1% of products are under $100, most results get discarded. You return 1 product instead of 10.

ScaNN supports filtering *during* scoring rather than after:

- **At the cluster level**: skip any cluster that contains zero products matching the filter. No quantized scoring at all for those clusters.
- **At the vector level**: inside a selected cluster, skip any vector that fails the filter before computing its approximate dot product.

This works cleanly because ScaNN's scoring is independent per vector — there's no graph to navigate, no connectivity to preserve. Skipping a vector just means not scoring it. The remaining vectors are still found correctly.

## putting it together

Each phase of ScaNN answers one question:

- **Partitioning** — where in the space should we look?
- **AQ scoring** — how cheaply can we score candidates there?
- **Rescoring** — how accurately do we finalize the ranking?

The interesting design is the compression. Anisotropic quantization isn't just an implementation tweak — it reflects a real asymmetry in similarity search: the error that corrupts ranking is directional. The error in the query's direction matters; error sideways mostly doesn't. Spending the compression budget to reduce directional error is the right trade, and it's why ScaNN consistently outperforms standard PQ on recall benchmarks at the same compression ratio.

— v
