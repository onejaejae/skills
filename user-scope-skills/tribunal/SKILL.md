---
name: tribunal
description: |
  This skill should be used when the user says "/tribunal", "tribunal", "review this",
  "3-way review", "risk-value-feasibility check", or wants multi-perspective adversarial review.
  Also triggered by: "트리뷰널", "리뷰 해줘", "3관점 리뷰", "위험성 검토".
  Runs 3 agents (Risk/Value/Feasibility) in parallel and synthesizes a verdict.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
  - Bash
  - AskUserQuestion
validate_prompt: |
  Must contain:
  1. Three parallel agent launches (codex-risk-analyst, value-assessor, feasibility-checker)
  2. A Tribunal Verdict section with scores table and final verdict
  3. Required Actions if verdict is REVISE or REJECT
  4. Agent failure handling (degraded mode if any agent fails)
  5. Contention points section (even if "None — all agents aligned")
---

# /tribunal — 3-Perspective Adversarial Review

You are a tribunal orchestrator. You launch 3 review agents with distinct perspectives,
then synthesize their findings into a unified verdict.

## When to Use /tribunal vs Other Skills

| Skill | Purpose | Key Difference |
|-------|---------|----------------|
| **/tribunal** | Structured 3-axis review (Risk/Value/Feasibility) | Fixed panel, verdict matrix, fast (~1 min) |
| **/council** | Deep multi-perspective deliberation with debate | Dynamic panel, iterative debate, slower (~3-5 min) |
| **/check** | Pre-push change validation against rule checklists | Rule-driven, file-level, no subjective judgment |
| **/rulph** | Rubric-based scoring with autonomous improvement loop | Scores + auto-improves, iterative until threshold met |

Use `/tribunal` for quick go/no-go decisions. Use `/council` when the decision is complex enough to need real debate.

## Cost & Performance

- **3 parallel Task calls** (1 Codex + 2 Claude). Typical wall-clock: 30-60s.
- Input is duplicated across all 3 agents, so token cost scales with input size x3.
- For very large inputs (>5000 lines), consider narrowing scope before invoking.

## Architecture

```
            ┌─ codex-risk-analyst (Codex)  ── "What can go wrong?"
Input ──────┼─ value-assessor (Claude)     ── "What value does this deliver?"
            └─ feasibility-checker (Claude) ── "Can this actually be built?"
                         ↓
               You synthesize all 3
               → APPROVE / REVISE / REJECT
```

---

## Step 1: Parse Input

Determine the review target from arguments:

| Input | How to get content |
|-------|-------------------|
| `file.md` or path | `Read(file_path)` |
| `--pr <number>` | `Bash("gh pr diff <number>")` and `Bash("gh pr view <number>")` |
| `--diff` | `Bash("git diff HEAD")` or `Bash("git diff main...HEAD")` |
| No args | Ask user what to review via `AskUserQuestion` |
| Ambiguous (e.g. "this", pronoun, vague ref) | Auto-gather context: check `git diff`, recent files, conversation history. If still unclear, ask via `AskUserQuestion` |

**Collect the full content** — all 3 agents need the same input.

**Ambiguous Input Recovery**: If the argument is not a valid path, flag, or recognizable target, try these in order:
1. Check if the conversation has a recent artifact (plan, spec, diff) — use that
2. Run `git diff HEAD` — if non-empty, offer to review that
3. Fall back to `AskUserQuestion` with specific options (recent files, PR, diff)

If reviewing a PLAN.md, also read the corresponding DRAFT.md (if exists) for context.

---

## Step 2: Launch Tribunal (3 Agents in Parallel)

Launch all 3 agents **simultaneously in a single message**:

```
# Risk Analysis (Codex-powered — adversarial)
Task(subagent_type="codex-risk-analyst",
     prompt="""
Review Target: [type - plan/PR/diff/proposal]

## Content
[Full content to review]

## Context (if available)
[Project structure, related patterns, constraints]

Perform adversarial risk analysis. Find everything that could go wrong.
""")

# Value Assessment (Claude — constructive)
Task(subagent_type="value-assessor",
     prompt="""
Review Target: [type - plan/PR/diff/proposal]

## Content
[Full content to review]

## Original Goal
[What was the intent/requirement behind this work]

Assess the value this delivers. Be genuinely constructive but honest.
""")

# Feasibility Check (Claude — pragmatic)
Task(subagent_type="feasibility-checker",
     prompt="""
Review Target: [type - plan/PR/diff/proposal]

## Content
[Full content to review]

## Codebase Context
[Relevant patterns, dependencies, test infrastructure]

Evaluate practical feasibility. Can this actually be built/merged?
""")
```

**CRITICAL**: All 3 in ONE message (parallel). Do NOT run sequentially.

### Agent Failure Handling

If any agent returns empty, errors, or times out:

| Scenario | Action |
|----------|--------|
| 1 agent fails | Mark that dimension as **UNAVAILABLE** in the scores table. Synthesize verdict from remaining 2 agents with a note: "Verdict is degraded — [dimension] was not evaluated." |
| 2 agents fail | Report available results only. Do NOT issue a verdict. State: "Insufficient panel coverage for a verdict. [Available] analysis is shown below." |
| All 3 fail | Report the failure. Suggest the user retry or use a simpler review method. |

If an agent returns a report but does NOT include a clear rating (BLOCK/CAUTION/CLEAR etc.), infer the rating from the report content. If the report is too ambiguous to infer, mark as **UNCLEAR** and note it in Contention Points.

When a dimension is UNAVAILABLE, treat it as worst-case for verdict purposes. For example, if Risk is UNAVAILABLE, assume HIGH risk when determining the final verdict. This prevents APPROVE verdicts when critical perspectives are missing.

---

## Step 3: Synthesize Verdict

After all 3 agents return, synthesize their findings.

### 3.1 Extract Ratings

From each report, extract the summary rating:
- **Risk**: BLOCK / CAUTION / CLEAR (from risk analyst)
- **Value**: STRONG / ADEQUATE / WEAK (from value assessor)
- **Feasibility**: GO / CONDITIONAL / NO-GO (from feasibility checker)

### 3.2 Verdict Matrix

| Risk | Value | Feasibility | Verdict |
|------|-------|-------------|---------|
| CLEAR | STRONG | GO | **APPROVE** |
| CLEAR | ADEQUATE | GO | **APPROVE** |
| CAUTION | STRONG | GO | **APPROVE** (with notes) |
| CAUTION | ADEQUATE | GO | **REVISE** |
| CAUTION | * | CONDITIONAL | **REVISE** |
| BLOCK | * | * | **REVISE** (or REJECT if critical count > 2) |
| * | WEAK | * | **REVISE** |
| * | * | NO-GO | **REJECT** |
| BLOCK | WEAK | * | **REJECT** |

Use judgment for combinations not in the matrix.

### 3.3 Identify Contention Points

Find areas where agents **disagree**:
- Risk says dangerous, but Value says high-impact → worth the risk?
- Feasibility says hard, but Value says critical → invest the effort?
- Risk says fine, but Feasibility says blocked → hidden dependency?

### 3.4 Compile Required Actions

From all 3 reports, extract actionable items:
- **Must fix** (from BLOCK risks or NO-GO feasibility)
- **Should address** (from CAUTION risks or CONDITIONAL feasibility)
- **Nice to have** (from missed opportunities in value assessment)

---

## Step 4: Present Tribunal Report

```markdown
## Tribunal Verdict

### Panel Scores

| Dimension | Agent | Rating | Key Finding |
|-----------|-------|--------|-------------|
| Risk | codex-risk-analyst | [BLOCK/CAUTION/CLEAR] | [1-line summary] |
| Value | value-assessor | [STRONG/ADEQUATE/WEAK] | [1-line summary] |
| Feasibility | feasibility-checker | [GO/CONDITIONAL/NO-GO] | [1-line summary] |

### Verdict: [APPROVE / REVISE / REJECT]

[1-2 sentence rationale]

### Contention Points
[Where agents disagreed and the resolution reasoning]

### Required Actions
**Must Fix (before proceeding):**
1. [action from risk/feasibility]

**Should Address:**
1. [action]

**Consider:**
1. [action from value missed opportunities]

### Strengths to Preserve
[Key positives identified by value-assessor that should NOT be lost in revisions]

---

<details>
<summary>Full Risk Analysis</summary>

[Complete risk analyst report]

</details>

<details>
<summary>Full Value Assessment</summary>

[Complete value assessor report]

</details>

<details>
<summary>Full Feasibility Report</summary>

[Complete feasibility checker report]

</details>
```

---

## Step 5: Handle Verdict

After presenting the report:

| Verdict | Action |
|---------|--------|
| **APPROVE** | Inform user: "Tribunal approves. Proceed with confidence." |
| **REVISE** | Present required actions. Ask user how to proceed. |
| **REJECT** | Present blockers clearly. Recommend returning to planning. |

For REVISE:
```
AskUserQuestion(
  question: "Tribunal recommends revisions. How do you want to proceed?",
  options: [
    { label: "Apply fixes", description: "Address the required actions and re-review" },
    { label: "Override — proceed anyway", description: "Acknowledge risks and continue (Disagree & Commit)" },
    { label: "Back to planning", description: "Return to /specify to rethink approach" }
  ]
)
```

---

## Usage Examples

```bash
# Review a plan
/tribunal .dev/specs/auth-feature/PLAN.md

# Review a PR
/tribunal --pr 421

# Review current uncommitted changes
/tribunal --diff

# Review with no args (will ask what to review)
/tribunal
```

---

## Checklist Before Stopping

- [ ] All 3 agents launched in parallel (single message)
- [ ] Agent failures handled gracefully (degraded mode if any failed)
- [ ] Verdict synthesized with scores table
- [ ] Contention points identified (where agents disagreed, or "None — all agents aligned")
- [ ] Required actions listed (if REVISE or REJECT)
- [ ] Full reports included in collapsible details
- [ ] User action presented based on verdict
