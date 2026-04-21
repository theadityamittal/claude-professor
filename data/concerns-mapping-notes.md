# Concerns → Seed Mapping Rationale

This document explains the reasoning behind concern scope and seed-mapping choices in `data/concerns.json`. It is the human-readable audit trail for maintainers; `concerns.json` is the machine source of truth.

## Design philosophy

- **Concerns are meeting-topic level.** A "concern" is something you'd spend 15-30 minutes discussing in a design review. Finer-grained topics are L2 proposals during HLD/LLD, not Phase 1 selections.
- **The registry is dual-purpose.** L1 concepts serve two roles: (a) Phase 1 concern selections, (b) L2 parent containers in Phase 2/3. `orphan_l1s` is the explicit allowlist for L1s that only serve role (b).
- **Coverage is complete.** Every registry L1 is either in a concern's `mapped_seeds` or in `orphan_l1s`. 407 L1s = 291 mapped + 116 orphan.

## Why these 19 concerns

The catalog extends the battle-tested 15-item list from the prior `skills/whiteboard/SKILL.md` (validated through PR #446/#447 sessions) with four canonical-source-backed additions:

- **`cost_optimization`** — AWS Well-Architected cost pillar; design-time concern for cloud architectures
- **`sli_slo_sla`** — Google SRE Book; distinct from observability (targets vs instrumentation); absent from prior list but needed in PR #446
- **`testing_strategy`** — ISO 25010 testability; legit HLD-phase topic
- **`idempotency_and_retry`** — PR #446 specifically failed when `idempotency_key` and `exponential_backoff` weren't covered by any existing concern; split from `error_handling` because the two have different teaching targets

## Concern scope notes

### Broad concerns (20+ seeds)

| Concern | Seeds | Why so broad |
|---|---|---|
| `data_consistency` | 38 | Spans concurrency primitives, distributed consensus, isolation levels, and CQRS/event-sourcing. All serve the same "correctness under parallelism" question. |
| `service_integration` | 26 | Covers architectural styles (microservices, hexagonal, DDD), transport protocols (HTTP/gRPC/WebSocket), and integration patterns (sidecar, BFF, strangler). |
| `testing_strategy` | 26 | Entire `testing` domain (23 L1s) maps here plus `frontend_testing`, `refactoring`, `static_analysis`. |
| `async_processing` | 24 | Pulls from concurrency primitives, OS process scheduling, streaming/batch processing, queues, and webhooks. |
| `deployment_strategy` | 23 | Entire devops_infrastructure deployment cluster plus build/version tooling and ML deployment (mlops, model_serving). |
| `scalability` | 21 | Horizontal/vertical/auto scaling + partitioning/sharding + load balancing + DB query tuning. |
| `security_and_secrets` | 21 | Crypto primitives + key management + threat modeling + ML guardrails/bias. |
| `data_modeling` | 22 | Relational + NoSQL + data lake + serialization + lineage — the "shape of persistent data" umbrella. |

### Narrow concerns (3-10 seeds)

| Concern | Seeds | Why narrow |
|---|---|---|
| `rate_limiting` | 3 | Focused topic; minimal direct registry matches |
| `idempotency_and_retry` | 3 | Intentionally narrow; pairs with `error_handling` |
| `schema_migration` | 5 | Most migration work happens via adjacent concerns (data_modeling, api_design) |
| `input_validation` | 6 | Focused on injection/sanitization primitives |
| `cost_optimization` | 8 | Few L1s are explicitly cost-flavored; draws from scaling + caching + compression |

## Notable cross-concern L1s (appear in 2+ concerns)

Only 3 L1s have 2 mappings; none exceeds the 4-concern cap.

- **`schema_evolution`** — in `data_modeling` (shape over time) and `schema_migration` (safely deploying the shape change)
- **`auto_scaling`** — in `scalability` (capacity) and `cost_optimization` (right-sizing)
- **`capacity_planning`** — in `scalability` (sizing for load) and `cost_optimization` (sizing for spend)

## Orphan categories

116 L1s are orphans. They cluster into predictable categories:

| Category | Count | Example | Why orphan |
|---|---|---|---|
| Algorithms/data structures | 29 | `arrays`, `bloom_filters`, `dynamic_programming` | Implementation primitives; L2 parents for specific algorithms discussed in LLD |
| Programming language features | 20 | `type_systems`, `garbage_collection`, `closures` | Language-level choices; L2 parents when discussing language-specific implementations |
| ML/AI domain-specific | 26 | `classification`, `diffusion_models`, `llm_agents` | ML-domain concepts; L2 parents when designing ML systems |
| Frontend implementation | 13 | `component_architecture`, `css_layout`, `micro_frontends` | Frontend-specific implementation; L2 parents for UI component discussions |
| OS internals | 10 | `memory_management`, `file_systems`, `kernel_architecture` | OS-level concepts; L2 parents when designing kernel-adjacent code |
| Coding patterns | 6 | `solid_principles`, `dependency_injection`, `design_patterns` | Coding-level principles; too narrow for Phase 1 architectural discussion |
| Networking fundamentals | 3 | `dns`, `osi_model`, `dhcp` | Protocol foundations; L2 parents for protocol-specific discussions |
| Practice concepts | 5 | `code_review`, `technical_debt`, `documentation` | Team practice topics; rarely design concerns |
| Concurrency models | 4 | `threads`, `actor_model`, `csp` | Paradigms at a lower level than `async_processing`; L2 parents |

## How to extend

Adding a concern:
1. Write the concern entry in `data/concerns.json` with ≥3 `mapped_seeds` drawn from the registry
2. Move those seeds out of `orphan_l1s` if they were there
3. Add a scope note in this file
4. Run `scripts/validate-concerns.js` — must exit 0

Adding L1s to the registry:
1. Decide: Phase 1 concern target or Phase 2/3 L2 parent?
2. If concern target: add to the most-fitting concern's `mapped_seeds`
3. If L2 parent only: add to `orphan_l1s` with a one-line reason
4. Validator must pass

Removing a concern:
- Move its seeds to `orphan_l1s` or distribute to other concerns; validator must pass after.
