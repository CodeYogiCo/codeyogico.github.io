---
date: 2026-06-16
tag: systems
title: Every agent needs an ID
read: 5 min
deck: "Human identity is persistent, embodied, legal. Agent identity is a string in a header. The difference matters more than it sounds."
hidden: true
---

When you onboard a person to a system, you give them an account. Behind it is a name, an email, a password, a face maybe. Something anchored to a human who exists in the world and can be held responsible.

When you onboard an agent, you give it a string.

That string — an API key, a client ID, a JWT — is the whole of what the agent is, from the system's perspective. There's no person behind it. No continuity between sessions. No memory of what it did last Tuesday. Just a credential that says: this caller is allowed to do these things.

That difference is easy to underestimate until something goes wrong.

## what human identity actually does

Human identity in a system carries a lot of implicit assumptions we rarely spell out.

It's **singular** — one person, one account. If two requests come in under the same identity, they came from the same person or someone who stole their credentials.

It's **persistent** — the person existed before they logged in and will exist after they log out. Their history is theirs. Their actions accumulate into a record.

It's **accountable** — there is a human somewhere who can be asked why something happened. Audit logs are useful because the person in them can be found and questioned.

Agent identity breaks all three of these quietly.

## where agent identity diverges

An agent can run as a thousand parallel instances simultaneously, all presenting the same ID. Singular doesn't apply. When you see a hundred actions under one agent ID in your logs, you have no idea if that was one agent thinking slowly or a hundred agents running at once.

An agent has no memory across sessions by default. The ID persists; the state doesn't. Two requests from the same agent ID might come from completely different context windows, with no shared understanding of what happened between them. The account is continuous. The agent isn't.

And accountability is indirect at best. When an agent does something unexpected, the question isn't "why did the agent do that" — agents don't have reasons in the human sense. The question is "what was the agent given permission to do, and who gave it that permission." The human in the audit trail is the one who deployed the agent, not the agent itself.

> An agent ID identifies a capability, not a person. Treating it like a person is where most access control mistakes begin.

## what this means in practice

**Scope tightly.** A human account can hold broad permissions because a human brings judgment about when to use them. An agent doesn't. Every permission an agent holds is a permission it will use mechanically, at scale, without hesitation. Give it only what the specific task requires.

**Log the prompt, not just the action.** Human audit trails record what someone did. Agent audit trails need to record what the agent was told to do. An action without its instruction is half the picture.

**Treat agent IDs as ephemeral.** A human credential tied to a person is hard to rotate — there's friction, communication, support tickets. An agent credential can and should be short-lived. If an agent ID leaks, the blast radius should be small and the rotation should be fast.

**Design for parallel.** Assume any agent identity might be running as multiple simultaneous instances. If your system can't handle the same agent ID appearing in two places at once, that's a constraint worth naming explicitly — not something to discover under load.

## the deeper question

When we say an agent has an identity, we're really saying it has a slot in an authorization system. That slot has a name, some permissions, and a log of what it did under those permissions.

That's useful. But it's not the same as identity in the human sense — the thing that persists, that remembers, that can be asked to explain itself.

The confusion between the two is where bad assumptions creep in. Give agents IDs. Just don't mistake the ID for more than it is.

— v
