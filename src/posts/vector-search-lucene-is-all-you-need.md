---
date: 2026-06-12
tag: search
title: "Vector search: Lucene is all you need"
read: 8 min
deck: "FAISS won't filter. Your segments already belong in object storage. The database you've been reaching around is the one you already have."
hidden: true
---

Every few months someone on a search team discovers that their similarity search is getting slow and decides to solve it with a new piece of infrastructure. They evaluate Pinecone, Weaviate, Qdrant, Milvus. They write an RFC. They add a dependency. The new system runs beside Elasticsearch or OpenSearch for six months before someone notices that the Elasticsearch cluster was already doing the hard part — and that the new system has three operational problems the old one didn't.

I've done this. The answer, at least for most production workloads, is that you don't need a separate vector database. You need to understand what Lucene is already doing.

## FAISS is a library, not a system

FAISS is the most widely cited tool in vector search discussions. It's fast. It's from Meta. It has good benchmarks. It is also not a search system — it's an indexing and search library, and the gap between those two things matters enormously in production.

The most practical problem: **FAISS has no native support for filtered search**.

In almost every real retrieval problem, you're not searching over everything. You're searching over products in a category, documents from a specific tenant, items in a date range. You have a predicate, and you need nearest neighbors *within* that predicate. FAISS doesn't know what a predicate is. The common workaround — post-filtering — is statistically broken at anything other than trivial selectivity.

The logic is simple. If your filter selects 1% of the corpus and you need 10 results, you have to overfetch by 100× to have a reasonable chance of getting 10 survivors after the filter. At 0.1% selectivity, oversampling falls apart entirely. You either return too few results or you're doing brute-force search with extra steps.

The right answer is *pre-filtering*: evaluate the predicate during graph traversal, before committing to a candidate. That requires the index to understand your filter semantics. FAISS doesn't. Lucene does.

## what Lucene's HNSW actually does

Lucene added HNSW-based vector search in version 9.0 (2022) and has been improving it steadily since. The implementation is mature, tested at enormous scale through Elasticsearch and OpenSearch, and integrated with Lucene's existing query model — meaning filtering, scoring, and hybrid retrieval all compose naturally.

When you run a filtered vector query in Lucene, it doesn't overfetch and discard. It maintains a *live docs* bitset — a compact representation of which document IDs are active after filter evaluation — and passes it into the HNSW traversal. Candidates that don't pass the filter are simply skipped during graph traversal. The search is over the filtered set from the start.

This matters most at the tails of selectivity distributions, which is exactly where production queries tend to live. A user searching within a narrow category, a multi-tenant system isolating by customer ID, a time-bounded query over recent content — these are not edge cases. They're the common case.

There's also hybrid scoring: Lucene's `KnnFloatVectorQuery` composes naturally with BM25, boosting, function queries, and the full machinery you're probably already using for keyword search. You don't add a second system. You add a second query clause.

## segments go in object storage

The other underrated fact about Lucene is its segment model, and what that model implies for storage.

A Lucene index is not a single mutable file. It's a collection of **segments** — each segment is a complete, immutable, write-once mini-index. When you index new documents, Lucene writes a new segment. Periodically it merges small segments into larger ones. It never modifies a segment in place.

Immutability is interesting for one specific reason: it makes segments trivially cacheable and trivially storable in object storage.

Object storage (S3, GCS, Azure Blob) doesn't like random writes. It's optimized for put-once, read-many access. Mutable database files are awkward here — you either pay for costly copy-on-write mechanics or you give up durability guarantees. Lucene's segment model fits the object storage access pattern almost perfectly. Write a segment once, upload it, read it many times from cold storage.

Elasticsearch's Searchable Snapshots feature exploits exactly this. Segments are stored in S3. The search node streams the parts it needs on demand, caches hot regions on local SSD, and cold data costs object storage prices rather than disk prices. For workloads with power-law access patterns — which is most of them — this is a meaningful cost lever.

For vector indices specifically, HNSW graphs are large. A graph over 10 million 768-dimensional float32 vectors is roughly 30GB before any compression. Keeping that entirely in RAM is expensive. The segment model lets you tier it: hot segments on local NVMe, warm segments on object storage, full graph available, cache filling on demand.

A standalone vector database doesn't give you this for free. You build it yourself, or you pay for managed infrastructure that has already reinvented the wheel.

## the operational argument

New infrastructure has a cost that doesn't show up in benchmarks: operational surface area. A separate vector store means separate monitoring, separate incident response, separate backup and recovery, separate access control. It means two systems can disagree about the state of your data. It means a class of bugs that are fundamentally distributed systems bugs: dual-write failures, replication lag, the index getting out of sync with the source of truth.

Lucene-based systems — Elasticsearch, OpenSearch, Solr — are mature enough that most of these problems are already solved, documented, and understood by your ops team. The failure modes are known. The monitoring is off the shelf.

This doesn't mean a purpose-built vector database is never the right answer. At extreme scale (billions of vectors, sub-10ms p99, commodity margins), the tradeoffs shift. Specialized systems can tune away from the generality that makes Lucene flexible. That's a real advantage — for that specific problem.

For the search problems most teams actually have, the answer is usually: you already have the infrastructure. Run the HNSW query inside the system you're already operating.

## when to reach for something else

**FAISS** makes sense as a component inside a system you're building — not as the search system itself. If you're building a retrieval engine and you own the filtering layer, FAISS gives you fast, hackable ANN primitives. Use it the way you'd use a sorting algorithm: a building block, not an answer.

**Purpose-built vector DBs** start to win when your access patterns are almost entirely vector-based (minimal hybrid or keyword search), when you need sub-millisecond latency at very high QPS, or when you're operating at a scale where Lucene's JVM and segment merge overhead are genuinely bottlenecking you. That threshold is higher than most teams think.

For everyone else: the filtering is already there. The segments already fit in object storage. The hybrid query model is already mature. The operational playbook exists.

You don't need a new database. You need to look harder at the one you have.

— v
