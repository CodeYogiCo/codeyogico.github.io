---
date: 2026-06-03
tag: search
title: "Pre-filter and post-filter in vector search"
read: 10 min
deck: "The recall cliff, and how HNSW and ScaNN are built differently enough that pre-filtering works differently in each."
---

Filtered approximate nearest neighbor (ANN) search asks: find the k most similar vectors to this query *that also satisfy some predicate*. Two obvious strategies:

- **Post-filter**: run ANN over everything, take top-k, discard anything that fails the filter.
- **Pre-filter**: apply the filter first, search only the surviving candidates.

Both have failure modes. Understanding them properly means understanding the internals of the indexes, because the failure mode in each case is structural — it follows directly from how the index is built.

## the recall cliff in post-filter

Post-filter works when the filter is broad. The trouble starts when the filter gets selective. Say you have 1M vectors and the filter passes 0.1% — 1,000 items. Post-filter runs ANN over the full 1M and returns top-10. Statistically, around 0 of those 10 will be in your 1,000-item filtered set. You return almost nothing.

The fix is to over-fetch: retrieve top-5,000, filter, return 10. This works at moderate selectivity but the over-fetch multiplier grows with selectivity, and at some point you're doing more work than a brute-force search over the filtered set would have cost. That's the recall cliff — the point where over-fetching stops being cheaper than an alternative strategy.

## how HNSW is constructed

HNSW builds a layered proximity graph. When inserting a vector `v`:

1. Draw a random maximum layer `l` for `v` from an exponential distribution: `l = ⌊−ln(random()) × mL⌋`. Most vectors land at layer 0; a few reach layer 1; fewer still reach layer 2; and so on.
2. Starting from the top layer, do a greedy descent to find the insertion neighborhood at each level. At layers above `l`, just descend toward `v` to find a good entry point. At layers from `l` down to 0, connect `v` to its M nearest neighbors found by a beam search of width `ef_construction`.
3. The resulting graph has a hierarchy: upper layers have few nodes with long-range edges (good for fast global navigation), layer 0 has all nodes with short-range edges (good for precise local search).

**Search** follows the same structure. Given query `q`:

1. Enter at the top layer's entry point. Greedily descend through each layer, moving to whichever neighbor is closest to `q`, until you reach layer 0.
2. At layer 0, run beam search with exploration width `ef`: maintain a candidate priority queue `C` and a result set `W`. For each candidate popped from `C`, expand its neighbors, compute distances to `q`, and add promising ones back to `C` and `W`. Stop when no unvisited candidate in `C` is closer to `q` than the worst result in `W`.
3. Return top-k from `W`.

The parameter `ef` trades recall for speed: a larger `ef` explores more nodes and finds better approximate neighbors, at higher latency.

## why pre-filtering breaks HNSW

The upper layers exist to route you quickly to the right neighborhood. Layer 0 then does precise local search. Both depend on the graph being fully traversable — the greedy descent in the upper layers follows edges without restriction, and the beam search at layer 0 expands into any neighbor.

Naive pre-filtering — only visiting nodes that pass the predicate `P(v)` — breaks both phases. In the upper layers, if filtered-out nodes are the best routing hops toward the filtered-in neighborhood, you never get routed correctly. At layer 0, if the filtered set is sparse (say 0.1% of nodes), the local neighborhood around any filtered-in node will mostly contain filtered-out nodes. The beam search exhausts its candidates without finding enough filtered-in results.

More precisely: the M nearest neighbors stored per node were chosen to represent the full corpus, not the filtered subgraph. The filtered subgraph is a random 0.1% sample of nodes; its local connectivity via existing edges is terrible. The HNSW graph was never built to efficiently navigate *within* that subgraph.

## how HNSW can do pre-filtering algorithmically

The insight that makes runtime filtering work: **traverse freely, but gate the result set**.

Don't restrict which nodes go into the candidate queue `C`. Let the beam search expand into all neighbors as normal, so graph routing is preserved. But when deciding whether a node counts toward the `k` results you need, check `P(v)` first. Only filtered-in nodes go into `W`.

```
// Runtime-filtered beam search at layer 0
C ← priority queue seeded with entry point
W ← empty result set (max-heap, size ef)

while C not empty:
    c ← pop closest from C
    if distance(c, q) > distance(W.worst, q) and |W| >= k:
        break

    for each neighbor n of c:
        if n not visited:
            mark n visited
            d ← distance(n, q)
            if d < distance(W.worst, q) or |W| < ef:
                push n → C             // always explore
                if P(n):               // only count in results
                    push n → W

return top-k from W
```

This preserves connectivity. You still traverse filtered-out nodes as routing steps; you just don't count them. The cost: work proportional to the number of filtered-out nodes you visit. When selectivity is 0.1%, roughly 999 of every 1000 nodes visited are wasted traversal.

**ACORN** fixes this at index construction time rather than query time. The observation: the two-hop neighborhood of any node is much larger than its direct neighborhood. If you could expand two hops during search, you'd have many more chances to land on a filtered-in node without getting stranded.

ACORN builds a denser version of HNSW: for each node `u`, it stores not just its M nearest neighbors, but also a set of *neighbor-of-neighbor* links — the closest vectors reachable in two hops from `u`, up to a budget `M_β`. This augmented neighbor list is stored at index time.

At query time, the beam search uses this denser graph. When considering node `u`, instead of just expanding to its direct neighbors, the search expands through the two-hop list, which has been pre-populated with candidates that are topologically further but geometrically diverse. The chance that at least some of those candidates pass `P(v)` is much higher than with a standard M-neighbor list.

When a filter is extremely selective (less than ~1% of the corpus passes), even two-hop expansion can't maintain enough filtered-in candidates for good routing. At that threshold the right move is to give up on ANN entirely and do exact search over the pre-filtered candidate set. The crossover point — "when is brute force cheaper than ANN on the full index?" — depends on the filter size, dimensionality, and hardware, but it's usually in the range of a few hundred thousand vectors.

## how ScaNN is constructed

ScaNN uses a fundamentally different structure: a two-level partitioned quantization index.

**Level 1 — partitioning.** Run k-means over the corpus to produce `k` cluster centroids, where `k ≈ √N` (for N vectors, that's typically a few thousand clusters). Each vector is assigned to its nearest centroid. This produces `k` posting lists, one per cluster.

**Level 2 — quantization within each partition.** Within each cluster, encode every vector using *anisotropic vector quantization* (AVQ). Standard product quantization minimizes mean squared reconstruction error uniformly across all directions. AVQ does something more useful for similarity search: it penalizes quantization error in the direction parallel to the query vector more heavily than error in the perpendicular direction, because parallel-direction error degrades inner product estimates while perpendicular error mostly cancels out. The quantization codebooks are trained to minimize this weighted loss, not MSE.

The result: compact quantized codes that produce more accurate inner product estimates for the vectors that actually matter (high-similarity candidates), at the cost of worse estimates for low-similarity ones. This is a good trade.

**Search** runs in three phases:

1. **Partition scoring.** Score all `k` cluster centroids against the query. Select the top `t` clusters to search (e.g., `t = 10%` of `k`). Vectors in the other 90% of clusters are never touched.
2. **Quantized in-partition scoring.** For each of the `t` selected clusters, score every quantized vector against the query using AVQ inner product estimation. This is fast: it's table lookups over the pre-computed quantization codebook, not float multiply-accumulates over the full vector dimension.
3. **Exact rescoring.** Take the top-c candidates from phase 2, compute exact distances, return top-k.

## why pre-filtering is structurally different in ScaNN

ScaNN's phases are independent. There is no routing graph. Vectors in cluster A are scored; vectors in cluster B are scored; the two scoring passes are completely independent. Skipping a vector in cluster A has no effect on your ability to find vectors in cluster B.

This means the predicate `P(v)` can be applied at either level without breaking anything:

**At partition level**: before phase 2, check whether a cluster contains any filtered-in vectors (this requires a per-cluster filter summary, e.g., a bitset or posting list). If a cluster has zero matching vectors, skip quantized scoring for that entire cluster. This saves work proportional to cluster size times filter selectivity.

**At vector level**: during phase 2, before computing the quantized distance for a candidate, check `P(v)`. If it fails, skip the distance computation entirely. The per-vector overhead is a single predicate check; the savings scale with filter selectivity.

Both can be applied together: prune empty clusters first, then gate individual vector scoring inside the surviving clusters.

The key difference from HNSW: in ScaNN there are no "routing nodes." Every vector is just a thing to score. You can skip any of them without affecting your ability to find any other vector. Pre-filtering in ScaNN reduces the number of score operations without touching the structural invariant of the index. Pre-filtering in HNSW reduces the number of usable graph edges, which breaks the structural invariant of the index and requires either tolerating wasted traversal or rebuilding the graph to be denser.

## the structural lesson

The reason pre-filtering is hard in HNSW and comparatively straightforward in ScaNN is not a design choice — it's a consequence of what each index is fundamentally doing. HNSW is a routing structure: the graph edges exist to navigate you from anywhere in the space to the right neighborhood. Any node can be a routing hop, so removing nodes (via filtering) degrades navigation. ScaNN is a scoring structure: the partitioning and quantization exist to reduce the number of distance computations, but scoring is independent per vector. Filtering just reduces the work.

Both approaches reach the same practical answer at extreme selectivity: below a certain threshold, brute force on the filtered set is cheaper than using the ANN index at all. The difference is how much engineering you need between "the ANN index" and "brute force on the filtered set" to handle the middle of the selectivity range.

— v
