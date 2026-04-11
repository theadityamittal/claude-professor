---
name: analyze-architecture
description: >
  Scan the current codebase and produce a high-level architecture graph
  stored as interlinked markdown files. Use when starting a new project
  analysis or when the architecture may have changed significantly.
disable-model-invocation: true
argument-hint: "[--update] [--branch name] [--budget N]"
model: sonnet
inputs:
  - update: "boolean, optional — refresh existing architecture"
  - branch: "string, optional — compare branch against stored base"
  - budget: "integer, optional — max files in scan manifest (default: 100)"
outputs:
  - architecture_docs: "docs/professor/architecture/"
  - concept_scope: "docs/professor/architecture/concept-scope.json"
failure_modes:
  - scan_subagent_failure: "retry once, then report failure and stop"
  - analyze_subagent_failure: "report failure and stop"
  - verify_broken_links: "report to developer, continue to cleanup"
---

You are an architecture analyst orchestrating a 4-stage pipeline. Each stage runs as a subagent and writes its output to disk. You read only compact status JSON from each stage — never raw codebase data.

## Input

Read `$ARGUMENTS` for flags:
- No flags: full analysis from scratch
- `--update`: refresh existing architecture (re-scan, update changed, preserve unchanged)
- `--branch {name}`: generate a delta file comparing the specified branch against the stored base architecture
- `--budget {N}`: max files in scan manifest (default: 100). Increase for large codebases (e.g., `--budget 300`). Files are prioritized: manifests > configs > source > tests > docs.

## Setup

Create the build directory:

```bash
mkdir -p docs/professor/architecture/.build
```

## Stage 1: Scan

Dispatch an Explore subagent with this exact prompt:

> You are a codebase scanner. Your job is to produce a scan manifest and write it to disk. Do not explain your work — just execute.
>
> **Step 1:** Run the scan script (use the `--budget` value from arguments, or 100 if not specified):
> ```bash
> node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js scan --dir . --budget {budget}
> ```
>
> The script returns JSON wrapped in `{status, data, error}` envelope format. Parse the `data` field for results.
>
> **Step 2:** The script returns a JSON manifest with `files[]`. Each file has `path`, `language`, `type`, and `size`. For each file with `type` of `source`, `manifest`, or `config`: read the file and add:
> - `description`: max 12 words describing its purpose
> - `exports`: array of function/class/constant names exported by the file (empty array for non-source files)
>
> For files you cannot or do not read: leave `description` and `exports` absent.
>
> **Step 3:** Write the enriched manifest to `docs/professor/architecture/.build/scan-manifest.json`. Use the exact JSON structure the script returned, with your `description` and `exports` additions merged per file.
>
> **Step 4:** Output ONLY this JSON (no prose, no markdown):
> `{"wrote": "scan-manifest.json", "files_found": <total_files from script output>}`

Wait for the subagent to return. Parse its JSON output.
- If `wrote` is missing or the file does not exist: retry Stage 1 once. If it fails again, report failure and stop.
- If successful: continue to Stage 2.

## Stage 2: Analyze

Dispatch an Explore subagent with this exact prompt:

> You are a codebase analyzer. Your job is to read the scan manifest, analyze key files, and write component files. Do not explain your work — just execute.
>
> **Step 1:** Read `docs/professor/architecture/.build/scan-manifest.json`.
>
> **Step 2:** Selectively read files with `type` of `manifest` and `config` (all of them), plus up to 10 `source` files that appear to be entry points, public APIs, or route handlers (prioritize files named `main.*`, `app.*`, `index.*`, `router.*`, `handler.*`, or `server.*`; or files that are imported by 5 or more other files based on path frequency in the manifest).
>
> **Step 3:** Identify 5–15 logical components. A component is a unit with a clear responsibility. Use directory groupings, import patterns, and file descriptions as signals.
>
> **Step 4:** For each component, search for relevant concept IDs:
> Determine the search query from the component's purpose: if the component handles HTTP routing, search "routing"; if it connects to a database, search "database connection" or the specific DB name; if it manages caching, search "caching". Run one search per component.
> ```bash
> node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
>   --query "{technology or pattern name}" \
>   --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
>   --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
> ```
> The script returns JSON wrapped in `{status, data, error}` envelope format. Parse the `data` field for results.
> Use `concept_id` fields from `matched_concepts`.
>
> **Step 5:** For each component, run:
> ```bash
> node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js create-component \
>   --id "{component-id}" \
>   --description "{1-2 line description}" \
>   --concepts "{comma-separated concept_ids}" \
>   --depends-on "{comma-separated component-ids}" \
>   --depended-on-by "{comma-separated component-ids}" \
>   --key-files "{comma-separated paths from scan manifest}" \
>   --output-dir docs/professor/architecture/components/
> ```
> The script returns JSON wrapped in `{status, data, error}` envelope format. Parse the `data` field for results.
>
> **Step 6:** Output ONLY this JSON:
> `{"components_written": <count>}`

Wait for the subagent to return.
- If `components_written` is 0 or missing: report failure and stop.
- If successful: continue to Stage 3.

## Stage 3: Synthesize

Dispatch an Explore subagent with this exact prompt:

> You are an architecture synthesizer. Your job is to read the component files and write supporting documentation. Do not explain — just execute.
>
> **Step 1:** Read all files in `docs/professor/architecture/components/`.
>
> **Step 2:** Write `docs/professor/architecture/data-flow.md`:
> - Start with a component dependency graph using Mermaid `graph LR` syntax showing all components
> - Add 2–3 sequence diagrams for the most important request flows
> - Use component IDs from the component files as node labels
> - External services (databases, caches, queues) use `[(name)]` cylinder syntax
>
> **Step 3:** Write `docs/professor/architecture/tech-stack.md`:
> - Sections: Runtime, Framework, Data Stores, Infrastructure, Key Dependencies (table: package, version, purpose)
> - Source ALL versions from scan manifest files (package.json, go.mod, etc.) — never guess
>
> **Step 4:** Detect tech stack from manifest files. Then run concept searches and write `docs/professor/architecture/concept-scope.json`:
> Determine queries from the detected tech stack: search for each major technology name (e.g., "redis", "fastapi", "react") and each architectural pattern observed (e.g., "event sourcing", "cqrs"). Run one search per technology or pattern.
> ```bash
> node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
>   --query "{technology or pattern}" \
>   --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
>   --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
> ```
> The script returns JSON wrapped in `{status, data, error}` envelope format. Parse the `data` field for results.
> Apply these domain heuristics to set `relevant_domains`:
> | Tech Signals | Domains |
> |---|---|
> | Python, FastAPI, Django, Flask | `architecture`, `databases`, `api_design` |
> | React, Next.js, Vue, Angular | `frontend` |
> | Docker, Kubernetes, Terraform | `devops_infrastructure` |
> | PyTorch, TensorFlow, scikit-learn | `machine_learning` |
> | Kafka, RabbitMQ, Celery | `data_processing`, `architecture` |
> | PostgreSQL, MySQL, MongoDB, Redis | `databases` |
>
> Write using this exact structure:
> ```json
> {
>   "relevant_domains": ["..."],
>   "tech_stack": ["..."],
>   "detected_patterns": ["concept_ids"],
>   "generated_from": "analyze-architecture",
>   "last_updated": "<ISO timestamp>"
> }
> ```
>
> **Step 5:** Update the index:
> ```bash
> node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js update-index \
>   --architecture-dir docs/professor/architecture/ \
>   --project-name "$(node -e "try{const p=require('./package.json');console.log(p.name)}catch{console.log(require('path').basename(process.cwd()))}")" \
>   --branch "$(git branch --show-current)" \
>   --summary "{2-3 sentence description}"
> ```
> The script returns JSON wrapped in `{status, data, error}` envelope format. Parse the `data` field for results.
>
> **Step 6:** Count the files you actually wrote (data-flow.md, tech-stack.md, concept-scope.json, and the updated index each count as 1). Output ONLY this JSON:
> `{"files_written": <count of files actually written>}`

Wait for the subagent to return. Parse its JSON output.
- If `files_written` is 0 or missing: report failure and stop.
- If successful: continue to Stage 4.

## Stage 4: Verify

Dispatch an Explore subagent with this exact prompt:

> You are an output verifier. Check the generated architecture files for correctness. Do not explain — just check and report.
>
> **Step 1:** Read all files in `docs/professor/architecture/components/` and `docs/professor/architecture/data-flow.md`.
>
> **Step 2:** Wiki-link check — every `[[component-id]]` reference in Depends On / Depended On By sections must have a corresponding `.md` file in `components/`. Collect broken links.
>
> **Step 3:** Concept ID check — for each concept ID listed in component files, verify it exists in the registry:
> ```bash
> node ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.js search \
>   --query "{concept_id}" \
>   --registry-path ${CLAUDE_PLUGIN_ROOT}/data/concepts_registry.json \
>   --domains-path ${CLAUDE_PLUGIN_ROOT}/data/domains.json
> ```
> The script returns JSON wrapped in `{status, data, error}` envelope format. Parse the `data` field for results.
> Collect any IDs not found.
>
> **Step 4:** Output ONLY this JSON:
> `{"broken_links": <count>, "missing_concepts": ["concept_id_1", ...], "components_verified": <count>}`

Wait for the subagent to return. Parse its JSON output.
- If the output cannot be parsed: report to the developer: "Stage 4 verification failed — architecture files have NOT been verified. Review `docs/professor/architecture/` manually." Continue to Cleanup.
- If successful: proceed to Cleanup.

## Cleanup

Delete the build directory:

```bash
rm -rf docs/professor/architecture/.build
```

## Output Summary

Present to the developer:
- Number of components identified
- Tech stack highlights (from tech-stack.md)
- Verification results from Stage 4 (`broken_links`, `missing_concepts`)
- Suggest: "Review `docs/professor/architecture/` and correct any inaccuracies."

## Handle Modes

**`--update` mode:**
1. Read existing `docs/professor/architecture/_index.md`
2. Run detect-changes:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/graph.js detect-changes \
     --architecture-dir docs/professor/architecture/ \
     --scan-dirs "src/,lib/,services/,cmd/,pkg/"
   ```
3. If `structural_changes_detected` is false: report "No structural changes detected" and stop.
4. If true: run the full 4-stage pipeline above.

**`--branch {name}` mode:**
1. Read base architecture from `docs/professor/architecture/`
2. Read the base branch from `docs/professor/architecture/_index.md` (look for the `Branch:` field). If not found, default to `main`. Get changed files: `git diff --name-only {base-branch}...HEAD`
3. Map changed files to existing components by path matching
4. Write delta to `docs/professor/branch-deltas/{branch-name}/delta.md` with sections: New Components, Modified Components, New Dependencies, Structural Changes

## Accuracy Rules

- Package manifests are **ground truth** for tech stack. No guessing.
- Config files are **ground truth** for infrastructure.
- **Never hallucinate versions.** If a version isn't in a manifest, say "version not specified."
- **Ask the developer when uncertain.** Don't guess at ambiguous architecture.
