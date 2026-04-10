# Data Flow Architecture

## Component Dependency Graph

```mermaid
graph LR
    SharedUtilities["Shared Utilities<br/>utils.js"]
    ConceptRegistry["Concept Registry<br/>concepts_registry.json"]
    DomainTaxonomy["Domain Taxonomy<br/>domains.json"]
    
    SharedUtilities --> ConceptRegistry
    SharedUtilities --> DomainTaxonomy
    
    ConceptLookup["Concept Lookup<br/>lookup.js"]
    ConceptLookup --> SharedUtilities
    ConceptLookup --> ConceptRegistry
    
    FsrsScheduler["FSRS Scheduler<br/>fsrs.js"]
    FsrsScheduler --> SharedUtilities
    
    ConceptUpdater["Concept Updater<br/>update.js"]
    ConceptUpdater --> FsrsScheduler
    ConceptUpdater --> SharedUtilities
    ConceptUpdater --> ConceptRegistry
    
    DataMigration["Data Migration<br/>migrate-v2.js, migrate-v3.js"]
    DataMigration --> SharedUtilities
    
    ArchitectureGraph["Architecture Graph<br/>graph.js"]
    ArchitectureGraph --> SharedUtilities
    ArchitectureGraph --> DomainTaxonomy
    
    GitChangeDetection["Git Change Detection<br/>detect-changes.js"]
    GitChangeDetection --> ArchitectureGraph
    GitChangeDetection --> SharedUtilities
    
    ArchitectureAnalysisSkill["Architecture Analysis Skill<br/>analyze-architecture"]
    ArchitectureAnalysisSkill --> ArchitectureGraph
    ArchitectureAnalysisSkill --> ConceptLookup
    
    SessionState["Session State<br/>session.js"]
    SessionState --> SharedUtilities
    
    TeachingSkills["Teaching Skills<br/>professor, professor-teach"]
    TeachingSkills --> ConceptLookup
    TeachingSkills --> SessionState
    
    ApplicationConfig["Application Config<br/>default_config.json"]
    ApplicationConfig --> SharedUtilities
    
    TestSuite["Test Suite<br/>test/"]
    TestSuite --> ArchitectureGraph
    TestSuite --> ConceptLookup
    TestSuite --> FsrsScheduler
    TestSuite --> ConceptUpdater
    TestSuite --> SessionState
    TestSuite --> DataMigration
    
    style SharedUtilities fill:#e1f5ff
    style ConceptRegistry fill:#f3e5f5
    style DomainTaxonomy fill:#f3e5f5
    style ConceptLookup fill:#fff3e0
    style FsrsScheduler fill:#e8f5e9
    style ConceptUpdater fill:#e8f5e9
    style DataMigration fill:#fce4ec
    style ArchitectureGraph fill:#fff3e0
    style GitChangeDetection fill:#f1f8e9
    style ArchitectureAnalysisSkill fill:#fff3e0
    style SessionState fill:#e0f2f1
    style TeachingSkills fill:#f1f8e9
    style ApplicationConfig fill:#ede7f6
    style TestSuite fill:#e0e0e0
```

## Request Flow: Learning Session Initialization

```mermaid
sequenceDiagram
    participant User
    participant TeachingSkill as Teaching Skills<br/>professor-teach
    participant SessionMgr as Session State
    participant ConceptLookup as Concept Lookup
    participant ConceptRegistry as [(Concept Registry)]
    participant FsrsScheduler as FSRS Scheduler
    
    User->>TeachingSkill: Initialize teaching session
    TeachingSkill->>SessionMgr: Create session context
    SessionMgr->>SessionMgr: Initialize state, requirements, decisions
    
    TeachingSkill->>ConceptLookup: Search concept by ID
    ConceptLookup->>ConceptRegistry: Query concept registry
    ConceptRegistry-->>ConceptLookup: Return concept metadata
    ConceptLookup-->>TeachingSkill: Return concept + aliases
    
    TeachingSkill->>FsrsScheduler: Compute retrievability
    FsrsScheduler->>FsrsScheduler: Calculate FSRS metrics
    FsrsScheduler-->>TeachingSkill: Return difficulty, stability, ease
    
    TeachingSkill->>SessionMgr: Update session with concept state
    SessionMgr-->>TeachingSkill: Confirm session updated
    
    TeachingSkill-->>User: Begin teaching interaction
```

## Request Flow: Concept Update and FSRS Calculation

```mermaid
sequenceDiagram
    participant User
    participant ConceptUpdater as Concept Updater<br/>update.js
    participant ConceptLookup as Concept Lookup
    participant FsrsScheduler as FSRS Scheduler
    participant ConceptRegistry as [(Concept Registry)]
    participant DomainTaxonomy as [(Domain Taxonomy)]
    
    User->>ConceptUpdater: Submit review grade (1-4)
    ConceptUpdater->>ConceptLookup: Resolve concept alias
    ConceptLookup->>ConceptRegistry: Lookup concept by ID or alias
    ConceptRegistry-->>ConceptLookup: Return full concept
    ConceptLookup-->>ConceptUpdater: Return concept + metadata
    
    ConceptUpdater->>FsrsScheduler: Calculate FSRS metrics
    FsrsScheduler->>FsrsScheduler: Apply SM-2 algorithm to grade
    FsrsScheduler-->>ConceptUpdater: Return updated difficulty, stability, ease
    
    ConceptUpdater->>ConceptUpdater: Merge metrics into concept
    ConceptUpdater->>ConceptRegistry: Persist updated concept
    ConceptRegistry-->>ConceptUpdater: Confirm write
    
    ConceptUpdater-->>User: Return updated concept state
```

## Request Flow: Architecture Analysis and Indexing

```mermaid
sequenceDiagram
    participant User
    participant AnalysisSkill as Architecture Analysis<br/>analyze-architecture
    participant ArchGraph as Architecture Graph<br/>graph.js
    participant GitDetect as Git Change Detection
    participant ConceptLookup as Concept Lookup
    participant SharedUtils as Shared Utilities
    participant ComponentFiles as [(Component<br/>Markdown Files)]
    participant ConceptRegistry as [(Concept Registry)]
    participant IndexFile as [(Index File<br/>_index.md)]
    
    User->>AnalysisSkill: Scan codebase architecture
    AnalysisSkill->>ArchGraph: create-index command
    ArchGraph->>SharedUtils: Scan component directory
    SharedUtils->>ComponentFiles: Read all .md files
    ComponentFiles-->>SharedUtils: Return component metadata
    SharedUtils-->>ArchGraph: Return parsed components
    
    ArchGraph->>GitDetect: Detect architectural changes
    GitDetect->>SharedUtils: Parse git diff
    SharedUtils-->>GitDetect: Return file changes
    GitDetect-->>ArchGraph: Return affected components
    
    ArchGraph->>ConceptLookup: Reconcile tech stack concepts
    ConceptLookup->>ConceptRegistry: Search detected technologies
    ConceptRegistry-->>ConceptLookup: Return matched concepts
    ConceptLookup-->>ArchGraph: Return concept IDs
    
    ArchGraph->>ArchGraph: Build dependency graph
    ArchGraph->>IndexFile: Write index.md
    IndexFile-->>ArchGraph: Confirm write
    
    ArchGraph-->>AnalysisSkill: Return index with metadata
    AnalysisSkill-->>User: Present architecture overview
```
