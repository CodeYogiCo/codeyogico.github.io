---
date: 2026-06-12
tag: search
title: "Vector search: Lucene is all you need"
read: 9 min
deck: "FAISS won't filter. Your segments already belong in object storage. The database you've been reaching around is the one you already have."
hidden: true
---

Every few months someone on a search team discovers that their similarity search is getting slow and decides to solve it with a new piece of infrastructure. They evaluate Pinecone, Weaviate, Qdrant, Milvus. They write an RFC. They add a dependency. The new system runs beside Elasticsearch or OpenSearch for six months before someone notices that the Elasticsearch cluster was already doing the hard part — and that the new system has three operational problems the old one didn't.

I've done this. The answer, at least for most production workloads, is that you don't need a separate vector database. You need to understand what Lucene is already doing.

## FAISS is a library, not a system

FAISS is the most widely cited tool in vector search discussions. It's fast. It's from Meta. It has good benchmarks. It is also not a search system — it's an indexing and search library, and the gap between those two things matters enormously in production.

The most practical problem: **FAISS has no native support for filtered search**.

In almost every real retrieval problem, you're not searching over everything. You're searching over products in a category, documents from a specific tenant, items in a date range. You have a predicate, and you need nearest neighbors *within* that predicate. FAISS doesn't know what a predicate is. The common workaround — post-filtering — is statistically broken at anything other than trivial selectivity.

The logic is simple. If your filter selects 1% of the corpus and you need 10 results, you have to overfetch by 100× to have a reasonable chance of getting 10 survivors after the filter. At 0.1% selectivity, oversampling falls apart entirely.

Here's what that looks like in code:

```python
import faiss
import numpy as np

index = faiss.IndexHNSWFlat(768, 32)
index.add(corpus_vectors)  # 1M products

# post-filter: fetch 1000, keep the ones in category
distances, ids = index.search(query_vec, k=1000)

results = [
    products[i] for i in ids[0]
    if products[i]["category"] == "running-shoes"
][:10]

# if category is 1% of corpus, ~10 of 1000 survive — barely
# if category is 0.1%, you likely return fewer than 10
```

You either return too few results or you're doing brute-force search with extra steps. There's no good path here. FAISS will never see the predicate, so it can't help you.

The right answer is *pre-filtering*: evaluate the predicate during graph traversal, before committing to a candidate. That requires the index to understand your filter semantics. FAISS doesn't. Lucene does.

## what Lucene's HNSW actually does

Lucene added HNSW-based vector search in version 9.0 (2022) and has been improving it steadily since. The implementation is mature, tested at enormous scale through Elasticsearch and OpenSearch, and integrated with Lucene's existing query model — meaning filtering, scoring, and hybrid retrieval all compose naturally.

When you run a filtered vector query in Lucene, it doesn't overfetch and discard. It maintains a *live docs* bitset — a compact representation of which document IDs are active after filter evaluation — and passes it into the HNSW traversal. Candidates that don't pass the filter are simply skipped during graph traversal. The search is over the filtered set from the start.

In Elasticsearch, this is just a query:

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

The `filter` isn't applied after the fact. It's passed into the HNSW graph walk as the live docs bitset. Nodes that fail the filter are invisible to the traversal — not fetched, not scored, not discarded. This works correctly at 0.1% selectivity the same way it works at 50%.

There's also hybrid scoring. `knn` composes with `query` in the same request:

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
    "match": {
      "title": { "query": "red running shoes", "boost": 0.3 }
    }
  }
}
```

BM25 and HNSW in one round-trip. No second system, no fan-out, no result merging layer you own.

## segments go in object storage

The other underrated fact about Lucene is its segment model, and what that model implies for storage.

A Lucene index is not a single mutable file. It's a collection of **segments** — each segment is a complete, immutable, write-once mini-index. When you index new documents, Lucene writes a new segment. Periodically it merges small segments into larger ones. It never modifies a segment in place.

```
index/
  _0.cfe   # segment 0 metadata
  _0.cfs   # segment 0 data (docs, terms, vectors)
  _1.cfe
  _1.cfs
  _2.cfe
  _2.cfs
  segments_4   # commit point — which segments are live
```

When a merge runs, `_0` and `_1` become `_3`. The old files are deleted only after the new segment is flushed and fsync'd. At no point is any existing file overwritten.

Immutability means: **write a segment once, put it in S3, read it many times**. Object storage doesn't like random writes — it's optimized for put-once, read-many. Lucene's segment model fits that access pattern almost perfectly.

Elasticsearch's Searchable Snapshots exploits exactly this. You configure a snapshot repository pointing at S3:

```json
PUT /_snapshot/my-s3-repo
{
  "type": "s3",
  "settings": {
    "bucket": "my-search-snapshots",
    "region": "us-east-1"
  }
}
```

Then mount old indices directly from the snapshot, without restoring them to local disk:

```json
POST /_snapshot/my-s3-repo/my-snapshot/_mount
{
  "index": "products-2024-01",
  "renamed_index": "products-2024-01-cold"
}
```

The search node streams segment data on demand and caches hot regions on local SSD. Cold data costs S3 prices (~$0.023/GB/month) instead of EBS prices (~$0.10/GB/month). For a 30GB HNSW graph over 10M vectors, that's real money at scale.

A standalone vector database doesn't give you this for free. You build it yourself, or you pay for managed infrastructure that has already reinvented it.

## the operational argument

New infrastructure has a cost that doesn't show up in benchmarks: operational surface area. A separate vector store means separate monitoring, separate incident response, separate backup and recovery, separate access control. It means two systems can disagree about the state of your data — and the failure mode is silent.

```
# the dual-write problem, simplified

def index_product(product):
    es.index(index="products", body=product)      # line A
    vector_db.upsert(product["id"], embedding)    # line B

# line A succeeds, line B times out
# now keyword search finds the product, vector search doesn't
# no error surfaced to the caller
```

With Lucene-based vector search, the embedding and the document are the same write, in the same index, in the same transaction. There's no line B.

Lucene-based systems — Elasticsearch, OpenSearch, Solr — are mature enough that most of these problems are already solved, documented, and understood by your ops team. The failure modes are known. The monitoring is off the shelf.

This doesn't mean a purpose-built vector database is never the right answer. At extreme scale (billions of vectors, sub-10ms p99, commodity margins), the tradeoffs shift. Specialized systems can tune away from the generality that makes Lucene flexible. That's a real advantage — for that specific problem.

For the search problems most teams actually have, the answer is usually: you already have the infrastructure. Run the HNSW query inside the system you're already operating.

## when to reach for something else

**FAISS** makes sense as a component inside a system you're building — not as the search system itself. If you're building a retrieval engine and you own the filtering layer, FAISS gives you fast, hackable ANN primitives. Use it the way you'd use a sorting algorithm: a building block, not an answer.

**Purpose-built vector DBs** start to win when your access patterns are almost entirely vector-based (minimal hybrid or keyword search), when you need sub-millisecond latency at very high QPS, or when you're operating at a scale where Lucene's JVM and segment merge overhead are genuinely bottlenecking you. That threshold is higher than most teams think.

For everyone else: the filtering is already there. The segments already fit in object storage. The hybrid query model is already mature. The operational playbook exists.

You don't need a new database. You need to look harder at the one you have.

— Ali
