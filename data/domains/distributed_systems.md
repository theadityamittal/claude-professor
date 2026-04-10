---json
{
  "domain_id": "distributed_systems",
  "display_name": "Distributed Systems",
  "aliases": [
    "distributed computing",
    "distributed architecture",
    "distributed"
  ],
  "related_domains": [
    "networking",
    "concurrency",
    "databases",
    "reliability_observability"
  ],
  "concept_count": 26
}
---
# Distributed Systems

Design and reasoning about systems spanning multiple networked computers.
Consensus, replication, partitioning, failure modes, and consistency models.

## Boundary
- Consensus protocols (Raft, Paxos), CRDTs, vector clocks, sagas → here
- CAP theorem, eventual consistency, linearizability → here
- Distributed transactions, two-phase commit → here
- TCP/IP, DNS, HTTP transport layer → networking
- Thread-level parallelism, async/await → concurrency
- Database replication/sharding mechanics → databases
- Circuit breakers, fault tolerance patterns → reliability_observability
