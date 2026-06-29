---
date: 2026-06-29
tag: search
title: "Every filter is a set intersection"
read: 9 min
deck: "Filter caching, availability, vector pre-filtering, facet counts — under all of them is the same operation: combining sets of document IDs. Roaring bitmaps are the structure that makes it fast, and the trick is that they refuse to commit to a single representation."
---

Click a filter on any search results page — brand, color, in stock, under $100 — and somewhere in the engine each filter is a *set of document IDs*: every item that is red, every item in stock, every item under $100. What you see is the intersection of those sets.

Once you notice that, you start seeing it everywhere in a search engine. A facet count is the size of a set. The candidate list a vector query hands back, before you narrow it to what's actually available, is a set. The cached result of last query's `in_stock:true` clause is a set. Almost every stage of a search pipeline that isn't *scoring* is, underneath, holding a set of document IDs and combining it with another one — *intersect*, *union*, *difference*, *count*.

So a boring-sounding question sits under most of your search latency: how fast can you store and combine sets of document IDs, when one set might hold three documents and the next might hold fifty million?

This post is about the structure search engines reach for to answer that — the roaring bitmap — and the single idea that makes it work: refusing to pick one representation.

In one line: **a roaring bitmap is a compressed set of integers that chops the ID space into fixed chunks and stores each chunk in whichever layout — a small array, a dense bitmap, or a run-length list — is smallest for the data in that chunk.** That's the whole concept. It stays compact when the set is tiny *and* when it's enormous, and it combines with other sets fast. The rest of this post is why that one decision matters so much in a search engine.

## the two obvious answers, and why each is wrong half the time

A set of IDs is a set of integers. There are two textbook ways to store one.

**A sorted array of integers.** `[3, 17, 902, 40001, ...]`. To intersect two of them, walk both with two pointers and emit matches. Compact when the set is small. But suppose the universe is 200 million IDs and your set — "in stock", "active users", "rows from 2024" — holds 120 million of them. Now you're storing 120 million 4-byte integers, 480 MB, for one set. Intersecting two dense arrays means marching through hundreds of millions of entries.

**A plain bitmap.** One bit per possible ID. Bit *i* is 1 if *i* is in the set. Intersection is breathtaking — AND the two bit arrays a machine word (64 bits) at a time, no branches. But the size is fixed by the universe, not the set. For 200 million IDs that's 200 million bits, 25 MB, *per set, whether it holds 50 million elements or 3.* A rare attribute that matches 11 things still costs you 25 MB.

```
sorted array          great when sparse     terrible when dense
[3, 17, 902, ...]     2–4 bytes/element     480 MB for 120M IDs

plain bitmap          great when dense      terrible when sparse
1011000100...         word-at-a-time AND    25 MB for 3 IDs
```

Neither is wrong, exactly. Each is wrong *for the wrong data*. Any real workload has both kinds of set side by side — huge dense ones, tiny sparse ones, and everything between. Whatever you pick globally, half your sets punish you for it.

## the roaring idea: decide per chunk, not per set

Roaring bitmaps start from the observation that you don't have to choose once. You can choose *locally*.

Take a 32-bit ID and split it in half. The top 16 bits select a **chunk** — a block of 65,536 consecutive IDs. The bottom 16 bits are the position *within* that chunk. The integer 1,000,000 has top bits 15 (it lives in chunk 15) and bottom bits 16,960.

The whole structure is a sorted list of chunks that contain at least one element, keyed by those top 16 bits:

```
chunk key →  container
─────────────────────────
   0       →  [ ... values 0 .. 65535 ... ]
   3       →  [ ... values 196608 .. 262143 ... ]
  15       →  [ ... values 983040 .. 1048575 ... ]
  ...
```

Empty regions of the ID space cost nothing — there's simply no chunk for them. To test membership, binary-search the chunk keys, then look inside that one chunk.

Here's the actual trick. **Each chunk picks its own representation independently**, based on how many elements it happens to hold:

- **Array container** — a sorted array of 16-bit values. Used when the chunk is sparse. Two bytes per element.
- **Bitmap container** — a flat 65,536-bit bitmap, exactly 8 KB. Used when the chunk is dense.
- **Run container** — a list of `(start, length)` runs. Used when the values come in long consecutive stretches (e.g. 40,000 through 65,000 all present). A run of 25,000 values costs *one* pair of numbers.

The crossover between array and bitmap is not a vibe — it's arithmetic. A bitmap container is fixed at 8,192 bytes. An array container costs 2 bytes per element. They break even at 8,192 / 2 = **4,096 elements**. Below that the array is smaller; above it the bitmap is. So a chunk holding fewer than 4,096 elements stores them as an array, and the moment it crosses 4,096 it converts itself to a bitmap. A rare attribute is one small array container. A near-universal one is thousands of full bitmap (and run) containers. Same structure, no global compromise.

### a worked example

Make it concrete. Suppose `color:red` matches these document IDs, and watch where each one lands. The chunk is `id ÷ 65,536`; the position inside the chunk is `id mod 65,536`.

- **Documents 3, 17, and 902.** All in chunk 0 (`0 ÷ 65,536 = 0`), and there are only three of them. Three is far below 4,096, so chunk 0 is an **array container**: literally `[3, 17, 902]`, six bytes of data.
- **40,000 reds scattered through chunk 5** (document IDs 327,680 – 393,215). 40,000 is well past 4,096, so this chunk flips to a **bitmap container** — a flat 8 KB block where bit `(id − 327,680)` is set. It doesn't matter that the reds are scattered; the bitmap is the same 8 KB whether it holds 40,000 elements or 60,000.
- **Documents 800,000 – 830,000, all red and contiguous** (a newly-added product line with sequential IDs). These fall in chunk 12 (IDs 786,432 – 851,967). 30,001 elements is past 4,096 — but they're *consecutive*, so instead of a bitmap this becomes a **run container** holding one run: start `800,000 − 786,432 = 13,568`, length `30,000`. That entire range of 30,001 documents costs a single pair of numbers.

```
color:red  →  roaring bitmap
─────────────────────────────────────────────────────────
chunk  0  →  array    [3, 17, 902]                 ~6 bytes
chunk  5  →  bitmap   1011000100…  (40,000 set)    8 KB
chunk 12  →  run      [(13568, 30000)]             ~4 bytes
─────────────────────────────────────────────────────────
   one logical set — three different physical layouts
```

Three chunks, three representations, each chosen by the data in that chunk alone — no one decided up front that `color:red` was "a sparse set" or "a dense set", because it's both, in different regions. That per-chunk choice is the whole idea; everything else is bookkeeping.

### the same thing in code

The nice part is that you never deal with chunks or containers yourself. You add integers; the library picks the right layout per chunk for you. Here's that exact `color:red` set, built with the [RoaringBitmap](https://github.com/RoaringBitmap/RoaringBitmap) Java library:

```java
import org.roaringbitmap.RoaringBitmap;

RoaringBitmap red = new RoaringBitmap();

red.add(3);
red.add(17);
red.add(902);                  // chunk 0  — three values, stays a small array

for (int id : scatteredRedsInChunk5) {
    red.add(id);               // chunk 5  — crosses 4,096, flips to a bitmap
}

red.add(800_000L, 830_001L);   // chunk 12 — one contiguous range of IDs
red.runOptimize();             // that range collapses into a single run

red.getCardinality();          // how many reds in total
red.getSizeInBytes();          // bytes actually used — small, despite the range
```

No `if (sparse) … else …` anywhere. `add` decides. `runOptimize()` is the one manual step — it scans for long consecutive ranges and rewrites them as runs. Skip it and the contiguous range above would sit as a full 8 KB bitmap instead of a few bytes.

## why this makes the operations fast

Memory is only half the story. The reason roaring is *inside* your engine is that the set operations are fast precisely because of the chunking.

To intersect two roaring bitmaps, you don't touch the data first — you intersect the *chunk keys*. Both are sorted lists, so this is a merge: chunks present in only one of the two sets can't contribute to an intersection and are skipped entirely. A query for `A AND B` never looks at the regions of the ID space where `A` doesn't exist.

For the chunks that *do* overlap, roaring dispatches on the pair of container types, and each combination has its own tuned routine:

```
bitmap  ∩  bitmap   →  word-at-a-time AND of two 8 KB blocks (no branches)
array   ∩  array    →  two-pointer merge of two short sorted arrays
array   ∩  bitmap   →  for each value in the array, test one bit
run     ∩  anything →  walk the runs, clip against the other container
```

Each path is the *best* algorithm for that specific pair — dense-meets-dense gets the branchless word AND, sparse-meets-anything gets the cheap probe. You never run the dense algorithm on sparse data or vice versa, because the containers told you which one they are. The hard general problem ("these sets have wildly different densities") dissolves into many local problems, each of which has one obviously-right answer.

It's the same move as the array-vs-bitmap decision, applied recursively: don't solve the hard general case — partition until each piece is easy.

## where it shows up in a search engine

You probably don't import a roaring library yourself. You inherit it — and inside a search engine it's doing four different jobs that all turn out to be the same job.

**Filter caching.** **Lucene** — and so Solr, Elasticsearch, OpenSearch — caches the result of a `filter` clause as a roaring-style doc-ID set. Its `RoaringDocIdSet` is a direct descendant of this design. The first time a query carries `brand:nike`, the engine resolves which documents match and stores that bitmap; the next query reuses it for free and just intersects it with whatever else came in. Filters are cached, scores are not, precisely because a filter is a reusable *set* and a score is per-query.

**Availability and inventory filters.** The classic dense filter. `in_stock:true` might match a huge fraction of the catalog, and it changes constantly as inventory moves. This is the worst case for a sorted array (enormous) and a fine case for a bitmap — and because availability tends to hold across long contiguous ID ranges, roaring's run containers collapse it further. The filter that touches the most documents is the one roaring handles most gracefully.

**Pre-filtering in vector search.** When a vector query is constrained — "nearest neighbors *that are in stock and under $100*" — the engine needs the set of documents satisfying the filter so it can restrict the ANN traversal to them. That allowed-set is a roaring bitmap, intersected from the same cached filter clauses above, and the vector index walks it as a membership test during search. This is the join between the lexical and vector worlds: the bitmap decides *which* candidates are eligible, the vector index decides *which* are close. It's the structure that makes [[you-already-have-a-vector-database]] practical — the same Lucene segment holds both halves.

**Facet formation.** A facet is a count per attribute value — "Nike (412), Adidas (380), …" — computed *over the current result set*. Done naively that's a scan; done with bitmaps it's an intersection cardinality. Keep one bitmap per facet value, intersect each with the result-set bitmap, and the size of the intersection *is* the facet count. No documents are read; you're counting set overlaps. Multi-select facets ("Nike OR Adidas") are just a union first.

And here's the thing worth seeing: all four of those jobs are *one or two method calls* once each clause is a bitmap. Same library, same handful of operations:

```java
// each clause is just a set of document IDs (its postings)
RoaringBitmap red     = postings("color", "red");
RoaringBitmap inStock = postings("in_stock", "true");
RoaringBitmap nike    = postings("brand", "nike");
RoaringBitmap adidas  = postings("brand", "adidas");

// filter — red AND in stock                  (intersection)
RoaringBitmap results = RoaringBitmap.and(red, inStock);

// multi-select facet — nike OR adidas         (union)
RoaringBitmap brands = RoaringBitmap.or(nike, adidas);

// facet count for "nike" in the results       (no documents read)
int nikeCount = RoaringBitmap.andCardinality(results, nike);

// vector pre-filter — is this candidate allowed?
boolean eligible = results.contains(candidateDocId);
```

`and` is your filter. `or` is multi-select. `andCardinality` is a facet count — it returns the size of the overlap without building the intersection. `contains` is the membership test a vector search runs against the allowed set. Four search features, four method calls.

The thread tying them together: every stage that isn't scoring reduces to *which documents satisfy this?* — and combining those answers. Make that set algebra cheap and filtering, availability, vector constraints, and faceting all get cheap at once.

## the numbers

Rough, order-of-magnitude, the kind you put on a napkin before you benchmark — the spirit of [[the-quiet-art-of-capacity-planning]].

**Memory.** A set of 11 elements out of 200 million: a plain bitmap is 25 MB, a sorted array is 44 bytes, roaring is ~one small array container (tens of bytes). A set of 120 million scattered elements: the sorted array is 480 MB, roaring is mostly bitmap containers at 8 KB per populated chunk — on the order of 25 MB, the same as the plain bitmap but *without* paying that price on the sparse sets. You get the dense case's compactness and the sparse case's compactness in one structure.

**Run compression.** Append-only or time-ordered IDs produce long consecutive runs. A flag that holds true for 25,000 contiguous IDs stores as a single run — a handful of bytes for what would be 8 KB of bitmap or 50 KB of array. Calling `runOptimize()` after building is what unlocks this; it isn't automatic.

**Operations.** Bitmap-meets-bitmap AND runs at memory-bandwidth speed — billions of IDs per second per core, because it's branchless word operations. The chunk-key merge means you only pay for chunks that actually overlap, so selective multi-set queries touch a small fraction of the data.

## what can go wrong

**Tiny sets carry overhead.** A roaring bitmap holding three IDs still has the chunk-directory machinery around it. If your sets are reliably minuscule, a bare sorted array is leaner. Roaring wins on *variety* and *scale*, not on toy inputs.

**It's a set, not a list with positions or payloads.** Roaring is excellent at "is X present", "intersect", "union", "count". It is not built for "give me the 5,000th element" without iterating, nor for duplicates or per-element values. If you need a score attached to each ID, the bitmap tells you *which* elements survive — something else has to rank them.

**`runOptimize()` is opt-in.** The run container only appears if you ask for it. Build from naturally-runny data, skip the optimize step, and you've left the best compression on the table while wondering why it's bigger than expected.

**Serialization format is a contract.** Roaring has a portable serialization spec, which is what lets a bitmap built in one process be read by another — handy when you cache filter sets to disk or ship them between nodes. But mixing a library that emits the older format with one expecting the portable one will bite you. Pin versions across producers and consumers.

**Updates are coarse.** Containers are cheap to read and combine, less cheap to mutate one bit at a time at high frequency. Most engines sidestep this by building bitmaps per immutable segment and rebuilding on merge — the lifecycle Lucene already uses for everything. If your access pattern is heavy random single-bit churn, that's a different structure's job.

## one breath

Filter caching, availability, vector pre-filtering, faceting — strip the surface off and they're the same operation: combining sets of document IDs, where the sets range from three documents to fifty million. A sorted array is compact only when sparse; a plain bitmap is fast only when dense. Roaring refuses to choose: it splits the ID space into 65,536-document chunks and lets each chunk pick its own representation — array when sparse, bitmap when dense, run when consecutive — with the array-to-bitmap crossover falling exactly at 4,096 documents, where their sizes meet. Operations merge chunk keys first (skipping non-overlapping regions for free) and run the best-fit algorithm per container pair. The result is one structure that's compact *and* fast across the whole density range, which is why it's quietly load-bearing inside Lucene and Solr — under your filters, your availability, your vector constraints, and your facet counts alike.

Pick once and half your data punishes you. Pick per chunk and the hard case never shows up.

— v
