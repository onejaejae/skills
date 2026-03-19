---
name: check
context: fork
description: |
  This skill should be used when the user wants to verify their changes
  before pushing, or update the project's rule checklists.
  Phase 1: validate changed files against .dev/rules/ checklists and report
  PASS/WARN. Phase 2 (conditional): propose rule additions when unmatched
  patterns are detected. Essential before git push.
  Trigger phrases: "check", "checklist", "verify changes", "what did I miss",
  "pre-push check", "cascading changes", "any more changes needed",
  "update checklist", "update rules", "rules update",
  "체크", "체크리스트", "변경 확인", "빠뜨린 거 없나", "push 전 확인",
  "뭐 더 건드려야 해?", "연쇄 변경 확인", "규칙 갱신".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Agent
  - Edit
  - Write
  - AskUserQuestion
validate_prompt: |
  Must contain:
  1. Phase 1 Verification Results section with PASS/WARN/Not Applicable groupings
  2. Rule citations for each WARN (which rule file and checklist item triggered it)
  3. Phase 2 Rule Update Proposals section OR explicit skip reason
  4. Follow-Up Actions section with user choice (Fix All / Select / Ignore)
  5. If no changes detected, a graceful "nothing to check" message instead of phases
  6. If .dev/rules/ missing, a guided setup message instead of phases
---

# Check — Change Verification + Rule Evolution

> Analyze git diff against `.dev/rules/` to catch missed cascading changes, then propose rule updates when new unmatched patterns are detected.

## When to Use /check vs Other Review Skills

| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| **/check** | Verify changes against project-specific rule checklists | git diff + `.dev/rules/` | PASS/WARN per rule + rule evolution proposals |
| **/tribunal** | Adversarial 3-perspective review (Risk/Value/Feasibility) | Any artifact | Verdict (APPROVE/REVISE/REJECT) with scores |
| **/council** | Multi-perspective deliberation with tradeoff mapping | Decision or design | Tradeoff map + contention points |
| **/rulph** | Rubric-based scoring with autonomous improvement loop | Any artifact + rubric | Iterative score improvement until threshold |

**Use /check** when you want a pre-push safety net based on codified project rules. Use /tribunal or /council for subjective design decisions. Use /rulph for iterative quality improvement against a rubric.

---

## Step 0: Prerequisites and Early Exits

### 0a. Check for `.dev/rules/` directory

```
if .dev/rules/ does not exist:
  Output: "No .dev/rules/ directory found. /check requires project-specific
  rule files to validate against."
  Guide: "Run `mkdir -p .dev/rules` and create your first rule file.
  See ${baseDir}/references/rules-authoring.md for the authoring guide."
  STOP — do not proceed to Phase 1.
```

### 0b. Check for empty `.dev/rules/`

```
if .dev/rules/ exists but contains no .md files with YAML frontmatter:
  Output: "Found .dev/rules/ but it contains no rule files.
  Create your first rule following ${baseDir}/references/rules-authoring.md."
  STOP — do not proceed to Phase 1.
```

### 0c. Check for changed files

Run the git diff commands (see Step 1). If `CHANGED_FILES` is empty after deduplication:

```
Output: "Nothing to check — working tree is clean and no recent commits
differ from HEAD~1. Make some changes and run /check again."
STOP — do not proceed to Phase 1.
```

---

**Two-phase structure:**
- **Phase 1** (always): Validate changes — produce PASS/WARN results
- **Phase 2** (conditional): Propose rule updates — only when unmatched patterns exist

---

## Phase 1: Change Validation

### 1. Collect Changed Files

```bash
# Gather committed + uncommitted changes
git diff --name-only HEAD~1..HEAD
git diff --name-only --cached
git diff --name-only
```

Deduplicate and store as `CHANGED_FILES`.

### 2. Build Rule Graph and Match

Read YAML frontmatter from all `.dev/rules/*.md` files to construct the rule graph. Refer to `references/rules-authoring.md` ("Structure" section) for the frontmatter schema.

**Matching order:**
1. Glob-match each file in `CHANGED_FILES` against every rule's `triggers` patterns
2. Follow `depends_on` edges from matched rules to pull in related rules (1-depth only)
3. Finalize the active rule set
4. **Store unmatched files separately as `UNMATCHED_FILES`** (used in Phase 2)

**Note:** Meta documents (e.g., RULES.md) are excluded from matching.

### 3. Parallel Subagent Verification

Spawn one subagent per active rule using the **Agent tool (`subagent_type="general-purpose"`)** and run them in parallel.

Pass each subagent:
- The `CHANGED_FILES` list
- The rule file's body (checklist content)
- The actual diff of changed files (`git diff`)

Each subagent:
1. Applies checklist items against CHANGED_FILES
2. Identifies cases where a file was changed but related files were not
3. Reads the actual diff for WARN items to determine if the omission is genuine
4. Returns results classified as PASS / WARN / Not Applicable

### 4. Aggregate and Output Results

Collect all subagent results and output them **grouped by category**: domain rules first, then concern rules, then pipeline rules.

```
## Phase 1: Verification Results

### PASS (N items)
#### domain
- [billing] schema.ts changed -> migration file created
#### concern
- [infra] .env changed -> terraform synced
#### pipeline
- [api-codegen] swagger changed -> types regenerated

### WARN (N items)
#### concern
- [ux] en.json changed -> ko.json not updated

### Not Applicable (N items)
- [docs] no docs/ changes
```

### 5. Execute agents/commands

If active rules have `agents` or `commands` fields:

- **agents**: Run automatically via the Agent tool for additional verification. Merge any WARNs from agent results into the Phase 1 WARN list.
- **commands**: Present the commands to the user for manual execution (e.g., `pnpm generate:api`).

### 6. Process WARNs

For each WARN item:
1. Read the changed code to determine whether a change is actually needed
2. Distinguish between intentional omissions and accidental misses
3. For genuine misses, specify exactly which file and section needs modification

---

## Phase 2: Rule Update Proposals (Conditional)

> **Phase 2 trigger conditions** — Execute Phase 2 if ANY of the following is true:
> 1. `UNMATCHED_FILES` contains at least one meaningful source file (`.ts`, `.tsx`, `.json`, `.yaml`, `.tf`, etc.) — exclude meta files (`.md`, lock files, etc.)
> 2. Any WARN from Phase 1 indicates a **rule gap** (not a rule violation)
>
> **Skip condition**: If `UNMATCHED_FILES` is empty AND no WARNs indicate rule gaps, skip Phase 2 and proceed directly to follow-up actions (step 9).
>
> **Distinguishing rule gaps from rule violations**: If a WARN was caused by violating an existing checklist item, it is a rule violation (handled in Phase 1). If no checklist item exists anywhere that could have caught the WARN in advance, it is a rule gap — this triggers Phase 2.

### 7. Analyze Patterns and Cross-Reference Rules

Analyze `UNMATCHED_FILES` and Phase 1 WARN results to identify:

- **Uncovered change patterns** — file changes not matched by any rule's `triggers`
- **Near-miss cascading changes** — duplicate logic across multiple locations where only some were updated
- **Newly discovered sync points** — relationships where changing one location requires updating another

Read `references/rules-authoring.md` for authoring guidelines, then classify findings:
- **Existing rule needs new items** — propose the rule file and specific items to add
- **New rule file needed** — entirely new pattern not covered by any existing rule; include the `category` field (domain | concern | pipeline)

### 8. Output Rule Update Proposals

```
## Phase 2: Rule Update Proposals

1. [subscriptions.md] Add sync check for URL detection functions across 3 apps
   - Reason: isSubstackUrl() duplicated in 3 locations, only 2 updated
2. [New file: webhook.md] Add sync check for webhook event changes
   - category: domain
   - Reason: new domain with no existing rule coverage
```

**Confirm each proposal with AskUserQuestion:**
- **"Add"** — Apply the item to the rule file
- **"Edit & Add"** — Adjust the content before adding
- **"Skip"** — Unnecessary, skip this item

Apply approved items to the corresponding rule files. For new rule files, create them with frontmatter (`category` and `triggers` are required).

After adding or modifying rules, verify that the frontmatter `triggers` patterns correctly match the intended files.

---

### 9. Follow-Up Actions

Consolidate WARNs from Phase 1 and rule updates from Phase 2 into a follow-up change list.

If one or more WARN items exist, present the list and use **AskUserQuestion** to ask the user:

- **"Fix All"** — Automatically fix all WARN items
- **"Select"** — Choose specific items to fix (multiSelect)
- **"Ignore & Proceed"** — Treat as intentional omissions, finish without changes

When "Fix All" or "Select" is chosen, apply the fixes in order and display the updated results.

---

## Additional Resources

### Reference Files

- **`${baseDir}/references/rules-authoring.md`** — Rule authoring principles, frontmatter schema, category classification, and abstraction-level guidelines. Consult when creating or updating rules.
