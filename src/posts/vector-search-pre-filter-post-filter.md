---
date: 2026-06-03
tag: search
title: "How ScaNN works"
read: 8 min
deck: "Google's vector search algorithm explained with analogies — partitioning, approximate scoring, and why compression isn't just compression."
---

You're building a music recommendation system. You have 100 million songs. A user plays one and you want to find the 10 most similar songs — instantly, every time.

The obvious approach: compare the query song to every other song, rank by similarity, return top 10. That's 100 million comparisons per request. At any real scale, that's too slow.

ScaNN is Google's solution to this problem. It's the algorithm behind several of Google's production search and recommendation systems, open-sourced in 2020. It solves the speed problem in three phases, and each phase has a neat idea behind it.

## first: what is "similarity" here?

Before the algorithm, a quick grounding. In vector search, each item (a song, a product, a document) is represented as a list of numbers — a *vector*. These numbers capture some learned sense of the item's meaning or character: similar items end up with similar vectors.

Similarity between two vectors is usually measured as a dot product: multiply each pair of corresponding numbers and add them up. A high result means the vectors are pointing in the same direction — the items are similar. This is called MIPS: Maximum Inner Product Search. ScaNN is built to do MIPS fast.

## phase 1: partitioning — stop searching everywhere

The first idea is simple: **don't look at everything**.

Think of a library with 100,000 books. If you want books similar to a mystery novel you enjoyed, you don't start at shelf A1 and check every book. You walk to the mystery section. You've already cut the search down to a few thousand books.

ScaNN does the same thing. At index time, it runs k-means clustering on all the vectors and groups them into *k* clusters — neighborhoods of similar vectors. Each cluster has a centroid, which is the average point at the center of that group.

At query time:

1. Score the query against all `k` centroids. This is cheap — just `k` comparisons.
2. Pick the top `t` most similar centroids (the most promising neighborhoods).
3. Only look at vectors inside those `t` clusters.

With 10 million vectors and `k = 3,000` clusters (~√10M), each cluster holds about 3,000 vectors. If you search the top 100 clusters, you're scoring 300,000 vectors instead of 10 million — a 33x reduction before doing anything else.

The dial here is `t`: how many clusters to search. More clusters → better results → higher latency. In practice, searching 3–10% of clusters gives good recall for most datasets.

## phase 2: approximate scoring — compress the vectors

After partitioning you still have hundreds of thousands of vectors to score. Storing 10 million vectors at 768 dimensions in full precision is ~30GB. Doing exact dot products across that is expensive even after the partitioning step.

So ScaNN compresses the vectors. The technique is called **quantization** — instead of storing each vector precisely, you store an approximation that's cheap to compute with.

Here's the analogy: think of your music taste as a point on a map. Storing your exact location takes many decimal places. Instead, you just say "I'm in neighborhood #42." You lose some precision, but you can compare neighborhoods cheaply.

In quantization, ScaNN pre-computes a "codebook" of reference vectors during index building. Each database vector is then encoded as a sequence of references into that codebook — a short code instead of a full vector. At query time, ScaNN pre-computes how similar the query is to each codebook entry, then scores every compressed vector via fast table lookups instead of full dot products.

This is dramatically faster. You're looking up pre-computed numbers in a small table, not doing hundreds of floating-point multiplications per vector.

## the clever part: compression that cares about what matters

Standard compression minimizes error uniformly — it tries to reconstruct each vector as accurately as possible in all directions, equally. That sounds right. But for similarity search, it's the wrong goal.

Here's why. You only care about getting the *ranking* right for the vectors with the *highest* similarity to your query. The vector at rank 47,000 can have a completely wrong approximate score and it doesn't matter — you were never going to return it.

And here's the key geometry: vectors with high similarity to your query tend to be *pointing in the same direction* as your query. If you think of the query as an arrow, the relevant results are other arrows roughly aligned with it.

When you compress a vector and introduce a small error, that error can be decomposed into two parts:
- **parallel error** — error in the direction the vector is pointing
- **perpendicular error** — error in the sideways directions

For two arrows pointing roughly the same way, the parallel error is what throws off the dot product between them. Perpendicular error mostly cancels out when you compute the dot product.

Standard quantization treats both error types equally. **Anisotropic vector quantization (AVQ)** — ScaNN's approach — penalizes parallel error more heavily during training. The result: the compressed vectors are more accurate in the direction that matters for ranking, at the cost of being slightly less accurate sideways.

A concrete analogy: imagine rating restaurants by how much you'd enjoy them. You care a lot about cuisine type (Italian vs. Thai) and not much about how many plants are in the decor. Good compression for *you specifically* would preserve cuisine type precisely and be approximate on the plants. ScaNN does the same — it figures out which "directions" matter for inner product search and compresses to be accurate there.

The practical effect: at the same compression ratio, AVQ produces better ranking of the top results than standard quantization does. You're not paying more — you're spending the same compression budget more wisely.

## phase 3: rescoring — clean up the ranking

Approximate scoring gives you a rough ranked list. It's good but not perfect — the item that should be rank 2 might have slipped to rank 8 due to compression error.

The fix is cheap: take the top-c candidates from phase 2 (say, the top 200), and compute their exact similarity scores. No compression, no shortcuts — just the real dot product. Rerank those 200 and return the final top 10.

This works because `c` is tiny compared to `N`. You did the hard work narrowing from 10 million to 200. Re-scoring 200 vectors exactly is fast. The cost is proportional to `c`, not `N`.

The full pipeline then looks like:

```
10,000,000 vectors
   → partition: score 3,000 centroids → pick top 100 clusters
   → approximate score: ~300,000 vectors via fast table lookups → top 200
   → exact rescore: 200 vectors → top 10 returned
```

Each step is much faster than the one before, and the final answer is nearly as accurate as searching everything exactly.

## SOAR: the problem at the borders

There's a subtle issue with single-cluster assignment. A vector sitting near the boundary between two clusters might belong to cluster A, but some queries that would love that vector happen to search only cluster B.

It's like a book about "spy thrillers" that could reasonably sit in either the Mystery section or the Thriller section. If the librarian files it in Mystery but a reader browsing Thrillers would have loved it, they never find it.

SOAR (Google, NeurIPS 2023) fixes this by assigning borderline vectors to **two** clusters instead of one. The primary cluster is the nearest centroid as normal. The secondary cluster is chosen with a specific rule: pick the backup cluster such that its centroid is a good proxy for this vector *from the perspective of likely queries*.

The math behind choosing the secondary cluster is what gives SOAR its name (Spilling with Orthogonality-Amplified Residuals), but the intuition is: find a backup neighborhood where queries that would want this item are likely to look. The vector gets a second chance to be found without you having to search more clusters.

The cost: each borderline vector appears in two posting lists, so storage increases by up to 2x. The benefit: meaningfully better recall at the same search latency.

## pre-filtering: searching a subset

One last thing ScaNN handles cleanly: filters. "Find similar songs — but only from artists I follow."

The naive approach (post-filtering) finds the 10 most similar songs from 100M, then checks if you follow the artist. If you follow 1% of artists, 9 of those 10 results get discarded. You return 1 song instead of 10.

ScaNN can apply the filter *during* scoring instead of after. At the cluster level, it skips entire clusters that contain no songs from artists you follow. At the vector level, it skips individual vectors that don't match the filter before computing any approximate score.

This works because ScaNN's phases are independent scoring steps — there's no graph to navigate, no requirement that all vectors be reachable. You can freely skip any vector and the remaining ones are still found correctly. Filtering just reduces work; it doesn't break anything structural in the index.

## the shape of the algorithm

Each phase of ScaNN answers one question:

- **Partitioning** — *where* in the space should we look?
- **Approximate scoring (AVQ)** — *how cheaply* can we score vectors there?
- **Rescoring** — *how accurately* do we finalize the ranking?

The interesting part is the compression. Anisotropic quantization isn't just an implementation detail — it reflects a real insight about what makes MIPS different from generic vector compression. The error that matters is the error in the direction the query is pointing. Spend your compression budget there.

— v
