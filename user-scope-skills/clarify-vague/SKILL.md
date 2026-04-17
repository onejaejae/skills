---
name: clarify-vague
description: >
  Use when the user's request is too vague or ambiguous to act on safely,
  even if they haven't explicitly asked for clarification. Also use when
  another skill says "clarify first" or when jumping to implementation
  would be risky because the problem statement is unclear.
  Triggers: "clarify requirements", "refine requirements",
  "make this concrete", "요구사항 정리", "막연한데 정리해줘", "아이디어 구체화",
  "명확하게 해줘", "뭘 원하는지 모르겠어", "정리부터 하자", "vague idea",
  "clarify this", "구체화해줘", "스펙 정리", "뭘 만들어야 할지 모르겠어".
  Prefer over /discuss when the goal is convergence, not open exploration.
---

# clarify-vague

Shape a fuzzy idea into a short, concrete brief that another skill or person can act on immediately.

## Why this skill exists

Jumping into implementation on a vague request wastes time and produces the wrong thing. But heavy-weight requirement processes (multi-round interviews, deep assumption surfacing) are overkill when the idea just needs a quick sharpening pass. This skill fills that gap: 1-2 rounds of focused questions, then a brief you can hand off.

## When to use vs. adjacent skills

| Skill | Best for | Not for |
|-------|----------|---------|
| **clarify-vague** | Vague idea that needs shaping into a concrete brief (1-2 rounds) | Full spec generation or open-ended exploration |
| `/discuss` | Sparring, challenging assumptions, exploring the problem space | Producing a structured requirement document |
| `/interview` | Codebase-aware requirement discovery for known feature work | Early-stage idea shaping where the direction is still open |
| `/deep-interview` | Surfacing hidden assumptions across a complex system | Quick clarification of a single fuzzy request |

If you're unsure which to pick: start here. If more depth is needed, this skill will tell you where to go next.

## Turn separation rule

Do not call AskUserQuestion in the same turn this skill is loaded. The reason: the skill loads mid-turn and the user hasn't seen your framing yet. If you ask a question immediately, it feels abrupt and they lack context for answering well. Instead, output a short framing summary first, then stop. Ask questions on the next turn after the user responds.

## Workflow

### Phase 0 — Frame the ambiguity

Convert the user's input into a working frame so they can see what you understood and correct you early.

If the user explicitly refers to a codebase, do a light scan (`Read`/`Glob`/`Grep`) first. Don't ask questions the code already answers — that wastes the user's patience and signals you didn't look.

Output this structure:

```markdown
## Clarify Start

**Current idea**
- [One-line restatement in your own words]

**Likely goal**
- [What outcome the user seems to want]

**Known constraints**
- [Only what the user or codebase clearly establishes]

**Biggest unknowns**
- [Unknown 1]
- [Unknown 2]
```

Then stop and wait. The user needs a chance to correct the frame before you build on it.

### Phase 1 — Clarification loop

Use `AskUserQuestion` for 1-2 rounds. Focus on the highest-leverage unknowns — the ones that would change your approach if answered differently.

Priority order for questions:
1. What problem are we actually solving?
2. What does success look like?
3. What must be in scope?
4. What is explicitly out of scope?
5. Are there hard constraints that rule out obvious approaches?

**Question discipline:**
- Ask at most 2 questions per round. More than that overwhelms and gets vague answers back.
- Prefer concrete, mutually exclusive options over open-ended questions. "Should this be a CLI tool or a web UI?" beats "What format should this be in?"
- Always let the user correct the framing — don't treat your Phase 0 frame as settled.
- Skip any question the codebase or conversation history already answered.

### Early exit

If at any point the user says something like "just do it" or "that's enough, let's go" — respect that. Produce the best brief you can with what you have, note any remaining gaps in the Open Questions section, and move on. The point is to help, not to gatekeep.

## Completion criteria

Stop clarifying when:
- The problem statement is concrete enough to act on
- The desired outcome is explicit
- In-scope vs out-of-scope is distinguishable
- Hard constraints are known (or confirmed absent)
- Remaining unknowns are small enough to defer

If these aren't met after 2 rounds, escalate:
- `/interview` — if codebase-aware requirement discovery would help
- `/deep-interview` — if major hidden assumptions still lurk

## Output

Produce a concise brief. Keep it short enough that another skill can consume it immediately without summarization.

```markdown
## Clarified Brief

**Problem**
- [What was unclear, now made concrete]

**Desired outcome**
- [What "done" means]

**In scope**
- [Item]

**Out of scope**
- [Item]

**Constraints**
- [Constraint, if any]

**Open questions**
- [Deferred unknowns, if any]

**Recommended next step**
- [/interview | /deep-interview | /scope | /plan | proceed directly]
```

## What this skill does NOT do

- Write code
- Create plan files
- Brainstorm solutions (that's `/discuss`)
- Generate full specs (that's `/spec-generator`)

Staying narrow is the point. A brief that tries to be a spec will be a bad spec.

## Common mistakes to avoid

| Mistake | Why it happens | Fix |
|---------|---------------|-----|
| Turning this into ideation | The user's idea is interesting and you start exploring | Remember: converge on a brief, don't expand the solution space |
| Jumping to architecture | You see a technical problem and want to solve it | Stay on problem → outcome → scope → constraints |
| Asking too many questions | You want to be thorough | Pick the 1-2 unknowns that would change everything; defer the rest |
| Hiding uncertainty | Feels awkward to say "I don't know" | Put unresolved items in Open Questions explicitly — that's what it's for |
| Ignoring "just do it" | The workflow says 2 rounds | The user's agency overrides the workflow. Produce the best brief you can and move on |
