# Redesign professor-teach skill with web search integration and enhanced pedagogical features

## Phase 1 — Requirements (Concerns)
### error_handling (catalog) [done]
- Search failure never aborts teaching. Three paths: empty results → degrade with inline top-of-output signal; 429 short Retry-After → retry 2x with backoff; 429 long / timeout / bad shape → validate, fail fast to static content, signal upfront before teaching begins.
  - Open questions:
    - Should the degradation signal include the specific failure reason (timeout vs empty vs bad shape) or just a generic fallback notice?
### caching (catalog) [done]
- Decision: no caching. Web search freshness is the core value prop — caching negates it. Query variance across concepts and time means cached results would diverge anyway. Lazy invalidation was the only viable strategy for a CLI plugin, but the complexity (TTL management, staleness checks on every invocation, cache clearing) outweighs any latency or cost benefit.
### cost_optimization (catalog) [done]
- Search fires once per concern, not per concept — ~4 calls per session vs ~20. Results shared as context across all concept teachings within the concern. Concern-level query is richer and more task-grounded than per-concept queries.
### pedagogical_effectiveness (proposed) [done]
- Priority: fix weakness #3 — thread search results through all teaching blocks (not just real-world example), especially the recall question. Directly in the path of the web search feature, no new infrastructure. Weakness #1 (user preference): save data but defer acting on it — not proven. Weakness #2 (intra-session adaptation): deferred — unconstrained adaptation risks LLM declaring known_baseline to skip a required teach, which breaks the JIT contract.

## Phase 2 — High-Level Design (Components)
### concern_search [done]
- Seeds: rest, async_processing
- Proposed L2s:
  - search_query_construction (parent: retrieval_augmented_gen)
- L2 decisions:
  - 
- Discussions:
  - Whiteboard fires one search per concern at phase-start (prefetch), not at first professor-teach invocation. Query = concern vocabulary + task domain signal + current year (3-7 terms). Results passed as --search-results arg to all professor-teach calls in that concern. Fire-and-wait; prefetch means the wait happens upfront, not mid-JIT-loop.
### result_injector [done]
- Seeds: prompt_engineering
- Proposed L2s:
  - snippet_selection (parent: prompt_engineering)
- L2 decisions:
  - 
- Discussions:
  - One-anchor model: pick best snippet via concept-match then task-context domain tiebreaker. Thread single anchor through real-world example, task connection, and recall question only. Analogy block is always synthetic — snippets don't produce good analogies. Coherence over coverage.
### degradation_handler [done]
- Seeds: graceful_degradation, error_handling
- Discussions:
  - Validate shape on receipt (results array, non-empty, snippet string per item). On 429: check Retry-After header — retry 2x with backoff if ≤3s, degrade immediately if longer. On empty/bad-shape/timeout: degrade to static content. Signal at top of teaching output: specific failure reason + search term used. Teaching always continues.

## Phase 3 — Low-Level Design
_No components scheduled._

## Concept Coverage
### Phase 1
- byzantine_fault_tolerance | action=skipped_remediation
- split_brain | action=skipped_remediation
- failure_detection | action=skipped_remediation
- bulkhead_pattern | action=skipped_remediation
- circuit_breaker | action=skipped_not_due | unit=error_handling
- fault_tolerance | action=skipped_not_due | unit=error_handling
- byzantine_fault_tolerance | action=known_baseline | unit=error_handling
- split_brain | action=known_baseline | unit=error_handling
- failure_detection | action=known_baseline | unit=error_handling
- bulkhead_pattern | action=known_baseline | unit=error_handling
- error_handling | action=skipped_not_due | unit=error_handling
- graceful_degradation | action=reviewed | grade=4 | unit=error_handling
- api_error_handling | action=known_baseline | grade=3 | unit=error_handling
- defensive_programming | action=reviewed | grade=3 | unit=error_handling
- cdn | action=skipped_remediation
- static_site_generation | action=skipped_remediation
- incremental_regeneration | action=skipped_remediation
- offline_first | action=skipped_remediation
- connection_pooling | action=skipped_remediation
- cdn | action=known_baseline | unit=caching
- static_site_generation | action=known_baseline | unit=caching
- incremental_regeneration | action=known_baseline | unit=caching
- offline_first | action=known_baseline | unit=caching
- connection_pooling | action=reviewed | grade=3 | unit=caching
- caching_strategies | action=taught | grade=4 | unit=caching
- cache_invalidation | action=known_baseline | grade=3 | unit=caching
- lazy_loading | action=known_baseline | unit=caching
- multi_region | action=skipped_remediation
- database_connection_tuning | action=skipped_remediation
- auto_scaling | action=skipped_remediation
- capacity_planning | action=skipped_remediation
- model_compression | action=skipped_remediation
- virtualization | action=skipped_remediation
- multi_region | action=known_baseline | unit=cost_optimization
- database_connection_tuning | action=known_baseline | unit=cost_optimization
- auto_scaling | action=known_baseline | unit=cost_optimization
- capacity_planning | action=known_baseline | unit=cost_optimization
- model_compression | action=known_baseline | unit=cost_optimization
- virtualization | action=known_baseline | unit=cost_optimization
- cost_optimization | action=known_baseline | grade=4 | unit=cost_optimization
- cloud_primitives | action=known_baseline | unit=cost_optimization
- reinforcement_learning | action=taught | grade=2 | unit=pedagogical_effectiveness
- prompt_engineering | action=known_baseline | grade=3 | unit=pedagogical_effectiveness
### Phase 2
- rest | action=known_baseline | grade=3 | unit=concern_search
- async_processing | action=known_baseline | grade=3 | unit=concern_search
- search_query_construction | action=taught | grade=3 | unit=concern_search
- prompt_engineering | action=skipped_not_due | unit=result_injector
- snippet_selection | action=taught | grade=4 | unit=result_injector
- graceful_degradation | action=skipped_not_due | unit=degradation_handler
- error_handling | action=skipped_not_due | unit=degradation_handler
