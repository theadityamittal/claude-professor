# Data Flow & Architecture

## Component Dependency Graph

```mermaid
graph LR
    AppConfig["application-config"]
    ArchSkill["architecture-analysis-skill"]
    ArchGraph["architecture-graph"]
    ConceptLookup["concept-lookup"]
    ConceptReg["concept-registry"]
    ConceptUpdate["concept-updater"]
    DataMig["data-migration"]
    DomainTax["domain-taxonomy"]
    FSRSScheduler["fsrs-scheduler"]
    GitChange["git-change-detection"]
    SessionState["session-state"]
    SharedUtils["shared-utilities"]
    TeachingGate["teaching-gate"]
    TeachingSkills["teaching-skills"]
    TestSuite["test-suite"]
    
    ProfileDir[["(profile)/<br/>domain/<br/>concept.md"]]
    ConceptFile[["data/concepts_<br/>registry.json"]]
    DomainFile[["data/domains.json"]]
    SessionFile[["session.json"]]
    ArchDir[["docs/professor/<br/>architecture/"]]
    
    AppConfig --> ConceptLookup
    AppConfig --> SessionState
    
    ArchSkill --> ArchGraph
    ArchSkill --> ConceptLookup
    
    ArchGraph --> SharedUtils
    ArchGraph --> ArchDir
    GitChange --> ArchGraph
    
    ConceptReg --> ConceptFile
    ConceptReg --> ConceptLookup
    DomainTax --> DomainFile
    DomainTax --> ConceptLookup
    
    ConceptLookup --> FSRSScheduler
    ConceptLookup --> ConceptReg
    
    FSRSScheduler --> ProfileDir
    ConceptUpdate --> FSRSScheduler
    ConceptUpdate --> SharedUtils
    ConceptUpdate --> ProfileDir
    
    DataMig --> SharedUtils
    
    SessionState --> SharedUtils
    SessionState --> ConceptLookup
    SessionState --> SessionFile
    
    TeachingGate --> SessionState
    TeachingGate --> ConceptLookup
    TeachingGate --> FSRSScheduler
    
    TeachingSkills --> ConceptLookup
    TeachingSkills --> SessionState
    
    TestSuite -.-> FSRSScheduler
    TestSuite -.-> ConceptLookup
    TestSuite -.-> SessionState
    TestSuite -.-> TeachingGate
    TestSuite -.-> ConceptUpdate
    TestSuite -.-> ArchGraph
    TestSuite -.-> DataMig
```

## Key Request Flows

### Flow 1: Concept Search & Scheduling

**Trigger**: `/whiteboard` or `/professor-teach` initiates concept resolution

```mermaid
sequenceDiagram
    participant User
    participant SessionState
    participant ConceptLookup
    participant FSRSScheduler
    participant ConceptReg
    participant ProfileDir as Profile<br/>(profile/)
    
    User->>SessionState: Load or create session
    SessionState->>ProfileDir: Read session.json
    User->>ConceptLookup: search(query, domain)
    ConceptLookup->>ConceptReg: Load concepts_registry.json
    ConceptLookup->>FSRSScheduler: computeRetrievability()
    FSRSScheduler->>ProfileDir: Check concept/domain/id.md
    FSRSScheduler-->>ConceptLookup: Return retrievability score
    ConceptLookup-->>SessionState: Return matched concepts + status
    SessionState->>ProfileDir: Update session.json with schedule
```

### Flow 2: Architecture Analysis & Detection

**Trigger**: `/analyze-architecture` scans codebase

```mermaid
sequenceDiagram
    participant User
    participant ArchGraph
    participant GitChange
    participant SharedUtils
    participant ArchDir as docs/professor/<br/>architecture/
    
    User->>ArchGraph: Scan codebase with --update flag
    ArchGraph->>SharedUtils: listMarkdownFiles(cwd)
    SharedUtils->>ArchGraph: Return file list + manifest
    ArchGraph->>ArchGraph: Build dependency graph
    ArchGraph->>ArchDir: Write components/*.md
    ArchGraph->>ArchDir: Write data-flow.md, tech-stack.md
    GitChange->>ArchGraph: detect-changes (post-git hook)
    ArchGraph-->>User: Report architectural changes
```

### Flow 3: Teaching Gate & Session Progression

**Trigger**: Session checkpoint requires concept verification

```mermaid
sequenceDiagram
    participant TeachingGate
    participant SessionState
    participant ConceptLookup
    participant FSRSScheduler
    participant ProfileDir as Profile
    
    TeachingGate->>SessionState: Check phase schedule
    SessionState->>ProfileDir: Load session.json checkpoints
    TeachingGate->>ConceptLookup: Resolve scheduled concepts
    ConceptLookup->>FSRSScheduler: computeRetrievability(stability, days)
    FSRSScheduler->>ProfileDir: Load concept history
    FSRSScheduler-->>TeachingGate: Return retrievability metric
    alt Retrievability < threshold
        TeachingGate-->>SessionState: Block progression, trigger teaching
    else Retrievability >= threshold
        TeachingGate-->>SessionState: Gate open, allow continuation
    end
    SessionState->>ProfileDir: Update gate status in session.json
```

## Data Models

### Session State Structure

- **Type**: JSON persisted to `~/.claude-professor/profiles/{project}/session.json`
- **Contents**:
  - `sessionId`: UUID for session
  - `phase`: Current phase (clarify, design_hld, design_lld, conclude)
  - `checkpoints`: Map of phase → required concepts
  - `taught`: Set of resolved concept IDs
  - `gates`: Map of phase → open/closed status
  - `updatedAt`: ISO timestamp

### Concept Profile Entry

- **Type**: Markdown with YAML frontmatter
- **Location**: `~/.claude-professor/profiles/{project}/{domain}/{concept_id}.md`
- **Frontmatter Fields**:
  - `stability`: FSRS stability metric (float)
  - `difficulty`: FSRS difficulty rating (1-10)
  - `reps`: Count of reviews
  - `lapses`: Count of failed recalls
  - `lastReview`: ISO timestamp of most recent review

### Architecture Manifest

- **Type**: JSON generated by `architecture-graph`
- **Location**: `docs/professor/architecture/concept-scope.json`
- **Contents**:
  - `relevant_domains`: Inferred domains (e.g., architecture, databases)
  - `tech_stack`: Detected technologies (Node, FastAPI, React, etc.)
  - `detected_patterns`: Observed architectural patterns
  - `generated_from`: Script name or command
  - `last_updated`: ISO timestamp
