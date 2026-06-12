---
date: 2026-06-12
tag: search
title: "Vector search: Lucene is all you need"
read: 9 min
deck: "FAISS won't filter. Your segments already belong in object storage. The database you've been reaching around is the one you already have."
hidden: true
---

I've added a vector database to a system that didn't need one. I've written the RFC, run the evaluation, argued for the dependency, and watched it sit beside Elasticsearch for six months before anyone quietly asked why we had two systems doing half a job each.

The answer was that we didn't understand what Lucene was already doing.

## FAISS is a library

FAISS is fast. It's from Meta. It has good benchmarks. It is also not a search system — it's an indexing library, and that gap matters in production more than any benchmark will show you.

The problem is filtering. In almost every real retrieval problem, you're not searching over everything. You're searching over products in a category, documents from a tenant, content within a date range. You have a predicate, and you need nearest neighbors *within* it.

FAISS doesn't know what a predicate is. So you post-filter: fetch more than you need, discard the ones that don't match.

```python
index = faiss.IndexHNSWFlat(768, 32)
index.add(corpus_vectors)

# ask for 1000, hope enough survive the filter
distances, ids = index.search(query_vec, k=1000)
results = [products[i] for i in ids[0]
           if products[i]["category"] == "running-shoes"][:10]
```

At 1% category selectivity, about 10 of those 1000 survive. At 0.1%, you get fewer results than the user asked for and there's nothing you can do about it. You're either over-fetching into brute force territory or returning bad results. There's no good path.

> Post-filtering isn't a solution. It's a bet that the distribution cooperates.

The right answer is pre-filtering: skip non-matching nodes *during* graph traversal, before you commit to a candidate. That requires the index to understand the predicate. FAISS never will. Lucene does this natively.

## what Lucene actually does

Lucene has had HNSW-based vector search since version 9.0. The implementation is quiet, mature, and already running at scale inside every Elasticsearch and OpenSearch cluster in the world. It's also integrated with Lucene's query model — which means filtering is not an afterthought.

When you run a filtered vector query, Lucene builds a *live docs* bitset from the filter predicate and hands it to the HNSW traversal. Nodes that don't pass are invisible to the walk. Not fetched, not scored, not discarded — invisible.

```json
POST /products/_search
{
  "knn": {
    "field": "embedding",
    "query_vector": [0.12, 0.45, ...],
    "k": 10,
    "num_candidates": 100,
    "filter": {
      "term": { "category": "running-shoes" }
    }
  }
}
```

This works correctly at 0.1% selectivity the same way it works at 50%. The math doesn't break.

And because it's Lucene, it composes. BM25 and HNSW in the same request, one round-trip, no fan-out layer you own:

```json
{
  "knn": {
    "field": "embedding",
    "query_vector": [...],
    "k": 10,
    "num_candidates": 100,
    "boost": 0.7
  },
  "query": {
    "match": { "title": { "query": "red running shoes", "boost": 0.3 } }
  }
}
```

You don't add a second system. You add a second query clause.

## segments belong in object storage

The other thing worth understanding about Lucene is its segment model — because it has a direct implication for what you pay to store vectors.

A Lucene index is not one mutable file. It's a collection of segments, each one complete, immutable, write-once.

```
index/
  _0.cfs   # segment 0 — docs, terms, vectors
  _1.cfs   # segment 1
  _2.cfs   # segment 2
  segments_4  # commit point — which segments are live
```

New documents create new segments. Merges combine small segments into large ones. Nothing is ever overwritten. The files that exist are final.

That makes them trivially portable. Object storage hates random writes — it's designed for put-once, read-many. Mutable database files fight that access pattern constantly. Lucene segments fit it perfectly.

Elasticsearch's Searchable Snapshots exploits exactly this. You point a snapshot repo at S3:

```json
PUT /_snapshot/my-s3-repo
{
  "type": "s3",
  "settings": { "bucket": "my-search-snapshots", "region": "us-east-1" }
}
```

Then mount old indices cold, directly from the snapshot:

```json
POST /_snapshot/my-s3-repo/my-snapshot/_mount
{
  "index": "products-2024-01",
  "renamed_index": "products-2024-01-cold"
}
```

Segment data streams on demand, hot regions cache on local SSD. A 30GB HNSW graph over 10M vectors sits in S3 at $0.023/GB instead of on EBS at $0.10/GB. The search still works. It just costs less.

A standalone vector database doesn't give you this. You build the tiering yourself, or you pay for managed infrastructure that already reinvented it.

## the operational cost

New infrastructure has a cost that doesn't show up in any benchmark: everything that can go wrong now has two places to go wrong in.

```python
def index_product(product):
    es.index(index="products", body=product)   # succeeds
    vector_db.upsert(product["id"], embedding) # times out
    # keyword search finds it. vector search doesn't.
    # no error. no alert. just wrong results.
```

Two systems means dual-write bugs, replication lag, the vector index drifting from the source of truth. With Lucene-based vector search the embedding and the document are the same write, same index, same transaction. Line B doesn't exist.

I'm not arguing that purpose-built vector databases are never worth it. At extreme scale — billions of vectors, sub-10ms p99, commodity margins — the tradeoffs genuinely shift. Specialized systems can tune away from the generality that makes Lucene flexible. That's a real advantage, for that specific problem.

For most teams, the threshold is higher than they think. The filtering is already there. The segments already fit in object storage. The operational playbook already exists.

You don't need a new database. You need to look harder at the one you have.

— Ali
