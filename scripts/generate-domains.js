'use strict';

const path = require('node:path');
const { writeMarkdownFile, ensureDir } = require('./utils.js');

const DOMAINS_DIR = path.join(__dirname, '..', 'data', 'domains');

const domains = [
  {
    frontmatter: {
      domain_id: 'algorithms_data_structures',
      display_name: 'Algorithms & Data Structures',
      aliases: ['algorithms', 'data structures', 'algo', 'DSA', 'competitive programming'],
      related_domains: ['concurrency', 'databases', 'machine_learning', 'performance_scalability'],
      concept_count: 29,
    },
    body: `# Algorithms & Data Structures

Fundamental computational building blocks: sorting, searching, graph traversal, dynamic programming,
and the data structures (arrays, trees, heaps, hash maps, graphs) that make them efficient.

## Boundary
- Sorting/searching algorithms, graph algorithms (BFS, DFS, Dijkstra), DP, greedy → here
- Arrays, linked lists, trees, heaps, hash tables, tries, skip lists → here
- Big-O complexity analysis, amortized analysis → here
- Parallel/concurrent data structures → concurrency
- Query planning, B-trees as storage engines → databases
- Neural network architectures, optimization methods → machine_learning
- Cache-aware algorithms, SIMD optimizations → performance_scalability
`,
  },
  {
    frontmatter: {
      domain_id: 'architecture',
      display_name: 'Software Architecture & Design',
      aliases: ['software architecture', 'system design', 'design patterns', 'software design'],
      related_domains: ['distributed_systems', 'api_design', 'reliability_observability', 'software_construction'],
      concept_count: 27,
    },
    body: `# Software Architecture & Design

Organizing large software systems: layered and hexagonal architectures, microservices vs. monolith,
event-driven design, CQRS, design patterns (Gang of Four), and domain-driven design.

## Boundary
- Monolith, microservices, hexagonal/onion/clean architecture, DDD → here
- Gang of Four patterns, SOLID principles, dependency inversion → here
- CQRS, event sourcing at the application level → here
- Network topology, consensus algorithms → distributed_systems
- REST/GraphQL endpoint contracts → api_design
- SLOs, circuit breakers, fault tolerance → reliability_observability
- Module structure, build systems, code organisation → software_construction
`,
  },
  {
    frontmatter: {
      domain_id: 'distributed_systems',
      display_name: 'Distributed Systems',
      aliases: ['distributed computing', 'distributed architecture', 'distributed'],
      related_domains: ['networking', 'concurrency', 'databases', 'reliability_observability'],
      concept_count: 26,
    },
    body: `# Distributed Systems

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
`,
  },
  {
    frontmatter: {
      domain_id: 'databases',
      display_name: 'Data Storage & Management',
      aliases: ['databases', 'database', 'data storage', 'SQL', 'NoSQL', 'storage'],
      related_domains: ['distributed_systems', 'performance_scalability', 'data_processing', 'reliability_observability'],
      concept_count: 28,
    },
    body: `# Data Storage & Management

Relational and non-relational databases, storage engines, indexing strategies, query optimization,
transactions, and schema design for durable, consistent data management.

## Boundary
- SQL, relational modelling, normalization, query planning → here
- NoSQL: document, key-value, columnar, graph databases → here
- ACID transactions, MVCC, write-ahead logging → here
- B-tree and LSM-tree storage engines → here
- Distributed replication and sharding strategies → here
- Cross-node consensus algorithms → distributed_systems
- ETL pipelines, stream processing → data_processing
- Query caching, read replicas for scale → performance_scalability
`,
  },
  {
    frontmatter: {
      domain_id: 'operating_systems',
      display_name: 'Operating Systems',
      aliases: ['OS', 'operating system', 'kernel', 'systems programming'],
      related_domains: ['concurrency', 'networking', 'performance_scalability', 'security'],
      concept_count: 19,
    },
    body: `# Operating Systems

Kernel internals, process and memory management, file systems, system calls, and scheduling.
The layer between hardware and user-space applications.

## Boundary
- Process/thread lifecycle, scheduling algorithms, context switching → here
- Virtual memory, paging, segmentation, demand paging → here
- File systems (ext4, NTFS, ZFS), inodes, VFS → here
- System calls, POSIX APIs → here
- Kernel-space vs. user-space networking stacks → networking
- Mutex, semaphore, lock primitives at the OS level → concurrency
- CPU caches, NUMA topology, memory bandwidth → performance_scalability
- Privilege rings, capabilities, mandatory access control → security
`,
  },
  {
    frontmatter: {
      domain_id: 'networking',
      display_name: 'Computer Networks',
      aliases: ['networking', 'networks', 'computer networking', 'TCP/IP', 'protocols'],
      related_domains: ['distributed_systems', 'security', 'operating_systems', 'reliability_observability'],
      concept_count: 16,
    },
    body: `# Computer Networks

Protocol stacks, routing, transport, application-layer protocols, and physical network topology.
How data moves reliably (or not) between machines over the internet and private networks.

## Boundary
- OSI/TCP/IP model, Ethernet, IP, TCP, UDP → here
- DNS, HTTP/1.1/2/3, TLS handshake, QUIC → here
- BGP, OSPF, routing tables, NAT, VPN tunnels → here
- Load balancing at the network layer (L4) → here
- Multi-node consensus, distributed coordination → distributed_systems
- TLS certificate management, firewall rules → security
- Kernel network stack, socket APIs → operating_systems
- Service meshes, traffic shaping for reliability → reliability_observability
`,
  },
  {
    frontmatter: {
      domain_id: 'security',
      display_name: 'Security & Cryptography',
      aliases: ['security', 'cryptography', 'infosec', 'application security', 'appsec', 'cybersecurity'],
      related_domains: ['networking', 'operating_systems', 'api_design', 'devops_infrastructure'],
      concept_count: 28,
    },
    body: `# Security & Cryptography

Protecting systems and data: cryptographic primitives, authentication/authorization, secure
coding practices, threat modelling, and vulnerability classes.

## Boundary
- Symmetric/asymmetric encryption, hashing, digital signatures, PKI → here
- OAuth 2.0, OpenID Connect, JWT, session management → here
- OWASP Top 10 (SQLi, XSS, SSRF, etc.), secure coding → here
- Threat modelling, penetration testing, CVE analysis → here
- TLS protocol mechanics → networking
- Kernel capabilities, SELinux, seccomp → operating_systems
- API authentication schemes, rate limiting → api_design
- Secret management, image scanning in CI/CD → devops_infrastructure
`,
  },
  {
    frontmatter: {
      domain_id: 'testing',
      display_name: 'Software Testing & QA',
      aliases: ['testing', 'QA', 'quality assurance', 'test automation', 'software testing'],
      related_domains: ['software_construction', 'reliability_observability', 'devops_infrastructure', 'architecture'],
      concept_count: 23,
    },
    body: `# Software Testing & QA

Strategies and techniques for verifying software correctness: unit, integration, end-to-end,
property-based, mutation, and performance testing; TDD and BDD workflows.

## Boundary
- Unit, integration, E2E, contract testing → here
- TDD, BDD, property-based testing, mutation testing → here
- Test doubles: mocks, stubs, fakes, spies → here
- Code coverage, test pyramid and trophy → here
- Observability for test failures in production → reliability_observability
- CI pipelines that run tests → devops_infrastructure
- Testable design, dependency injection → architecture
- Code structure that enables testability → software_construction
`,
  },
  {
    frontmatter: {
      domain_id: 'concurrency',
      display_name: 'Concurrency & Parallelism',
      aliases: ['concurrency', 'parallelism', 'async', 'multithreading', 'async programming'],
      related_domains: ['operating_systems', 'distributed_systems', 'performance_scalability', 'programming_languages'],
      concept_count: 23,
    },
    body: `# Concurrency & Parallelism

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
`,
  },
  {
    frontmatter: {
      domain_id: 'machine_learning',
      display_name: 'AI & Machine Learning',
      aliases: ['machine learning', 'ML', 'AI', 'deep learning', 'artificial intelligence', 'neural networks'],
      related_domains: ['algorithms_data_structures', 'data_processing', 'performance_scalability', 'programming_languages'],
      concept_count: 30,
    },
    body: `# AI & Machine Learning

Supervised, unsupervised, and reinforcement learning; neural network architectures; training
techniques; evaluation metrics; and LLM/generative AI fundamentals.

## Boundary
- Linear/logistic regression, decision trees, SVMs, ensembles → here
- Neural networks: CNNs, RNNs, Transformers, attention → here
- Backpropagation, gradient descent variants, regularization → here
- LLMs, prompt engineering, RAG, fine-tuning → here
- Reinforcement learning, reward modelling → here
- Foundational graph/tree algorithms used in ML → algorithms_data_structures
- Feature engineering pipelines, data preprocessing → data_processing
- GPU utilisation, distributed training → performance_scalability
- Type systems for tensor shapes, ML frameworks → programming_languages
`,
  },
  {
    frontmatter: {
      domain_id: 'programming_languages',
      display_name: 'Programming Languages & Type Systems',
      aliases: ['programming languages', 'type systems', 'compilers', 'language design', 'PLT'],
      related_domains: ['concurrency', 'software_construction', 'algorithms_data_structures', 'machine_learning'],
      concept_count: 22,
    },
    body: `# Programming Languages & Type Systems

Language design, type theory, compilation, interpretation, and runtime semantics.
How languages express computation, enforce safety, and are implemented.

## Boundary
- Type systems: static/dynamic, nominal/structural, generics, HKTs → here
- Compilers: parsing, ASTs, IR, code generation, optimisations → here
- Garbage collection strategies, ownership/borrow checking → here
- Functional programming: monads, functors, algebraic types → here
- Language-level concurrency models (goroutines, async/await) → concurrency
- Module systems, build tools, dependency management → software_construction
- Algorithm complexity in the context of language operations → algorithms_data_structures
- ML framework APIs, differentiable programming languages → machine_learning
`,
  },
  {
    frontmatter: {
      domain_id: 'api_design',
      display_name: 'API Design & Integration',
      aliases: ['API design', 'APIs', 'REST', 'GraphQL', 'gRPC', 'web services', 'integrations'],
      related_domains: ['architecture', 'security', 'distributed_systems', 'networking'],
      concept_count: 21,
    },
    body: `# API Design & Integration

Designing clear, evolvable interfaces between services: REST constraints, GraphQL schemas,
gRPC/Protobuf, versioning strategies, documentation, and third-party integration patterns.

## Boundary
- REST, GraphQL, gRPC, WebSockets, webhooks → here
- API versioning, backward compatibility, deprecation → here
- OpenAPI/Swagger, Protobuf schema design → here
- Pagination, filtering, rate limiting at the API layer → here
- SDK design, developer experience → here
- Service-to-service communication patterns → distributed_systems
- OAuth/JWT for API security → security
- TLS, HTTP/2, transport protocols → networking
- System-wide service composition → architecture
`,
  },
  {
    frontmatter: {
      domain_id: 'reliability_observability',
      display_name: 'Reliability & Observability',
      aliases: ['reliability', 'observability', 'SRE', 'site reliability', 'monitoring', 'SLOs', 'ops'],
      related_domains: ['distributed_systems', 'devops_infrastructure', 'databases', 'networking'],
      concept_count: 24,
    },
    body: `# Reliability & Observability

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
`,
  },
  {
    frontmatter: {
      domain_id: 'performance_scalability',
      display_name: 'Performance & Scalability',
      aliases: ['performance', 'scalability', 'optimization', 'perf', 'tuning', 'scaling'],
      related_domains: ['databases', 'distributed_systems', 'algorithms_data_structures', 'concurrency'],
      concept_count: 15,
    },
    body: `# Performance & Scalability

Making systems faster and able to handle more load: profiling, caching strategies, horizontal
and vertical scaling, capacity planning, and hardware-aware optimisation.

## Boundary
- CPU/memory profiling, flamegraphs, benchmarking → here
- Caching layers: CDN, reverse proxy, application-level, CPU cache → here
- Horizontal vs. vertical scaling, auto-scaling → here
- Capacity planning, load testing → here
- Database query tuning, index optimisation → databases
- Distributed data partitioning for scale → distributed_systems
- Algorithm complexity improvements → algorithms_data_structures
- Thread pools, async I/O, non-blocking patterns → concurrency
`,
  },
  {
    frontmatter: {
      domain_id: 'data_processing',
      display_name: 'Data Processing & Pipelines',
      aliases: ['data engineering', 'data pipelines', 'ETL', 'stream processing', 'batch processing', 'data processing'],
      related_domains: ['databases', 'distributed_systems', 'machine_learning', 'reliability_observability'],
      concept_count: 19,
    },
    body: `# Data Processing & Pipelines

Moving, transforming, and enriching data at scale: ETL/ELT workflows, stream and batch processing
frameworks, data quality, lineage, and pipeline orchestration.

## Boundary
- ETL/ELT patterns, data transformation, enrichment → here
- Batch processing (Spark, Hadoop MapReduce) → here
- Stream processing (Kafka Streams, Flink, Beam) → here
- Pipeline orchestration (Airflow, Prefect, dbt) → here
- Data quality, schema evolution, data lineage → here
- Storage formats (Parquet, Avro, ORC) and data lakes → databases
- Cross-node processing coordination → distributed_systems
- Feature pipelines for model training → machine_learning
- Pipeline SLOs, data freshness alerts → reliability_observability
`,
  },
  {
    frontmatter: {
      domain_id: 'devops_infrastructure',
      display_name: 'DevOps & Infrastructure',
      aliases: ['DevOps', 'infrastructure', 'CI/CD', 'cloud', 'IaC', 'platform engineering', 'containers'],
      related_domains: ['reliability_observability', 'security', 'networking', 'software_construction'],
      concept_count: 26,
    },
    body: `# DevOps & Infrastructure

Automating delivery and operating infrastructure: CI/CD pipelines, containers, Kubernetes,
infrastructure-as-code, cloud services, and platform engineering practices.

## Boundary
- CI/CD pipelines (GitHub Actions, Jenkins, CircleCI) → here
- Containers (Docker), orchestration (Kubernetes) → here
- Infrastructure-as-code (Terraform, Pulumi, CDK) → here
- Cloud services (AWS/GCP/Azure primitives) → here
- Configuration management (Ansible, Helm) → here
- SLOs, incident response, chaos engineering → reliability_observability
- Secrets management, image vulnerability scanning → security
- Network policies, ingress, service mesh → networking
- Build systems, dependency management → software_construction
`,
  },
  {
    frontmatter: {
      domain_id: 'frontend',
      display_name: 'Frontend Engineering',
      aliases: ['frontend', 'front-end', 'UI engineering', 'web frontend', 'client-side'],
      related_domains: ['api_design', 'performance_scalability', 'architecture', 'software_construction'],
      concept_count: 18,
    },
    body: `# Frontend Engineering

Building user interfaces for the web and mobile: component architecture, state management,
rendering strategies, accessibility, browser APIs, and performance optimisation.

## Boundary
- Component models (React, Vue, Angular, Web Components) → here
- State management (Redux, Zustand, signals, MobX) → here
- CSS, layout, design systems, accessibility (WCAG) → here
- Browser APIs, DOM, event loop, service workers → here
- SSR, SSG, hydration, streaming rendering → here
- REST/GraphQL consumption patterns → api_design
- Core Web Vitals, bundle optimisation → performance_scalability
- Frontend architecture patterns (micro-frontends) → architecture
- Build tooling (webpack, Vite, esbuild) → software_construction
`,
  },
  {
    frontmatter: {
      domain_id: 'software_construction',
      display_name: 'Software Construction',
      aliases: ['software construction', 'software engineering practices', 'coding practices', 'development practices'],
      related_domains: ['testing', 'architecture', 'devops_infrastructure', 'programming_languages'],
      concept_count: 13,
    },
    body: `# Software Construction

Day-to-day software engineering craft: code review, refactoring, technical debt management,
documentation, build systems, dependency management, and version control practices.

## Boundary
- Code review practices, pair programming, readability → here
- Refactoring techniques, legacy code strategies → here
- Build systems (Make, Bazel, Gradle, npm scripts) → here
- Dependency management, semantic versioning → here
- Technical debt tracking, feature flags → here
- Test strategies, TDD workflow → testing
- Module and package-level design → architecture
- CI/CD pipeline configuration → devops_infrastructure
- Language-specific module systems → programming_languages
`,
  },
];

function main() {
  ensureDir(DOMAINS_DIR);

  for (const { frontmatter, body } of domains) {
    const filePath = path.join(DOMAINS_DIR, `${frontmatter.domain_id}.md`);
    writeMarkdownFile(filePath, frontmatter, body);
    console.log(`  wrote ${frontmatter.domain_id}.md`);
  }

  console.log(`\nDone. ${domains.length} domain files written to data/domains/`);
}

main();
