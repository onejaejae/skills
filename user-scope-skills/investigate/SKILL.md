---
name: investigate
description: |
  Use when debugging complex, intermittent, or hard-to-reproduce bugs that
  resist simple fixes. Systematic hypothesis-driven investigation with
  scope lock and 3-strike escalation.
  Triggers: "/investigate", "investigate this", "deep debug", "조사해줘",
  "원인 분석", "간헐적 버그", "재현 안 돼", "intermittent bug",
  "race condition", "flaky", "hard to reproduce", "근본 원인"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Agent
  - Write
  - AskUserQuestion
validate_prompt: |
  Must produce a DEBUG REPORT containing:
  1. Immutable Symptom Record (established in Phase 0, never modified)
  2. Pattern match attempt (against 6 known patterns)
  3. Scope Lock declaration (which modules/files are in scope)
  4. At least 1 hypothesis tested with evidence (CONFIRMED/REFUTED)
  5. Final verdict: ROOT_CAUSE_FOUND / ESCALATED / INCONCLUSIVE
  If 3 hypotheses fail: must show ESCALATED verdict (3-strike rule)
  Must save report to .dev/debug/{slug}-investigation.md
  Must NOT: apply code fixes, edit files outside scope lock, skip hypothesis testing
---

# /investigate

Systematic hypothesis-driven root cause investigation for complex bugs.

## Iron Law

```
NO FIXES DURING INVESTIGATION.
Investigation produces UNDERSTANDING, not code changes.
The only files you may write are: temp diagnostic logs (removed after), and the final report.
```

**Violating the letter of this rule IS violating the spirit.**

## When to Use (Differentiator)

| Skill | Purpose | Pick when |
|-------|---------|-----------|
| **/investigate** | Hypothesis-driven understanding | Bug is intermittent, unclear root cause, resists simple debugging |
| /bugfix | Diagnosis + automated fix | Bug is reproducible, error message is clear, need a fix applied |
| /scope | Blast radius analysis | Need to understand what a change would affect |

## Workflow

```
Phase 0: Symptom Intake (IMMUTABLE after this phase)
    ↓
Phase 1: Pattern Matching (6 known patterns)
    ↓
Phase 2: Scope Lock Declaration
    ↓
Phase 3: Hypothesis Loop (max 3 strikes)
    ↓  ← CONFIRMED → Phase 4 (ROOT_CAUSE_FOUND)
    ↓  ← 3 REFUTED → Phase 4 (ESCALATED)
    ↓
Phase 4: Verdict + Report
    ↓
Phase 5: Handoff
```

## Phase 0: Symptom Intake

Collect and record symptoms. This record is **IMMUTABLE** — never modified after this phase.

**Required fields:**
- Error message (verbatim)
- Frequency (how often, when)
- Reproduction conditions (known triggers, environment)
- What has already been tried

**Output:** Symptom Record block at top of investigation.

```
## Symptom Record (IMMUTABLE)
- Error: [verbatim error]
- Frequency: [X times per day/hour]
- Reproduction: [conditions]
- Already tried: [list]
- Reported by: [source]
```

## Phase 1: Pattern Matching

Compare symptoms against 6 known bug patterns. Read `references/known-patterns.md`.

For each pattern, score match confidence (0-10):

```
| Pattern | Confidence | Evidence |
|---------|-----------|----------|
| Race Condition | 8/10 | "동시 요청에서만 발생" matches |
| Nil Propagation | 3/10 | NoneType 에러이지만 간헐적 |
| ... | | |
```

Select top 1-2 patterns as investigation starting points.

**If no pattern matches above 3/10:** Proceed to Phase 3 with open hypotheses (no pattern bias).

## Phase 2: Scope Lock

Based on symptom + pattern match, declare which modules are in scope for investigation.

```
## Scope Lock
- IN SCOPE: src/handlers/pull_request_handler.py, src/main.py
- OUT OF SCOPE: everything else
- REASON: Error trace points to request handling path
```

**Scope Lock Rules:**
1. Scope is declared ONCE and is IMMUTABLE
2. All code reading during investigation stays within scope
3. If evidence points outside scope → DO NOT silently expand. Go to Phase 4 with INCONCLUSIVE and recommend scope expansion
4. Temp diagnostic logs (Phase 3) are ONLY allowed within scoped files

## Phase 3: Hypothesis Loop

**Maximum 3 hypotheses. No exceptions.**

For each hypothesis:

### Step 3.1: Form Hypothesis

**Quality gate — hypothesis MUST be:**
- **Falsifiable:** clearly state what would CONFIRM and what would REFUTE
- **Specific:** not "maybe timing issue" but "concurrent requests to run_service_with_session share the same db session object, causing interleaved reads"
- **Scoped:** within the declared scope lock

```
### Hypothesis [N]: [specific statement]
- CONFIRM if: [observable evidence]
- REFUTE if: [observable evidence]
```

**Reject vague hypotheses:**
- "아마 타이밍 문제일 듯" → TOO VAGUE. What specific timing? Between what?
- "네트워크 문제인 것 같아" → TOO VAGUE. Which call? What failure mode?

### Step 3.2: Design Experiment

How to test this hypothesis:
- Add temporary diagnostic logging (within scope only)
- Create reproduction script
- Trace data flow with specific inputs

### Step 3.3: Execute Experiment

Run the experiment. Capture evidence.

### Step 3.4: Evaluate

- **CONFIRMED:** Evidence matches CONFIRM criteria → proceed to Phase 4 (ROOT_CAUSE_FOUND)
- **REFUTED:** Evidence matches REFUTE criteria → record and move to next hypothesis
- **INCONCLUSIVE:** Neither matches → counts as REFUTED (conservative)

### 3-Strike Rule

```
Strike 1 (REFUTED) → Form Hypothesis 2
Strike 2 (REFUTED) → Form Hypothesis 3
Strike 3 (REFUTED) → STOP. Phase 4 with ESCALATED. No more hypotheses.
```

**No exceptions:**
- Not "but I have a really good 4th idea"
- Not "let me try one more thing"
- Not "I'm almost there"
- 3 strikes = forced escalation to the user

## Phase 4: Verdict + Report

Save report to `.dev/debug/{slug}-investigation.md`:

```markdown
# Investigation Report: {slug}

## Verdict: [ROOT_CAUSE_FOUND / ESCALATED / INCONCLUSIVE]

## Symptom Record
[from Phase 0, unchanged]

## Pattern Analysis
[from Phase 1]

## Scope Lock
[from Phase 2]

## Hypothesis Log
### Hypothesis 1: [statement]
- Evidence: [what was found]
- Result: CONFIRMED / REFUTED

### Hypothesis 2: [statement]
...

## Root Cause (if found)
[detailed explanation with evidence chain]

## Recommended Next Steps
- [ ] [action item]
```

## Phase 5: Handoff

Based on verdict:

- **ROOT_CAUSE_FOUND:** Suggest `/bugfix` with the diagnosis context. Provide the exact root cause statement for the bugfix to use.
- **ESCALATED (3 strikes):** Present findings to user. Suggest: manual investigation, `/discuss` for brainstorming, or adding monitoring/logging to capture more data.
- **INCONCLUSIVE:** Recommend specific monitoring or logging to gather more evidence.

**Handoff rules:**
- "Recommended Next Steps" MUST be action items for the USER or for `/bugfix`, never direct code change instructions
- Do NOT write "Fix the test to use..." or "Consider adding .strip()..." — these are FIX instructions disguised as recommendations
- CORRECT: "- [ ] Run `/bugfix` with diagnosis: [root cause statement]"
- CORRECT: "- [ ] User to decide: whitespace handling policy for analysis param"
- WRONG: "- Fix the test assertion to be stricter"
- WRONG: "- Add .strip() check to the guard"

## Red Flags — STOP and Re-read Iron Law

- About to edit a source file (not a temp log) → STOP
- About to propose a "quick fix while investigating" → STOP
- About to write specific code change instructions in "Recommended Next Steps" → STOP (this is a fix, not a recommendation)
- Expanding scope without declaring INCONCLUSIVE → STOP
- Forming hypothesis #4 after 3 strikes → STOP
- Hypothesis without CONFIRM/REFUTE criteria → REWRITE IT

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "근본 원인이 명확하니 바로 고치겠습니다" | Investigation produces understanding. Fix goes through /bugfix. |
| "관련 파일도 같이 수정하면 재발 방지됩니다" | Scope lock exists for a reason. Out of scope = out of scope. |
| "한 번만 더 시도해보겠습니다" (4th hypothesis) | 3 strikes = escalation. No exceptions. |
| "이건 간단한 수정이라 조사가 과합니다" | Then use /bugfix, not /investigate. |
| "증거가 scope 밖을 가리키네요, 범위를 넓히겠습니다" | INCONCLUSIVE → report → user decides scope expansion. |
| "아마 ~일 것 같습니다" (vague hypothesis) | Hypothesis must be falsifiable and specific. Rewrite. |
| "테스트를 이렇게 고치면 됩니다" (fix in recommendations) | Recommendations are for the USER, not code instructions. Hand off to /bugfix. |
| "간단한 건데 굳이 /bugfix를 거칠 필요 없잖아요" | Iron Law has no size exception. All fixes go through /bugfix. |
