---
name: tech-decision
description: |
  This skill should be used when the user asks about "technical decision", "what to use",
  "A vs B", "comparison analysis", "library selection", "architecture decision",
  "which one to use", "tradeoffs", "tech selection", "implementation approach",
  or needs systematic multi-source research and a scored recommendation for technical decisions.
version: 2.0.0
validate_prompt: |
  Must contain all of these:
  - Conclusion / Executive Summary section with a clear recommendation and confidence level
  - Evaluation Criteria table with weights summing to 100%
  - Scored Comparison table using numeric 1-5 scale (not star emojis) with weighted averages
  - At least 2 options analyzed with Pros and Cons (each citing a source)
  - Recommendation Rationale section with numbered reasons
  - Risks and Considerations section
  Output must start with "# Technical Decision Report:" header.
  Scoring formula must be visible: weighted_avg = sum(score_i * weight_i).
---

# Tech Decision - Systematic Technical Decision Analysis (v2.0.0)

Skill for systematically analyzing technical decisions using multi-source research, numeric scoring, and conclusion-first reporting.

## Core Principle

**Conclusion First**: All reports present the recommendation upfront, then provide evidence and scoring.

## Use Cases

- Library/framework selection (React vs Vue, Prisma vs TypeORM)
- Architecture pattern decisions (Monolith vs Microservices, REST vs GraphQL)
- Implementation approach selection (Server-side vs Client-side, Polling vs WebSocket)
- Tech stack decisions (language, database, infrastructure, etc.)

---

## Phase 0: Context Intake + Complexity Classification

Before any research, gather context and classify the decision complexity.

### 0-A. Context Intake

Extract or ask the user for:
- **Decision topic**: What needs to be decided?
- **Options**: What are the choices? (minimum 2)
- **Project context**: Project type, team size, existing stack, constraints
- **Priority signal**: Speed, stability, cost, scalability?

If the user provides no project context, use these defaults:
- Team size: small (1-5)
- Project stage: greenfield
- Priority: balanced

### 0-B. Complexity Classification

| Tier | Signal | Agents Dispatched | Budget Cap | Example |
|------|--------|-------------------|------------|---------|
| **Quick** | 2 options, well-known tech, user wants fast answer | 1-2 | 3-5 tool calls | "React vs Vue for a new SPA" |
| **Standard** | 2-4 options, needs codebase + docs research | 3-4 | 8-15 tool calls | "Which ORM for our NestJS project?" |
| **Deep** | 4+ options, architecture-level, high stakes | 5-6 | 15-25 tool calls | "Microservices vs modular monolith for our platform rewrite" |

Classify and announce:
```
Complexity: [Quick|Standard|Deep] -- [one-line reason]
```

---

## Phase 1: Problem Definition + Criteria Selection

1. **Confirm Options**: List all options to compare (2-6).
2. **Select Evaluation Criteria**: Choose 4-6 criteria relevant to the decision type.
   - See **`references/evaluation-criteria.md`** for criteria by category.
3. **Assign Weights**: Weights must sum to 100%. Base weights on project context.
4. **Confirm with user** (Standard/Deep tiers only): Show criteria + weights, ask for approval.

---

## Phase 2: Information Gathering (Tier-Appropriate)

### Quick Tier (Sequential)

Run sequentially -- fast and lightweight:

```
Step 1: Task(subagent_type="code-explorer",
             prompt="Analyze the codebase for existing usage of [Option A] and [Option B].
                     Report: current patterns, dependencies, integration points, constraints.")

Step 2: WebSearch("[Option A] vs [Option B] comparison [year]")
        -- Read top 2-3 results with WebFetch if needed.

Step 3: Task(subagent_type="tradeoff-analyzer",
             prompt="Given these findings: [paste Step 1 + Step 2 results].
                     Options: [list]. Criteria: [list with weights].
                     Score each option 1-5 per criterion. Compute weighted averages.
                     Identify top recommendation with confidence level.")
```

### Standard Tier (Parallel)

Run in parallel -- broader coverage:

```
┌──────────────────────────────────────────────────────────────┐
│  Dispatch in ONE message (parallel with Task/Skill tools)    │
├──────────────────────────────────────────────────────────────┤
│  1. Task(subagent_type="code-explorer",                      │
│         prompt="Analyze codebase for usage of [options].     │
│                 Report patterns, deps, integration points.") │
│                                                              │
│  2. Task(subagent_type="docs-researcher",                    │
│         prompt="Research official docs for [options].        │
│                 Compare: API design, performance claims,     │
│                 migration guides, known limitations.")        │
│                                                              │
│  3. Skill(skill="dev-scan",                                  │
│           args="[Option A] vs [Option B] community opinions")│
│     -> Community opinions from Reddit, HN, Dev.to           │
│                                                              │
│  4. [Optional] context7 MCP                                  │
│     mcp__plugin_compound-engineering_context7__resolve-library-id │
│     then mcp__plugin_compound-engineering_context7__query-docs│
│     -> Query latest docs per library                         │
└──────────────────────────────────────────────────────────────┘
```

### Deep Tier (Parallel + Council)

Same as Standard, plus:

```
┌──────────────────────────────────────────────────────────────┐
│  Additional dispatches (parallel with above)                 │
├──────────────────────────────────────────────────────────────┤
│  5. Skill(skill="council",                                   │
│           args="Which is better for [context]: [options]?    │
│                 Consider: [criteria list]")                   │
│     -> Multi-perspective AI expert debate                    │
│                                                              │
│  6. WebSearch("[topic] benchmark [year]")                     │
│     WebSearch("[topic] production experience [year]")         │
│     -> Additional data points for high-stakes decisions      │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 3: Synthesis + Scoring

After all dispatches return, synthesize.

### 3-A. Collect Results

Gather outputs from all agents/skills dispatched in Phase 2.

### 3-B. Tradeoff Analysis

For Standard and Deep tiers, run the tradeoff-analyzer with all gathered data:

```
Task(subagent_type="tradeoff-analyzer",
     prompt="Synthesize these research findings into a scored comparison.

     FINDINGS:
     [paste all gathered results]

     OPTIONS: [list]
     CRITERIA + WEIGHTS: [list]

     For each option, score 1-5 per criterion using this rubric:
       1 = Poor (significant drawbacks, not recommended)
       2 = Below Average (notable weaknesses)
       3 = Adequate (meets basic needs, no standout)
       4 = Good (clear strengths, minor gaps)
       5 = Excellent (best-in-class for this criterion)

     Compute weighted average: weighted_avg = sum(score_i * weight_i / 100)
     Identify the top recommendation.
     Flag any conflicting evidence across sources.
     Assess confidence: HIGH (3+ agreeing sources), MEDIUM (2 sources or mixed), LOW (1 source or conflicting).")
```

For Quick tier, the tradeoff-analyzer call in Phase 2 Step 3 already covers this.

### 3-C. Source Reliability

Rank every claim by source reliability:
- **HIGH**: Official docs, independent benchmarks, peer-reviewed content
- **MEDIUM**: Established tech media, conference talks, GitHub issues
- **LOW**: Personal blogs, forum opinions, marketing materials

---

## Phase 4: Final Report (Inline + Conclusion-First)

Generate the report inline in the conversation. Use the detailed template from **`references/report-template.md`** as structure, with these mandatory elements:

```markdown
# Technical Decision Report: [Topic]

**Date**: YYYY-MM-DD
**Complexity**: [Quick|Standard|Deep]
**Decision Type**: [Library Selection | Architecture Decision | Implementation Approach | Technology Stack]

---

## 1. Conclusion (Executive Summary)

**Recommendation: [Option X]**
[1-2 sentence key reason]

**Confidence**: [HIGH|MEDIUM|LOW] -- [basis: N sources agreed, codebase fit confirmed, etc.]

---

## 2. Decision Context

- **Options**: [list]
- **Project Context**: [team size, stack, constraints]

---

## 3. Evaluation Criteria

| Criteria | Weight | Description |
|----------|--------|-------------|
| [Criteria 1] | X% | [Why it matters] |
| [Criteria 2] | X% | [Why it matters] |
| ... | ... | ... |
| **Total** | **100%** | |

---

## 4. Option Analysis

### Option A: [Name]
**Pros:**
- [Pro 1] (Source: [official docs / Reddit / benchmark])
- [Pro 2] (Source: [...])

**Cons:**
- [Con 1] (Source: [...])

**Best fit for:** [scenario]

### Option B: [Name]
[Same structure]

---

## 5. Scored Comparison

| Criteria (Weight) | Option A | Option B | Option C |
|-------------------|----------|----------|----------|
| [Criteria 1] (X%) | 4 | 3 | 5 |
| [Criteria 2] (X%) | 3 | 5 | 2 |
| [Criteria 3] (X%) | 4 | 4 | 3 |
| **Weighted Average** | **X.XX** | **X.XX** | **X.XX** |

Formula: weighted_avg = sum(score_i * weight_i / 100)

Scoring rubric:
  1 = Poor | 2 = Below Average | 3 = Adequate | 4 = Good | 5 = Excellent

---

## 6. Recommendation Rationale

1. **[Reason 1]** -- [evidence with source]
2. **[Reason 2]** -- [evidence with source]
3. **[Reason 3]** -- [evidence with source]

---

## 7. Risks and Considerations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [Strategy] |

---

## 8. Alternative Scenarios

- If [condition changes] -> consider [Option Y] instead.

---

## 9. Sources

- [Source 1](URL) -- [contribution]
- [Source 2](URL) -- [contribution]
```

---

## Resources Used

### Agents (dispatched via Task tool)

| Agent | Role | Invocation |
|-------|------|------------|
| `code-explorer` | Analyze existing codebase patterns and constraints | `Task(subagent_type="code-explorer", prompt="...")` |
| `docs-researcher` | Research official docs, guides, best practices | `Task(subagent_type="docs-researcher", prompt="...")` |
| `tradeoff-analyzer` | Score options, compute weighted comparison, synthesize | `Task(subagent_type="tradeoff-analyzer", prompt="...")` |

### Skills (dispatched via Skill tool)

| Skill | Purpose | Invocation |
|-------|---------|------------|
| `dev-scan` | Community opinions from Reddit, HN, Dev.to | `Skill(skill="dev-scan", args="[topic]")` |
| `council` | Multi-perspective AI expert debate | `Skill(skill="council", args="[question]")` |

### External Tools

| Tool | Purpose |
|------|---------|
| `WebSearch` | Ad-hoc web queries for benchmarks, comparisons |
| `WebFetch` | Fetch full page content from specific URLs |
| `mcp__plugin_compound-engineering_context7__resolve-library-id` | Resolve library ID for context7 docs |
| `mcp__plugin_compound-engineering_context7__query-docs` | Query latest library documentation |

---

## Error Handling

| # | Situation | Response |
|---|-----------|----------|
| 1 | `code-explorer` returns nothing (no codebase usage) | Skip codebase track. Note "No existing usage found" in report. Proceed with external sources only. |
| 2 | `docs-researcher` returns empty or fails | Use WebSearch + WebFetch as fallback for official docs. Note reduced doc coverage in report. |
| 3 | `dev-scan` skill fails or returns empty | Skip community track. Add note: "Community data unavailable" in report. Proceed with remaining sources. |
| 4 | `council` skill fails or times out | Skip council track. Standard-tier analysis is still sufficient. Note gap in report. |
| 5 | context7 resolve fails | Omit library docs section. Use WebSearch for official docs instead. |
| 6 | WebSearch returns irrelevant results | Reformulate with shorter, broader query. Try alternative keywords. Max 2 retries. |
| 7 | All external sources fail | Produce report based on codebase analysis + orchestrator knowledge only. Mark confidence as LOW. Add warning banner. |
| 8 | User provides no project context | Use defaults (small team, greenfield, balanced priority). State assumptions in report section 2. |
| 9 | User provides only 1 option (no comparison) | Ask user for at least one alternative. If user insists, research the single option's strengths/weaknesses and suggest 1-2 alternatives. |
| 10 | Options are not comparable (e.g., "React vs PostgreSQL") | Explain why comparison is invalid. Ask user to clarify the actual decision. |
| 11 | Tradeoff-analyzer returns scores without justification | Re-prompt with explicit instruction: "Justify each score with one sentence citing a source." |
| 12 | Conflicting information across sources | Present both perspectives in the report. Use source reliability ranking to weight the conflict. Flag in Risks section. |

---

## Complexity Tier Examples

### Quick Tier: "React vs Vue for a new SPA"

```
Phase 0: Classify -> Quick (2 well-known options, straightforward)
Phase 1: Criteria = Performance(20%), Learning Curve(25%), Ecosystem(25%), Community(15%), Documentation(15%)
Phase 2:
  Step 1: Task(subagent_type="code-explorer", prompt="Check for React or Vue usage in codebase...")
  Step 2: WebSearch("React vs Vue 2025 comparison")
  Step 3: Task(subagent_type="tradeoff-analyzer", prompt="Score React vs Vue on [criteria]...")
Phase 4: Inline report (~500 words)

Estimated cost: 3-5 tool calls, ~2 minutes
```

### Standard Tier: "Which ORM for our NestJS project?"

```
Phase 0: Classify -> Standard (3-4 options: Prisma, TypeORM, Drizzle, MikroORM)
Phase 1: Criteria = Type Support(25%), Performance(20%), DX(20%), Community(15%), Migration(20%)
Phase 2: Parallel dispatch:
  Task(subagent_type="code-explorer", prompt="Analyze current DB access patterns...")
  Task(subagent_type="docs-researcher", prompt="Compare Prisma, TypeORM, Drizzle, MikroORM docs...")
  Skill(skill="dev-scan", args="Prisma vs TypeORM vs Drizzle ORM comparison NestJS")
  context7: resolve + query for each ORM
Phase 3: Task(subagent_type="tradeoff-analyzer", prompt="Synthesize all findings...")
Phase 4: Inline report (~1000 words)

Estimated cost: 8-15 tool calls, ~5 minutes
```

### Deep Tier: "Microservices vs modular monolith for platform rewrite"

```
Phase 0: Classify -> Deep (architecture-level, high stakes, multiple dimensions)
Phase 1: Criteria = Scalability(25%), Team Fit(20%), Operational Cost(20%), Dev Speed(15%), Failure Isolation(20%)
Phase 2: Parallel dispatch:
  Task(subagent_type="code-explorer", prompt="Analyze current architecture, module boundaries...")
  Task(subagent_type="docs-researcher", prompt="Research microservices vs monolith patterns...")
  Skill(skill="dev-scan", args="microservices vs modular monolith production experience")
  Skill(skill="council", args="Should a 10-person team adopt microservices for a platform rewrite?")
  WebSearch("microservices vs monolith benchmark 2025")
  WebSearch("modular monolith production experience 2025")
Phase 3: Task(subagent_type="tradeoff-analyzer", prompt="Synthesize all findings...")
Phase 4: Inline report (~1500 words)

Estimated cost: 15-25 tool calls, ~8 minutes
```

---

## Scoring Rubric

All scores use a numeric 1-5 scale. No star emojis.

| Score | Label | Meaning |
|-------|-------|---------|
| 5 | Excellent | Best-in-class for this criterion. Clear leader. |
| 4 | Good | Strong performance with minor gaps. Recommended. |
| 3 | Adequate | Meets basic needs. No standout strength or weakness. |
| 2 | Below Average | Notable weaknesses. Acceptable only if other criteria compensate. |
| 1 | Poor | Significant drawbacks. Not recommended for this criterion. |

**Weighted Average Calculation:**
```
weighted_avg = (score_1 * weight_1 + score_2 * weight_2 + ... + score_n * weight_n) / 100
```

Example: Performance(30%) = 4, Learning Curve(20%) = 5, Ecosystem(25%) = 3, Community(25%) = 4
```
weighted_avg = (4*30 + 5*20 + 3*25 + 4*25) / 100 = (120 + 100 + 75 + 100) / 100 = 3.95
```

---

## Skill Differentiator

| Aspect | `/tech-decision` | `/google-search` | `/reference-seek` | `/deep-research` |
|--------|-------------------|--------------------|--------------------|-------------------|
| **Purpose** | Choose between alternatives with scored recommendation | Real-time web search with full page content | Find reusable code patterns and repos | Multi-agent deep investigation with cited report |
| **Output** | Conclusion-first decision report with numeric scores | Search result list (URLs + snippets/body) | Categorized references with code excerpts | Comprehensive research report with confidence assessment |
| **Depth** | Medium-Deep -- multi-source scored comparison | Shallow -- returns raw search results | Medium -- quality-filtered repos + code dive | Deep -- parallel agents + cross-validation |
| **When to use** | Need to choose between 2+ alternatives | Need quick search results or specific URLs | Need implementation examples to learn from | Need thorough investigation of a broad topic |
| **Key differentiator** | Numeric scoring rubric + weighted recommendation | Raw search access | Code-level repo analysis | Cross-model validation + confidence matrix |
| **Tools** | code-explorer, docs-researcher, tradeoff-analyzer, dev-scan, council, context7, WebSearch | chromux (real Chrome browser) | gh API, context7, WebSearch, Explore agent | WebSearch, WebFetch, chromux, Gemini CLI, subagents |

---

## Cost Estimate / Performance Notes

| Tier | Tool Calls | Estimated Time | Agent Count | Best For |
|------|-----------|---------------|-------------|----------|
| Quick | 3-5 | ~2 min | 1-2 | Simple A vs B, well-known tech |
| Standard | 8-15 | ~5 min | 3-4 | Multi-option with codebase context |
| Deep | 15-25 | ~8 min | 5-6 | Architecture decisions, high-stakes choices |

- **Quick tier** avoids unnecessary agent dispatch -- uses direct WebSearch instead of docs-researcher for speed.
- **Standard tier** is the default for most decisions. Parallel dispatch keeps wall-clock time reasonable.
- **Deep tier** adds council debate and extra WebSearch passes. Use only for decisions with significant cost/risk implications.
- All tiers produce inline reports -- no separate file output required.

---

## Notes

1. **Provide Context**: More accurate analysis with project characteristics, team size, existing tech stack.
2. **Confirm Criteria**: First confirm what criteria matter to user (Standard/Deep tiers).
3. **Show Reliability**: Mark unclear or outdated sources.
4. **Conclusion First**: Always present conclusion first.
5. **No Star Emojis**: Use numeric 1-5 scores exclusively in comparison tables.
