# Phase 3: Design Whiteboard & Dynamic Concept Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform claude-professor from a backend-specialized teaching tool into a domain-agnostic solutions architect with FSRS-driven concept lifecycle and dynamic L2 concept creation.

**Architecture:** Replace `/backend-architect` + `/professor` with a single `/whiteboard` skill that orchestrates a concept-agent (resolution + L2 creation) and professor-teach (interactive teaching). Domains become markdown files with boundary definitions. Seed registry expands from 172 to 407 L1 concepts. Status is computed from FSRS, never stored.

**Tech Stack:** Node.js scripts (zero dependencies), Claude Code skills/agents (markdown), FSRS-5 algorithm, JSON + markdown frontmatter storage.

**Spec:** `docs/superpowers/specs/2026-04-09-phase3-design-whiteboard-design.md`

---

## File Structure

### New Files
- `data/domains/*.md` — 18 domain definition files (replaces `data/domains.json`)
- `scripts/migrate-v3.js` — Phase 2 → Phase 3 migration script
- `agents/concept-agent.md` — Concept resolution + L2 creation agent
- `skills/whiteboard/SKILL.md` — Main orchestrator skill
- `skills/whiteboard/templates/design-doc.md` — Design document template
- `skills/whiteboard/protocols/critique.md` — Critique escalation protocol
- `skills/whiteboard/protocols/concept-check.md` — Concept identification protocol
- `scripts/test/migrate-v3.test.js` — Migration tests
- `scripts/test/lookup-v3.test.js` — New lookup modes tests
- `scripts/test/update-v3.test.js` — New update features tests

### Modified Files
- `data/concepts_registry.json` — Expand from 172 to 407 concepts, add new fields
- `scripts/lookup.js` — Add `list-concepts` and `reconcile` modes
- `scripts/update.js` — Add `--add-alias`, `--body`, level/parent/scope_note fields
- `scripts/utils.js` — Support new frontmatter fields in read/write
- `skills/professor-teach/SKILL.md` — Updated arguments, body writing
- `skills/analyze-architecture/SKILL.md` — Add concept-scope.json output
- `.claude-plugin/plugin.json` — Version bump to 3.0.0
- `README.md` — Full rewrite

### Deprecated (kept, marked)
- `skills/professor/SKILL.md` — Add deprecation notice
- `skills/backend-architect/SKILL.md` — Add deprecation notice
- `agents/knowledge-agent.md` — Add deprecation notice
- `data/domains.json` — Removed by migrate-v3.js

---

## Task 1: Domain Markdown Files

**Files:**
- Create: `data/domains/algorithms_data_structures.md` (and 17 more)
- Delete: `data/domains.json` (after migration script, Task 8)

- [ ] **Step 1: Create domain directory**

```bash
mkdir -p data/domains
```

- [ ] **Step 2: Write domain generation script**

Create `scripts/generate-domains.js` — a one-time script that writes all 18 domain files. This is a build tool, not a runtime script.

```javascript
'use strict';

const { writeMarkdownFile, ensureDir } = require('./utils');
const path = require('path');

const domains = [
  {
    domain_id: 'algorithms_data_structures',
    display_name: 'Algorithms & Data Structures',
    aliases: ['algorithms', 'data structures', 'DSA'],
    related_domains: ['concurrency', 'performance_scalability'],
    concept_count: 29,
    description: 'Foundational algorithms and data structures for problem solving.\nSorting, searching, graphs, trees, hashing, dynamic programming, complexity analysis.',
    boundary: [
      'Sorting, searching, graph algorithms, trees, hashing, DP → here',
      'Thread-level parallelism → concurrency',
      'Caching, load balancing → performance_scalability',
    ],
  },
  {
    domain_id: 'architecture',
    display_name: 'Software Architecture & Design',
    aliases: ['software architecture', 'system design', 'design patterns'],
    related_domains: ['api_design', 'distributed_systems', 'reliability_observability'],
    concept_count: 27,
    description: 'Architectural styles, design patterns, and system decomposition.\nMicroservices, event-driven, DDD, CQRS, modularity, coupling/cohesion.',
    boundary: [
      'Architectural styles, design patterns, SOLID, DDD → here',
      'REST, GraphQL, gRPC, API contracts → api_design',
      'Consensus, replication, partitioning → distributed_systems',
      'Circuit breakers, fault tolerance → reliability_observability',
    ],
  },
  {
    domain_id: 'distributed_systems',
    display_name: 'Distributed Systems',
    aliases: ['distributed computing', 'distributed architecture'],
    related_domains: ['networking', 'concurrency', 'databases', 'reliability_observability'],
    concept_count: 26,
    description: 'Design and reasoning about systems spanning multiple networked computers.\nConsensus, replication, partitioning, failure modes, and consistency models.',
    boundary: [
      'Consensus protocols, CRDTs, vector clocks, sagas → here',
      'TCP/IP, DNS, HTTP → networking',
      'Thread-level parallelism, async/await → concurrency',
      'Database replication/sharding mechanics → databases',
      'Circuit breakers, fault tolerance → reliability_observability',
    ],
  },
  {
    domain_id: 'databases',
    display_name: 'Data Storage & Management',
    aliases: ['database', 'data storage', 'SQL', 'NoSQL'],
    related_domains: ['distributed_systems', 'data_processing', 'performance_scalability'],
    concept_count: 28,
    description: 'Database design, query optimization, and storage engine internals.\nRelational modeling, indexing, transactions, ACID, normalization, NoSQL.',
    boundary: [
      'Schema design, indexing, transactions, storage engines → here',
      'ETL, streaming, data pipelines → data_processing',
      'Sharding as distributed concern → distributed_systems',
      'Caching, connection pooling as perf concern → performance_scalability',
    ],
  },
  {
    domain_id: 'operating_systems',
    display_name: 'Operating Systems',
    aliases: ['OS', 'systems programming', 'kernel'],
    related_domains: ['concurrency', 'networking', 'security'],
    concept_count: 19,
    description: 'Process management, memory, file systems, and OS internals.\nScheduling, virtual memory, IPC, system calls, kernel architecture.',
    boundary: [
      'Process/memory management, file systems, kernel → here',
      'Threads as concurrency primitive → concurrency',
      'Containers as deployment → devops_infrastructure',
      'Network stack internals → networking',
    ],
  },
  {
    domain_id: 'networking',
    display_name: 'Computer Networks',
    aliases: ['network', 'network protocols', 'TCP/IP'],
    related_domains: ['distributed_systems', 'security', 'performance_scalability'],
    concept_count: 16,
    description: 'Network protocols, transport layers, and communication infrastructure.\nTCP/IP, HTTP, DNS, WebSockets, routing, NAT, congestion control.',
    boundary: [
      'Transport/application protocols, routing, DNS → here',
      'Load balancing, CDN → performance_scalability',
      'TLS/SSL → security',
      'API gateway, gRPC → api_design',
      'Service mesh → devops_infrastructure',
    ],
  },
  {
    domain_id: 'security',
    display_name: 'Security & Cryptography',
    aliases: ['cybersecurity', 'infosec', 'application security'],
    related_domains: ['networking', 'api_design', 'devops_infrastructure'],
    concept_count: 28,
    description: 'Authentication, authorization, encryption, and secure development.\nOAuth, OWASP, threat modeling, cryptographic primitives, access control.',
    boundary: [
      'Auth protocols, encryption, OWASP, threat modeling → here',
      'API authentication mechanisms → api_design',
      'Network encryption (TLS) → here (security decision)',
      'Secret management in infrastructure → here',
    ],
  },
  {
    domain_id: 'testing',
    display_name: 'Software Testing & QA',
    aliases: ['QA', 'test automation', 'quality assurance'],
    related_domains: ['software_construction', 'devops_infrastructure'],
    concept_count: 23,
    description: 'Testing strategies, methodologies, and quality assurance practices.\nUnit/integration/e2e, TDD, property-based, mutation, coverage.',
    boundary: [
      'Test types, TDD, coverage, test design → here',
      'Static analysis, linting → software_construction',
      'CI/CD test pipelines → devops_infrastructure',
    ],
  },
  {
    domain_id: 'concurrency',
    display_name: 'Concurrency & Parallelism',
    aliases: ['parallel computing', 'multithreading', 'async programming'],
    related_domains: ['operating_systems', 'distributed_systems', 'programming_languages'],
    concept_count: 23,
    description: 'Concurrent and parallel execution models, synchronization, and safety.\nThreads, locks, async/await, actors, CSP, deadlocks, race conditions.',
    boundary: [
      'Thread primitives, locks, async, actors, race conditions → here',
      'OS-level scheduling and process management → operating_systems',
      'Language-level concurrency models (goroutines, coroutines) → here',
      'Distributed consensus and coordination → distributed_systems',
    ],
  },
  {
    domain_id: 'machine_learning',
    display_name: 'AI & Machine Learning',
    aliases: ['ML', 'artificial intelligence', 'deep learning', 'LLM'],
    related_domains: ['data_processing', 'performance_scalability'],
    concept_count: 30,
    description: 'Machine learning algorithms, neural networks, and AI systems.\nSupervised/unsupervised, NLP, computer vision, LLM systems, MLOps.',
    boundary: [
      'Training, inference, model design, LLM engineering → here',
      'Data pipelines feeding ML → data_processing',
      'Model serving performance → performance_scalability',
    ],
  },
  {
    domain_id: 'programming_languages',
    display_name: 'Programming Languages & Type Systems',
    aliases: ['PL', 'type theory', 'language design'],
    related_domains: ['concurrency', 'software_construction'],
    concept_count: 22,
    description: 'Language paradigms, type systems, compilers, and runtime models.\nOOP, FP, generics, ownership, garbage collection, metaprogramming.',
    boundary: [
      'Paradigms, type systems, compilers, memory models → here',
      'Language-level concurrency (async/await syntax) → concurrency',
      'Code quality practices → software_construction',
    ],
  },
  {
    domain_id: 'api_design',
    display_name: 'API Design & Integration',
    aliases: ['API', 'REST API', 'web services'],
    related_domains: ['architecture', 'networking', 'security'],
    concept_count: 21,
    description: 'API paradigms, contracts, versioning, and integration patterns.\nREST, GraphQL, gRPC, pagination, rate limiting, API gateways.',
    boundary: [
      'API paradigms, versioning, contracts, error handling → here',
      'Network protocols underlying APIs → networking',
      'API authentication → security',
      'Architectural communication patterns (pub/sub) → architecture',
    ],
  },
  {
    domain_id: 'reliability_observability',
    display_name: 'Reliability & Observability',
    aliases: ['SRE', 'monitoring', 'observability'],
    related_domains: ['devops_infrastructure', 'distributed_systems', 'performance_scalability'],
    concept_count: 24,
    description: 'Service reliability, monitoring, and operational excellence.\nSLOs, distributed tracing, logging, alerting, chaos engineering, fault tolerance.',
    boundary: [
      'SLOs, monitoring, tracing, incident management, resilience → here',
      'Infrastructure provisioning → devops_infrastructure',
      'Distributed failure modes → distributed_systems',
      'Performance tuning, capacity planning → performance_scalability',
    ],
  },
  {
    domain_id: 'performance_scalability',
    display_name: 'Performance & Scalability',
    aliases: ['performance engineering', 'scaling', 'optimization'],
    related_domains: ['databases', 'networking', 'reliability_observability'],
    concept_count: 15,
    description: 'Scaling strategies, caching, and performance optimization.\nHorizontal/vertical scaling, load balancing, CDN, profiling, capacity planning.',
    boundary: [
      'Caching, scaling, load balancing, profiling → here',
      'Database query optimization → databases',
      'Network-level infrastructure → networking',
      'SLOs and monitoring → reliability_observability',
    ],
  },
  {
    domain_id: 'data_processing',
    display_name: 'Data Processing & Pipelines',
    aliases: ['data engineering', 'ETL', 'data pipelines'],
    related_domains: ['databases', 'distributed_systems', 'machine_learning'],
    concept_count: 19,
    description: 'Batch and stream processing, ETL, and data architecture.\nETL/ELT, message queues, CDC, data lakes, workflow orchestration, schema evolution.',
    boundary: [
      'Pipeline design, ETL, streaming, data architecture → here',
      'Database storage engines → databases',
      'Distributed coordination → distributed_systems',
      'ML data pipelines → machine_learning',
    ],
  },
  {
    domain_id: 'devops_infrastructure',
    display_name: 'DevOps & Infrastructure',
    aliases: ['DevOps', 'infrastructure', 'cloud', 'CI/CD'],
    related_domains: ['reliability_observability', 'security', 'testing'],
    concept_count: 26,
    description: 'CI/CD, infrastructure as code, containers, and deployment strategies.\nGitOps, Kubernetes, Terraform, deployment patterns, service mesh.',
    boundary: [
      'CI/CD, IaC, containers, orchestration, deployment → here',
      'Monitoring and alerting → reliability_observability',
      'Secret management → security',
      'Test pipelines → testing',
    ],
  },
  {
    domain_id: 'frontend',
    display_name: 'Frontend Engineering',
    aliases: ['frontend', 'web development', 'UI engineering'],
    related_domains: ['api_design', 'performance_scalability', 'testing'],
    concept_count: 18,
    description: 'Client-side architecture, rendering strategies, and browser technologies.\nComponent architecture, SSR/CSR/SSG, state management, accessibility.',
    boundary: [
      'Component architecture, rendering, state, accessibility → here',
      'API consumption patterns → api_design',
      'Frontend performance (bundle, CWV) → here (frontend-specific)',
      'Visual regression testing → testing',
    ],
  },
  {
    domain_id: 'software_construction',
    display_name: 'Software Construction',
    aliases: ['software craftsmanship', 'code quality', 'clean code'],
    related_domains: ['testing', 'programming_languages', 'devops_infrastructure'],
    concept_count: 13,
    description: 'Code quality, refactoring, debugging, and development practices.\nBuild systems, dependency management, version control, technical debt.',
    boundary: [
      'Refactoring, debugging, build systems, code quality → here',
      'Test design and methodology → testing',
      'Language-specific patterns → programming_languages',
      'CI/CD pipelines → devops_infrastructure',
    ],
  },
];

const outputDir = path.join(__dirname, '..', 'data', 'domains');
ensureDir(outputDir);

for (const d of domains) {
  const frontmatter = {
    domain_id: d.domain_id,
    display_name: d.display_name,
    aliases: d.aliases,
    related_domains: d.related_domains,
    concept_count: d.concept_count,
  };
  const body = `# ${d.display_name}\n\n${d.description}\n\n## Boundary\n${d.boundary.map(b => `- ${b}`).join('\n')}\n`;
  const filePath = path.join(outputDir, `${d.domain_id}.md`);
  writeMarkdownFile(filePath, frontmatter, body);
  console.log(`Created: ${filePath}`);
}
console.log(`\nGenerated ${domains.length} domain files in ${outputDir}`);
```

- [ ] **Step 3: Run domain generation**

```bash
node scripts/generate-domains.js
```

Expected: 18 files created in `data/domains/`.

- [ ] **Step 4: Verify domain files**

```bash
ls data/domains/ | wc -l
# Expected: 18
node -e "const u = require('./scripts/utils'); console.log(JSON.stringify(u.readMarkdownWithFrontmatter('data/domains/distributed_systems.md').frontmatter, null, 2))"
```

Expected: Frontmatter with domain_id, display_name, aliases, related_domains, concept_count.

- [ ] **Step 5: Commit**

```bash
git add data/domains/ scripts/generate-domains.js
git commit -m "feat: add 18 domain markdown files with boundary definitions"
```

---

## Task 2: Seed Registry Enrichment

**Files:**
- Modify: `data/concepts_registry.json`

The seed registry needs to expand from 172 concepts (3 fields each) to 407 concepts (8 fields each). This is a large data authoring task best done with LLM assistance + human review.

- [ ] **Step 1: Write registry expansion script**

Create `scripts/expand-registry.js` that takes the research agent outputs from brainstorming and merges them with the existing registry, adding new fields.

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

const registryPath = path.join(__dirname, '..', 'data', 'concepts_registry.json');
const existing = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

// Map existing concepts by id for dedup
const existingById = new Map(existing.map(c => [c.id, c]));

function normalizeEntry(entry) {
  return {
    concept_id: entry.concept_id || entry.id,
    domain: entry.domain,
    difficulty_tier: entry.difficulty_tier || entry.difficulty || 'intermediate',
    level: 1,
    parent_concept: null,
    is_seed_concept: true,
    aliases: entry.aliases || [],
    related_concepts: entry.related_concepts || [],
    scope_note: entry.scope_note || '',
  };
}

// Read new concepts from a JSON file passed as argument
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node expand-registry.js <new-concepts.json>');
  process.exit(1);
}

const newConcepts = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const merged = new Map();

// Add existing (normalized)
for (const c of existing) {
  const normalized = normalizeEntry({ ...c, concept_id: c.id });
  merged.set(normalized.concept_id, normalized);
}

// Add/override with new
for (const c of newConcepts) {
  const normalized = normalizeEntry(c);
  merged.set(normalized.concept_id, normalized);
}

const result = Array.from(merged.values()).sort((a, b) => {
  if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
  return a.concept_id.localeCompare(b.concept_id);
});

fs.writeFileSync(registryPath, JSON.stringify(result, null, 2) + '\n');
console.log(`Registry: ${existing.length} existing + ${newConcepts.length} new → ${result.length} total (after dedup)`);
```

- [ ] **Step 2: Compile research agent outputs into a single JSON file**

Collect all L1 concepts from the 5 research agents (from brainstorming session) into `data/new-concepts.json`. Each entry must have: concept_id, domain, difficulty_tier, scope_note, aliases, related_concepts. Apply dedup principle: concept lives in the domain where the design decision is made.

This step requires manual assembly from the research outputs and dedup resolution table in the spec.

- [ ] **Step 3: Run registry expansion**

```bash
node scripts/expand-registry.js data/new-concepts.json
```

Expected: Output showing merge statistics, ~407 total concepts.

- [ ] **Step 4: Validate registry**

```bash
node -e "
const r = require('./data/concepts_registry.json');
console.log('Total:', r.length);
console.log('Fields per entry:', Object.keys(r[0]));
console.log('Domains:', [...new Set(r.map(c => c.domain))].sort());
console.log('Missing scope_note:', r.filter(c => !c.scope_note).length);
"
```

Expected: ~407 total, 9 fields per entry, 18 unique domains, 0 missing scope_notes.

- [ ] **Step 5: Commit**

```bash
git add data/concepts_registry.json data/new-concepts.json scripts/expand-registry.js
git commit -m "feat: expand seed registry to 407 L1 concepts with scope notes and aliases"
```

---

## Task 3: utils.js — Support New Frontmatter Fields

**Files:**
- Modify: `scripts/utils.js`
- Test: `scripts/test/utils.test.js`

No functional changes needed — the existing `readMarkdownWithFrontmatter` and `writeMarkdownFile` functions handle arbitrary JSON frontmatter. But we need to verify they work with the new fields (level, parent_concept, aliases, related_concepts, scope_note).

- [ ] **Step 1: Write test for new frontmatter fields**

Add to `scripts/test/utils.test.js`:

```javascript
test('readMarkdownWithFrontmatter handles Phase 3 concept fields', () => {
  const filePath = path.join(tmpDir, 'test-concept.md');
  const frontmatter = {
    concept_id: 'chunking_strategy',
    domain: 'machine_learning',
    level: 2,
    parent_concept: 'retrieval_augmented_gen',
    is_seed_concept: false,
    difficulty_tier: 'intermediate',
    aliases: ['document_chunking', 'text_chunking'],
    related_concepts: ['tokenization'],
    scope_note: 'Strategies for splitting documents into chunks.',
    first_encountered: '2026-04-10T14:30:00Z',
    last_reviewed: '2026-04-10T15:00:00Z',
    review_history: [{ date: '2026-04-10T15:00:00Z', grade: 3, context: 'RAG design' }],
    fsrs_stability: 2.3,
    fsrs_difficulty: 6.4,
  };
  const body = '# Chunking Strategy\n\nKey points here.\n';

  writeMarkdownFile(filePath, frontmatter, body);
  const result = readMarkdownWithFrontmatter(filePath);

  assert.deepStrictEqual(result.frontmatter.aliases, ['document_chunking', 'text_chunking']);
  assert.strictEqual(result.frontmatter.level, 2);
  assert.strictEqual(result.frontmatter.parent_concept, 'retrieval_augmented_gen');
  assert.strictEqual(result.frontmatter.scope_note, 'Strategies for splitting documents into chunks.');
  assert.strictEqual(result.body.trim(), body.trim());
});

test('readMarkdownWithFrontmatter handles minimal L1 concept (parent creation)', () => {
  const filePath = path.join(tmpDir, 'minimal-l1.md');
  const frontmatter = {
    concept_id: 'oauth2',
    domain: 'security',
    level: 1,
    parent_concept: null,
    is_seed_concept: true,
    difficulty_tier: 'intermediate',
    aliases: [],
    related_concepts: [],
    scope_note: '',
    first_encountered: '2026-04-10T14:30:00Z',
    last_reviewed: null,
    review_history: [],
    fsrs_stability: 0,
    fsrs_difficulty: 0,
  };

  writeMarkdownFile(filePath, frontmatter, '');
  const result = readMarkdownWithFrontmatter(filePath);

  assert.strictEqual(result.frontmatter.level, 1);
  assert.strictEqual(result.frontmatter.parent_concept, null);
  assert.deepStrictEqual(result.frontmatter.review_history, []);
  assert.strictEqual(result.frontmatter.fsrs_stability, 0);
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test scripts/test/utils.test.js
```

Expected: All tests PASS (existing read/write handles arbitrary JSON — these should pass without code changes).

- [ ] **Step 3: Commit**

```bash
git add scripts/test/utils.test.js
git commit -m "test: verify utils.js handles Phase 3 concept frontmatter fields"
```

---

## Task 4: lookup.js — Add `list-concepts` and `reconcile` Modes

**Files:**
- Modify: `scripts/lookup.js`
- Create: `scripts/test/lookup-v3.test.js`

### Part A: `list-concepts` mode

- [ ] **Step 1: Write failing test for list-concepts**

Create `scripts/test/lookup-v3.test.js`:

```javascript
'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const LOOKUP = path.join(__dirname, '..', 'lookup.js');

function run(args) {
  return JSON.parse(execFileSync('node', [LOOKUP, ...args], { encoding: 'utf8' }));
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'lookup-v3-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConceptFile(domain, conceptId, frontmatter) {
  const dir = path.join(tmpDir, 'profile', domain);
  fs.mkdirSync(dir, { recursive: true });
  const content = `---json\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n# ${conceptId}\n`;
  fs.writeFileSync(path.join(dir, `${conceptId}.md`), content);
}

function writeRegistry(concepts) {
  const regPath = path.join(tmpDir, 'registry.json');
  fs.writeFileSync(regPath, JSON.stringify(concepts));
  return regPath;
}

describe('list-concepts mode', () => {
  test('returns concept IDs, aliases, and scope notes for specified domains', () => {
    const regPath = writeRegistry([
      { concept_id: 'consensus', domain: 'distributed_systems', difficulty_tier: 'advanced', level: 1, parent_concept: null, is_seed_concept: true, aliases: ['distributed consensus'], related_concepts: ['leader_election'], scope_note: 'Agreement among nodes.' },
      { concept_id: 'oauth2', domain: 'security', difficulty_tier: 'intermediate', level: 1, parent_concept: null, is_seed_concept: true, aliases: ['oauth'], related_concepts: [], scope_note: 'Delegation framework.' },
    ]);

    writeConceptFile('distributed_systems', 'consistent_hashing', {
      concept_id: 'consistent_hashing',
      domain: 'distributed_systems',
      level: 1,
      aliases: ['hash ring'],
      scope_note: 'Minimizes key redistribution.',
      review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
      fsrs_stability: 5,
      fsrs_difficulty: 4,
    });

    const result = run([
      'list-concepts',
      '--domains', 'distributed_systems',
      '--registry', regPath,
      '--profile-dir', path.join(tmpDir, 'profile'),
    ]);

    assert.ok(result.concepts.length >= 2);
    const ids = result.concepts.map(c => c.concept_id);
    assert.ok(ids.includes('consensus'), 'should include seed concept');
    assert.ok(ids.includes('consistent_hashing'), 'should include profile concept');

    const consensus = result.concepts.find(c => c.concept_id === 'consensus');
    assert.deepStrictEqual(consensus.aliases, ['distributed consensus']);
    assert.strictEqual(consensus.scope_note, 'Agreement among nodes.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test scripts/test/lookup-v3.test.js
```

Expected: FAIL — `list-concepts` mode not implemented.

- [ ] **Step 3: Implement `list-concepts` mode in lookup.js**

Add the `listConcepts` function and CLI handler to `scripts/lookup.js`:

```javascript
function listConcepts(domains, registryPath, profileDir) {
  const registry = utils.readJSON(registryPath) || [];
  const domainList = domains.split(',').map(d => d.trim());
  const conceptMap = new Map();

  // Add seed registry concepts for specified domains
  for (const entry of registry) {
    if (domainList.includes(entry.domain)) {
      conceptMap.set(entry.concept_id, {
        concept_id: entry.concept_id,
        domain: entry.domain,
        aliases: entry.aliases || [],
        scope_note: entry.scope_note || '',
        source: 'seed',
      });
    }
  }

  // Add/override with user profile concepts
  for (const domain of domainList) {
    const domainDir = path.join(profileDir, domain);
    if (!fs.existsSync(domainDir)) continue;
    const files = utils.listMarkdownFiles(domainDir);
    for (const file of files) {
      const { frontmatter } = utils.readMarkdownWithFrontmatter(path.join(domainDir, file));
      conceptMap.set(frontmatter.concept_id, {
        concept_id: frontmatter.concept_id,
        domain: frontmatter.domain || domain,
        aliases: frontmatter.aliases || [],
        scope_note: frontmatter.scope_note || '',
        source: 'profile',
      });
    }
  }

  return { concepts: Array.from(conceptMap.values()) };
}
```

Add to CLI entry point (after existing mode handlers):

```javascript
if (mode === 'list-concepts') {
  const domains = args.domains;
  const registryPath = args.registry;
  const profileDir = utils.expandHome(args['profile-dir']);
  if (!domains || !registryPath || !profileDir) {
    console.error(JSON.stringify({ error: 'list-concepts requires --domains, --registry, --profile-dir' }));
    process.exit(1);
  }
  const result = listConcepts(domains, registryPath, profileDir);
  console.log(JSON.stringify(result));
}
```

Export `listConcepts` alongside existing exports.

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test scripts/test/lookup-v3.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lookup.js scripts/test/lookup-v3.test.js
git commit -m "feat: add list-concepts mode to lookup.js for concept-agent scoping"
```

### Part B: `reconcile` mode

- [ ] **Step 6: Write failing test for reconcile**

Add to `scripts/test/lookup-v3.test.js`:

```javascript
describe('reconcile mode', () => {
  test('exact match returns concept ID', () => {
    const regPath = writeRegistry([
      { concept_id: 'oauth2', domain: 'security', difficulty_tier: 'intermediate', level: 1, parent_concept: null, is_seed_concept: true, aliases: ['oauth'], related_concepts: [], scope_note: 'Delegation framework.' },
    ]);

    const result = run([
      'reconcile',
      '--mode', 'exact',
      '--candidate', 'oauth2',
      '--registry', regPath,
      '--profile-dir', path.join(tmpDir, 'profile'),
    ]);

    assert.strictEqual(result.match_type, 'exact');
    assert.strictEqual(result.concept_id, 'oauth2');
  });

  test('alias match returns canonical ID', () => {
    const regPath = writeRegistry([
      { concept_id: 'oauth2', domain: 'security', difficulty_tier: 'intermediate', level: 1, parent_concept: null, is_seed_concept: true, aliases: ['oauth', 'oauth2_framework'], related_concepts: [], scope_note: 'Delegation framework.' },
    ]);

    const result = run([
      'reconcile',
      '--mode', 'alias',
      '--candidate', 'oauth',
      '--registry', regPath,
      '--profile-dir', path.join(tmpDir, 'profile'),
    ]);

    assert.strictEqual(result.match_type, 'alias');
    assert.strictEqual(result.concept_id, 'oauth2');
  });

  test('no match returns no_match', () => {
    const regPath = writeRegistry([
      { concept_id: 'oauth2', domain: 'security', difficulty_tier: 'intermediate', level: 1, parent_concept: null, is_seed_concept: true, aliases: [], related_concepts: [], scope_note: 'Delegation framework.' },
    ]);

    const result = run([
      'reconcile',
      '--mode', 'exact',
      '--candidate', 'nonexistent_concept',
      '--registry', regPath,
      '--profile-dir', path.join(tmpDir, 'profile'),
    ]);

    assert.strictEqual(result.match_type, 'no_match');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
node --test scripts/test/lookup-v3.test.js
```

Expected: FAIL — `reconcile` mode not implemented.

- [ ] **Step 8: Implement `reconcile` mode**

Add to `scripts/lookup.js`:

```javascript
function reconcile(mode, candidate, registryPath, profileDir) {
  const registry = utils.readJSON(registryPath) || [];
  const candidateLower = candidate.toLowerCase();

  if (mode === 'exact') {
    // Check seed registry
    const seedMatch = registry.find(c => c.concept_id === candidateLower);
    if (seedMatch) return { match_type: 'exact', concept_id: seedMatch.concept_id, domain: seedMatch.domain, source: 'seed' };

    // Check user profile (scan all domain dirs)
    const domains = fs.readdirSync(profileDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    for (const domain of domains) {
      const filePath = path.join(profileDir, domain, `${candidateLower}.md`);
      if (fs.existsSync(filePath)) {
        const { frontmatter } = utils.readMarkdownWithFrontmatter(filePath);
        return { match_type: 'exact', concept_id: frontmatter.concept_id, domain, source: 'profile' };
      }
    }
    return { match_type: 'no_match' };
  }

  if (mode === 'alias') {
    // Check seed registry aliases
    for (const entry of registry) {
      const aliases = (entry.aliases || []).map(a => a.toLowerCase());
      if (aliases.includes(candidateLower)) {
        return { match_type: 'alias', concept_id: entry.concept_id, domain: entry.domain, source: 'seed' };
      }
    }

    // Check user profile aliases
    try {
      const domains = fs.readdirSync(profileDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
      for (const domain of domains) {
        const domainDir = path.join(profileDir, domain);
        const files = utils.listMarkdownFiles(domainDir);
        for (const file of files) {
          const { frontmatter } = utils.readMarkdownWithFrontmatter(path.join(domainDir, file));
          const aliases = (frontmatter.aliases || []).map(a => a.toLowerCase());
          if (aliases.includes(candidateLower)) {
            return { match_type: 'alias', concept_id: frontmatter.concept_id, domain, source: 'profile' };
          }
        }
      }
    } catch (e) { /* profile dir may not exist */ }
    return { match_type: 'no_match' };
  }

  return { error: `Unknown reconcile mode: ${mode}` };
}
```

Add CLI handler:

```javascript
if (mode === 'reconcile') {
  const reconcileMode = args.mode;
  const candidate = args.candidate;
  const registryPath = args.registry;
  const profileDir = utils.expandHome(args['profile-dir']);
  if (!reconcileMode || !candidate || !registryPath || !profileDir) {
    console.error(JSON.stringify({ error: 'reconcile requires --mode, --candidate, --registry, --profile-dir' }));
    process.exit(1);
  }
  const result = reconcile(reconcileMode, candidate, registryPath, profileDir);
  console.log(JSON.stringify(result));
}
```

Export `reconcile`.

- [ ] **Step 9: Run all tests**

```bash
node --test scripts/test/lookup-v3.test.js && node --test scripts/test/lookup.test.js
```

Expected: All PASS (new tests + existing tests unbroken).

- [ ] **Step 10: Commit**

```bash
git add scripts/lookup.js scripts/test/lookup-v3.test.js
git commit -m "feat: add reconcile mode to lookup.js for exact and alias matching"
```

---

## Task 5: update.js — New Fields and Features

**Files:**
- Modify: `scripts/update.js`
- Create: `scripts/test/update-v3.test.js`

### Part A: Support new concept fields on creation

- [ ] **Step 1: Write failing test for new fields**

Create `scripts/test/update-v3.test.js`:

```javascript
'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readMarkdownWithFrontmatter } = require('../utils');

const UPDATE = path.join(__dirname, '..', 'update.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'update-v3-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Phase 3 concept creation', () => {
  test('creates L2 concept with parent, aliases, scope_note', () => {
    execFileSync('node', [UPDATE,
      '--concept', 'chunking_strategy',
      '--domain', 'machine_learning',
      '--grade', '3',
      '--profile-dir', tmpDir,
      '--level', '2',
      '--parent-concept', 'retrieval_augmented_gen',
      '--aliases', 'document_chunking,text_chunking',
      '--scope-note', 'Strategies for splitting documents into chunks.',
      '--related-concepts', 'tokenization,retrieval_augmented_gen',
    ]);

    const filePath = path.join(tmpDir, 'machine_learning', 'chunking_strategy.md');
    assert.ok(fs.existsSync(filePath));

    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.strictEqual(frontmatter.level, 2);
    assert.strictEqual(frontmatter.parent_concept, 'retrieval_augmented_gen');
    assert.deepStrictEqual(frontmatter.aliases, ['document_chunking', 'text_chunking']);
    assert.strictEqual(frontmatter.scope_note, 'Strategies for splitting documents into chunks.');
    assert.deepStrictEqual(frontmatter.related_concepts, ['tokenization', 'retrieval_augmented_gen']);
    assert.strictEqual(frontmatter.is_seed_concept, false);
  });

  test('creates parent L1 with FSRS defaults (no grade)', () => {
    execFileSync('node', [UPDATE,
      '--concept', 'oauth2',
      '--domain', 'security',
      '--profile-dir', tmpDir,
      '--create-parent',
      '--level', '1',
      '--is-seed-concept',
      '--scope-note', 'Delegation framework for third-party access.',
      '--aliases', 'oauth',
    ]);

    const filePath = path.join(tmpDir, 'security', 'oauth2.md');
    assert.ok(fs.existsSync(filePath));

    const { frontmatter } = readMarkdownWithFrontmatter(filePath);
    assert.strictEqual(frontmatter.level, 1);
    assert.strictEqual(frontmatter.parent_concept, null);
    assert.strictEqual(frontmatter.fsrs_stability, 0);
    assert.strictEqual(frontmatter.fsrs_difficulty, 0);
    assert.deepStrictEqual(frontmatter.review_history, []);
    assert.strictEqual(frontmatter.is_seed_concept, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test scripts/test/update-v3.test.js
```

Expected: FAIL — new flags not supported.

- [ ] **Step 3: Implement new fields in update.js**

Modify the `update` function in `scripts/update.js` to accept new options:

```javascript
function update(options) {
  const {
    concept, domain, grade, isRegistryConcept, difficultyTier,
    profileDir, documentationUrl, notes,
    // Phase 3 new fields
    level, parentConcept, aliases, scopeNote, relatedConcepts,
    isSeedConcept, createParent, body,
  } = options;

  const domainDir = path.join(profileDir, domain);
  utils.ensureDir(domainDir);
  const filePath = path.join(domainDir, `${concept}.md`);

  if (!fs.existsSync(filePath)) {
    // New concept creation
    const gradeNum = grade ? parseInt(grade, 10) : null;
    const now = utils.isoNow();

    const frontmatter = {
      concept_id: concept,
      domain,
      level: level ? parseInt(level, 10) : 1,
      parent_concept: parentConcept || null,
      is_seed_concept: isSeedConcept || isRegistryConcept || false,
      difficulty_tier: difficultyTier || 'intermediate',
      aliases: aliases ? aliases.split(',').map(a => a.trim()) : [],
      related_concepts: relatedConcepts ? relatedConcepts.split(',').map(r => r.trim()) : [],
      scope_note: scopeNote || '',
      first_encountered: now,
      last_reviewed: gradeNum ? now : null,
      review_history: gradeNum ? [{ date: now, grade: gradeNum }] : [],
      fsrs_stability: gradeNum ? fsrs.getInitialStability(gradeNum) : 0,
      fsrs_difficulty: gradeNum ? fsrs.getInitialDifficulty(gradeNum) : 0,
    };

    const fileBody = body || '';
    utils.writeMarkdownFile(filePath, frontmatter, fileBody);

    const action = gradeNum ? fsrs.determineAction(1.0) : 'teach_new';
    return { success: true, concept_id: concept, domain, new_stability: frontmatter.fsrs_stability, new_difficulty: frontmatter.fsrs_difficulty, action };
  }

  // ... existing update logic for existing files (unchanged)
}
```

Update the CLI entry point to parse the new flags: `--level`, `--parent-concept`, `--aliases`, `--scope-note`, `--related-concepts`, `--is-seed-concept`, `--create-parent`, `--body`.

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test/update-v3.test.js && node --test scripts/test/update.test.js
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/update.js scripts/test/update-v3.test.js
git commit -m "feat: update.js supports level, parent, aliases, scope_note, create-parent mode"
```

### Part B: `--add-alias` and `--body` flags

- [ ] **Step 6: Write failing tests for add-alias and body**

Add to `scripts/test/update-v3.test.js`:

```javascript
describe('add-alias flag', () => {
  test('appends alias to existing concept', () => {
    // Create concept first
    execFileSync('node', [UPDATE,
      '--concept', 'oauth2', '--domain', 'security', '--grade', '3',
      '--profile-dir', tmpDir, '--aliases', 'oauth',
    ]);

    // Add alias
    execFileSync('node', [UPDATE,
      '--concept', 'oauth2', '--domain', 'security',
      '--profile-dir', tmpDir, '--add-alias', 'oauth2_framework',
    ]);

    const { frontmatter } = readMarkdownWithFrontmatter(path.join(tmpDir, 'security', 'oauth2.md'));
    assert.ok(frontmatter.aliases.includes('oauth'));
    assert.ok(frontmatter.aliases.includes('oauth2_framework'));
  });
});

describe('body flag', () => {
  test('writes markdown body to concept file', () => {
    execFileSync('node', [UPDATE,
      '--concept', 'oauth2', '--domain', 'security', '--grade', '3',
      '--profile-dir', tmpDir,
    ]);

    execFileSync('node', [UPDATE,
      '--concept', 'oauth2', '--domain', 'security',
      '--profile-dir', tmpDir,
      '--body', '# OAuth2\n\n## Key Points\n- Delegation framework\n- Authorization code flow\n',
    ]);

    const { body } = readMarkdownWithFrontmatter(path.join(tmpDir, 'security', 'oauth2.md'));
    assert.ok(body.includes('## Key Points'));
    assert.ok(body.includes('Delegation framework'));
  });
});
```

- [ ] **Step 7: Implement add-alias and body**

Add to the existing-file update path in `update.js`:

```javascript
// Handle --add-alias (no grade needed)
if (options.addAlias) {
  const existing = frontmatter.aliases || [];
  const newAlias = options.addAlias.trim();
  if (!existing.includes(newAlias)) {
    frontmatter.aliases = [...existing, newAlias];
    utils.writeMarkdownFile(filePath, frontmatter, existingBody);
  }
  return { success: true, concept_id: concept, action: 'alias_added' };
}

// Handle --body (replace markdown body)
if (options.body) {
  utils.writeMarkdownFile(filePath, frontmatter, options.body);
  return { success: true, concept_id: concept, action: 'body_updated' };
}
```

- [ ] **Step 8: Run tests**

```bash
node --test scripts/test/update-v3.test.js && node --test scripts/test/update.test.js
```

Expected: All PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/update.js scripts/test/update-v3.test.js
git commit -m "feat: update.js add-alias and body writing for professor-teach integration"
```

---

## Task 6: migrate-v3.js

**Files:**
- Create: `scripts/migrate-v3.js`
- Create: `scripts/test/migrate-v3.test.js`

- [ ] **Step 1: Write failing tests**

Create `scripts/test/migrate-v3.test.js`:

```javascript
'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readMarkdownWithFrontmatter } = require('../utils');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'migrate-v3-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createV2Concept(domain, conceptId, frontmatter) {
  const dir = path.join(tmpDir, domain);
  fs.mkdirSync(dir, { recursive: true });
  const content = `---json\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n# ${conceptId}\n`;
  fs.writeFileSync(path.join(dir, `${conceptId}.md`), content);
}

describe('migrate-v3', () => {
  test('renames systems/ to operating_systems/', () => {
    createV2Concept('systems', 'processes', {
      concept_id: 'processes', domain: 'systems',
      is_registry_concept: true, difficulty_tier: 'beginner',
      fsrs_stability: 5, fsrs_difficulty: 3,
      review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
    });

    const { migrate } = require('../migrate-v3');
    const result = migrate(tmpDir);

    assert.ok(fs.existsSync(path.join(tmpDir, 'operating_systems', 'processes.md')));
    assert.ok(!fs.existsSync(path.join(tmpDir, 'systems', 'processes.md')));

    const { frontmatter } = readMarkdownWithFrontmatter(path.join(tmpDir, 'operating_systems', 'processes.md'));
    assert.strictEqual(frontmatter.domain, 'operating_systems');
    assert.strictEqual(frontmatter.is_seed_concept, true);
    assert.strictEqual(frontmatter.level, 1);
  });

  test('merges algorithms/ + data_structures/ into algorithms_data_structures/', () => {
    createV2Concept('algorithms', 'binary_search', {
      concept_id: 'binary_search', domain: 'algorithms',
      is_registry_concept: true, difficulty_tier: 'foundational',
      fsrs_stability: 3, fsrs_difficulty: 2,
      review_history: [{ date: '2026-04-01T00:00:00Z', grade: 4 }],
    });
    createV2Concept('data_structures', 'hash_tables', {
      concept_id: 'hash_tables', domain: 'data_structures',
      is_registry_concept: true, difficulty_tier: 'beginner',
      fsrs_stability: 4, fsrs_difficulty: 3,
      review_history: [],
    });

    const { migrate } = require('../migrate-v3');
    migrate(tmpDir);

    assert.ok(fs.existsSync(path.join(tmpDir, 'algorithms_data_structures', 'binary_search.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'algorithms_data_structures', 'hash_tables.md')));
  });

  test('adds default Phase 3 fields to migrated concepts', () => {
    createV2Concept('databases', 'acid_properties', {
      concept_id: 'acid_properties', domain: 'databases',
      is_registry_concept: true, difficulty_tier: 'foundational',
      fsrs_stability: 8, fsrs_difficulty: 2,
      review_history: [{ date: '2026-04-01T00:00:00Z', grade: 3 }],
    });

    const { migrate } = require('../migrate-v3');
    migrate(tmpDir);

    const { frontmatter } = readMarkdownWithFrontmatter(path.join(tmpDir, 'databases', 'acid_properties.md'));
    assert.strictEqual(frontmatter.level, 1);
    assert.strictEqual(frontmatter.parent_concept, null);
    assert.deepStrictEqual(frontmatter.aliases, []);
    assert.deepStrictEqual(frontmatter.related_concepts, []);
    assert.strictEqual(frontmatter.scope_note, '');
    assert.strictEqual(frontmatter.is_seed_concept, true);
    // FSRS fields preserved
    assert.strictEqual(frontmatter.fsrs_stability, 8);
  });

  test('is idempotent', () => {
    createV2Concept('systems', 'processes', {
      concept_id: 'processes', domain: 'systems',
      is_registry_concept: true, difficulty_tier: 'beginner',
      fsrs_stability: 5, fsrs_difficulty: 3,
      review_history: [],
    });

    const { migrate } = require('../migrate-v3');
    migrate(tmpDir);
    const result2 = migrate(tmpDir);

    assert.strictEqual(result2.skipped > 0, true);
    assert.ok(fs.existsSync(path.join(tmpDir, 'operating_systems', 'processes.md')));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test scripts/test/migrate-v3.test.js
```

Expected: FAIL — `migrate-v3.js` doesn't exist.

- [ ] **Step 3: Implement migrate-v3.js**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const utils = require('./utils');

// Domain rename map: old → new
const DOMAIN_RENAMES = {
  systems: 'operating_systems',
  ml_ai: 'machine_learning',
  languages: 'programming_languages',
};

// Domain merge map: old → target
const DOMAIN_MERGES = {
  algorithms: 'algorithms_data_structures',
  data_structures: 'algorithms_data_structures',
  cloud_infrastructure: 'devops_infrastructure',
};

// Backend concept redistribution: concept_id → new domain
const BACKEND_MAP = {
  rest_api: 'api_design',
  graphql: 'api_design',
  websockets: 'networking',
  middleware: 'architecture',
  async_patterns: 'concurrency',
  event_sourcing: 'architecture',
  circuit_breaker: 'reliability_observability',
  rate_limiting: 'api_design',
  idempotency: 'distributed_systems',
  session_management: 'security',
  connection_pooling: 'databases',
  caching: 'performance_scalability',
  message_queue: 'performance_scalability',
  microservices: 'architecture',
  api_gateway: 'api_design',
  pagination: 'api_design',
  authentication: 'security',
  authorization: 'security',
};

// Tools concepts → software_construction
const TOOLS_REDIRECT = 'software_construction';

// Retired domains (all remaining concepts go here)
const RETIRED_FALLBACKS = {
  backend: 'architecture',  // fallback for unmapped backend concepts
  tools: TOOLS_REDIRECT,
  custom: '_unmapped',
};

function migrate(profileDir) {
  const stats = { moved: 0, skipped: 0, enriched: 0, errors: [] };

  function moveAndEnrich(srcPath, destDir, destDomain) {
    const destPath = path.join(destDir, path.basename(srcPath));
    if (fs.existsSync(destPath)) {
      stats.skipped++;
      return;
    }

    const { frontmatter, body } = utils.readMarkdownWithFrontmatter(srcPath);

    // Update domain
    frontmatter.domain = destDomain;

    // Add Phase 3 defaults if missing
    if (frontmatter.level === undefined) frontmatter.level = 1;
    if (frontmatter.parent_concept === undefined) frontmatter.parent_concept = null;
    if (frontmatter.aliases === undefined) frontmatter.aliases = [];
    if (frontmatter.related_concepts === undefined) frontmatter.related_concepts = [];
    if (frontmatter.scope_note === undefined) frontmatter.scope_note = '';

    // Rename is_registry_concept → is_seed_concept
    if (frontmatter.is_registry_concept !== undefined) {
      frontmatter.is_seed_concept = frontmatter.is_registry_concept;
      delete frontmatter.is_registry_concept;
    }
    if (frontmatter.is_seed_concept === undefined) frontmatter.is_seed_concept = true;

    // Rename difficulty tiers
    if (frontmatter.difficulty_tier === 'foundational') frontmatter.difficulty_tier = 'beginner';

    utils.ensureDir(destDir);
    utils.writeMarkdownFile(destPath, frontmatter, body);
    fs.unlinkSync(srcPath);
    stats.moved++;
    stats.enriched++;
  }

  // Process each old domain directory
  const entries = fs.readdirSync(profileDir, { withFileTypes: true }).filter(e => e.isDirectory());

  for (const entry of entries) {
    const oldDomain = entry.name;
    const oldDir = path.join(profileDir, oldDomain);
    const files = utils.listMarkdownFiles(oldDir);

    if (files.length === 0) continue;

    let targetDomain = oldDomain;

    // Handle renames
    if (DOMAIN_RENAMES[oldDomain]) {
      targetDomain = DOMAIN_RENAMES[oldDomain];
    }
    // Handle merges
    else if (DOMAIN_MERGES[oldDomain]) {
      targetDomain = DOMAIN_MERGES[oldDomain];
    }
    // Handle backend redistribution
    else if (oldDomain === 'backend') {
      for (const file of files) {
        const conceptId = path.basename(file, '.md');
        const dest = BACKEND_MAP[conceptId] || RETIRED_FALLBACKS.backend;
        const destDir = path.join(profileDir, dest);
        moveAndEnrich(path.join(oldDir, file), destDir, dest);
      }
      // Remove empty directory
      try { fs.rmdirSync(oldDir); } catch (e) { /* not empty */ }
      continue;
    }
    // Handle tools → software_construction
    else if (oldDomain === 'tools') {
      targetDomain = TOOLS_REDIRECT;
    }
    // Handle custom → _unmapped
    else if (oldDomain === 'custom') {
      targetDomain = '_unmapped';
    }

    if (targetDomain !== oldDomain) {
      const destDir = path.join(profileDir, targetDomain);
      for (const file of files) {
        moveAndEnrich(path.join(oldDir, file), destDir, targetDomain);
      }
      try { fs.rmdirSync(oldDir); } catch (e) { /* not empty */ }
    } else {
      // Same domain — just enrich with new fields
      for (const file of files) {
        const filePath = path.join(oldDir, file);
        const { frontmatter, body } = utils.readMarkdownWithFrontmatter(filePath);

        let changed = false;
        if (frontmatter.level === undefined) { frontmatter.level = 1; changed = true; }
        if (frontmatter.parent_concept === undefined) { frontmatter.parent_concept = null; changed = true; }
        if (frontmatter.aliases === undefined) { frontmatter.aliases = []; changed = true; }
        if (frontmatter.related_concepts === undefined) { frontmatter.related_concepts = []; changed = true; }
        if (frontmatter.scope_note === undefined) { frontmatter.scope_note = ''; changed = true; }
        if (frontmatter.is_registry_concept !== undefined) {
          frontmatter.is_seed_concept = frontmatter.is_registry_concept;
          delete frontmatter.is_registry_concept;
          changed = true;
        }
        if (frontmatter.is_seed_concept === undefined) { frontmatter.is_seed_concept = true; changed = true; }
        if (frontmatter.difficulty_tier === 'foundational') { frontmatter.difficulty_tier = 'beginner'; changed = true; }

        if (changed) {
          utils.writeMarkdownFile(filePath, frontmatter, body);
          stats.enriched++;
        } else {
          stats.skipped++;
        }
      }
    }
  }

  return stats;
}

// CLI
if (require.main === module) {
  const args = utils.parseArgs(process.argv.slice(2));
  const profileDir = utils.expandHome(args['profile-dir'] || '~/.claude/professor/concepts');

  if (!fs.existsSync(profileDir)) {
    console.log(JSON.stringify({ message: 'No profile directory found. Nothing to migrate.' }));
    process.exit(0);
  }

  const stats = migrate(profileDir);
  console.log(JSON.stringify({ success: true, ...stats }));
}

module.exports = { migrate };
```

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test/migrate-v3.test.js
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-v3.js scripts/test/migrate-v3.test.js
git commit -m "feat: add migrate-v3.js for Phase 2 → Phase 3 domain restructuring"
```

---

## Task 7: Concept Agent

**Files:**
- Create: `agents/concept-agent.md`

- [ ] **Step 1: Write concept-agent.md**

```markdown
---
name: concept-agent
description: >
  Concept resolution and creation agent. Resolves concept candidates
  against user profile and seed registry. Creates new L2 concepts
  with metadata. Returns resolved IDs and computed FSRS status.
tools: Read, Bash
model: sonnet
---

# Concept Agent

You are a concept resolution engine. You receive concept candidates from the whiteboard skill, resolve them against the seed registry and user profile, and return structured results. You do NOT teach. You do NOT interact with the user.

## Input

You receive:
- A list of concept candidates with context
- Relevant domains to search
- Mode: `resolve-only` (Phase 1/2) or `resolve-or-create` (Phase 3)

## Resolution Flow

For each candidate:

### Step 1: Exact ID match
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js reconcile --mode exact --candidate "{candidate}" --registry ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json --profile-dir ~/.claude/professor/concepts
```
If match → record result, move to next candidate.

### Step 2: Alias match
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js reconcile --mode alias --candidate "{candidate}" --registry ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json --profile-dir ~/.claude/professor/concepts
```
If match → add candidate as new alias via update.js, record result.

### Step 3: Semantic match
If no exact or alias match:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js list-concepts --domains "{relevant_domains}" --registry ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json --profile-dir ~/.claude/professor/concepts
```
Review returned concept IDs and scope_notes. Judge: "Is this candidate the same as an existing concept?" If yes → record matched ID, add candidate as alias. If ambiguous between 2 concepts → return both with scope_notes for whiteboard to decide.

### Step 4: Genuinely new (resolve-or-create mode only)
If no match and mode is `resolve-or-create`:
1. Determine the closest parent L1 from the seed registry
2. Check if parent L1 has a user profile file:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js status --concepts "{parent_id}" --profile-dir ~/.claude/professor/concepts --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json --registry ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json
```
3. If parent has no profile file, create one with FSRS defaults:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js --concept "{parent_id}" --domain "{domain}" --profile-dir ~/.claude/professor/concepts --create-parent --level 1 --is-seed-concept --scope-note "{from seed registry}" --aliases "{from seed registry}"
```
4. Create the new L2 concept:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js --concept "{new_id}" --domain "{domain}" --grade 0 --profile-dir ~/.claude/professor/concepts --level 2 --parent-concept "{parent_id}" --scope-note "{generated}" --aliases "{generated}" --related-concepts "{generated}"
```

## Computed Status

After resolving each concept, compute its status:

1. If no user profile file exists → status: `new`
2. If file exists, run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js status --concepts "{id}" --profile-dir ~/.claude/professor/concepts --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json --registry ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json
```
3. From the status response:
   - If `review_history` is empty → status: `encountered_via_child`
   - If `action` is `teach_new` → status: `teach_new`
   - If `action` is `review` → status: `review`
   - If `action` is `skip` → status: `skip`

## Output Format

Return ONLY raw JSON (no markdown fences, no prose):

```json
{
  "resolved": [
    {
      "concept_id": "oauth2",
      "domain": "security",
      "computed_status": "new",
      "has_reviews": false,
      "match_type": "exact"
    }
  ],
  "ambiguous": [
    {
      "candidate": "auth_delegation",
      "top_matches": [
        {"concept_id": "oauth2", "scope_note": "..."},
        {"concept_id": "openid_connect", "scope_note": "..."}
      ]
    }
  ],
  "created": [
    {
      "concept_id": "chunking_strategy",
      "domain": "machine_learning",
      "level": 2,
      "parent_concept": "retrieval_augmented_gen",
      "parent_created": true
    }
  ]
}
```

## Rules

- In `resolve-only` mode: NEVER create files. Read-only operations only.
- In `resolve-or-create` mode: create L2 concepts and ensure parent L1 files exist.
- L1 concepts are seed-only. Never create new L1 concept definitions.
- L1 profile files may be created to ensure parent exists for L2 child.
- concept_id naming: lowercase_snake_case, max 3 words.
- Always return JSON. Never interact with the user.
```

- [ ] **Step 2: Commit**

```bash
git add agents/concept-agent.md
git commit -m "feat: add concept-agent for resolution and L2 creation"
```

---

## Task 8: Professor-Teach Updates

**Files:**
- Modify: `skills/professor-teach/SKILL.md`

- [ ] **Step 1: Update professor-teach with new argument format and body writing**

Key changes:
1. Accept `--status` and `--domain` arguments from whiteboard (skip redundant lookup)
2. After grading, write markdown body to concept file via `update.js --body`
3. Update argument hint

Modify the frontmatter:
```yaml
argument-hint: "{concept_id} [--context \"...\"] [--status new|encountered_via_child|teach_new|review] [--domain \"...\"]"
```

Add to Step 1 (Identify Concept): if `--status` is provided, skip `lookup.js status` call (whiteboard already has it).

Add after Step 6 (Update Score): Step 6.5 — Write concept body:
```
Run: node ${CLAUDE_PLUGIN_ROOT}/scripts/update.js --concept "{id}" --domain "{domain}" --profile-dir ~/.claude/professor/concepts/ --body "{markdown content}"

The body should contain:
# {Concept Name}

## Key Points
- {2-4 bullet points from your explanation}

## Notes
Learned in context of {task context from --context argument}.
```

On subsequent reviews (status is `review` or `teach_new`), append to Notes section instead of replacing body.

- [ ] **Step 2: Commit**

```bash
git add skills/professor-teach/SKILL.md
git commit -m "feat: professor-teach accepts FSRS status, writes markdown body after teaching"
```

---

## Task 9: Analyze-Architecture Update

**Files:**
- Modify: `skills/analyze-architecture/SKILL.md`

- [ ] **Step 1: Add concept-scope.json output**

Add a new step after the existing "Write Supporting Files" step:

```markdown
### Step 5: Write Concept Scope

After analyzing the codebase, write a concept-scope.json file:

```bash
cat > docs/professor/architecture/concept-scope.json << 'SCOPE'
{
  "relevant_domains": ["{detected domains based on tech stack and patterns}"],
  "tech_stack": ["{detected technologies}"],
  "detected_patterns": ["{concept_ids matching detected architectural patterns}"],
  "generated_from": "analyze-architecture",
  "last_updated": "{ISO timestamp}"
}
SCOPE
```

Domain detection heuristics:
- Python/FastAPI/Django → backend, databases, api_design
- React/Next.js/Vue → frontend, api_design
- Docker/K8s/Terraform → devops_infrastructure
- ML libraries (torch, transformers) → machine_learning
- Message queues (Kafka, RabbitMQ) → data_processing, architecture
- PostgreSQL/MongoDB → databases
- AWS/GCP/Azure SDKs → devops_infrastructure

The `/whiteboard` skill reads this file during Phase 0 to scope concept-agent searches.
```

- [ ] **Step 2: Commit**

```bash
git add skills/analyze-architecture/SKILL.md
git commit -m "feat: analyze-architecture outputs concept-scope.json for whiteboard"
```

---

## Task 10: Whiteboard Skill

**Files:**
- Create: `skills/whiteboard/SKILL.md`
- Create: `skills/whiteboard/templates/design-doc.md`
- Create: `skills/whiteboard/protocols/critique.md`
- Create: `skills/whiteboard/protocols/concept-check.md`

This is the largest task. The SKILL.md contains persona + full conversation flow. Reference files are loaded on demand via Read.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p skills/whiteboard/templates skills/whiteboard/protocols
```

- [ ] **Step 2: Write critique protocol**

Create `skills/whiteboard/protocols/critique.md` — extracted from spec Section 6 (Phase 2.2).

- [ ] **Step 3: Write concept-check protocol**

Create `skills/whiteboard/protocols/concept-check.md` — extracted from spec concept-agent interaction pattern, FSRS-driven status handling.

- [ ] **Step 4: Write design document template**

Create `skills/whiteboard/templates/design-doc.md` — copied from spec Section 6 design document template.

- [ ] **Step 5: Write SKILL.md**

Create `skills/whiteboard/SKILL.md` with:
- Frontmatter (name, description, model, argument-hint, disable-model-invocation)
- Persona section
- References to supporting files
- Full conversation flow (Phase 0-4) with concept-agent spawn patterns
- Developer controls
- Resume flow

The SKILL.md should reference supporting files with markdown links:
```markdown
## Reference Files
- [Design Document Template](templates/design-doc.md) — read during Phase 4
- [Critique Protocol](protocols/critique.md) — read during Phase 2.2
- [Concept Check Protocol](protocols/concept-check.md) — read when identifying concepts
```

Target: 300-400 lines for SKILL.md. Each supporting file: 50-100 lines.

- [ ] **Step 6: Commit**

```bash
git add skills/whiteboard/
git commit -m "feat: add /whiteboard skill with design conversation flow"
```

---

## Task 11: Deprecation Notices

**Files:**
- Modify: `skills/professor/SKILL.md`
- Modify: `skills/backend-architect/SKILL.md`
- Modify: `agents/knowledge-agent.md`

- [ ] **Step 1: Add deprecation notices**

Add to the top of each file (after frontmatter):

For `skills/professor/SKILL.md`:
```markdown
> **DEPRECATED:** This skill is superseded by `/whiteboard` in Phase 3. Use `/whiteboard` for design conversations with integrated concept teaching. This file is kept for reference only.
```

For `skills/backend-architect/SKILL.md`:
```markdown
> **DEPRECATED:** This skill is superseded by `/whiteboard` in Phase 3. `/whiteboard` is domain-agnostic and replaces the backend-only design conversation. This file is kept for reference only.
```

For `agents/knowledge-agent.md`:
```markdown
> **DEPRECATED:** This agent is replaced by `concept-agent` in Phase 3. The concept-agent handles resolution, semantic matching, and L2 creation. This file is kept for reference only.
```

- [ ] **Step 2: Commit**

```bash
git add skills/professor/SKILL.md skills/backend-architect/SKILL.md agents/knowledge-agent.md
git commit -m "docs: mark professor, backend-architect, and knowledge-agent as deprecated"
```

---

## Task 12: Plugin Version Bump + README

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `README.md`

- [ ] **Step 1: Bump version to 3.0.0**

In `.claude-plugin/plugin.json`, change `"version": "2.0.0"` to `"version": "3.0.0"`.

- [ ] **Step 2: Rewrite README**

Update README.md to reflect Phase 3:
- New skill: `/whiteboard` (primary entry point)
- 18 domains (list with display names)
- 407 L1 seed concepts
- Two-level concept hierarchy
- FSRS-driven computed status
- Migration instructions (`node scripts/migrate-v3.js`)
- Updated architecture diagram
- Deprecated skills section

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json README.md
git commit -m "docs: update README for Phase 3 — whiteboard, 18 domains, 407 concepts"
```

---

## Task 13: Run Full Test Suite

- [ ] **Step 1: Run all tests**

```bash
node --test scripts/test/
```

Expected: All tests pass (existing + new).

- [ ] **Step 2: Verify no regressions**

```bash
# Check existing tests still pass
node --test scripts/test/fsrs.test.js
node --test scripts/test/lookup.test.js
node --test scripts/test/update.test.js
node --test scripts/test/utils.test.js
node --test scripts/test/session.test.js
node --test scripts/test/graph.test.js
node --test scripts/test/migrate-v2.test.js

# Check new tests
node --test scripts/test/lookup-v3.test.js
node --test scripts/test/update-v3.test.js
node --test scripts/test/migrate-v3.test.js
```

- [ ] **Step 3: Commit if any fixes needed**

---

## Dependency Graph

```
Task 1 (Domains) ──────────────────┐
Task 2 (Registry) ─────────────────┤
                                    ├── Task 6 (Migration)
Task 3 (Utils tests) ──────────────┤
                                    │
Task 4 (lookup.js modes) ──────────┼── Task 7 (Concept Agent)
Task 5 (update.js features) ───────┤       │
                                    │       ├── Task 10 (Whiteboard)
Task 8 (Professor-teach) ──────────┘       │
Task 9 (Analyze-architecture) ─────────────┘
                                            │
Task 11 (Deprecations) ────────────────────┤
Task 12 (Version + README) ────────────────┤
Task 13 (Full test suite) ─────────────────┘
```

Tasks 1-5 can run in parallel (no dependencies between them).
Tasks 6-9 depend on Tasks 1-5.
Task 10 depends on Tasks 7-9.
Tasks 11-13 depend on Task 10.
