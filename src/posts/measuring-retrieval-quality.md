---
date: 2026-05-16
tag: search
title: "Offline evaluation metrics for information retrieval"
read: 10 min
deck: "What an IR system is actually being asked, in four metrics — recall@k, precision@k, MRR, NDCG. With small calculators."
hidden: true
---

Information retrieval is the discipline of helping a person locate documents that satisfy an *information need*. Offline evaluation is how we decide whether our system does that well, before it ever touches a user.

This post walks through the four offline metrics that cover most of IR — recall@k, precision@k, MRR, NDCG — framed around the information need each is asking about. Three small calculators are embedded; play with them. Intuition lives in the fingers.

## the setup: what offline evaluation actually measures

The Cranfield idea, going back to the 1960s, is to evaluate retrieval systems against a fixed **test collection**:

- A **corpus** — the documents the system can return.
- A set of **queries** — representations of information needs.
- **Relevance judgments** — for each (query, document) pair we care about, a label saying how relevant that document is to that query. Binary (relevant / not) or graded (0–3, 0–4).

Given those, your system produces a **run**: a ranked list of documents for each query. A metric converts the run + the judgments into a single number per query, which you then average across queries.

The hard part of offline IR evaluation is rarely the metric — it's getting honest judgments at scale. TREC's pooling protocol partly solved this in the 1990s by judging only the documents that appeared in the top-k of *any* submitted system. Click logs and LLM-as-judge partly solve it today, with different distortions.

The metrics themselves are simple. The judgments aren't.

## what we measure

Four metrics that cover almost all offline IR evaluation:

| metric | judgments | scope | the question it asks |
|---|---|---|---|
| recall@k | binary | full top-k | did we surface the relevant docs anywhere in the top k? |
| precision@k | binary | full top-k | of our top k, how many are actually relevant? |
| MRR | binary | first hit only | how far did the user have to scroll for the first good answer? |
| NDCG@k | graded | full top-k | how well did we *order* the relevant docs? |

Each metric is a lens on the same underlying judgments, picked to match a particular shape of information need.

## recall@k and precision@k

The two oldest metrics in IR, and still the right starting point.

**Recall@k** = (# relevant in top-k) / (total # relevant in the corpus). *What fraction of the answers were surfaced.*

**Precision@k** = (# relevant in top-k) / k. *What fraction of the top-k are actually answers.*

The two trade off. As you grow k, recall goes up monotonically (you can only find more); precision usually goes down (you're including weaker matches). The right balance depends on the information need:

- **Known-item search** (the user is looking for one specific document they know exists): precision@1 is everything. Recall is binary — either it's at rank 1 or it isn't.
- **Topical / ad-hoc search** (the user wants to read up on a topic): precision@10, recall@10. Both matter.
- **Exhaustive / scholarly search** (the user wants every relevant paper): recall@100, recall@1000 dominate.
- **Recall stage of a multi-stage system** (cheap retriever feeding an expensive re-ranker): recall@k where k = size of the candidate pool. Precision doesn't matter — that's the re-ranker's job.

Try it:

<div data-widget="precision-recall-calc"></div>

Toggle a few high-rank results off and watch precision drop. Bump the total-relevant number up and watch recall fall. The metrics are dead simple; the interesting thing is *what they trade off against each other.*

## MRR — when only the first relevant result matters

**Mean Reciprocal Rank.** For each query, find the rank of the *first* relevant result. Take its reciprocal. Average across queries.

```
MRR = (1/|Q|) · Σ_q (1 / rank_q)        // rank_q = 0 if no relevant result, contributes 0
```

- rank 1 → 1.000
- rank 2 → 0.500
- rank 3 → 0.333
- rank 10 → 0.100
- not found → 0

The reciprocal makes MRR very top-heavy. Moving a result from rank 5 to rank 1 is worth a lot more than moving it from rank 50 to rank 46.

MRR is the right metric when the information need has the shape **"there's one right answer; how fast did we get it?"**:

- Navigational queries — "github settings", "w3c html spec".
- Known-item search — the user can describe one document and just wants it.
- Question-answering — exactly one paragraph contains the answer.

It's a poor fit when the user is browsing multiple results, or when relevance has degrees. It can only see the first hit; everything past it is invisible.

Try it:

<div data-widget="mrr-calc"></div>

Move one query's rank from 1 to 3 and watch MRR drop sharply. Now move another query from 5 to 2 — the *same magnitude of movement*, but a much bigger gain. That asymmetry is MRR's whole personality.

## NDCG — when ranking quality matters

**Normalized Discounted Cumulative Gain** is the standard metric for graded judgments. It does three useful things at once:

1. **Graded relevance.** Documents aren't just relevant / not. They get a score on a scale (typically 0–3 or 0–4) reflecting how well they satisfy the information need.
2. **Position discount.** A relevant document at rank 1 contributes more than the same document at rank 5. The discount is `1 / log₂(rank + 1)`.
3. **Normalization.** Divided by the best-possible DCG for those same scores, so NDCG always lives in `[0, 1]`. NDCG = 1.0 means "you returned the optimal ordering of these documents."

The formula:

```
DCG  = Σ_i  (2^rel_i − 1) / log₂(i + 1)        // i = 1-indexed rank
IDCG = DCG of the same scores sorted descending
NDCG = DCG / IDCG
```

The `2^rel − 1` form (sometimes called the Burges variant) weights highly-relevant documents disproportionately, which matches how users actually experience search quality — a "perfect" answer is much more than twice as good as a "kinda related" one. The older `rel_i / log₂(i+1)` form is also seen in some literature; it's a linear weighting that under-rewards top-quality matches.

NDCG@k truncates the sum at rank k. If you see NDCG reported without a k, it's usually NDCG over the full judged set per query.

Try it:

<div data-widget="ndcg-calc"></div>

A few things worth noticing as you play:

- A `3` (highly relevant) at rank 1 contributes 7 to DCG. The same `3` at rank 5 contributes ~2.7. **Position dominates.**
- Adding more `0`s at the bottom doesn't change DCG or IDCG. They contribute zero; they don't hurt and don't help.
- Adding `0`s near the top *does* hurt — they don't add DCG but they push relevant documents into lower-discount positions.
- NDCG = 1.0 only when your ranking equals the ideal ranking of *those same scores*. NDCG measures ordering, not absolute quality. A query where every retrieved document is a `1` can have NDCG = 1.0 and still represent a weak retrieval — there's nothing better to retrieve.
- If every document is `0`, IDCG = 0 and NDCG is undefined. Convention: treat it as 0.

NDCG is the right metric when:
- You have graded judgments (or graded signals you trust — dwell time, satisfaction scores, structured pools).
- The information need is topical and the user is comparing multiple results.
- You want one number per query that captures "did we order this well."

## which metric for which information need

The question to ask isn't "which metric is best?" It's *what is the user trying to do?*

| information need | best metric |
|---|---|
| navigational / known-item (one right answer) | MRR, recall@1, precision@1 |
| ad-hoc topical search (browse multiple results) | NDCG@10, precision@10 |
| exhaustive / scholarly search (find everything relevant) | recall@100, recall@1000 |
| recall stage feeding a re-ranker | recall@k, where k = pool size |
| graded judgments available | NDCG |
| only binary signals (clicks, relevance flags) | precision@k, MRR, MAP |

Pick the metric that mirrors the information need, not the one that gives the prettiest number.

## a few things about offline eval to keep in mind

The metrics are the easy part. The judgments — and trusting them — are where the work lives:

- **Unjudged ≠ not relevant.** If your judgments came from pooling an older system, a new system that finds a document at rank 30 that the old pool never included may look worse than it is. That document has no judgment, not a judgment of "not relevant." This is the dominant failure mode of using static test collections to evaluate fundamentally different systems (BM25 → dense → hybrid).
- **Average per query, not per document.** A few queries with hundreds of judged documents will dominate any naively-averaged metric. Always: compute the metric per query, then average (typically equal-weighted) across queries.
- **Confidence intervals matter.** A 0.005 NDCG difference between two systems is noise unless you've measured it with enough queries and paired-bootstrapped a CI. "Bigger number" isn't progress without that.
- **Test collections age.** Query distributions drift, the corpus changes, judged documents get deleted, judgments grow stale. Refresh on a calendar, or your eval quietly stops predicting reality.

Build the eval before you build the system. The eval compounds; the system changes every quarter.

— v
