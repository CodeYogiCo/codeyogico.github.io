---
date: 2026-06-27
tag: search
title: "Retrieval is a threshold. Ranking is the product."
read: 10 min
deck: "Getting documents into the candidate set is a solved problem in most mature search systems. The order you show them in is everything. Here's why."
---

Here is a number that should change how you think about search: in a typical web search result page, the #1 result gets roughly 30% of all clicks. The #2 result gets about 15%. By rank 5, you're at 5%. Rank 10 is below 2%.

Users don't browse search results. They glance at the top three and leave.

This is the most important fact in information retrieval, and most engineering teams are not building for it. They spend months improving retrieval — tuning BM25 parameters, experimenting with dense embeddings, benchmarking ANN libraries — and comparatively little time on the ranker that decides which of those retrieved documents the user actually sees.

This post argues that in most mature search systems, retrieval is largely a solved problem, and ranking is where the real leverage lives.

## what retrieval actually does

Retrieval has one job: **recall**. Given a query, pull a set of candidate documents that contains the relevant ones. Whether you use BM25, a dense bi-encoder, or a hybrid of both, the goal is the same — get the right documents into the pool before any ranking happens.

The key word is *pool*. Retrieval doesn't decide what the user sees. It decides what the ranker is allowed to work with. A document that isn't retrieved can never be ranked. That ceiling matters.

But here's what that ceiling actually looks like in practice. In a mature system — one where the corpus is indexed, the query vocabulary is known, and at least some tuning has happened — recall@100 is often above 90%. Sometimes above 95%. Which means:

- Out of every 100 queries, the correct document is in the top 100 candidates for more than 90 of them.
- Improving retrieval to, say, 97% recall@100 changes the outcome for 7 more queries out of 100.
- But on all 100 queries, the ranker is deciding which of those 100 candidates gets shown at rank 1.

That asymmetry is the whole argument. Retrieval misses at the margins. Ranking misses on every single query.

## the math is not in retrieval's favor

Let's make this concrete. Suppose your system retrieves 100 candidates per query. Your retrieval recall@100 is 90% — the relevant document is in those 100 candidates for 90% of queries.

Now suppose your ranker is mediocre. It puts the relevant document at rank 5 on average instead of rank 1.

The user at rank 1 gets a click rate of ~30%. At rank 5, maybe 5%. That's a 6× difference in whether the user finds what they're looking for — on the 90% of queries where retrieval already succeeded.

Compare that to a perfect retrieval system at 100% recall@100, still with the same mediocre ranker. The ranker still puts the right answer at rank 5. Click rate is still 5%. You fixed retrieval perfectly and the user experience barely moved.

Now flip it. Keep retrieval at 90% recall@100, but improve the ranker so the right answer lands at rank 1.

Click rate goes from 5% to 30% on 90% of your queries. That is the engineering win that moves the needle.

## what ranking actually does

Ranking's job is not recall. It's **precision at the top**. Given a pool of candidates that probably contains the relevant documents, put the best ones first.

This sounds simple but it isn't. The ranker has to solve a harder problem than retrieval: it doesn't just need to know that a document is relevant to a query. It needs to know that it is *more* relevant than the 99 other candidates in the pool, and it needs to express that as an order.

The features that drive ranking decisions are more nuanced than anything BM25 or an embedding model uses:

- Is the query term in the title or buried in a footnote on page four?
- Has this document been clicked at high rates for similar queries before?
- Is it fresh? Does freshness matter for this query type?
- Is the document authoritative, or thin content that keyword-matched?
- Does the user's history suggest they want a technical reference or a beginner tutorial?

Retrieval doesn't know any of this. It can't. Retrieval operates at the scale of millions of documents in milliseconds; it has time for a score, not a judgment. The ranker has a smaller candidate set and more time. It can afford to be nuanced.

## the user only sees what the ranker decides

Here is the framing that makes this clearest: **the ranker is the search product**. Everything else is infrastructure.

A user who searches for something and finds the right answer at rank 1 doesn't know or care whether you used BM25 or ScaNN or a hybrid retriever. They found what they needed. The retriever is invisible to them.

A user who searches and sees the right answer at rank 7 — below two thin-content articles and an irrelevant FAQ — has had a bad experience. It doesn't matter that your retrieval recall@100 is 98%. The ranking put the wrong thing at the top and the right thing too far down to find.

Every user-facing metric you care about — click-through rate, conversion, dwell time, query reformulation rate, satisfaction — is a function of what the ranker puts at position 1, 2, and 3. Not what retrieval found.

## when retrieval does matter

None of this means retrieval is unimportant. There are real situations where retrieval is the binding constraint:

**Tail queries.** On rare or novel queries, BM25 may miss entirely if the document uses different vocabulary. Dense retrieval helps here — but only if you've thought about it at retrieval time. The ranker can't surface a document that was never retrieved.

**New domains and cold start.** When the corpus is new, there's no engagement data to inform the ranker. Retrieval quality matters more when the ranker has less signal to work with.

**Very large corpora.** If your corpus has a billion documents, even a 99% recall@1000 means 10 million queries per day where the right answer isn't in the pool. At that scale, marginal recall improvements are worth real engineering.

**Filtering and constraints.** If retrieval doesn't respect hard filters — price range, geographic region, publication date — the ranker has to compensate with soft signals, which is worse. Get the constraints right at retrieval time.

The pattern: retrieval matters most at the edges — tail queries, hard constraints, cold start, extreme scale. In the happy path of a mature system handling head and torso queries, retrieval is already good enough, and ranking is the gap.

## why teams still under-invest in ranking

Retrieval is easier to measure than ranking. You can compute recall@k with binary judgments. You can benchmark latency with a script. The number goes up; you ship it.

Ranking requires graded judgments, annotators, A/B tests, and careful thinking about position bias. It's slower to iterate on and harder to attribute to revenue. Teams default to what's easy to measure.

There's also a mental model problem. Engineers often think of retrieval as the "hard" problem — searching a billion documents in milliseconds sounds impressive. Ranking sounds like sorting. But ranking is the harder ML problem by almost every measure: the label distribution is messier, the features are noisier, the feedback loops are more subtle, and the business impact is more direct.

## what this means in practice

If you are building or improving a search system, here is the heuristic:

Measure your retrieval recall@k for a realistic k (usually 100–1000 depending on your system). If it's above 85%, your retrieval is not your biggest problem.

Then look at your ranking. What's your click rate at position 1 vs. position 3? What's your zero-result rate? What fraction of users reformulate their query within 10 seconds of clicking a result? These are ranking failures wearing retrieval's clothes.

Fix those first.

Retrieval sets the ceiling. Ranking is everything underneath it — and in most systems, there's a lot more room under the ceiling than people think.

— v
