---json
{
  "domain_id": "concurrency",
  "display_name": "Concurrency & Parallelism",
  "aliases": [
    "concurrency",
    "parallelism",
    "async",
    "multithreading",
    "async programming"
  ],
  "related_domains": [
    "operating_systems",
    "distributed_systems",
    "performance_scalability",
    "programming_languages"
  ],
  "concept_count": 23
}
---
# Concurrency & Parallelism

Coordinating multiple threads, processes, or coroutines: synchronisation primitives, lock-free
data structures, event loops, async/await, actors, and parallelism models.

## Boundary
- Threads, coroutines, fibers, green threads → here
- Mutex, semaphore, condition variable, RWLock → here
- Lock-free/wait-free algorithms, CAS, memory ordering → here
- Async/await, event loops, Promises, futures → here
- Actor model (Erlang/Akka), CSP (Go channels) → here
- OS scheduler, context switching overhead → operating_systems
- Distributed consensus, cross-node coordination → distributed_systems
- CPU-level parallelism, SIMD, GPU computing → performance_scalability
- Language-specific concurrency models (ownership, etc.) → programming_languages
