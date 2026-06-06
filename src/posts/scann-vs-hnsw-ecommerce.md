---
date: 2026-06-06
tag: search
title: "ScaNN vs HNSW for e-commerce search"
read: 8 min
deck: "Two algorithms, one product catalog. Why the choice between graph search and partition search comes down to filters, updates, and scale."
---

You're building search for an e-commerce site. A user types "blue running shoes under $80, size 10, in stock." You have 5 million products. You need the top 10 most relevant ones in under 50 milliseconds.

Two algorithms dominate production vector search right now: HNSW and ScaNN. They solve the same problem — find approximate nearest neighbors fast — but with completely different internal structures. For e-commerce specifically, those differences matter in ways that don't show up in benchmarks.

## what they're each doing

**HNSW** (Hierarchical Navigable Small World) builds a graph. Every product vector connects to its nearest neighbors through layered graph edges. Search is navigation: start at an entry point, follow edges toward the query, converge on good candidates. Adding a new product means inserting a new node into the graph — you connect it to its neighbors and you're done.

**ScaNN** (Scalable Nearest Neighbors) builds a partition index. All products are grouped into clusters at index time. Search is elimination: score the cluster centers first, pick the most promising neighborhoods, score only the vectors inside those. Adding a new product is harder — you need to assign it to a cluster and potentially rebuild parts of the index.

Same output. Fundamentally different structure.

## the filtering problem — where they diverge most

E-commerce queries are almost never pure similarity search. They're similarity search *plus* a pile of constraints:

- Price range: under $80
- Size availability: size 10 only
- Stock status: in stock
- Brand: Nike or Adidas
- Category: running shoes, not dress shoes

This is where the two algorithms behave very differently.

**In HNSW**, the graph was built assuming every node is reachable. During traversal, the algorithm hops from node to node following edges. If you try to skip filtered-out nodes — just ignore products that are out of stock or the wrong price — you break the routing. The path to good results might pass through a filtered-out node. Block it, and the search gets stranded, missing relevant products entirely.

The workarounds exist but they're not free: traverse through filtered-out nodes anyway and just don't count them (wasted work), or fall back to brute force on the filtered set when selectivity gets too high.

**In ScaNN**, filtering is structurally free. Vectors are scored independently inside each partition. Skipping a vector that doesn't match the filter has no effect on finding other vectors. You can apply the filter at two levels:

- Skip entire partitions that contain zero matching products (if a cluster has no size-10 shoes, don't score it at all)
- Skip individual vectors inside a partition before computing their approximate score

"Blue running shoes, size 10, in stock, under $80" with ScaNN means you only compute dot products for products that actually match all those constraints. With HNSW, you're doing extra work regardless.

For e-commerce — where almost every query has multiple filters — this is the biggest practical difference.

## the update problem — where HNSW wins

E-commerce catalogs are never static.

A mid-size retailer might add hundreds of new products daily. Flash sales create thousands of new SKUs overnight. Products go in and out of stock constantly. A seller relists a product with new photos and a new embedding.

**HNSW handles this naturally.** Insert a new product vector: the algorithm finds its nearest neighbors, creates edges, and the graph is updated. The index is always current. This is one of the main reasons HNSW is embedded in databases like Elasticsearch, Weaviate, and pgvector — systems where the data is always changing.

**ScaNN requires a rebuild.** The partition structure was trained on the corpus at index time. New vectors can be added to existing partitions, but if the catalog changes substantially — new product categories, seasonal shifts in inventory — the cluster structure becomes stale and recall degrades. A full rebuild, which can take hours on large corpora, is needed to restore quality. For most teams, this means a nightly rebuild job, meaning new products take up to 24 hours to become fully searchable.

## scale and throughput

At very large scale — tens of millions of products, hundreds of millions of queries per day — ScaNN's architecture has a throughput advantage.

ScaNN's quantization compresses product vectors significantly (often 4–8× smaller than HNSW's graph storage), which means more of the index fits in memory and less time is spent on memory access. The partition structure also parallelizes well: scoring 100 clusters is embarrassingly parallel.

HNSW's graph traversal is inherently sequential — you follow one edge at a time. It has lower latency for a single query, but throughput per machine is lower than ScaNN at the same recall target.

For a retailer doing 10 million searches per day, this might not matter much. For Google Shopping or Amazon-scale systems, it's the difference between 50 machines and 200.

## a practical decision framework

| scenario | better choice |
|---|---|
| Heavy filtering on every query | ScaNN |
| Catalog updates multiple times per day | HNSW |
| Static or nightly-rebuilt catalog | ScaNN |
| Small catalog (< 1M products) | HNSW |
| Very large catalog (10M+ products) | ScaNN |
| Memory is constrained | ScaNN (quantization helps) |
| Need sub-10ms p99 latency | HNSW |
| Embedded in Postgres / Elasticsearch | HNSW (it's already there) |
| Building a dedicated search service | ScaNN |

Most e-commerce companies land somewhere in the middle: a catalog large enough that filtering matters, updated frequently enough that nightly rebuilds are acceptable but hourly ones are not.

For that middle zone — which describes most mid-to-large retailers — the filtering advantage of ScaNN tends to outweigh the update advantage of HNSW. Filters are on every query. New products can wait until the next nightly rebuild.

## what large e-commerce actually uses

The honest answer is: a hybrid, or neither in its pure form.

Amazon uses a partition-based approach (similar to ScaNN's IVF structure) with heavy custom infrastructure built on top. Google Shopping uses ScaNN directly. Most of the open-source e-commerce stacks (Elasticsearch, OpenSearch, Weaviate) use HNSW because it's already embedded in the database and handles updates cleanly.

The practical advice: if you're on Elasticsearch or pgvector already, HNSW is your default and the filtering workarounds are mature enough to handle most cases. If you're building a dedicated vector search service from scratch and filtering is a core requirement, ScaNN's structure is the right starting point.

The algorithm choice matters less than getting the embedding quality right, the filter architecture right, and the recall measurement right. Both HNSW and ScaNN can deliver good results; the difference shows up at the edges — extreme filter selectivity, extreme scale, extreme update frequency.

— v
