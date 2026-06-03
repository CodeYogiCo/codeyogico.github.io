---
date: 2026-06-03
tag: search
title: "How ScaNN works"
read: 11 min
deck: "A walk through the three phases of ScaNN — partitioning, anisotropic quantization, and rescoring — and why each one exists."
---

Most vector indexes are solving the same problem: given a query vector `q` and a corpus of `N` vectors, find the k vectors with the highest similarity to `q` without computing all N distances. The naive approach — score every vector, sort, return top-k — is exact but doesn't scale past a few hundred thousand vectors at low latency.

ScaNN (Scalable Nearest Neighbors) is Google's answer to this problem. It was open-sourced in 2020 and underpins several of Google's production retrieval systems. The reason it's worth understanding in detail is that it makes a non-obvious design choice at each phase, and understanding *why* those choices were made tells you something useful about the structure of the MIPS problem itself.

MIPS stands for Maximum Inner Product Search — find vectors with the highest dot product with the query. Cosine similarity reduces to this when vectors are normalized, so MIPS covers most practical similarity search.

## the three phases

ScaNN decomposes search into three sequential phases:

1. **Partitioning** — reduce the candidate pool by only searching the most promising partitions of the corpus.
2. **Scoring** — approximate inner products for all candidates in those partitions, quickly.
3. **Rescoring** — rerank the top candidates with exact inner products.

Each phase is independently optional, but for large corpora (100k+ vectors) you want all three. The combination gives you the accuracy of exact search at a fraction of the cost.

## partitioning

The partitioning phase divides the corpus into `k` clusters using k-means. Each database vector `x` is assigned to the centroid it is closest to. At index time this is just training a k-means model. At query time the payoff comes: rather than scoring all N vectors, ScaNN scores all `k` centroids first, picks the top `t` clusters, and only runs the inner scoring phase on vectors inside those clusters.

If `k = √N`, then each cluster contains roughly `√N` vectors. Searching `t` clusters means scoring `t·√N` vectors instead of N. With `t = 0.1·k`, that's `0.1·√N·√N = 0.1N` — a 10x reduction in work before the expensive scoring phase even starts.

The parameter `t` (`num_leaves_to_search` in the ScaNN API) is the primary recall-vs-speed dial. More clusters searched means higher recall and higher latency. Typical values search 1–10% of clusters.

The rule of thumb `k ≈ √N` comes from minimizing the total work: `k` centroids to score in phase 1, `N/k` vectors per cluster to score in phase 2. Total work is roughly `k + N/k`, which is minimized at `k = √N`. At that point both terms equal `√N`, giving `O(√N)` total work versus `O(N)` for brute force.

## scoring: why standard quantization isn't enough

Inside each selected cluster, ScaNN needs to score every vector. A corpus of 10M vectors with 768 dimensions, stored as float32, is 30GB. Computing exact dot products for all vectors in the top-t clusters is expensive even after partitioning. The scoring phase compresses those vectors.

The standard approach is **product quantization (PQ)**: split each high-dimensional vector into sub-vectors, quantize each sub-vector independently to a small codebook (e.g., 256 centroids per sub-vector), and represent the full vector as a sequence of codebook indices. Dot products can then be computed with lookup tables — precompute the dot product between the query and each of the 256 codebook entries per sub-vector, then score each compressed vector by summing lookups.

PQ minimizes mean squared reconstruction error: it trains the quantizer to minimize `E[‖x − x̃‖²]` uniformly across all directions. This is a reasonable default, but it's the wrong objective for MIPS.

## anisotropic quantization: the key insight

The dot product between query `q` and database vector `x` is `⟨q, x⟩`. When you quantize `x` to `x̃`, you compute `⟨q, x̃⟩` instead. The error in the inner product estimate is:

```
⟨q, x̃⟩ − ⟨q, x⟩  =  ⟨q, x̃ − x⟩  =  ⟨q, e⟩
```

where `e = x̃ − x` is the quantization error vector.

Now decompose `e` relative to `x`:

```
e  =  e_∥  +  e_⊥

e_∥  =  (e · x̂) x̂      // component parallel to x
e_⊥  =  e − e_∥          // component orthogonal to x
```

The inner product error becomes `⟨q, e_∥⟩ + ⟨q, e_⊥⟩`.

Here is the asymmetry that ScaNN exploits: **MIPS cares only about the vectors that have high inner products with `q`**. Those are the vectors roughly aligned with `q`. For such a vector `x`, the query `q` is approximately parallel to `x`, so `q ≈ α x̂` for some scalar `α`. That means:

```
⟨q, e_∥⟩  ≈  α · ‖e_∥‖       // large: q is roughly in the x direction
⟨q, e_⊥⟩  ≈  0               // small: q is roughly orthogonal to e_⊥
```

The parallel component of quantization error directly corrupts the inner product estimate for the vectors MIPS most cares about. The orthogonal component mostly cancels. Yet standard PQ weights both equally — it minimizes `‖e‖² = ‖e_∥‖² + ‖e_⊥‖²`.

**Anisotropic vector quantization (AVQ)** replaces the MSE loss with a weighted loss that penalizes the parallel component more heavily:

```
loss(e) = η · ‖e_∥‖²  +  ‖e_⊥‖²      where η > 1
```

Training the quantizer under this loss produces codebooks where `x̃` tracks `x` more closely in the direction of `x` itself, at the cost of more residual error in perpendicular directions. That's the right trade for MIPS: you sacrifice accuracy on the inner product components that don't affect which vectors rank highest, and gain accuracy on the component that does.

Concretely: the anisotropic codebooks give better inner product estimates for the high-similarity candidates (the ones you're actually going to return), and slightly worse estimates for the low-similarity ones. You were never going to return the low-similarity ones anyway.

The parameter `anisotropic_quantization_threshold` in ScaNN controls `η` — how aggressively to weight the parallel component. Setting it to 0.2 is a common default; tuning it on your data distribution matters.

## rescoring

The quantized scoring phase returns a ranked list of approximate top-candidates, not exact results. AVQ is better than PQ at ranking them correctly, but approximation errors still produce small ranking mistakes — a vector ranked 12th by approximation might actually belong in the top 5.

The rescoring phase takes the top-c candidates from the scoring phase (with `c > k`, typically a few hundred) and recomputes exact inner products for each. The final top-k are drawn from these exact scores.

This is cheap because `c ≪ N`. The expensive part was identifying the `c` candidates worth exact-scoring; rescoring `c` vectors in exact arithmetic is fast. The `reordering_num_neighbors` parameter controls `c`. Higher values improve recall at the cost of more exact dot products.

The accuracy-cost budget works like this: partitioning controls how many clusters you search (first filter), quantization controls how cheaply you score each candidate inside those clusters (second filter), and rescoring controls how accurately you rerank the survivors (final refinement).

## SOAR: the boundary problem

Standard ScaNN assigns each database vector to exactly one cluster — its nearest centroid. This creates a boundary recall problem: a vector sitting near the boundary between two clusters might be the correct result for a query, but if the query's top-t clusters happen to include only one side of the boundary, that vector is never scored.

This is especially harmful for vectors where the quantization residual (the difference between the vector and its assigned centroid) is large and **parallel** to likely query directions. When the residual is parallel to `q`, the centroid is a poor representative of `x` from the query's perspective — `⟨q, centroid⟩` underestimates `⟨q, x⟩`, so the cluster gets deprioritized and the vector gets missed.

**SOAR** (Spilling with Orthogonality-Amplified Residuals, NeurIPS 2023) fixes this by assigning each vector to a primary cluster *and* a secondary cluster, chosen so that its residual from the secondary centroid is near-orthogonal to typical query directions.

The intuition: if the residual from a backup centroid is orthogonal to `q`, then `⟨q, x⟩ ≈ ⟨q, c_2⟩` — the backup centroid is a good proxy for `x` in the inner product sense, so queries similar to `x` will include the backup cluster in their top-t. The vector gets a second chance to be found.

The "orthogonality-amplified" part of the name refers to how the secondary centroid is selected: not simply the second-nearest centroid, but the centroid whose residual direction has the smallest component parallel to `x`. This is a geometric condition on the backup assignment that maximizes query coverage.

In practice, SOAR increases storage by roughly 2x (each vector appears in two posting lists), but the recall improvement at a fixed number of clusters searched is significant — you get better coverage of boundary vectors without searching more clusters.

## pre-filtering

One useful property of ScaNN's structure follows from partition independence.

Filters in vector search narrow the candidate set: "find similar vectors, but only among vectors where `P(v)` is true." Post-filtering — run ANN, then apply the filter — loses recall when the filter is selective, because most of the top-k candidates get discarded.

ScaNN supports pre-filtering at two levels:

**Partition level**: at query time, before scoring any vectors, check whether each selected cluster contains any filtered-in vectors. If a cluster is entirely filtered out, skip it. This requires a small per-cluster filter summary (a bitset or a per-value posting list), but saves the entire quantized scoring pass for empty clusters.

**Vector level**: during quantized scoring inside a cluster, check `P(v)` before computing the approximate inner product. Vectors that fail the filter are skipped. The per-vector overhead is a single predicate check.

Neither operation breaks the index. ScaNN's phases are independent scoring passes over pre-selected candidates — there is no routing graph, no connectivity requirement, no assumption that all vectors are reachable. Skipping any subset of vectors only affects which candidates appear in the output; it doesn't affect the index's ability to find other candidates. This is structurally different from graph-based indexes, where skipping nodes during traversal can disconnect the routing path to good results. In ScaNN, each vector is just a thing to score, and not scoring it is free.

## putting it together

ScaNN at full scale runs:

1. Score `k` cluster centroids against `q` → select top-`t` clusters.
2. Score all quantized vectors in those `t` clusters against `q` using AVQ lookups → collect top-c approximate candidates.
3. Exact-score the top-c candidates → return top-k.

The parameters — `k`, `t`, `c` — are independently tunable. More clusters (higher `k`) means finer partitioning and better recall at fixed `t/k`; more clusters searched (higher `t`) means higher recall at higher latency; more rescoring candidates (higher `c`) means more accurate final ranking at the cost of more exact dot products.

What makes ScaNN worth studying is that each phase embodies a precise answer to a precise question: *where* in the corpus should we look (partitioning), *how cheaply* can we score candidates there (AVQ), and *how accurately* do we finalize the ranking (rescoring). The anisotropic quantization is the part that departs furthest from convention — and it's the part that matters most, because the error it avoids is the error that MIPS gets wrong on standard PQ.

— v
