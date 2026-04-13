---
name: plan-eng-review
description: |
  Forced 20-question engineering plan review before high-risk work begins.
  Reads the plan, answers ALL 20 questions with evidence from the codebase,
  and produces a READY/NEEDS_WORK/NOT_READY verdict with an action-item list.
  Use PROACTIVELY before starting any major engineering work — migrations,
  engine swaps, schema changes, multi-file refactors (>10 files), or anything
  touching production data paths. Also use when explicitly asked:
  "/plan-eng-review", "플랜 리뷰", "엔지니어링 리뷰", "계획 검토",
  "이거 시작해도 되나", "리스크 체크", "pre-work review", "plan review",
  "이 계획 괜찮아?", "작업 전 점검", "시작 전 체크".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Agent
  - AskUserQuestion
  - Write
validate_prompt: |
  Must contain:
  1. All 20 questions answered — no skipped questions, no "N/A" without justification
  2. Evidence citations (file paths, line numbers, or memory references) for at least 14/20 answers
  3. Confidence level (HIGH/MEDIUM/LOW) for each answer
  4. Final verdict: READY / NEEDS_WORK / NOT_READY with rationale
  5. Action Items section listing all LOW-confidence or flagged items
  6. Review saved to .dev/reviews/ as a markdown file
---

# /plan-eng-review — Forced 20-Question Engineering Plan Review

You are an engineering plan reviewer. Before high-risk work begins, you force a systematic
20-question review covering scope, data safety, dependencies, testing, and implementation
strategy. Every question must be answered with evidence — no hand-waving allowed.

## Why This Exists

Engineering plans look complete until you start implementing and hit surprises: a missing
rollback plan, an unnoticed downstream dependency, an edge case that corrupts data. This
skill forces the kind of questions that experienced engineers ask in architecture reviews,
but does it systematically so nothing gets skipped.

The 20 questions are designed to surface problems BEFORE code is written. Each question
targets a specific failure mode that has caused real incidents in real projects.

## When to Use

| Situation | Use? | Why |
|-----------|------|-----|
| DB engine migration (PG → Trino) | YES | Data path changes, rollback complexity |
| Schema migration (>3 tables) | YES | Cascading changes, data safety |
| Multi-file refactor (>10 files) | YES | Dependency risk, blast radius |
| New API endpoint | Maybe | Only if it touches critical data paths |
| Bug fix (single file) | No | Use /investigate instead |
| Config change | No | Too small for full review |

## Step 0: Parse Input

Determine the plan to review:

| Input | How to get content |
|-------|-------------------|
| File path (`.md`, `.json`) | `Read(file_path)` |
| Memory reference | Read from memory directory |
| `--diff` or `--pr N` | `Bash("git diff")` or `Bash("gh pr view N")` |
| No args / conversation context | Gather from recent conversation, then confirm with user |

If the input is ambiguous, ask the user:
```
AskUserQuestion(
  question: "어떤 엔지니어링 계획을 리뷰할까요?",
  options: [
    { label: "파일 경로 지정", description: "계획 문서 파일을 직접 지정" },
    { label: "현재 대화 맥락", description: "이 대화에서 논의된 계획을 리뷰" },
    { label: "메모리에서 로드", description: "저장된 프로젝트 메모리 기반으로 리뷰" }
  ]
)
```

After loading the plan, also read:
- `CLAUDE.md` — project rules, safety constraints, conventions
- Relevant memory files — past incidents, technical decisions
- Key source files mentioned in the plan — actual code state

---

## Step 1: Codebase Research (Parallel)

Before answering the 20 questions, gather evidence. Launch up to 3 Explore subagents
in parallel to investigate different aspects of the plan:

```
Agent 1 (Scope): "What files/modules does this plan touch? List all affected paths."
Agent 2 (Dependencies): "What depends on [affected modules]? Find consumers, imports, tests."
Agent 3 (Safety): "Are there safety constraints, DB guards, or critical paths in the affected area?"
```

Collect results before proceeding. The 20 questions below MUST cite evidence from this
research — answers without evidence are flagged as LOW confidence.

---

## Step 2: The 20 Questions

Answer ALL 20 questions. No skipping. Each answer must include:
- **Answer**: Concrete, specific response (not "yes/no" — explain)
- **Evidence**: File path, line number, memory reference, or explicit reasoning
- **Confidence**: HIGH / MEDIUM / LOW
  - HIGH = verified in code or documentation
  - MEDIUM = inferred from patterns but not directly verified
  - LOW = uncertain or requires user input → automatically becomes an Action Item

### Category A: Scope & Boundaries (Q1-Q4)

**Q1. What exactly changes?**
List every file, module, and API that will be modified. Be specific — "the services layer"
is not acceptable. "main/services/generator/ (20 files), main/common/query.py, main/models/generator/event.py" is.

**Q2. What explicitly does NOT change?**
Define the boundaries. What adjacent systems are intentionally left alone? This prevents
scope creep and sets expectations. ("메타데이터 CRUD는 PG 유지" is a good boundary.)

**Q3. Are there scope creep risks?**
Identify areas where the change could unintentionally expand. Look for:
- Shared utilities used by both changed and unchanged code
- Config files that affect multiple systems
- Test fixtures that assume current behavior

**Q4. Is the change reversible via git revert?**
Can you `git revert` the entire changeset and return to a working state? If not, what
additional steps are needed? (Data migrations are often NOT revertable by git alone.)

### Category B: Data Safety (Q5-Q8)

**Q5. What data operations does this involve?**
Classify each data operation: READ / WRITE / DELETE / SCHEMA_CHANGE / MIGRATION.
Flag any DELETE or SCHEMA_CHANGE operations explicitly.

**Q6. What happens if the operation fails midway?**
Describe the partial state. Are intermediate results left behind? Can they be cleaned up?
Is there a transaction boundary, or are changes committed incrementally?

**Q7. Is there a rollback plan for data changes?**
Code can be reverted with git. Data cannot. What's the data rollback strategy?
Options: backup → restore, compensating transactions, manual cleanup, or "data changes
are append-only and safe."

**Q8. What's the blast radius?**
If something goes completely wrong, what's the worst-case data impact?
- How many tables affected?
- How many rows at risk?
- Is production data at risk, or only dev/staging?
- Reference past incidents if relevant (e.g., the 2026-04-02 dev DB deletion)

### Category C: Dependencies & Integration (Q9-Q12)

**Q9. What upstream systems feed into the affected area?**
Where does the data come from? APIs, scheduled jobs, user input, other services?

**Q10. What downstream systems consume from the affected area?**
Who reads the output? Dashboards, other services, export jobs, user-facing UIs?

**Q11. Are there shared state changes?**
DB schema changes, config file changes, environment variable changes, shared cache
structures — anything that multiple systems depend on simultaneously.

**Q12. What timing/ordering constraints exist?**
Does this need to be deployed in a specific order? Are there dependencies between
migrations? Does a service need to restart? Is there a maintenance window requirement?

### Category D: Testing & Verification (Q13-Q16)

**Q13. How will correctness be verified?**
What's the test strategy? Unit tests, integration tests, manual verification?
Are existing tests sufficient, or do new ones need to be written?

**Q14. What edge cases need specific attention?**
Identify at least 3 edge cases based on the codebase. Empty inputs, maximum values,
concurrent access, encoding issues, null handling — whatever is relevant.

**Q15. How will production behavior be monitored post-deploy?**
What metrics or logs will confirm the change is working correctly?
What does "success" look like in production? What does "failure" look like?

**Q16. Is there a canary/gradual rollout strategy?**
Can this be deployed incrementally? Feature flag, percentage rollout, or shadow mode?
Or is it an all-or-nothing deployment?

### Category E: Implementation Strategy (Q17-Q20)

**Q17. What's the migration path?**
Big bang (one PR, one deploy) vs incremental (multiple PRs, staged rollout)?
Justify the choice.

**Q18. What's the point of no return?**
At what step does rollback become significantly harder or impossible?
("After the CTAS tables are rebuilt with the new schema, the old indexes are gone.")

**Q19. What are the prerequisites?**
What must be true before starting? Infrastructure provisioned, permissions granted,
data backups completed, team notified?

**Q20. What's the worst-case scenario and mitigation?**
Describe the single worst thing that could happen and how to prevent or recover from it.
Be specific — "data loss" is not enough. "25 tables in clue_main_dev deleted because
pytest ran against the wrong DB" is.

---

## Step 3: Verdict

After answering all 20 questions, produce a verdict:

### Verdict Rules

| Condition | Verdict |
|-----------|---------|
| All 20 answered, ≥14 HIGH confidence, 0 critical gaps | **READY** |
| All answered, but 3+ LOW confidence or 1+ critical gap | **NEEDS_WORK** |
| Major gaps: no rollback plan, no test strategy, or unclear scope | **NOT_READY** |

**Critical gaps** (any one triggers NEEDS_WORK or NOT_READY):
- Q4 (reversibility) = LOW confidence
- Q7 (data rollback) = LOW confidence or missing
- Q8 (blast radius) = not quantified
- Q13 (test strategy) = missing or "will add later"
- Q20 (worst case) = not described

### Verdict Output

```markdown
## Verdict: [READY / NEEDS_WORK / NOT_READY]

**Confidence Distribution**: HIGH: N/20 · MEDIUM: N/20 · LOW: N/20

**Rationale**: [2-3 sentences explaining the verdict]

### Action Items (must resolve before starting)

| # | Question | Issue | Priority |
|---|----------|-------|----------|
| 1 | Q7 | No data rollback plan defined | CRITICAL |
| 2 | Q14 | Edge cases not identified | HIGH |
| 3 | Q16 | No gradual rollout strategy | MEDIUM |
```

---

## Step 4: Save Review

Save the complete review to `.dev/reviews/`:

```bash
mkdir -p .dev/reviews
```

Filename format: `{plan-name}-review-{YYYY-MM-DD}.md`

The saved file must contain:
1. Header with plan name, date, verdict
2. All 20 Q&A with evidence and confidence
3. Verdict section with action items
4. Metadata: files researched, memory references used

---

## Output Format

The review should be structured but readable. Use this template:

```markdown
# Engineering Plan Review: {Plan Name}

**Date**: {YYYY-MM-DD}
**Reviewer**: Claude (plan-eng-review)
**Verdict**: {READY / NEEDS_WORK / NOT_READY}

---

## A. Scope & Boundaries

### Q1. What exactly changes?
**Confidence**: HIGH
[Answer with file paths and line references]

### Q2. What explicitly does NOT change?
**Confidence**: HIGH
[Answer]

... (all 20 questions)

---

## Verdict

[Verdict section as defined in Step 3]

---

## Metadata

- **Plan source**: [file path or "conversation context"]
- **Files researched**: [list]
- **Memory references**: [list]
- **Codebase queries**: [list of searches performed]
```

---

## Checklist Before Stopping

- [ ] All 20 questions answered (no skips)
- [ ] Evidence cited for ≥14 answers (file:line or memory reference)
- [ ] Confidence level assigned to every answer
- [ ] Critical gaps identified (Q4, Q7, Q8, Q13, Q20)
- [ ] Verdict calculated correctly from verdict rules
- [ ] Action items listed for all LOW-confidence answers
- [ ] Review saved to `.dev/reviews/{name}-review-{date}.md`
- [ ] User informed of verdict and next steps
