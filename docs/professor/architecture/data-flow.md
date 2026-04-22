# Data Flow & Architecture

## Component Dependency Graph

```mermaid
graph LR
    AppConfig["application-config"]
    ArchSkill["architecture-analysis-skill"]
    ArchChange["architecture-change-detection"]
    ArchGen["architecture-generation"]
    ArchGraph["architecture-graph"]
    ConceptLookup["concept-lookup"]
    ConceptMig["concept-migration"]
    ConceptProg["concept-progress-tracking"]
    ConceptReg["concept-registry"]
    ConceptRegLookup["concept-registry-lookup"]
    ConceptUpdate["concept-update"]
    ConceptUpdater["concept-updater"]
    ConfigMgmtConfig["configuration-management-config"]
    ConfigVal["configuration-validation"]
    DataMig["data-migration"]
    DomainTax["domain-taxonomy"]
    FileIO["file-io-utilities"]
    FSRSAlgo["fsrs-learning-algorithm"]
    FSRSSched["fsrs-scheduler"]
    GitChange["git-change-detection"]
    PhaseChk["phase-checkpointing"]
    SessionChk["session-checkpoint"]
    SessionLife["session-lifecycle"]
    SessionState["session-state"]
    SharedUtils["shared-utilities"]
    SpcRepeat["spaced-repetition"]
    TeachGate["teaching-gate"]
    TeachSkills["teaching-skills"]
    TestSuite["test-suite"]
    WBCommands["whiteboard-commands"]
    WBConceptRec["whiteboard-concept-recording"]
    WBIter["whiteboard-iterators"]
    WBPhaseMgmt["whiteboard-phase-mgmt"]
    WBRouter["whiteboard-router"]
    WBScheduling["whiteboard-scheduling"]
    WBSessionInit["whiteboard-session-init"]
    WBSkillRouter["whiteboard-skill-router"]

    ProfileDir[("~/.claude/professor/\nconcepts/")]
    ConceptRegFile[("data/concepts_\nregistry.json")]
    DomainsFile[("data/domains.json")]
    SessionFile[("session.json")]
    SessionLog[("session.jsonl")]
    ArchDirStore[("docs/professor/\narchitecture/")]

    %% file-io-utilities / shared-utilities are the foundation
    FileIO --> SpcRepeat
    FileIO --> ConceptLookup
    FileIO --> ConceptRegLookup
    FileIO --> SessionLife
    FileIO --> SessionChk
    FileIO --> WBRouter
    FileIO --> WBSkillRouter
    FileIO --> ConceptUpdate
    FileIO --> ArchGraph
    FileIO --> ArchGen
    FileIO --> ConceptMig
    FileIO --> ConfigVal
    FileIO --> ConceptProg
    FileIO --> PhaseChk
    FileIO --> AppConfig
    FileIO --> ConfigMgmtConfig
    SharedUtils --> SessionState
    SharedUtils --> ConceptUpdater
    SharedUtils --> ArchGraph
    SharedUtils --> DataMig

    %% domain taxonomy feeds registry and lookup
    DomainTax --> DomainsFile
    DomainTax --> ConceptReg
    DomainTax --> ConceptLookup

    %% concept registry
    ConceptReg --> ConceptRegFile
    ConceptReg --> ConceptLookup
    ConceptReg --> ConceptRegLookup

    %% FSRS components
    FSRSAlgo --> ConceptProg
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
    ConceptLookup --> ArchSkill

    %% concept registry lookup
    ConceptRegLookup --> SessionLife
    ConceptRegLookup --> WBIter
    ConceptRegLookup --> WBScheduling

    %% application config
    AppConfig --> SessionLife
    ConfigMgmtConfig --> SessionLife

    %% session lifecycle
    SessionLife --> WBSkillRouter
    SessionLife --> SessionChk
    SessionLife --> SessionFile
    SessionLife --> WBCommands
    SessionLife --> WBSessionInit
    SessionLife --> WBPhaseMgmt
    SessionLife --> WBConceptRec
    SessionLife --> WBScheduling
    SessionLife --> WBIter

    %% session state
    SessionState --> TeachGate
    SessionState --> ConceptUpdater
    SessionState --> SessionFile
    SessionState --> TeachSkills

    %% teaching gate
    TeachGate --> SessionState

    %% session checkpoint
    SessionChk --> WBRouter
    SessionChk --> SessionLog

    %% whiteboard skill router
    WBSkillRouter --> WBSessionInit
    WBSkillRouter --> WBPhaseMgmt
    WBSkillRouter --> WBConceptRec
    WBSkillRouter --> WBScheduling
    WBSkillRouter --> WBIter
    WBSkillRouter --> ConceptProg
    WBSkillRouter --> PhaseChk

    %% whiteboard router
    WBRouter --> WBCommands

    %% whiteboard commands
    WBCommands --> SessionLife
    WBCommands --> ConceptLookup
    WBCommands --> SessionChk
    WBCommands --> WBRouter

    %% whiteboard sub-handlers
    WBConceptRec --> WBSkillRouter
    WBIter --> WBSkillRouter
    WBPhaseMgmt --> WBSkillRouter
    WBScheduling --> WBSkillRouter
    WBSessionInit --> WBSkillRouter

    %% concept updater
    ConceptUpdater --> ProfileDir

    %% concept update (script)
    ConceptUpdate --> ProfileDir
    ConceptProg --> FSRSAlgo
    ConceptProg --> FileIO

    %% architecture graph / generation
    ArchGraph --> ArchDirStore
    ArchGen --> ArchChange
    GitChange --> ArchGraph
    ArchSkill --> ArchGraph

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

**Trigger**: `whiteboard init-session` — user begins a design session via the v5 skill router

```mermaid
sequenceDiagram
    participant User
    participant WBSkillRouter as whiteboard-skill-router
    participant WBSessionInit as whiteboard-session-init
    participant SessionLife as session-lifecycle
    participant ConceptRegLookup as concept-registry-lookup
    participant FSRSSched as fsrs-scheduler
    participant SessionFile as [(session.json)]
    participant ProfileDir as [(profile/)]

    User->>WBSkillRouter: whiteboard init-session --task "Design auth service"
    WBSkillRouter->>WBSessionInit: dispatch(init-session, args)
    WBSessionInit->>SessionLife: createSession(taskDescription, catalogVersion)
    SessionLife->>SessionFile: write initial session.json
    WBSessionInit->>ConceptRegLookup: enumerateConcepts(domains)
    ConceptRegLookup->>FSRSSched: computeRetrievability(stability, elapsedDays)
    FSRSSched->>ProfileDir: load concept/{domain}/{id}.md frontmatter
    FSRSSched-->>ConceptRegLookup: retrievability score per concept
    ConceptRegLookup-->>WBSessionInit: ranked concept list with FSRS state
    WBSessionInit->>SessionLife: updateSession(scheduledConcepts)
    SessionLife->>SessionFile: persist updated session.json
    WBSessionInit-->>User: session initialized, concepts scheduled
```

### Flow 2: Phase Progression & Teaching Gate

**Trigger**: `whiteboard phase-complete` — user requests advancement to next phase

```mermaid
sequenceDiagram
    participant User
    participant WBSkillRouter as whiteboard-skill-router
    participant WBPhaseMgmt as whiteboard-phase-mgmt
    participant PhaseChk as phase-checkpointing
    participant TeachGate as teaching-gate
    participant SessionState as session-state
    participant FSRSSched as fsrs-scheduler
    participant ConceptProg as concept-progress-tracking
    participant FSRSAlgo as fsrs-learning-algorithm
    participant ProfileDir as [(profile/)]
    participant SessionFile as [(session.json)]
    participant SessionLog as [(session.jsonl)]

    User->>WBSkillRouter: whiteboard phase-complete --phase 2
    WBSkillRouter->>WBPhaseMgmt: dispatch(phase-complete, args)
    WBPhaseMgmt->>PhaseChk: auditPhaseRequirements(phase, state)
    PhaseChk->>TeachGate: checkGate(phase, concepts)
    TeachGate->>SessionState: getScheduledConcepts(phase)
    SessionState->>SessionFile: read
    TeachGate->>FSRSSched: computeRetrievability(stability, days)
    FSRSSched->>ProfileDir: load concept history
    FSRSSched-->>TeachGate: retrievability metric
    alt retrievability < threshold
        TeachGate-->>WBPhaseMgmt: BLOCKED — trigger teaching
        WBPhaseMgmt-->>User: teach concept before continuing
    else retrievability >= threshold
        PhaseChk-->>WBPhaseMgmt: gate open, requirements met
        WBPhaseMgmt->>ConceptProg: applyGrade(conceptId, grade)
        ConceptProg->>FSRSAlgo: scheduleNext(params, grade)
        FSRSAlgo-->>ConceptProg: nextDue, stability, difficulty
        ConceptProg->>ProfileDir: write updated concept.md frontmatter
        WBPhaseMgmt->>SessionState: advancePhase(3)
        SessionState->>SessionFile: write updated phase
        WBPhaseMgmt->>SessionLog: append checkpoint entry
        WBPhaseMgmt-->>User: phase advanced to 3
    end
```

### Flow 3: Architecture Analysis & Index Update

**Trigger**: `/analyze-architecture` or git post-hook — codebase is scanned and docs updated

```mermaid
sequenceDiagram
    participant User
    participant ArchSkill as architecture-analysis-skill
    participant ArchGen as architecture-generation
    participant ArchGraph as architecture-graph
    participant ArchChange as architecture-change-detection
    participant GitChange as git-change-detection
    participant FileIO as file-io-utilities
    participant ConceptLookup as concept-lookup
    participant ArchDirStore as [(docs/professor/architecture/)]

    User->>ArchSkill: /analyze-architecture
    ArchSkill->>ArchGraph: graph.js update-index --architecture-dir ...
    ArchGraph->>FileIO: listMarkdownFiles(cwd)
    FileIO-->>ArchGraph: component file list
    ArchGraph->>ArchGraph: parse frontmatter, build dependency graph
    ArchGraph->>ArchDirStore: write _index.md
    ArchSkill->>ConceptLookup: lookup.js search --query detected_patterns
    ConceptLookup-->>ArchSkill: matched concept IDs + domains
    ArchSkill->>ArchDirStore: write concept-scope.json, data-flow.md, tech-stack.md
    GitChange->>ArchGraph: detect-changes.js (post-git hook)
    ArchGraph->>ArchGen: scan filesystem for new/modified components
    ArchGen->>ArchChange: emit change events if structural drift detected
    ArchChange-->>User: warn if architecture diverged from base branch
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
