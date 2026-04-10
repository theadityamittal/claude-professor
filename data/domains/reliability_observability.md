---json
{
  "domain_id": "reliability_observability",
  "display_name": "Reliability & Observability",
  "aliases": [
    "reliability",
    "observability",
    "SRE",
    "site reliability",
    "monitoring",
    "SLOs",
    "ops"
  ],
  "related_domains": [
    "distributed_systems",
    "devops_infrastructure",
    "databases",
    "networking"
  ],
  "concept_count": 24
}
---
# Reliability & Observability

Building and operating systems that stay up: SLOs/SLAs/error budgets, incident management,
distributed tracing, metrics, logs, alerting, chaos engineering, and fault tolerance patterns.

## Boundary
- SLOs, SLAs, error budgets, SLIs → here
- Distributed tracing (OpenTelemetry, Jaeger), metrics (Prometheus), structured logging → here
- Alerting, on-call, incident response, postmortems → here
- Circuit breakers, retries with backoff, bulkheads, timeouts → here
- Chaos engineering, game days → here
- Kubernetes health checks, deployment strategies → devops_infrastructure
- Consensus and replication for durability → distributed_systems
- Database backup and point-in-time recovery → databases
- Network-level health probes, latency → networking
