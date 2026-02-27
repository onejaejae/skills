---
name: interview
description: "Reverse-interview skill that extracts detailed specs by interviewing the user. Use when: (1) user says '/interview', 'interview me', '인터뷰', '요구사항 추출', '스펙 작성', (2) user wants to define requirements for a new feature, refactoring plan, bug analysis, or architecture design, (3) user wants AI to ask deep questions instead of writing requirements themselves. Accepts optional arguments for interview topic/context."
allowed-tools: "AskUserQuestion, Write, Read, Glob, Grep"
---

# Interview

Extract detailed, actionable specs by interviewing the user instead of receiving passive requirements.

## Workflow

1. Analyze the topic from $ARGUMENTS (or ask if not provided)
2. Scan the codebase to understand current implementation
3. Conduct multi-round interview using AskUserQuestion
4. Write the final spec to a file

## Interview Process

### Phase 1: Context Discovery

Determine the interview category from user's topic:

- **New feature** → Focus on user stories, acceptance criteria, edge cases, technical constraints
- **Refactoring** → Focus on current pain points, target architecture, migration strategy, risk
- **Bug analysis** → Focus on symptoms, reproduction steps, environment, expected vs actual behavior
- **Architecture design** → Focus on requirements, scalability, trade-offs, integration points

If the topic doesn't fit neatly, adapt freely. These categories are guides, not constraints.

Scan the codebase (Read, Glob, Grep) to understand the current implementation context. This grounds your questions in the user's actual code — making them specific and avoiding questions the codebase already answers.

### Phase 2: Deep Interview

Conduct the interview using AskUserQuestion. Guidelines:

- Ask 2-3 questions per round (use the multi-question capability)
- Provide concrete options where helpful, but always allow free-form "Other" input
- Avoid obvious or generic questions — dig into what the user hasn't considered
- Build on previous answers — each round should go deeper, not sideways
- **Adapt round count to task specificity**: Already-concrete tasks (clear feature + target + scope) may need only 1-2 rounds. Vague or architectural topics may need 4-6 rounds. Don't ask questions the codebase already answered.
- Cover these dimensions as relevant:
  - Technical implementation details and constraints
  - UI/UX considerations and user flows
  - Edge cases, error scenarios, failure modes
  - Trade-offs the user may not have articulated
  - Dependencies and integration points
  - Non-functional requirements (performance, security, scalability)
  - What's explicitly out of scope

### Phase 3: Completion Check

End the interview when ALL of these are true:

- Core requirements are clear enough to start implementation
- Key trade-offs and decisions have been explicitly made
- Edge cases and error handling have been discussed
- The user has no more to add (ask "Is there anything else?" as a final round)

Adapt the depth to the task: concrete tasks may satisfy these criteria in 1-2 rounds. Don't artificially extend the interview.

### Phase 4: Spec Output

Write the spec file to the project root as `specs/{topic-slug}.md`.

Use this flexible structure — adapt sections based on what was actually discussed:

```markdown
# {Topic Title}

## Summary
One-paragraph overview of what was decided.

## Requirements
- Concrete, actionable items extracted from the interview
- Each requirement should be specific enough to implement

## Technical Decisions
Key decisions made during the interview with rationale.

## Edge Cases & Constraints
Scenarios discussed, how to handle them.

## Out of Scope
What was explicitly excluded.

## Open Questions
Anything that remains unresolved (if any).
```

After writing, tell the user the file path.
