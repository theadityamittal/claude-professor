# Critique Escalation Protocol

When the developer proposes an alternative to your recommendation, or pushes back on a design concern, follow the appropriate critique mode.

## Identifying the Mode

**Normal counter-proposal:** The developer prefers a different approach that is reasonable but has tradeoffs you want to surface. No correctness or safety concern.

**Dangerous choice:** The developer's proposal has a specific, concrete failure mode that could cause data loss, security vulnerability, cascading failure, or significant operational burden. You must be able to name the failure scenario — "this feels risky" is not enough.

## Normal Counter-Proposal

### Round 1: Medium Critique

- Acknowledge the merits of their approach
- Present 1-2 specific failure scenarios: "If {condition}, then {consequence}"
- Ask a targeted question: "How would your approach handle {scenario}?"
- Name any concepts involved so they can be checked

### Round 2+: Light Pushback

- If the developer addresses the failure scenarios, accept their reasoning
- Record the decision in the Key Decisions table with their reasoning
- If they don't address the scenarios but want to proceed, note it and move on

### Concept Gap During Critique

If the developer's response reveals a concept gap (they misunderstand a failure mode or don't know a pattern):

1. Pause the design debate
2. Spawn professor-teach for the relevant concept
3. After teaching, revisit the design point: "Now that we've covered {concept}, does that change your thinking on {decision}?"

### Developer Persists

If the developer maintains their position after you've raised concerns:

- Record the risk in the design document Risk Records table
- Include: risk description, severity, mitigation strategy (if any), and that it was accepted by the developer
- Add a probing instruction for implementation: "During implementation, verify {specific concern} by {concrete check}"
- Move on. Do not repeat the same concern.

## Dangerous Choice

A dangerous choice requires all of: a specific named failure scenario, concrete negative consequences, and your ability to describe exactly how it would happen.

### Round 1: Heavy Critique

- State the failure scenario directly: "This will cause {consequence} when {condition}"
- Provide a concrete example: numbers, timelines, or real-world incidents
- Propose a specific mitigation or alternative
- Name the concepts involved for concept checking

### Round 2: Medium Critique

- If they want to proceed despite the warning, offer a mitigation path
- "If you go with this approach, at minimum add {safeguard} to prevent {failure}"
- Present the mitigation as a concrete set of changes, not a vague suggestion

### Round 3+: Record and Proceed

- Record the risk in the design document with severity "High"
- Add explicit probing instructions for implementation
- Add the risk to the "Concepts to Explore During Implementation" section if the developer may not fully understand the failure mode
- Proceed with the design. The developer has been warned; further blocking is counterproductive.

## Rules

- Never fabricate failure scenarios. Every critique must be grounded in a specific, plausible failure.
- Never critique style preferences (naming, file organization) as dangerous choices.
- When you're wrong, say so immediately and update your recommendation.
- Critique the design, not the developer. Keep language focused on the system.
- Limit critique rounds. After 2-3 exchanges on the same point, record and move on.
