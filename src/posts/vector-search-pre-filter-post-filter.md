---
date: 2026-06-03
tag: search
title: "Pre-filter and post-filter in vector search"
read: 9 min
deck: "The recall cliff, why HNSW graphs break under selective filters, and how ACORN and ScaNN each navigate the trade-off."
---

Imagine you're building a product search. The user uploads a photo of a handbag and asks to see similar items — under $200, in stock. The "under $200, in stock" part is a **filter**. The "similar to this photo" part is a **vector search**. Combining them is called filtered approximate nearest neighbor (ANN) search, and it's harder than it looks.

There are two obvious strategies: apply the filter before the vector search, or after. The naming is what you'd expect.

- **Post-filter**: run ANN over everything, take top-k results, discard anything that fails the filter.
- **Pre-filter**: apply the filter first, search only the surviving candidates.

Both strategies have a failure mode. Understanding those failure modes is how you get to why HNSW and ScaNN are built the way they are.

## post-filter and the recall cliff

Post-filter works when the filter is broad. If 80% of your corpus passes the filter, you fetch the top-10 by similarity, filter out 2 of them, return 8. Close enough — you might bump the fetch to top-15 and be done with it.

The trouble starts when the filter gets selective. Say you have 1 million products and the filter passes 0.1% — 1,000 items. ANN returns its top-10 by vector similarity over the full 1M corpus. Statistically, around 0 or 1 of those 10 will be in your 1,000-item filtered set. You return almost nothing.

The fix is to over-fetch — retrieve top-1,000 instead of top-10, filter, return 10. But now you're doing 100x more work than you wanted, and your latency looks like it. For filters at 0.01% selectivity, even top-10,000 might not be enough. Post-filter recall drops sharply as filter selectivity increases. That drop is the recall cliff.

The fundamental problem: you can't know ahead of time how many ANN candidates you need to over-fetch. The number depends on the filter selectivity, which depends on the data distribution and the specific query — both of which change constantly.

## pre-filter and why it breaks ANN

Pre-filter sounds like the fix: narrow the corpus first, then search it. If the filter leaves 1,000 documents, you're doing nearest neighbor search over 1,000 vectors — cheap!

Here's the catch. The ANN index was built over the full corpus. It doesn't know about your filter. You can't simply ask it to "search only these 1,000 vectors."

**Brute force on the filtered set** is the obvious escape hatch, and it actually works when the filtered set is small enough. At 1,000 vectors, exact search over floats is fast. At 100,000, latency starts to matter. At 10M, it's not viable.

The hard zone is the middle — filters selective enough to defeat post-filter recall, but not selective enough for brute force on the filtered set to be fast. Tens or hundreds of thousands of candidates. This is where HNSW and ScaNN diverge.

## what happens when you pre-filter inside HNSW

HNSW is a layered graph. Each node connects to its nearest neighbors at multiple granularity levels. Search is greedy: start at an entry node, follow whichever neighbor edge points closest to the query, repeat until you can't improve. The "small world" property guarantees you reach approximate nearest neighbors in `O(log n)` hops.

Naive pre-filtering breaks this. During traversal, you'd skip any node that fails the filter. If the filtered set is sparse — say 0.1% of nodes — the graph becomes effectively disconnected from your perspective. The greedy walk gets stuck at a locally optimal filtered-in node, unable to reach globally better candidates because every path to them passes through filtered-out nodes you're ignoring.

The core tension: HNSW's routing logic assumes you can traverse any node. Pre-filtering violates that assumption.

### weaviate's original approach

Follow all graph links during traversal — even through filtered-out nodes — but only accept filtered-in nodes into the result set. Graph connectivity is preserved; you still reach good candidates. The cost: you do real work visiting nodes you'll discard. When the filter is moderately selective this is fine. When it's very selective, most of your traversal is wasted.

### ACORN

The [2024 paper from Patel et al.](https://arxiv.org/html/2403.04871v1), now implemented in Weaviate. The insight is to fix the graph rather than patch the traversal.

ACORN builds a **denser** version of HNSW — each node stores more neighbors than standard HNSW, parameterized by an expansion factor. At query time, rather than following normal edges and hoping they lead to filtered-in nodes, ACORN does **two-hop expansion**: from each candidate node, expand through its neighbors' neighbors to find the next valid filtered-in step. This keeps the traversal from getting stranded at disconnected pockets of the filtered subgraph.

ACORN handles both the "filter is uncorrelated with query" case (where the local neighborhood happens to contain few filtered-in nodes) and the highly selective case. When filter selectivity drops below a threshold — roughly 1% — ACORN falls back to exact search on the filtered candidate set, since brute force becomes cheaper than ANN traversal.

### qdrant's filterable HNSW

Qdrant takes a different approach: maintain a separate inverted index over filter fields ("payload"), and adapt strategy at query time based on estimated selectivity.

- **High selectivity** (tiny filtered set): skip HNSW entirely, do exact search over the payload index results. Fast because candidate count is small.
- **Moderate selectivity**: use a modified HNSW that adds extra cross-links between payload-indexed segments, ensuring filtered nodes remain reachable during traversal.
- **Low selectivity** (broad filter): standard HNSW traversal with post-filtering.

The planner picks the strategy at query time. The filtering strategy isn't a config value — it's an optimization decision made per query.

### lucene / elasticsearch

Similar adaptive behavior. If the filter bitset is small enough, Lucene does exact search over the bitset instead of HNSW traversal. Otherwise, it runs HNSW with the bitset applied as a gate during graph exploration. The threshold is tuned empirically.

## how ScaNN handles it

ScaNN uses a different index structure: a two-level system combining **space partitioning** with **quantized distance scoring**. It first partitions the corpus into clusters via k-means. At query time: (1) use the tree to identify the most promising partitions, (2) rescore candidates within those partitions using asymmetric quantized distance.

Filtering in AlloyDB's ScaNN implementation works at three levels:

**Post-filter (default)**: Run ANN, apply filter. Same recall cliff. Usable when filters are broad.

**Pre-filter**: When the query optimizer estimates a very selective filter, it uses the filter's metadata index to get matching row IDs, then runs **exact search over those IDs** — bypassing the ScaNN ANN index entirely. The optimizer is making the same judgment Qdrant makes: at low enough cardinality, brute force on the filtered set beats ANN on the full corpus.

**Inline filtering**: The query optimizer evaluates metadata conditions and vector similarity together, using both the ScaNN index and metadata indexes in tandem. ScaNN's tree structure helps here: entire partitions that contain no filtered-in vectors can be pruned before quantized scoring, reducing wasted work compared to HNSW graph traversal, where you have to visit a node to know whether its neighborhood is worth exploring.

## the selectivity spectrum

Every system that handles filtering well does something like this:

| filter selectivity | viable strategies |
|---|---|
| > 50% pass | post-filter with small over-fetch |
| 5–50% pass | post-filter with larger over-fetch; inline filter during ANN |
| 0.5–5% pass | inline / runtime filter (ACORN, filterable HNSW) |
| < 0.5% pass | exact search on filtered candidate set |

The boundaries are data-dependent and the right system adapts at query time. Fixed strategies — "we always post-filter" or "we always pre-filter" — will have bad recall in parts of this table.

The metric to watch is recall at your target k. If you're seeing degraded recall on filtered queries, plot it against filter selectivity. The shape of the recall curve tells you which zone you're in and which strategy is missing.

## the part that surprised me

The "pre-filter" strategy that sounds obvious — filter first, then search — is actually the hardest case to support efficiently in an ANN index. HNSW's routing assumes full-graph traversal. ScaNN's scoring assumes a fixed candidate pool. Both need intentional design to handle selective filters without sacrificing recall or latency.

What ACORN, Qdrant's adaptive planner, and ScaNN's inline filtering have in common: they all decide the strategy at query time, and they all fall back to exact search when selectivity makes ANN more expensive than brute force. The failure mode — in every system I've looked at — is treating the filtering approach as a fixed architectural choice rather than a per-query optimization.

The graph isn't broken. It just wasn't designed for the part of the space you're trying to search.

— v
