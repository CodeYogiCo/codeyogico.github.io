---
date: 2026-06-18
tag: search
title: "The first half of an embedding is also an embedding"
read: 8 min
deck: "Matryoshka representation learning, from first principles. Why you should stop treating an embedding as atomic — and how truncating one can make vector search several times faster."
---

We treat an embedding as an atom. The model hands you 768 floating-point numbers, you store all 768, you compare all 768. The vector is the unit of meaning, and you don't reach inside it any more than you'd use half a hash.

Matryoshka representation learning (MRL) breaks that assumption. With the right training, the first 256 dimensions of a 768-dim vector are themselves a perfectly good 256-dim embedding. So are the first 128. So are the first 64. One stored vector, many usable embeddings — nested like the dolls it's named after.

That single property is enough to make vector search several times faster and several times smaller, with almost no loss in quality. Here's why it works.

## The thing we usually get wrong

Truncate a normal embedding and you get garbage. A standard model spreads the signal evenly across all its dimensions; no single prefix carries the meaning. Chop off the back half and you haven't kept "most" of the vector — you've kept a random projection that happens to be the front.

MRL changes what "the front" means.

<div data-widget="mrl-truncation"></div>

The trick is in the loss function. A normal model computes its loss once, on the full 768-dim output. An MRL model computes the loss at several prefix lengths *simultaneously* — 64, 128, 256, 512, 768 — and sums them. Every prefix is graded as if it were the final embedding. Gradient descent has only one way to satisfy all of those objectives at once: push the most important, most general information into the earliest dimensions, and let later dimensions add finer detail.

The result is an ordering. Dimension 1 matters more than dimension 700. The vector stops being an atom and becomes a *ranked* representation you can cut anywhere.

Two things are worth saying plainly, because they're the usual gotchas:

- **You cannot do this to a model that wasn't trained for it.** Truncating an off-the-shelf embedding still gives garbage. The property has to be trained in.
- **Renormalize after you cut.** Cosine similarity assumes unit vectors; a truncated prefix is no longer unit-length. Re-normalize the prefix before you compare, or your distances drift.

## What it buys you: coarse to fine

Once a prefix is a real embedding, the obvious move is to search cheaply with a short prefix and only pay for full dimensions on the survivors.

<div data-widget="mrl-funnel"></div>

The first pass runs approximate nearest-neighbor search over the whole catalog using 64 dimensions. That's 12× less data to scan and 12× less arithmetic per comparison than the full vector — and ANN over a smaller vector is cheaper at every level of the index. It's allowed to be a little sloppy, because its only job is to *not* throw away the real answers. From ten million vectors it returns maybe ten thousand candidates.

Now the set is small enough that precision is cheap. Rescore those ten thousand with 256 dimensions, keep a couple hundred, then rank the final handful with the full 768-dim vectors — exact, no approximation. The expensive comparison only ever touches a few hundred items. You've spent full precision exactly where it changes the answer and nowhere else.

This is the same shape as any good retrieval funnel — cheap filter, expensive rerank — except you don't need a separate cheap model. The cheap representation is a prefix of the expensive one. One model, one stored vector.

## It stacks with quantization

Truncation cuts the *number* of dimensions. Quantization cuts the *bits per dimension* — store each value as one bit (just its sign) instead of a 32-bit float, and a single vector shrinks 32×. The two are orthogonal, so they multiply: a 768-dim float vector quantized to binary and truncated to 256 dims is a tiny fraction of the original footprint, and you still recover the precise ordering with a full-precision rescore at the end.

For a catalog of tens of millions of vectors, that's the difference between holding the index in RAM and not.

## When it's worth it

MRL earns its keep when you're memory-bound or latency-bound at scale — large catalogs, tight p99s, search that has to fan out over everything before it narrows. If your corpus is small enough that a brute-force full-dimension scan is already fast, the machinery isn't worth it; just compare the whole vectors.

But the mental shift is the real takeaway, and it outlives any one technique: **an embedding is not an atom.** It's an ordered budget of meaning, and you get to decide how much of it to spend per comparison. Once you stop treating the vector as indivisible, a lot of "we can't afford that at this scale" problems quietly turn into "spend fewer dimensions here."
