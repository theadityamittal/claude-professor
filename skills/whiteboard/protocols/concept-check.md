# Concept Identification and Teaching Trigger Protocol

How to identify, resolve, and handle concepts during a whiteboard conversation.

## When to Check Concepts

Check concepts that are **central to a design decision** — not every technical term mentioned in passing. A concept is worth checking when:

- You are about to base a recommendation on the developer understanding it
- The developer's response suggests they may not understand it
- A design option's tradeoffs depend on understanding it
- It is a prerequisite for a deeper concept you need to discuss

Do NOT check concepts that are:
- Mentioned only in passing or as background context
- Already in the session's `concepts_checked` list (already resolved this session)

**Never skip concept-agent based on assumed developer expertise.** Always resolve through concept-agent. The `skip` status is how the system records that a developer knows a concept — not a reason to bypass the check.

## Identifying Concept Candidates

When discussing architecture, always name specific technical patterns and concepts. Replace vague language with precise terms:

- Instead of "your database might struggle" -> "you'd need connection pooling and query optimization"
- Instead of "you need something between the services" -> "a message broker like RabbitMQ or an event bus"
- Instead of "handle the failure case" -> "implement circuit breaker with fallback"

Each named concept becomes a candidate for checking.

## Batching and Resolution

When multiple concept candidates arise in the same exchange, batch them into a single concept-agent call rather than resolving one at a time.

### Spawn concept-agent for resolution:

```
Use the Agent tool to spawn concept-agent:
- description: "Resolve concept candidates"
- prompt: include the candidates list, domains from concept-scope.json, and mode
```

**Modes:**
- `resolve-only`: Phase 1 (requirements). Identify what exists, don't create new concepts.
- `resolve-or-create`: Phase 3 (LLD). Create L2 concepts for genuinely new patterns that arise during detailed design.

### Check Session State First

Before spawning concept-agent, check the session state:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js load --session-dir docs/professor/
```

Filter out any candidates already in `concepts_checked`. Only send unchecked candidates to concept-agent.

## Acting on Computed Status

The concept-agent returns a status for each resolved concept. Handle each status as follows:

### `skip` (R > 0.7 — developer knows this well)
- Use the concept freely in discussion without explanation
- Do not spawn professor-teach
- Record the concept in the session:
  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js add-concept \
    --session-dir docs/professor/ \
    --concept-id "{concept_id}" --domain "{domain}" \
    --status "known" \
    --phase "{current phase}" --context "{brief context}"
  ```

### `review` (0.3 <= R <= 0.7 — knowledge is decaying)
- Spawn professor-teach with status `review`
- Messaging: "Let me do a quick check on {concept} — it's been a while since you last looked at it."
- The teach session will be a lighter review, not a full first-teach

### `encountered_via_child` (file exists, no reviews — parent placeholder)
- Spawn professor-teach with status `encountered_via_child`
- Messaging: "You've worked with patterns that build on {concept}, but we haven't covered the concept itself. Let me walk through it."
- This is a first teach — the developer has indirect exposure but no direct teaching

### `new` (no file exists — completely unknown)
- Spawn professor-teach with status `new`
- Messaging: "Before we go further, let me cover {concept} — it's going to come up in our design."
- This is a first teach from scratch

### `teach_new` (R < 0.3 — previously taught but forgotten)
- Spawn professor-teach with status `teach_new`
- Messaging: "We covered {concept} before, but your recall has dropped. Quick refresher."
- The teach session will reference prior context if available

## Spawning professor-teach

```
Use the Agent tool:
- description: "Teach {concept_id}"
- prompt: "/claude-professor:professor-teach {concept_id} --context \"{design context}\" --status {status} --domain {domain}"
```

After professor-teach returns, record the concept in the session:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/session.js add-concept \
  --session-dir docs/professor/ \
  --concept-id "{id}" --domain "{domain}" \
  --status "{taught|reviewed|known}" --grade {1-4|null} \
  --phase "{current phase}" --context "{brief context}"
```

## Parent-Before-Child Rule (Phase 3 Only)

When an L2 concept arises during LLD and its parent L1 concept has not been covered in this session:

1. Check if the parent L1 is in `concepts_checked`
2. If not: teach the parent first, then teach the child
3. Messaging: "Before we get into {child}, let me make sure you have the foundation — {parent}."

This only applies in Phase 3 (LLD) where L2 concepts are created via `resolve-or-create` mode.

## Ambiguous Matches

When concept-agent returns candidates in the `ambiguous` array with multiple `possible_matches`:

1. Pick the match that best fits the current design context
2. If genuinely ambiguous, briefly ask the developer: "When I say {concept}, I could mean {option A} or {option B}. Which fits what you're thinking?"
3. Use their answer to resolve and proceed

## Error Handling

If concept-agent fails or a script errors:
- Warn the developer: "I couldn't look up {concept} — continuing without the check."
- Continue the design conversation. Never block on a failed concept lookup.
- Note the failure so it can be retried if the session is resumed.

## Rules

- Always name concepts explicitly. Vague language prevents checking.
- Batch lookups when possible to reduce interruptions.
- Never re-check a concept already in `concepts_checked`.
- Teach before building on a concept. Don't assume understanding.
- Keep concept teaching focused — return to the design conversation promptly.
- Distinguish first teach from review in messaging to set developer expectations.
