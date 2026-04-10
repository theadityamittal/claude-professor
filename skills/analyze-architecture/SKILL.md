---
name: analyze-architecture
description: >
  Scan the current codebase and produce a high-level architecture graph
  stored as interlinked markdown files. Use when starting a new project
  analysis or when the architecture may have changed significantly.
disable-model-invocation: true
argument-hint: "[--update] [--branch name]"
model: sonnet
---

You are an architecture analyst. Scan the current codebase and produce a high-level architecture graph as interlinked markdown files.

## Input

Read `$ARGUMENTS` for flags:
- No flags: full analysis from scratch
- `--update`: refresh existing architecture (re-scan, update changed, preserve unchanged)
- `--branch {name}`: generate a delta file comparing the specified branch against the stored base architecture

## Step 1: Gather Data (Parallel Subagents)

Dispatch two Explore subagents in parallel. Each MUST return structured output.

**File Scanner Agent:**
> Scan the codebase at the current working directory.
>
> Use Glob to find files. Use Read to inspect them. Exclude these directories: node_modules, .git, dist, build, coverage, __pycache__, .next, .nuxt, vendor, .cache.
>
> Collect and return:
> 1. **Directory tree** — run `ls -R` (top 3 levels) or use Glob with `*/*/*` pattern
> 2. **Package manifests** — read ALL of: package.json, requirements.txt, go.mod, Cargo.toml, pyproject.toml, build.gradle, pom.xml, composer.json, Gemfile (whichever exist)
> 3. **Config files** — read ALL of: docker-compose.yml, Dockerfile, tsconfig.json, .env.example, any *config*.json or *config*.yaml (whichever exist)
> 4. **Entry points** — read the main entry file(s): src/index.ts, src/main.ts, main.py, app.py, cmd/main.go, src/main.rs (whichever exist). Also read route/handler registration files if identifiable from imports.
>
> Return your findings as structured sections with headers: `## Directory Tree`, `## Package Manifests`, `## Config Files`, `## Entry Points`. Include the full content of each file you read under its section.

**Dependency Analyzer Agent:**
> Analyze the codebase at the current working directory.
>
> Use Grep to search for import/require patterns. Use Read on key files.
>
> Collect and return:
> 1. **Dependencies** — all production dependencies from package manifests with versions
> 2. **Import graph** — for each entry point and key source file, list what it imports (local and external)
> 3. **External services** — grep for database URLs, API endpoints, queue connection strings in config files and .env.example
> 4. **Framework identification** — which HTTP framework, ORM, test framework, build tool
>
> Return as structured sections: `## Dependencies`, `## Import Graph`, `## External Services`, `## Framework Stack`.

## Step 2: Synthesize Architecture

Using both agents' results, work through these steps in order:

1. **Identify components.** A component is a logical unit (service, module, library) with a clear responsibility. Use these signals:
   - Top-level directories under src/ or the project root that contain entry points or route handlers
   - Directories with their own package manifest or config
   - Logical groupings visible from the import graph (e.g., all files importing from `services/auth/` form the auth component)
   - For each candidate component, read 3-5 files in this priority: entry point, public API/exports, main business logic, tests, config

2. **Determine relationships.** Map dependencies between components:
   - Direct imports between component directories
   - Shared data stores (both components access the same database/table)
   - Message passing (one component publishes, another subscribes)
   - External services that mediate (e.g., both use Redis but for different purposes)

3. **Map concepts.** For each component, identify relevant technical concepts from the registry:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
     --query "{technology or pattern}" \
     --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
     --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
   ```
   Use the `id` field from matched results. If a concept isn't in the registry, use a descriptive snake_case identifier.

4. **Ask the developer when uncertain.** If architecture is ambiguous (monolith vs microservices, unclear component boundaries, unusual project structure), ask rather than guess.

## Step 3: Write Component Files

For each component, run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js create-component \
  --id "{component-id}" \
  --description "{1-2 line description}" \
  --concepts "{comma-separated concept_ids}" \
  --depends-on "{comma-separated component-ids}" \
  --depended-on-by "{comma-separated component-ids}" \
  --key-files "{comma-separated paths}" \
  --patterns "{comma-separated patterns}" \
  --output-dir docs/professor/architecture/components/
```

Then generate the index:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js update-index \
  --architecture-dir docs/professor/architecture/ \
  --project-name "{project name from package.json name field or directory name}" \
  --branch "$(git branch --show-current)" \
  --summary "{2-3 sentence description}"
```

## Step 4: Write Supporting Files

**data-flow.md** — Write `docs/professor/architecture/data-flow.md`:

Start with a component dependency graph using Mermaid `graph LR` syntax showing all components and their relationships. Then add 2-3 sequence diagrams for the most critical request flows (e.g., authentication, main business operation, background job).

Use component names from Step 3 as node labels. External services (databases, caches, queues) use the `[(name)]` cylinder syntax.

**tech-stack.md** — Write `docs/professor/architecture/tech-stack.md`:

Organize into sections: Runtime, Framework, Data Stores, Infrastructure, Key Dependencies (table with package, version, purpose). Source ALL information from the package manifests and config files read in Step 1 — never guess versions.

## Step 5: Write Concept Scope

After writing the supporting files, output a `docs/professor/architecture/concept-scope.json` file to help the `/whiteboard` skill scope concept-agent searches.

Detect the tech stack from the package manifests and config files gathered in Step 1, then apply these domain heuristics:

| Tech Signals | Domains |
|---|---|
| Python, FastAPI, Django, Flask | `architecture`, `databases`, `api_design` |
| React, Next.js, Vue, Angular | `frontend` |
| Docker, Kubernetes, Terraform, Helm | `devops_infrastructure` |
| PyTorch, TensorFlow, scikit-learn, pandas | `machine_learning` |
| Kafka, RabbitMQ, SQS, NATS, Celery | `data_processing`, `architecture` |
| PostgreSQL, MySQL, MongoDB, Redis, DynamoDB | `databases` |

A project may match multiple rows — include all relevant domains. If a technology doesn't fit any row above, use `custom`.

For `detected_patterns`, run the concept registry search for each major technology or architectural pattern identified:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
  --query "{technology or pattern}" \
  --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
  --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
```

Collect the `id` fields from the top matches. Include only concept IDs that appear in the registry — do not invent IDs.

Write the file using this exact structure:

```json
{
  "relevant_domains": ["detected domains based on tech stack"],
  "tech_stack": ["detected technologies"],
  "detected_patterns": ["concept_ids matching detected patterns"],
  "generated_from": "analyze-architecture",
  "last_updated": "ISO timestamp"
}
```

Example:

```json
{
  "relevant_domains": ["architecture", "databases", "api_design", "devops_infrastructure"],
  "tech_stack": ["Python", "FastAPI", "PostgreSQL", "Docker", "Redis"],
  "detected_patterns": ["rest_api_design", "connection_pooling", "cache_invalidation", "container_orchestration"],
  "generated_from": "analyze-architecture",
  "last_updated": "2024-01-15T10:30:00Z"
}
```

If graph.js or lookup.js fails during this step, write the file with the information you have and flag the error in the output summary.

## Step 6: Handle Modes

**`--update` mode:**
1. Read existing `docs/professor/architecture/_index.md` and component files
2. Run detect-changes:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js detect-changes \
     --architecture-dir docs/professor/architecture/ \
     --scan-dirs "src/,lib/,services/,cmd/,pkg/"
   ```
3. If `structural_changes_detected` is true: dispatch Explore subagent to analyze new directories only
4. For new directories: create component files
5. For existing components: re-read 2-3 key files, update only if description or dependencies actually changed
6. Regenerate `_index.md`

**`--branch {name}` mode:**
1. Read base architecture from `docs/professor/architecture/`
2. Get changed files: `git diff --name-only main...HEAD` (or the base branch from `_index.md`)
3. Map changed files to existing components by path matching
4. Identify new directories not covered by existing components
5. Write delta to `docs/professor/branch-deltas/{branch-name}/delta.md` with sections: New Components, Modified Components, New Dependencies, Structural Changes

## Step 7: Verify Output

Before presenting results to the developer:

1. **Wiki-link check**: every `[[component-id]]` in Depends On / Depended On By must have a corresponding file in `components/`
2. **Concept check**: verify concept IDs used in component files exist in the registry (via lookup.js search) — flag any that don't
3. **Completeness check**: every directory with source files should map to at least one component

Report any verification failures to the developer as "areas to review."

## Accuracy Rules

- Package manifests are **ground truth** for tech stack. If `package.json` lists `express`, the project uses Express. No guessing.
- Config files are **ground truth** for infrastructure. If `docker-compose.yml` lists `postgres`, the project uses PostgreSQL.
- Directory structure is **evidence, not proof.** Read files inside to confirm.
- Read 3-5 files per component: entry point > public API > business logic > tests > config.
- **Ask the developer when uncertain.** Don't guess at ambiguous architecture.
- **Never hallucinate versions.** If a version isn't in a manifest, say "version not specified."

## Error Handling

- If no package manifest found: ask the developer what the tech stack is
- If graph.js fails: report the error, continue with remaining components
- If a subagent returns incomplete data: proceed with what you have, flag gaps in the output summary
- If the project structure is unfamiliar: describe what you see and ask the developer to identify components

## Output Summary

After writing all files, present:
- Number of components identified
- Tech stack highlights
- Verification results (any broken links or missing concepts)
- Areas of uncertainty flagged
- Suggest: "Review the generated files in `docs/professor/architecture/` and correct any inaccuracies."
