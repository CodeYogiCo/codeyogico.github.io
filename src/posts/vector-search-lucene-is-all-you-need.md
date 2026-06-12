---
date: 2026-06-12
tag: search
title: "Vector search: Lucene is all you need"
read: 8 min
deck: "HNSW is already in there. Your segments already belong in object storage. The database you've been reaching around is the one you already have."
hidden: true
---

I've added a vector database to a system that didn't need one. I've written the RFC, run the evaluation, argued for the dependency, and watched it sit beside our existing search stack for six months before anyone quietly asked why we had two systems doing half a job each.

The answer was that we didn't understand what Lucene was already doing.

## the library you already have

Lucene has had HNSW-based vector search since version 9.0. It shipped quietly. Most teams missed it. They were already reaching for something newer-looking.

The implementation is mature — running at scale inside search infrastructure across the industry. And because it lives inside Lucene, it composes naturally with everything else the index already knows: term filters, range queries, scoring, the full query model. You don't bolt a new system on. You add a field and write a query.

Filtering is where this matters most. In almost every real retrieval problem, you're not searching over everything. You're searching over products in a category, documents from a tenant, content within a date range. You have a predicate, and you need nearest neighbors *within* it.

The naive approach — fetch more candidates than you need, discard the ones that fail the filter — breaks at anything other than trivial selectivity. At 1% category selectivity you're already over-fetching by 100×. At 0.1% the math falls apart entirely.

> Post-filtering isn't a solution. It's a bet that the distribution cooperates.

Lucene's HNSW traversal accepts a live docs bitset built from the filter. Nodes that don't pass are invisible to the walk — not fetched, not scored, not discarded. The search is over the filtered set from the start. This works correctly at 0.1% selectivity the same way it works at 50%.

## what the code looks like

```java
// index time: define a vector field alongside regular fields
document.add(new KnnFloatVectorField("embedding", floatVector,
    VectorSimilarityFunction.DOT_PRODUCT));
document.add(new StringField("category", "running-shoes", Field.Store.YES));
writer.addDocument(document);
```

```java
// query time: HNSW search with an inline filter
Query categoryFilter = new TermQuery(new Term("category", "running-shoes"));

KnnFloatVectorQuery vectorQuery = new KnnFloatVectorQuery(
    "embedding",
    queryVector,
    10,          // k
    categoryFilter
);

TopDocs results = searcher.search(vectorQuery, 10);
```

The filter is not applied after the fact. It is handed to the graph traversal. The HNSW walk never touches a node that fails it.

You can also combine with BM25 in a single pass:

```java
Query textQuery = new QueryParser("title", analyzer).parse("red running shoes");

BooleanQuery hybrid = new BooleanQuery.Builder()
    .add(vectorQuery, BooleanClause.Occur.SHOULD)
    .add(textQuery, BooleanClause.Occur.SHOULD)
    .build();

TopDocs results = searcher.search(hybrid, 10);
```

Two signals, one round-trip, no merging layer you own.

## segments belong in object storage

The other thing worth understanding about Lucene is its segment model — and what it implies for what you pay to store a large HNSW graph.

A Lucene index is not one mutable file. It is a collection of segments, each one complete, immutable, write-once.

```
index/
  _0.cfs      # segment 0 — docs, terms, vectors, HNSW graph
  _1.cfs      # segment 1
  _2.cfs      # segment 2
  segments_4  # commit point — which segments are live
```

New documents create new segments. Merges combine small segments into larger ones. Nothing is ever overwritten. The files that exist are final.

That makes them trivially portable. Object storage — S3, GCS, Azure Blob — is designed for put-once, read-many. Mutable database files fight that access pattern. Lucene segments fit it natively.

Write a segment once. Upload it. Read it many times from cold storage. Stream only the parts you need on a given query, cache hot graph regions on local SSD.

A 30GB HNSW graph over 10 million 768-dimensional vectors sitting in S3 costs a fraction of what it costs on attached disk. And because segments are immutable, you never need to reconcile a partial write or coordinate a lock. The segment either exists or it doesn't.

```java
// Lucene's Directory abstraction is the seam
// FSDirectory for local disk — swap in any implementation
Directory dir = FSDirectory.open(Path.of("/var/index"));
IndexWriterConfig config = new IndexWriterConfig(analyzer);
IndexWriter writer = new IndexWriter(dir, config);

// community implementations exist for S3, GCS, Azure Blob
// segments are write-once, so any put-once store works
```

A standalone vector database doesn't give you this. You build the tiering yourself, or you pay for managed infrastructure that already reinvented it.

## the operational cost

New infrastructure has a cost that doesn't show up in any benchmark: everything that can go wrong now has two places to go wrong in.

Two systems means dual-write bugs, replication lag, the vector index drifting quietly from the source of truth with no error surfaced to the caller. With Lucene the embedding and the document are the same write, same segment, same commit. There is no second system to fall out of sync.

I'm not arguing that purpose-built vector databases are never worth it. At extreme scale — billions of vectors, sub-10ms p99, commodity margins — the tradeoffs shift. Specialized systems can tune away from the generality that makes Lucene flexible. That is a real advantage, for that specific problem.

For most teams, the threshold is higher than they think. The filtered HNSW is already there. The segments already fit in object storage. The operational surface area is already understood.

You don't need a new database. You need to look harder at the one you have.

— Ali
