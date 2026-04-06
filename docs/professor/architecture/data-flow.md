# Data Flow

## Component Dependency Graph

```mermaid
graph LR
    PI[plugin-infrastructure] --> TS[teaching-skills]
    PI --> AA[architecture-analyzer]
    PI --> DC[design-conversation]

    CR[concept-registry] --> PM[profile-manager]
    CR --> KA[knowledge-agent]
    CR --> AA

    FE[fsrs-engine] --> PM
    UT[utilities] --> PM
    UT --> AA
    UT --> DC

    PM --> KA
    PM --> TS
    PM --> DC

    KA --> TS
    TS --> DC
    AA --> DC
```

## Key Request Flows

### 1. `/professor {task}` — Teaching Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Prof as professor skill
    participant KA as knowledge-agent
    participant LU as lookup.js
    participant CR as concepts_registry.json
    participant UP as update.js
    participant FSRS as fsrs.js

    Dev->>Prof: /professor "Add Redis caching"
    Prof->>KA: Spawn subagent with task
    KA->>CR: Read registry + domains
    KA->>LU: search --query "caching redis..."
    LU-->>KA: matched_concepts
    KA->>LU: status --concepts "cache_invalidation,..."
    LU->>FSRS: computeRetrievability()
    LU->>FSRS: determineAction()
    FSRS-->>LU: teach_new / review / skip
    LU-->>KA: concept statuses
    KA-->>Prof: JSON briefing (teach/review/skip groups)

    loop For each teach_new concept
        Prof->>Dev: Explain + recall question
        Dev->>Prof: Answer
        Prof->>Prof: Grade (1-4)
    end

    loop For each review concept
        Prof->>Dev: Flashcard prompt
        Dev->>Prof: Answer
        Prof->>Prof: Grade (1-4)
    end

    Prof->>Dev: MCQ pop quiz (all concepts)
    Dev->>Prof: Answers

    loop For each concept
        Prof->>UP: update --concept X --grade N
        UP->>FSRS: computeNewStability/Difficulty
        UP-->>Prof: success
    end

    Prof->>Prof: Write handoff document
    Prof-->>Dev: Handoff doc path + summary
```

### 2. `/backend-architect {feature}` — Design Conversation Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant BA as backend-architect skill
    participant Sess as session.js
    participant Arch as Architecture Docs
    participant PT as professor-teach skill
    participant LU as lookup.js
    participant UP as update.js

    Dev->>BA: /backend-architect "Add notifications"
    BA->>Arch: Check docs/professor/architecture/
    BA->>Sess: create(feature, branch)

    Note over BA,Dev: Phase 2: Requirements
    BA->>Dev: Clarifying questions (1 at a time)
    Dev->>BA: Answers
    BA->>Sess: update(phase: "requirements")

    Note over BA,Dev: Phase 3: Architecture Fit
    BA->>Arch: Read relevant components
    BA->>Dev: How feature fits existing system

    Note over BA,Dev: Phase 4: Design Options
    BA->>Dev: Propose 2-3 approaches
    BA->>LU: status --concepts "message_queue,..."
    alt Concept gap detected
        BA->>PT: Teach concept inline
        PT->>Dev: Explain + question
        Dev->>PT: Answer
        PT->>UP: update --grade N
    end
    Dev->>BA: Choose option
    BA->>Sess: update(chosen_option)

    Note over BA,Dev: Phase 5: Finalization
    BA->>Dev: Present complete design
    Dev->>BA: Feedback / approve

    Note over BA,Dev: Phase 6: Write Document
    BA->>BA: Generate design doc
    BA->>Sess: clear()
    BA-->>Dev: Design doc path
```

### 3. `/analyze-architecture` — Architecture Scan Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant AA as analyze-architecture skill
    participant FS as File Scanner Agent
    participant DA as Dependency Analyzer Agent
    participant GR as graph.js
    participant LU as lookup.js

    Dev->>AA: /analyze-architecture
    par Parallel subagents
        AA->>FS: Scan directory tree, manifests, configs
        AA->>DA: Analyze imports, dependencies, frameworks
    end
    FS-->>AA: Structure data
    DA-->>AA: Dependency data

    AA->>AA: Synthesize components from findings
    AA->>LU: search --query per component

    loop For each component
        AA->>GR: create-component --id X ...
    end

    AA->>GR: update-index
    AA->>AA: Write data-flow.md + tech-stack.md
    AA-->>Dev: Summary (N components, tech stack)
```
