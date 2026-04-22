# Data Flow & Architecture

## Component Dependency Graph

```mermaid
graph LR
    AppConfig["application-config"]
    ArchSkill["architecture-analysis-skill"]
    ArchGraph["architecture-graph"]
    ConceptLookup["concept-lookup"]
    ConceptMig["concept-migration"]
    ConceptReg["concept-registry"]
    ConceptUpdate["concept-update"]
    ConceptUpdater["concept-updater"]
    ConfigVal["configuration-validation"]
    DataMig["data-migration"]
    DomainTax["domain-taxonomy"]
    FileIO["file-io-utilities"]
    FSRSSched["fsrs-scheduler"]
    GitChange["git-change-detection"]
    SessionChk["session-checkpoint"]
    SessionLife["session-lifecycle"]
    SessionState["session-state"]
    SharedUtils["shared-utilities"]
    SpcRepeat["spaced-repetition"]
    TeachGate["teaching-gate"]
    TeachSkills["teaching-skills"]
    TestSuite["test-suite"]
    WBCommands["whiteboard-commands"]
    WBRouter["whiteboard-router"]

    ProfileDir[("~/.claude/professor/\nconcepts/")]
    ConceptRegFile[("data/concepts_\nregistry.json")]
    DomainsFile[("data/domains.json")]
    SessionFile[("session.json")]
    ArchDirStore[("docs/professor/\narchitecture/")]

    %% file-io-utilities is the foundation
    FileIO --> SpcRepeat
    FileIO --> ConceptLookup
    FileIO --> SessionLife
    FileIO --> SessionChk
    FileIO --> WBRouter
    FileIO --> ConceptUpdate
    FileIO --> ArchGraph
    FileIO --> ConceptMig
    FileIO --> ConfigVal

    %% shared-utilities (overlaps with file-io-utilities)
    SharedUtils --> SessionState
    SharedUtils --> ConceptUpdater
    SharedUtils --> ArchGraph
    SharedUtils --> DataMig

    %% domain taxonomy feeds registry and lookup
    DomainTax --> DomainsFile
    DomainTax --> ConceptLookup

    %% concept registry
    ConceptReg --> ConceptRegFile
    ConceptReg --> ConceptLookup

    %% FSRS scheduler
    FSRSSched --> ConceptUpdater
    FSRSSched --> TeachGate
    FSRSSched --> ConceptLookup

    %% spaced repetition
    SpcRepeat --> ConceptUpdate
    SpcRepeat --> SessionLife

    %% concept lookup
    ConceptLookup --> SessionLife
    ConceptLookup --> WBCommands
    ConceptLookup --> ConceptUpdate
    ConceptLookup --> SessionState
    ConceptLookup --> TeachGate
    ConceptLookup --> TeachSkills

    %% application config
    AppConfig --> SessionLife

    %% session lifecycle
    SessionLife --> WBRouter
    SessionLife --> SessionChk
    SessionLife --> SessionFile

    %% session state
    SessionState --> TeachGate
    SessionState --> ConceptUpdater
    SessionState --> SessionFile

    %% teaching gate
    TeachGate --> SessionState

    %% session checkpoint
    SessionChk --> WBRouter

    %% whiteboard router
    WBRouter --> WBCommands

    %% whiteboard commands
    WBCommands --> SessionLife
    WBCommands --> ConceptLookup
    WBCommands --> SessionChk

    %% concept updater
    ConceptUpdater --> ProfileDir

    %% concept update (script)
    ConceptUpdate --> ProfileDir

    %% architecture graph
    ArchGraph --> ArchDirStore
    GitChange --> ArchGraph

    %% architecture analysis skill
    ArchSkill --> ArchGraph
    ArchSkill --> ConceptLookup

    %% teaching skills
    TeachSkills --> SessionState

    %% data migration & concept migration
    DataMig --> SharedUtils
    ConceptMig --> FileIO

    %% test suite (dashed = test dependency)
    TestSuite -.-> FSRSSched
    TestSuite -.-> ConceptLookup
    TestSuite -.-> SessionState
    TestSuite -.-> TeachGate
    TestSuite -.-> ConceptUpdater
    TestSuite -.-> ArchGraph
    TestSuite -.-> DataMig
```

## Key Request Flows

### Flow 1: Whiteboard Session Init & Concept Scheduling

**Trigger**: `/whiteboard init` — user begins a design session

```mermaid
sequenceDiagram
    participant User
    participant WBRouter as whiteboard-router
    participant WBCmd as whiteboard-commands\n(init-session)
    participant SessionLife as session-lifecycle
    participant ConceptLookup as concept-lookup
    participant FSRSSched as fsrs-scheduler
    participant SessionFile as [(session.json)]
    participant ProfileDir as [(profile/)]

    User->>WBRouter: whiteboard init --project foo
    WBRouter->>WBCmd: dispatch init-session handler
    WBCmd->>SessionLife: createSession(project, config)
    SessionLife->>SessionFile: Write initial session.json
    WBCmd->>ConceptLookup: search(domain, query)
    ConceptLookup->>FSRSSched: computeRetrievability(stability, elapsedDays)
    FSRSSched->>ProfileDir: Load concept/{domain}/{id}.md frontmatter
    FSRSSched-->>ConceptLookup: retrievability score per concept
    ConceptLookup-->>WBCmd: Ranked concept list with status
    WBCmd->>SessionLife: updateSession(scheduledConcepts)
    SessionLife->>SessionFile: Persist updated session.json
    WBCmd-->>User: Session initialized, concepts scheduled
```

### Flow 2: Phase Progression & Teaching Gate

**Trigger**: `/whiteboard phase-complete` — user requests advancement to next phase

```mermaid
sequenceDiagram
    participant User
    participant WBRouter as whiteboard-router
    participant WBCmd as whiteboard-commands\n(phase-complete)
    participant SessionChk as session-checkpoint
    participant TeachGate as teaching-gate
    participant SessionState as session-state
    participant FSRSSched as fsrs-scheduler
    participant ConceptUpdater as concept-updater
    participant ProfileDir as [(profile/)]
    participant SessionFile as [(session.json)]

    User->>WBRouter: whiteboard phase-complete
    WBRouter->>WBCmd: dispatch phase-complete handler
    WBCmd->>SessionChk: validatePhaseCheckpoint(phase)
    SessionChk->>SessionFile: Load current session state
    SessionChk->>TeachGate: checkGate(phase, concepts)
    TeachGate->>SessionState: Get scheduled concepts for phase
    TeachGate->>FSRSSched: computeRetrievability(stability, days)
    FSRSSched->>ProfileDir: Load concept history
    FSRSSched-->>TeachGate: retrievability metric
    alt retrievability < threshold
        TeachGate-->>WBCmd: BLOCKED — trigger teaching
        WBCmd-->>User: Teach concept before continuing
    else retrievability >= threshold
        TeachGate-->>SessionChk: Gate open
        SessionChk->>ConceptUpdater: applyGrade(conceptId, grade)
        ConceptUpdater->>FSRSSched: scheduleNext(params, grade)
        ConceptUpdater->>ProfileDir: Write updated concept.md frontmatter
        SessionChk->>SessionFile: Log checkpoint passed
        WBCmd-->>User: Phase advanced
    end
```

### Flow 3: Architecture Analysis & Index Update

**Trigger**: `/analyze-architecture` or git post-hook — codebase is scanned and docs updated

```mermaid
sequenceDiagram
    participant User
    participant ArchSkill as architecture-analysis-skill
    participant ArchGraph as architecture-graph
    participant GitChange as git-change-detection
    participant FileIO as file-io-utilities
    participant ConceptLookup as concept-lookup
    participant ArchDirStore as [(docs/professor/\narchitecture/)]

    User->>ArchSkill: /analyze-architecture
    ArchSkill->>ArchGraph: graph.js update-index --architecture-dir ...
    ArchGraph->>FileIO: listMarkdownFiles(cwd)
    FileIO-->>ArchGraph: Component file list
    ArchGraph->>ArchGraph: Parse frontmatter, build dependency graph
    ArchGraph->>ArchDirStore: Write _index.md
    ArchSkill->>ConceptLookup: lookup.js search --query detected_patterns
    ConceptLookup-->>ArchSkill: Matched concept IDs + domains
    ArchSkill->>ArchDirStore: Write concept-scope.json
    ArchSkill->>ArchDirStore: Write data-flow.md, tech-stack.md
    GitChange->>ArchGraph: detect-changes.js (post-git hook)
    ArchGraph-->>User: Warn if architecture diverged from base branch
```

## Data Models

### Session State Structure

- **Type**: JSON persisted to `~/.claude/professor/sessions/{project}/session.json`
- **Key Fields**:
  - `sessionId`: UUID for session
  - `phase`: Current phase (`clarify`, `design_hld`, `design_lld`, `conclude`)
  - `checkpoints`: Map of phase to required concept IDs
  - `taught`: Set of resolved concept IDs
  - `gates`: Map of phase to open/closed status
  - `updatedAt`: ISO timestamp

### Concept Profile Entry

- **Type**: Markdown with YAML frontmatter
- **Location**: `~/.claude/professor/concepts/{domain}/{concept_id}.md`
- **Frontmatter Fields**:
  - `stability`: FSRS stability metric (float)
  - `difficulty`: FSRS difficulty rating (1–10)
  - `reps`: Count of reviews
  - `lapses`: Count of failed recalls
  - `lastReview`: ISO timestamp of most recent review

### Architecture Manifest

- **Type**: JSON generated by `architecture-graph`
- **Location**: `docs/professor/architecture/concept-scope.json`
- **Key Fields**:
  - `relevant_domains`: Inferred knowledge domains
  - `tech_stack`: Detected technologies
  - `detected_patterns`: Observed architectural concept IDs
  - `generated_from`: Source script or command
  - `last_updated`: ISO timestamp
