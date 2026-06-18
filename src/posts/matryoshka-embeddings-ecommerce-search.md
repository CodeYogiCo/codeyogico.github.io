---
date: 2026-06-18
tag: search
title: "Matryoshka embeddings and the e-commerce retrieval funnel"
read: 9 min
deck: "One model, many resolutions. How nested embeddings let you run cheap recall and expensive re-ranking without paying for both upfront."
---

Most teams think of embeddings as atomic. You generate a 768-dimensional vector. You store it. You compare it. You get a result. The whole vector travels through every stage of the pipeline at full cost.

Matryoshka Representation Learning (MRL) breaks that assumption. It gives you one model that produces embeddings you can truncate at multiple resolutions — and every truncation is still meaningful.

The name comes from Russian nesting dolls. The first 64 dimensions of a Matryoshka embedding are a useful representation. The first 128 are more useful. The full 768 are most useful. You choose the resolution based on what the stage of retrieval can afford.

## why this matters at e-commerce scale

A typical e-commerce search pipeline has a retrieval problem that looks like this:

- 10 million product embeddings in the index
- A user query arrives every 50ms at peak
- You need to return ranked results in under 100ms end-to-end

Full 768-dim ANN search over 10M vectors is expensive. You can make it work, but the index is large, the memory footprint is high, and every query touches a lot of data.

The standard solution is a two-stage funnel: fast approximate retrieval to get a candidate set, then more expensive re-ranking to get the final order. The problem is that both stages traditionally use the same full-dimensional embedding. You've paid the storage cost twice and the compute cost at every stage.

> MRL lets you match the embedding resolution to what each stage of the funnel actually needs.

## how the nesting works

Standard embedding training optimizes one loss: how well the full vector represents the input. MRL trains a joint loss across multiple prefix lengths — 64, 128, 256, 512, 768 — simultaneously.

The result is an embedding where every prefix is independently useful. The model has learned to pack the most important information into the first dimensions and progressively add detail as you extend the vector.

```python
# training sketch — loss computed at each granularity
dims = [64, 128, 256, 512, 768]
total_loss = 0

for d in dims:
    truncated = embedding[:d]           # first d dimensions
    loss = contrastive_loss(truncated)  # must be meaningful at this size
    total_loss += loss

total_loss.backward()
```

The first 64 dimensions aren't random — they've been explicitly trained to be a good representation at that resolution. Truncation is not approximation. It's a deliberate, lower-resolution view of the same information.

## the two-stage retrieval pattern

In e-commerce search, this maps directly onto the retrieval funnel:

**Stage 1 — recall with small embeddings**

Build your ANN index using 64 or 128-dimensional vectors. The index is 6-12× smaller than a full 768-dim index. Retrieval is faster. Memory footprint shrinks. You fetch a large candidate set — say, top 500.

```python
# index built on truncated vectors
index = build_hnsw_index(embeddings[:, :64])  # first 64 dims only

# fast recall — cheap, pulls a large candidate set
candidates = index.search(query_embedding[:64], k=500)
```

**Stage 2 — re-rank with full embeddings**

Take those 500 candidates, load their full 768-dim embeddings, and compute exact similarity scores. Re-rank. Return top 10.

```python
# re-rank candidates using full embeddings
candidate_embeddings = load_full_embeddings(candidates)  # 500 × 768
scores = cosine_similarity(query_embedding, candidate_embeddings)
ranked = sorted(zip(candidates, scores), key=lambda x: -x[1])
results = ranked[:10]
```

The expensive computation — full dot products — runs on 500 vectors, not 10 million. The cheap computation — 64-dim ANN — does the heavy lifting of narrowing the space.

## where it lands in ranking

Re-ranking with full embeddings isn't the end of the pipeline in e-commerce. After vector similarity, you typically blend in business signals: price, margin, inventory, recency, click-through rate.

MRL fits cleanly here. Vector similarity at full resolution gives you the semantic relevance signal. Everything after that is your ranking model's job.

```python
# final score blends semantic similarity with business signals
final_score = (
    0.5 * semantic_score(full_embedding)  # MRL full-dim similarity
  + 0.2 * recency_score(product)
  + 0.2 * popularity_score(product)
  + 0.1 * margin_score(product)
)
```

The MRL embedding is one input to the ranker — a well-calibrated one that doesn't require you to choose between "fast and weak" or "slow and strong" at the retrieval stage.

## the practical numbers

The gains compound:

| Stage | Standard | MRL (64-dim recall) |
|---|---|---|
| Index size (10M products) | ~30GB | ~2.5GB |
| ANN recall latency (p95) | ~40ms | ~5ms |
| Re-rank (top 500, full 768-dim) | not done | ~8ms |
| Total | ~40ms | ~13ms |

You get better latency and a re-ranking step you weren't running before — because the recall stage got cheap enough to afford it.

## what to watch for

**Recall quality at low dimensions.** 64-dim recall works well for common queries. For rare or highly specific queries, the truncated embedding may miss relevant products. Worth measuring recall@500 at each granularity before committing to a resolution.

**Training data matters more.** MRL doesn't change what the model knows — it changes how that knowledge is organized across dimensions. A weak base model trained with MRL is still a weak model. The nesting property amplifies whatever signal was there to begin with.

**Not all model families support it.** You can fine-tune MRL loss on top of existing encoders, but some models resist it. Models trained with MRL natively — like Nomic Embed or some versions of E5 — give better nested quality out of the box than post-hoc fine-tuning.

## the point

The retrieval funnel in e-commerce has always been about spending compute where it matters. Matryoshka embeddings give you a principled way to do that at the embedding level — cheap representations for wide recall, full representations for precise ranking.

One model. Multiple resolutions. You choose where to spend.

— v
