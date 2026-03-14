---
name: interview
description: >
  Use when the user wants requirements to be discovered through structured reverse-interviewing
  for feature, refactoring, bug-analysis, or architecture tasks.
allowed-tools: "AskUserQuestion, Write, Read, Glob, Grep"
---

# Interview

Extract detailed, actionable specs by reverse-interviewing the user.

## When to Use

- User wants requirements extracted through structured questioning
- Vague request needs clarification before implementation
- Complex architecture/refactoring needs systematic scoping
- User says "요구사항 정리해줘", "스펙 작성", "인터뷰"

**Do NOT use when:**
- User already provides a detailed spec
- Task is simple enough to implement directly (typo fix, single-line change)

## CRITICAL: AskUserQuestion 턴 분리 규칙

**AskUserQuestion은 이 스킬이 로드된 턴(같은 assistant turn)에서 절대 호출하지 마세요.**

Skill tool로 이 스킬이 로드되면, 같은 턴에서 AskUserQuestion을 호출할 경우 사용자에게 질문 UI가 표시되지 않고 빈 응답으로 자동 처리됩니다 (Claude Code 플랫폼 제약).

**필수 절차:**
1. Phase 1 (코드베이스 스캔)을 수행한다
2. 스캔 결과와 인터뷰 방향을 **텍스트로 출력**한다
3. **반드시 STOP하고 사용자 응답을 기다린다**
4. 사용자가 응답한 **다음 턴**에서 AskUserQuestion을 사용하여 Phase 2를 시작한다

이 규칙을 어기면 사용자가 질문을 볼 수 없고, 인터뷰가 진행되지 않습니다.

## Quick Reference

| Phase | Action | Key Rule |
|-------|--------|----------|
| 1. Context Discovery | Scan codebase + categorize topic | **Always scan code BEFORE asking** |
| 2. Deep Interview | Multi-round AskUserQuestion | 2-3 questions/round, build on answers |
| 3. Completion Check | Verify all criteria met | Don't stop early, don't drag on |
| 4. Spec Output | Write `specs/{topic-slug}.md` | Always this path, always structured |

## Protocol

### Phase 1: Context Discovery

**MANDATORY: Scan the codebase FIRST** using Read, Glob, Grep.
- Understand current implementation before asking anything
- This prevents asking questions the code already answers
- Ground your questions in the user's actual code

Then categorize the topic:

- **New feature** → user stories, acceptance criteria, edge cases, constraints
- **Refactoring** → pain points, target architecture, migration strategy, risk
- **Bug analysis** → symptoms, reproduction, environment, expected vs actual
- **Architecture design** → requirements, scalability, trade-offs, integration

Categories are guides, not constraints. Adapt freely.

### Phase 2: Deep Interview

Use AskUserQuestion with 2-3 questions per round.

**Rules:**
- Build on previous answers — go deeper, not sideways
- Avoid questions the codebase already answered
- Provide concrete options, always allow "Other"
- Dig into what the user hasn't considered

**Adapt round count:**
- Concrete tasks (clear feature + target + scope): 1-2 rounds
- Vague or architectural topics: 4-6 rounds

**Cover these dimensions as relevant:**
- Technical constraints and implementation details
- UI/UX considerations and user flows
- Edge cases, error scenarios, failure modes
- Trade-offs the user hasn't articulated
- Dependencies and integration points
- Non-functional: performance, security, scalability
- What's explicitly out of scope

### Phase 3: Completion Check

End ONLY when ALL are true:
- Core requirements are implementable
- Key trade-offs explicitly decided
- Edge cases and error handling discussed
- User confirms nothing to add ("Is there anything else?" as final round)

**Don't stop early** — "I feel I understand" is not a completion criterion.
**Don't drag on** — concrete tasks may satisfy all criteria in 1-2 rounds.

### Phase 4: Spec Output

Write to `specs/{topic-slug}.md`. Always this path.

```markdown
# {Topic Title}

## Summary
One-paragraph overview of what was decided.

## Requirements
- Concrete, actionable items
- Each specific enough to implement

## Technical Decisions
Key decisions with rationale.

## Edge Cases & Constraints
Scenarios and how to handle them.

## Out of Scope
What was explicitly excluded.

## Open Questions
Unresolved items (if any).
```

Tell the user the file path after writing.

## Handling Mid-Interview Pivots

If the user changes topic mid-interview:
1. Save current progress — write partial spec for the original topic
2. Start fresh Phase 1 for the new topic (codebase scan is mandatory again)
3. Don't carry over assumptions from the previous topic

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Asking questions without scanning code first | **Always** Read/Glob/Grep the codebase in Phase 1 |
| Asking generic/obvious questions | Ground questions in actual codebase context |
| Stopping after 2-3 questions under time pressure | Follow completion criteria, not feelings |
| Making assumptions instead of asking | If unsure, ask. Assumptions cause rework |
| Writing spec to random location | Always `specs/{topic-slug}.md` |
| Asking 5+ rounds for a concrete task | Adapt depth — simple tasks need fewer rounds |

## Red Flags — STOP and Reassess

- Starting to code before spec is written
- "I think I understand enough to start"
- Skipping codebase scan because "it's faster"
- Making 3+ assumptions without validating
- User says "빨리" and you skip systematic questioning
