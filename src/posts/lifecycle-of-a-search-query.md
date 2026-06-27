---
date: 2026-06-27
tag: search
title: "The lifecycle of a search query"
read: 12 min
deck: "A query enters your system as raw text and exits as an ordered list of results. In between, it changes form four times. Here's what happens at each stage."
---

When a user types a query into a search box and hits enter, they hand your system a short string of text. Maybe eight words. Maybe three. What happens next — before any result appears on screen — is a chain of transformations, each one converting the query into a different representation, each one losing some information and gaining some structure.

Most engineers working on search understand one or two of these stages well. Few have a clear picture of how they connect. This post walks through the full lifecycle: from raw text to query understanding, through hybrid retrieval, into ranking, and out the other side as an ordered result list.

The running example throughout: a user searches for **"apple macbook pro 2024 reviews"**.

---

## stage 0: the raw query

What the system receives:

```
"apple macbook pro 2024 reviews"
```

Five tokens. No structure. The system doesn't yet know whether "apple" is a fruit, a company, or a product name. It doesn't know if the user wants to buy, to read, or to compare. It doesn't know if "2024" is critical or incidental.

Everything that follows is the system's attempt to build that structure before it can do anything useful.

---

## stage 1: query understanding

Query understanding is the stage that most search tutorials skip. It's also the stage that most differentiates a good search system from a naive one.

Several things happen here, roughly in order:

**Normalization.** Lowercase, unicode normalization, whitespace collapse. Cheap and almost always correct. The output: `"apple macbook pro 2024 reviews"`.

**Tokenization.** Split into terms. How you split matters more than it seems. A naive whitespace split gives you five tokens. A smarter tokenizer might recognize "macbook pro" as a compound entity and preserve it. The difference affects both retrieval recall and precision.

**Spell correction.** Run each token against a dictionary weighted by query frequency. "macbok" becomes "macbook". The tricky part: brand names, technical terms, and proper nouns don't appear in standard dictionaries. A spell corrector that doesn't know about "macbook" might corrupt it. Good systems maintain domain-specific whitelists — terms that should never be corrected.

**Entity recognition.** This is where the query gets its first real structure. A named entity recognizer tags the tokens:

```
"apple"       → ORG: Apple Inc.
"macbook pro" → PRODUCT: MacBook Pro
"2024"        → YEAR
"reviews"     → INFORMATIONAL_INTENT
```

This matters enormously for retrieval. "Apple" as a company should not retrieve documents about the fruit. Without entity resolution, your keyword retriever will happily return apple orchard pages alongside laptop reviews.

**Query expansion.** Optional and dangerous if done carelessly. The idea: add related terms to improve recall. For this query, a synonym system might add "laptop" and "notebook computer" to broaden coverage in case some documents use those terms instead of "macbook pro".

The risk is **query drift**: adding terms that shift the semantic center of the query. Adding "iphone" to this query because Apple makes iPhones is query drift — the user isn't looking for iPhone reviews. Expansion should be conservative and weighted lower than original terms.

**Intent classification.** The system classifies the query into a small set of intent buckets. Common buckets:

| intent | signal | example |
|---|---|---|n| navigational | single entity, likely branded | "github" |
| informational | question words, broad topics | "how does bm25 work" |
| transactional | "buy", "price", "cheap", "deal" | "buy macbook pro" |
| research/comparative | "reviews", "vs", "comparison", "best" | "macbook pro 2024 reviews" |

Our query classifies as **research/comparative**. That classification will influence how the ranker weights certain features — engagement signals (clicks) matter more for navigational queries; document depth and authority matter more for research queries.

At the end of stage 1, the system has converted the raw string into a structured object:

```
{
  raw: "apple macbook pro 2024 reviews",
  tokens: ["apple", "macbook pro", "2024", "reviews"],
  entities: [
    { text: "apple", type: "ORG", resolved: "Apple Inc." },
    { text: "macbook pro", type: "PRODUCT" },
    { text: "2024", type: "YEAR" }
  ],
  intent: "research",
  expanded_tokens: ["laptop", "notebook"],
  is_head_query: true
}
```

This structure — not the raw string — is what the retrieval stage actually works with.

---

## stage 2: hybrid retrieval

Retrieval runs two parallel searches against the corpus and merges the results. The two searches are fundamentally different in how they represent the query and the documents.

### the sparse path (BM25 / keyword)

BM25 treats the query as a **bag of terms**. It looks up each token in the inverted index — the data structure that maps terms to the list of documents containing them — and scores each candidate document based on how often the terms appear, how rare they are in the corpus, and how long the document is.

For our query, BM25 does very well. "Macbook pro", "2024", and "reviews" are precise terms. Documents that contain all three, especially in the title, will score high. BM25 is excellent at lexical precision — exact or near-exact matches.

What it cannot do: understand that a document discussing "Apple's latest laptop" is relevant even though it doesn't use the word "macbook". Term overlap is the only signal. Different vocabulary, no match.

### the dense path (bi-encoder embedding)

The dense retriever encodes the structured query into a single vector using an embedding model. Every document in the corpus was pre-encoded into a vector at index time. Retrieval is approximate nearest-neighbor search in that vector space.

For our query, the embedding captures semantic meaning, not just terms. A document about "best Apple portable computers of 2024" — no exact term overlap — gets a high cosine similarity because the embedding space maps it near the query vector.

What dense retrieval does poorly: exact term matching. A query for a specific product ID or a rare proper noun may not be well-represented in the embedding space if the model wasn't trained on that vocabulary. Dense retrieval generalizes; it's weaker at precision.

### fusion: combining the two result sets

Sparse and dense retrieval return two separate ranked lists. You need to merge them into one candidate pool. The most common approach is **Reciprocal Rank Fusion (RRF)**:

```
RRF_score(doc) = Σ  1 / (k + rank_in_list)
             for each list the doc appears in
```

where `k` is typically 60. The key property of RRF: it ignores the raw scores from each system and uses only the rank. A document at rank 1 in BM25 contributes the same amount regardless of its BM25 score. This makes the fusion robust to the fact that BM25 scores and embedding cosine similarities are on completely different scales and not directly comparable.

Alternatively, some systems learn a linear combination: `α * sparse_score + (1-α) * dense_score`. This requires normalizing both scores to the same range first, and tuning α. RRF avoids that complexity and performs surprisingly well in practice.

After fusion, you have a candidate pool — typically the top 100 to 1000 documents. Each has survived at least one retrieval pass, probably two. The pool is recall-optimized: it contains most of the relevant documents. It is not precision-optimized: it also contains a lot of irrelevant ones. That's the ranking stage's problem.

---

## stage 3: ranking

Ranking takes the candidate pool and asks a harder question than retrieval did: not "is this document relevant?" but "which of these 100 documents is most relevant, and in what order?"

A learned ranker (gradient boosted trees or a neural model) scores each candidate against a feature vector. The features pull from multiple sources:

**Query-document similarity features.**
- BM25 score from the sparse retriever (field-level: title, body, URL separately)
- Cosine similarity from the dense retriever
- Exact query match in title? Yes/no
- Term coverage: what fraction of query tokens appear in the document?

**Document quality features.** Independent of the query:
- PageRank or authority score
- Content length and density (words per sentence, not just raw length)
- Freshness: when was this page last updated?
- For our query: is "2024" in the document's publication date?

**Engagement features.** What have users done with this document for similar queries?
- Click-through rate at each rank position (propensity-corrected)
- Dwell time on previous clicks
- Skip signal: users saw this result and clicked something else

**Query-level features.** About the query itself, not the document:
- Is this a head query? (More engagement data available, more reliable signals)
- Detected intent (research queries weight document depth; navigational queries weight domain authority)
- Query length

The ranker combines these features into a single score per document and sorts the pool. This is where the nuance that retrieval couldn't capture finally gets applied. Two documents that had identical BM25 scores get separated here by engagement history, freshness, and whether the query year matches the document year.

### the re-ranking layer

Some systems add a second pass: a **cross-encoder** re-ranker on the top 10–20 candidates after the first ranking pass.

A cross-encoder takes the query and document together as input and produces a relevance score. Unlike the bi-encoder used in dense retrieval (which encodes query and document separately), the cross-encoder can model interactions between query tokens and document tokens directly — "2024" in the query next to "2024" in the document title is more signal than their individual presences.

Cross-encoders are too slow for retrieval (they'd need to score millions of documents) but fast enough for a final re-rank of 20 candidates. This is why you almost always see them at the bottom of a pipeline, not the top.

---

## the full picture

Here is the query's journey from start to finish:

```
RAW QUERY
"apple macbook pro 2024 reviews"
        |
        ▼
QUERY UNDERSTANDING
  - entity resolution: Apple → Apple Inc., macbook pro → product
  - intent: research/comparative
  - expansion: +laptop, +notebook
        |
        ├─────────────────────┐
        ▼                     ▼
SPARSE RETRIEVAL         DENSE RETRIEVAL
(BM25 on inverted index) (ANN on embeddings)
Top 100 by term match    Top 100 by semantic sim
        |
        └─────────────────────┘
                  |
                  ▼
          HYBRID FUSION (RRF)
          Top 100-1000 candidates
                  |
                  ▼
            RANKING
          Feature extraction
        + Learned scoring model
                  |
                  ▼
          RE-RANKING (optional)
          Cross-encoder on top 20
                  |
                  ▼
         FINAL RESULT LIST
         Shown to the user
```

Each stage has a different definition of "the query":

| stage | what the query is |
|---|---|
| raw input | a string |
| query understanding | a structured object with intent, entities, expanded terms |
| sparse retrieval | a weighted term vector |
| dense retrieval | a float vector in embedding space |
| ranking | a set of features per candidate document |
| result | a ranked list |

The query never stays in one form. Every stage re-interprets it for a different purpose.

---

## where each stage can fail

Knowing the lifecycle also tells you where to look when search quality is bad.

**Query understanding failures** look like: obviously wrong results for a query with clear intent, or brand names being spell-corrected into common words. The entity resolver didn't fire, or fired incorrectly. Fix: improve entity coverage, add to the spell correction whitelist.

**Retrieval failures** look like: the correct document is simply not in the result set at all. No amount of better ranking helps. You can diagnose this by checking recall@100 for a held-out set of known-relevant documents. Fix: improve the sparse index, tune the dense model, adjust hybrid fusion weights.

**Ranking failures** look like: the correct document is in the candidate pool (recall is fine) but it shows up at rank 7 instead of rank 1. The user reformulates their query or leaves unsatisfied. Fix: feature engineering, better training data, propensity correction on click signals.

Most search quality complaints in mature systems are ranking failures wearing retrieval's clothes. The document was retrieved. It just wasn't surfaced.

---

## what changes when the query is different

The lifecycle above applies to a well-formed head query — common vocabulary, clear intent, well-indexed topic. Things shift at the edges:

**Tail queries** (rare, long, or highly specific) have no engagement history. The ranker falls back heavily on query-document similarity features. Query understanding matters more — understanding entities and intent is the only signal when click data is sparse.

**Navigational queries** compress the lifecycle. If entity resolution identifies the query as pointing at a specific domain, sparse retrieval alone is often sufficient. Dense retrieval and re-ranking add latency without meaningful benefit.

**Ambiguous queries** expose the limits of intent classification. "Java" could be the programming language, the island, or the coffee. A good system either detects the ambiguity and diversifies results across interpretations, or uses session context (what did this user search before?) to disambiguate. That session signal has to be threaded all the way through from query understanding to ranking.

---

A search query's journey is not a single lookup. It is a chain of translations, each one making the query legible to a different part of the system. Understanding the chain tells you what each stage is actually responsible for — and where to look when things go wrong.

— v
