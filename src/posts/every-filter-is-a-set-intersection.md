---
date: 2026-06-29
tag: search
title: "Every filter is a set intersection"
read: 10 min
deck: "Filter caching, availability, vector pre-filtering, facet counts — under all of them is the same operation: combining sets of document IDs. Roaring bitmaps are the structure that makes it fast, and the trick is that they refuse to commit to a single representation."
---

Click a filter on any search results page — brand, color, in stock, under $100 — and somewhere in the engine each filter is a *set of document IDs*: every item that is red, every item in stock, every item under $100. What you see is the intersection of those sets.

Once you notice that, you start seeing it everywhere in a search engine. A facet count is the size of a set. The candidate list a vector query hands back, before you narrow it to what's actually available, is a set. The cached result of last query's `in_stock:true` clause is a set. Almost every stage of a search pipeline that isn't *scoring* is, underneath, holding a set of document IDs and combining it with another one — *intersect*, *union*, *difference*, *count*.

So a boring-sounding question sits under most of your search latency: how fast can you store and combine sets of document IDs, when one set might hold three documents and the next might hold fifty million?

This post is about the structure search engines reach for to answer that — the roaring bitmap — and the single idea that makes it work: refusing to pick one representation.

In one line: **a roaring bitmap is a compressed set of IDs that splits them into fixed groups — picture aisles of a store — and lets each group keep whichever record is smallest: a short list, a tick-sheet of bits, or a range.** That's the whole concept. It stays compact when the set is tiny *and* when it's enormous, and it combines with other sets fast. The rest of this post builds that up from scratch, and shows why it matters so much in a search engine.

## start with the simplest idea: a bitmap

Forget clever data structures for a second. Say your catalog has just ten products, with IDs 0 through 9, and you want to remember which ones are red. The plainest way imaginable is a row of boxes — one box per product — each holding a `0` or a `1`:

```
product id:   0  1  2  3  4  5  6  7  8  9
red?          0  1  1  0  0  1  0  0  0  1
              → products 1, 2, 5 and 9 are red
```

That row of bits *is* a **bitmap**. Box number *i* answers one yes/no question about product *i* — here, "is it red?" A `1` means yes, a `0` means no. That's the entire idea.

Now the payoff. Suppose you keep a second bitmap for "in stock":

```
red?           0  1  1  0  0  1  0  0  0  1
in stock?      1  1  0  0  1  1  0  0  1  1
red AND stock  0  1  0  0  0  1  0  0  0  1
               → products 1, 5 and 9
```

To find products that are red *and* in stock, lay the two rows on top of each other and keep only the columns that are `1` in both. That's a filter — nothing more. And a computer does this column-by-column comparison 64 boxes at a time in a single instruction, so even across millions of products it's blazing fast. This is why bitmaps are everywhere in search: **a filter is just "line up two rows of bits and AND them."**

## the problem: real catalogs are huge and mostly empty

The tiny example hides a cost that only shows up at scale. A bitmap always keeps one box per product — *whether that box is a 1 or a 0*. Ten products, ten boxes: nothing to worry about. But a real catalog has 200 million products, so every bitmap is 200 million boxes ≈ 25 MB, and you keep one for each attribute value.

For a common attribute like "in stock," that's fine — lots of 1s, the space is pulling its weight. The trouble is the *rare* attributes. "Vermilion" might match 11 products out of 200 million. Its bitmap is *still* 25 MB — and 199,999,989 of those boxes are `0`. You're spending 25 MB to remember 11 things.

The obvious fix is to stop storing all those zeros: just keep a **list of the IDs that are `1`**. Vermilion becomes `[418, 90271, …]` — eleven numbers, a few dozen bytes. Problem solved?

Not quite — because now flip the situation around. "In stock" matches 120 million products. As a list, that's 120 million numbers, roughly 480 MB — *far worse* than the 25 MB bitmap, and slower to compare, because you're walking a giant list instead of ANDing machine words.

```
                sparse set (11 items)      dense set (120M items)
plain bitmap    25 MB   (mostly zeros)     25 MB   (good)
list of IDs     ~44 bytes (great)          480 MB  (terrible)
```

So there's no single winner. A plain bitmap wastes space on sparse sets; a list wastes space *and* speed on dense ones. And a real search index is full of **both** — a handful of giant sets like "in stock," a long tail of tiny ones like "vermilion," and everything in between. Whatever one format you commit to, half your data punishes you for it.

## the roaring idea: let each aisle keep its own kind of record

Roaring bitmaps start from a simple observation: you don't have to choose *once*. You can choose *locally* — aisle by aisle.

Picture the store laid out so products sit in ID order, and chop it into **aisles** of 65,536 consecutive IDs each: IDs 0–65,535 are aisle 0, IDs 65,536–131,071 are aisle 1, and so on. Here's the move — instead of forcing one format on the whole store, *each aisle keeps whichever kind of record is cheapest for the red products that happen to live in it*:

- An aisle with only a handful of red products just **jots down their IDs** — a short list.
- An aisle that's mostly red keeps a **tick-sheet**, one box per slot — a bitmap.
- An aisle where a whole run of shelves is red writes down a **single range** — "slots 400 to 450."

Three aisles, three different records, and no aisle had to care what the others chose. An aisle with no red products at all simply isn't recorded — empty stretches of the store cost nothing.

(The mechanism, if you're curious: an ID is a 32-bit number split in half. The top 16 bits name the aisle — roaring's word is **chunk** — and the bottom 16 bits are the slot inside it. So product 1,000,000 sits in aisle 15, slot 16,960. You can ignore the bit-twiddling and just picture aisles of 65,536.)

The three kinds of record have proper names, and they're exactly the two ideas from before plus one:

- **Array container** — the short list of IDs. The "jot down the few red ones" aisle. Two bytes per item.
- **Bitmap container** — the tick-sheet: one bit per slot, a flat 8 KB. The "mostly red" aisle.
- **Run container** — a list of `(start, length)` ranges. The "a whole stretch of shelves is red" aisle. A run of 25,000 costs *one* pair of numbers.

When does an aisle switch from a list to a tick-sheet? It's not a guess — it's arithmetic. A tick-sheet is a fixed 8,192 bytes. A list costs 2 bytes per item. They break even at 8,192 ÷ 2 = **4,096 items**. Below that the list is smaller; above it the tick-sheet wins. So an aisle with fewer than 4,096 red products keeps a list, and the instant it crosses 4,096 it flips itself to a tick-sheet — automatically, no one deciding globally.

### a worked example

Make it concrete. Say the red products fall like this, and watch which record each aisle ends up keeping. (A product's aisle is `id ÷ 65,536`; its slot is the remainder.)

- **Products 3, 17, and 902** — all in aisle 0, and only three of them. Three is far below 4,096, so aisle 0 keeps a **list**: literally `[3, 17, 902]`, six bytes.
- **40,000 red products scattered through aisle 5** (IDs 327,680 – 393,215). Well past 4,096, so this aisle switches to a **tick-sheet** — a flat 8 KB with a box per slot. It doesn't matter that the reds are scattered; the tick-sheet is the same 8 KB whether it holds 40,000 reds or 60,000.
- **Products 800,000 – 830,000, all red and sitting on consecutive shelves** (a newly-stocked line with sequential IDs). These land in aisle 12. That's 30,001 items — past 4,096 — but they're *consecutive*, so instead of a tick-sheet the aisle keeps a single **range**: start 13,568 (that's 800,000 − 786,432, where aisle 12 begins), length 30,000. Thirty thousand products, one pair of numbers.

```
red products  →  roaring bitmap
──────────────────────────────────────────────────────────
aisle  0  →  list        [3, 17, 902]              ~6 bytes
aisle  5  →  tick-sheet  ▦▦▢▦▢▢▦…  (40,000 red)    8 KB
aisle 12  →  range       [800,000 … 830,000]       ~4 bytes
──────────────────────────────────────────────────────────
   one set of red products — three kinds of record
```

Three aisles, three kinds of record, each chosen by what's in that aisle alone — nobody decided up front that "red" was a rare attribute or a common one, because it's *both*, in different parts of the store. That per-aisle choice is the whole idea; everything else is bookkeeping.

### the same thing in code

The nice part is that you never sort products into aisles or choose record types yourself. You just add IDs; the library files each one into the right aisle and picks that aisle's record for you. Here's that exact set of red products, built with the [RoaringBitmap](https://github.com/RoaringBitmap/RoaringBitmap) Java library:

```java
import org.roaringbitmap.RoaringBitmap;

RoaringBitmap red = new RoaringBitmap();

red.add(3);
red.add(17);
red.add(902);                  // aisle 0  — three items, kept as a small list

for (int id : scatteredRedsInAisle5) {
    red.add(id);               // aisle 5  — crosses 4,096, becomes a tick-sheet
}

red.add(800_000L, 830_001L);   // aisle 12 — one run of consecutive IDs
red.runOptimize();             // collapses that run into a single range

red.getCardinality();          // how many reds in total
red.getSizeInBytes();          // bytes actually used — small, despite the range
```

No `if (sparse) … else …` anywhere. `add` decides. `runOptimize()` is the one manual step — it scans for long consecutive ranges and rewrites them as runs. Skip it and the contiguous range above would sit as a full 8 KB bitmap instead of a few bytes.

## why this makes the operations fast

Memory is only half the story. The reason roaring is *inside* your engine is that the set operations are fast precisely because of those aisles.

To intersect two roaring bitmaps, you don't touch the data first — you line up their aisle numbers (the *chunk keys*). Both are sorted, so this is a quick merge: an aisle that appears in only one of the two sets can't contribute to an intersection, so you skip it entirely. A query for `red AND in-stock` never looks at the aisles where there are no reds.

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
