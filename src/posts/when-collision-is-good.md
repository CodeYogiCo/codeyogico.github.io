---
date: 2026-05-27
tag: search
title: "When collision is good: semantic query caching with LSH"
read: 11 min
deck: "Exact-match caches waste memory storing the same products under dozens of near-identical query strings. Here's how Locality-Sensitive Hashing fixes that — by designing hash collisions on purpose."
---

Everyone learns the same rule on day one: hash collisions are bad. Two inputs landing in the same bucket means wasted work — longer lookup chains, unpredictable performance, security headaches. The whole point of a good hash function is to scatter inputs as randomly and evenly as possible.

Locality-Sensitive Hashing (LSH) breaks this rule deliberately. The goal is to make similar inputs land in the *same* bucket, not different ones. Collisions are the product, not the defect.

This post explains why you'd want that, how MinHash makes it work, and how an LSH-backed cache can triple the effective capacity of a search cache without adding a single byte of hardware.

## the problem with exact-match caching

A search cache is simple: hash the query string, look up the result. If a user has typed this exact query before, return the cached product list and skip the expensive retrieval pipeline.

The problem is that users don't type the same string twice. They type variations:

```
"nike running shoes"
"nike running shoe"
"running shoes nike"
"nike running sneakers"
```

Those four strings produce four different hash values, four separate cache entries, and four copies of essentially the same product list. At the scale of a large retailer — hundreds of millions of searches per day, billions of cached entries — this redundancy is not a rounding error. It's a significant fraction of your cache budget.

The question isn't whether this waste exists. It's whether we can do anything about it without making wrong cache hits a thing.

```
exact-match cache
─────────────────
"nike running shoes"     →  [products]
"nike running shoe"      →  [products]
"running shoes nike"     →  [products]
"nike running sneakers"  →  [products]

   4 cache entries — same data, copied 4 times


LSH cache
─────────
"nike running shoes"     ╮
"nike running shoe"      │
                         ├──→  [products]
"running shoes nike"     │
"nike running sneakers"  ╯

   1 cache entry — shared across all 4 queries
```

## jaccard similarity: a way to measure "same thing"

Before we can build a smarter cache, we need a way to measure whether two queries are saying the same thing.

**Jaccard similarity** is the simplest useful measure: divide the number of words the two queries share by the total number of unique words across both.

```
A = {"nike", "running", "shoes"}
B = {"nike", "running", "shoe"}

intersection = {"nike", "running"} → size 2
union        = {"nike", "running", "shoes", "shoe"} → size 4

Jaccard(A, B) = 2 / 4 = 0.5
```

Two identical queries score 1.0. Completely unrelated queries score 0.0. The score lives cleanly in [0, 1].

For the cases we care about, similar queries score 0.5–0.9. Genuinely different queries (different category, different brand, different intent) tend to score below 0.2.

## minhash: turning jaccard into a hash

Now the clever part. There's a family of hash functions — called **MinHash** — with a remarkable property:

> For any two sets A and B, if you pick a random MinHash function h, then `P(h(A) == h(B)) = Jaccard(A, B)`.

Read that again. The *probability* that two queries produce the same hash value equals their Jaccard similarity. If two queries are 80% similar, a random MinHash function will give them the same hash 80% of the time.

This is the mathematical foundation that makes everything else work. The proof is elegant but not required here — the key intuition is: MinHash works by randomly permuting the set and taking the minimum element. Two similar sets have a higher chance of sharing their minimum.

## votes: making the signal reliable

A single MinHash function with 80% agreement probability is noisy. You'd see it disagree 20% of the time even for very similar queries, and agree 20% of the time even for dissimilar ones.

The fix is to run many hash functions and count agreements.

With 36 independent MinHash functions and a vote threshold of 18:
- A query pair with Jaccard 0.8 agrees on ~29 out of 36 functions on average. Getting at least 18 agreements is almost certain.
- A query pair with Jaccard 0.2 agrees on ~7 out of 36 functions on average. Getting at least 18 agreements is extremely unlikely.

The number of agreements follows a binomial distribution. With enough functions, the tails shrink and the two populations become cleanly separated. The vote count turns a noisy per-function signal into a reliable group decision.

Play with the numbers:

<div data-widget="lsh-match-calc"></div>

Two things worth noticing:

First, the S-curve crossover falls at the threshold ratio. With 18/36 votes (50%), the crossover is at Jaccard 0.5 — queries more than 50% similar get matched, queries less than 50% similar don't. Shift the threshold to 27/36 (75%) and the crossover shifts right.

Second, more hash functions means a *steeper* curve — a sharper boundary between "matched" and "not matched". Fewer functions gives a softer, fuzzier boundary. A common choice — 36 functions with a vote threshold of 18 — gives a curve steep enough to reliably separate similar from dissimilar while staying cheap to compute.

## how the system is actually built

There are two distinct parts, running at very different timescales.

**The offline cluster builder (nightly batch job)**

Once a day, run a job over the past 30 days of query logs. For each of the top ~60M queries:

1. Compute all 36 MinHash values.
2. For each hash, record which bucket that query lands in.
3. Any two queries that land in the same bucket across multiple hash functions increment an edge weight between them.
4. Prune edges below a vote threshold (e.g., 20/36).
5. Find connected components — each component is a semantic cluster.
6. Pick a **canonical query** per cluster (simplest: most frequent query in the cluster).
7. Publish the mapping: `canonical_query → which buckets it lives in`.

The output is a static index: given any bucket ID, which canonical queries appear in it?

**The online lookup (real-time, per request)**

When a user query arrives:

1. Normalize (lowercase, trim whitespace).
2. Compute 36 MinHash values.
3. For each value, look up the canonical queries that appear in that bucket. Tally votes.
4. If the top-voted canonical query has ≥ 18 votes: it wins. Fetch its cached result.
5. If no winner: cache miss. Fall through to the full retrieval pipeline.

```python
def get_cached_results(user_query):
    q = normalize(user_query)
    votes = Counter()

    for h in HASH_FUNCTIONS:          # 36 functions
        bucket = h(q)
        for canonical in bucket_index[bucket]:
            votes[canonical] += 1

    if not votes:
        return CACHE_MISS

    winner, count = votes.most_common(1)[0]
    return cache.get(winner) if count >= MIN_VOTES else CACHE_MISS
```

The 36 hash lookups can run in parallel. Each lookup is a hash table read against a compact in-memory index. At that point it's not doing search — it's doing arithmetic and array access.

## why token weights matter

Plain Jaccard treats all words equally. That's not quite right for queries.

Consider:

- "nike shoes" vs "adidas shoes" → Jaccard = 0.33, but these are different brand queries with different expected results
- "nike shoes" vs "nike sneakers" → Jaccard = 0.33, but these almost certainly return the same products

A word like "shoes" carries more semantic meaning about the product category than a brand name. If we weight tokens by their importance — category words higher, brand names and modifiers lower — we get a similarity score that better tracks "would these two queries return the same results?"

This is **weighted Jaccard**. A typical implementation uses a tagger to label each token by its role — head noun, modifier, brand, and so on — and assigns weights to match. If your system already has a query tagger somewhere in the pipeline, reuse it. If not, a basic part-of-speech tagger that boosts nouns and discounts adjectives gets you 80% of the way there.

The math of weighted MinHash is slightly more involved (you weight the random permutation by token weight), but any decent library handles it — `datasketch` in Python, for instance. You pass in token weights, it gives you a MinHash. The rest of the system doesn't change.

## the numbers

**Cache capacity.** If a cluster of 4–5 near-duplicate queries now shares one cache entry instead of four, and the average cluster size in your query log is 3–5 queries, you're storing 3–5x fewer entries for the same result coverage. In practice this lands around a ~3x improvement in effective cache capacity.

**Hit rate on tail queries.** This is where the gains are biggest. Head queries (the top 1000 searches) already have high hit rates under exact-match caching because users type them verbatim repeatedly. Tail queries — rare, varied, one-off phrasings — are where the cache fails today. LSH clustering effectively "borrows" hits from the canonical query to cover all the tail variations. On long-tail traffic, reported gains run into the multiple-x range on F1 — often cited around 250%.

**Latency.** The cost is real. An exact-match cache lookup is one hash + one table read (~0.1 ms). LSH lookup adds 36 hashes + 36 table reads + a vote tally (~2 ms). That's a 20x increase in cache lookup overhead. The question is whether that 2 ms is acceptable given the p99 savings from serving more cache hits (and skipping 50 ms+ retrieval pipelines on misses). For most search SLOs, it is — but measure it before you commit.

## what can go wrong

**Wrong cache hits.** If LSH assigns a user query to the wrong canonical, they get irrelevant results with no recovery path — the cache says "hit" but the results are wrong. The vote threshold is your main defense. Set it too low and false matches creep in. The offline evaluation step (replaying query logs and comparing returned results against ground-truth retrieval output) is how you find the right threshold empirically before touching production.

**Cluster staleness.** Product catalogs change. A query cluster that was semantically coherent last month may not be today if a brand launches a new category or discontinues a product line. Nightly re-clustering handles the slow drift. You'll want a fast invalidation path — either a manual override or an automated signal from catalog change events — for sudden shifts.

**Cold start for new queries.** Any query that has never appeared in the training window won't be in any cluster. It's a cache miss, same as today. This is fine — it's the same baseline behavior — but it means LSH doesn't help at all for genuinely novel queries. Those are also your most expensive queries (novel phrasing → harder retrieval), but that's a separate problem.

## one breath

The insight is that hash collisions, normally a defect to engineer away, can be made into a feature. MinHash is designed so that the probability of a collision equals the Jaccard similarity between two sets. With enough hash functions and a vote threshold, the resulting match decision is reliable. Similar queries cluster together and share one cache entry; dissimilar queries don't. Cache capacity goes up, tail-query hit rate goes up, retrieval load goes down. You pay ~2 ms extra per lookup and accept that your cache is slightly fuzzy.

The math is worth understanding once. After that, the implementation is a library call and a batch job.

— v
