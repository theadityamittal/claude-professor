---
name: analyze-architecture
description: >
  Scan the current codebase and produce a high-level architecture graph
  stored as interlinked markdown files. Use when starting a new project
  analysis or when the architecture may have changed significantly.
disable-model-invocation: true
argument-hint: "[--update] [--branch name]"
---

You are an architecture analyst. Scan the current codebase and produce a high-level architecture graph as interlinked markdown files.

## Input

Read `$ARGUMENTS` for flags:
- No flags: full analysis from scratch
- `--update`: refresh existing architecture (re-scan, update changed, preserve unchanged)
- `--branch {name}`: generate a delta file comparing branch against stored base architecture

## Step 1: Gather Data (Parallel Subagents)

Dispatch two Explore subagents in parallel:

**File Scanner Agent:**
> Scan the codebase at the current working directory. Exclude: node_modules, .git, dist, build, coverage, __pycache__, .next, .nuxt, vendor.
>
> Return:
> 1. Directory tree (top 3 levels)
> 2. Contents of package manifests (package.json, requirements.txt, go.mod, Cargo.toml, etc.)
> 3. Contents of config files (docker-compose.yml, Dockerfile, tsconfig.json, etc.)
> 4. Contents of key entry points (src/index.ts, main.py, app.py, cmd/main.go, etc.)

**Dependency Analyzer Agent:**
> Analyze the codebase at the current working directory.
>
> Return:
> 1. All dependencies from package manifests (with versions)
> 2. Import patterns in entry points and key source files
> 3. External services referenced in config (database URLs, API endpoints, queue configs)
> 4. Framework identification (Express, FastAPI, Spring Boot, etc.)

## Step 2: Synthesize Architecture

Using both agents' results:

1. **Identify components** from directory structure + entry points. A component is a logical unit (service, module, library) with a clear responsibility. Read 3-5 files per candidate component to confirm.

2. **Determine relationships** from imports, config references, and shared data stores.

3. **Map concepts** to components based on tech stack and patterns. Use concept IDs from the registry where possible:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
     --query "{technology or pattern}" \
     --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
     --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
   ```

4. **Ask the developer when uncertain.** If architecture is ambiguous (monolith vs microservices, unclear component boundaries), ask rather than guess.

## Step 3: Write Architecture Files

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
  --project-name "{project name}" \
  --branch "{current branch}" \
  --summary "{2-3 sentence description}"
```

## Step 4: Write Supporting Files

**data-flow.md** — Create `docs/professor/architecture/data-flow.md` with Mermaid diagrams:
- Component dependency graph (graph LR)
- Key request flow sequence diagrams (sequenceDiagram) for 2-3 critical paths

**tech-stack.md** — Create `docs/professor/architecture/tech-stack.md` with:
- Runtime, framework, data stores, infrastructure
- Key dependencies table (package, version, purpose)

## Step 5: Handle Modes

**`--update` mode:**
1. Read existing `_index.md` and component files
2. Run `detect-changes` to find new directories:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js detect-changes \
     --architecture-dir docs/professor/architecture/ \
     --scan-dirs "src/,lib/,services/,cmd/,pkg/"
   ```
3. For new directories: analyze and create component files
4. For existing components: re-read key files, update if description or dependencies changed
5. Regenerate `_index.md`

**`--branch {name}` mode:**
1. Read the base architecture from `docs/professor/architecture/`
2. Compare against current branch state
3. Write delta to `docs/professor/branch-deltas/{branch-name}/delta.md`
4. Delta includes: new components, modified components, new dependencies, structural changes

## Accuracy Rules

- Package manifests are **ground truth** for tech stack. If `package.json` lists `express`, the project uses Express.
- Config files are **ground truth** for infrastructure. If `docker-compose.yml` lists `postgres`, the project uses PostgreSQL.
- Directory structure is **evidence, not proof.** Read files inside to confirm.
- Read 3-5 files per component to understand patterns. Not every file.
- **Ask the developer when uncertain.** Don't guess at ambiguous architecture.

## Output Summary

After writing all files, summarize:
- Number of components identified
- Tech stack highlights
- Any areas of uncertainty flagged
- Suggest reviewing the generated files and correcting any inaccuracies
