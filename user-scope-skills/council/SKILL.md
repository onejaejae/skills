---
name: council
description: |
  This skill should be used when the user says "/council", "council", "deliberate",
  "multi-perspective decision", "트레이드오프 분석", "위원회 소집", "여러 관점으로 검토",
  or wants deep multi-perspective deliberation with tradeoff mapping.
  Combines tribunal (structured adversarial review), agent-council (external LLM opinions),
  dev-scan (community sentiment), and step-back (meta-level review) into a unified
  decision-making committee. Uses Agent Teams for real peer-to-peer debate with
  iterative step-back moderation loop.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Agent
  - Bash
  - AskUserQuestion
  - TeamCreate
  - TeamDelete
  - SendMessage
  - TaskCreate
  - TaskUpdate
  - TaskList
validate_prompt: |
  Must contain:
  1. Dynamic panelist design (not fixed 3)
  2. A Tradeoff Map as the primary output
  3. Contention Points section
  4. Step-back Insight section
  5. Team Mode debate with SendMessage (peer-to-peer)
  6. Iterative debate loop (debate → step-back → targeted re-debate)
  7. Groupthink check (step-back judge challenges unanimous early agreement)
  8. Circuit breaker produces PARTIAL verdict with dissenting opinions when max cycles reached
---

# /council — Multi-Perspective Decision Committee

You are a council orchestrator (team lead). You dynamically assemble a deliberation committee
as an **Agent Team**, run iterative debates where panelists argue with each other directly
via SendMessage, with a step-back reviewer acting as **in-loop judge** who decides whether
more debate is needed. Then synthesize findings into a **Tradeoff Map**.

## Architecture

```
Phase 1: Agenda Parsing + Committee Assembly
   │
Phase 2: Committee Deliberation (Iterative Debate Loop)
   │  ├─ 2.1: TeamCreate + spawn ALL (panelists + step-back + external agents)
   │  ├─ 2.2: Debate Cycle
   │  │    ├─ Panelists debate (peer-to-peer SendMessage)
   │  │    ├─ Lead collects positions → sends to step-back
   │  │    └─ Step-back judges → CONVERGED / PARTIAL / FULL
   │  │         ├─ CONVERGED → exit loop
   │  │         ├─ PARTIAL → lead tells specific panelists to re-debate
   │  │         └─ FULL → lead broadcasts, all panelists re-debate
   │  ├─ 2.3: Repeat cycle (max 3 cycles)
   │  └─ 2.4: Collect external results + shutdown all teammates
   │
Phase 3: Tradeoff Map + Verdict
```

```
         ┌──────────── TeamCreate("council") ────────────┐
         │                                                │
         │   Panelist A ←─ SendMessage ─→ B               │
         │   Panelist C ←─ SendMessage ─→ A               │
Input ───┤        ↕ debate ↕                              ├──→ Tradeoff Map
         │                                                │
         │   Lead collects ──→ Step-back Judge             │
         │                       │                        │
         │              CONVERGED? ──No──→ re-debate ─┐   │
         │                  │Yes                      │   │
         │                  ↓                    ←────┘   │
         │              exit loop                         │
         └────────────────────────────────────────────────┘
                ↑ parallel (background agents)
         External LLM + dev-scan (main agent spawns)
```

---

## Agent Role Table

| Agent | Role | Model | Type | Phase |
|-------|------|-------|------|-------|
| **Lead (you)** | Orchestrator, moderator, synthesizer | — | main agent | All |
| **Panelist ×2~4** | Perspective-specific analysis + debate | opus | teammate | Phase 2 |
| **Step-back Judge** | In-loop meta-reviewer, decides if debate continues | opus | teammate | Phase 2 |
| **Codex (external)** | Independent external LLM opinion | codex | background agent | Phase 2 |
| **Community Scanner** | dev-scan community sentiment (optional) | haiku | background agent | Phase 2 |

**Why two patterns**: Teammates (panelists + step-back) use SendMessage for real debate. Background agents handle external CLI calls (codex) because teammates cannot spawn subagents.

**Key change**: Step-back is spawned alongside panelists in Phase 2 and stays alive throughout the debate loop. It acts as the **judge** who decides when debate quality is sufficient.

---

## How Council Extends Tribunal

| Tribunal | Council (extends) |
|----------|-------------------|
| Fixed 3 roles (Risk/Value/Feasibility) | **Dynamic 2~4 roles** designed per topic |
| Internal Claude agents only | + **External LLM** (Codex) |
| No community data | + **dev-scan** community sentiment |
| Independent analysis, no interaction | **Multi-round debate** via SendMessage |
| Single-round hearings | **Iterative loop**: debate → step-back judge → re-debate |
| No meta-review feedback loop | Step-back can **send panelists back** for more debate |
| Verdict Matrix → APPROVE/REVISE/REJECT | → **Tradeoff Map** with Decision Confidence Score |

### When to Use Council vs Other Skills

| Need | Skill | Why |
|------|-------|-----|
| Quick "is this OK?" check | `/check` | Rule-based PASS/WARN, no agents |
| Structured 3-way review | `/tribunal` | Fixed Risk/Value/Feasibility, single round, APPROVE/REVISE/REJECT |
| Rubric-based scoring + improvement | `/rulph` | Iterative self-improvement loop against a rubric |
| Socratic exploration (no decision) | `/discuss` | Thought partner, no verdict needed |
| Scored tech recommendation | `/tech-decision` | Multi-source research, weighted scoring matrix |
| Deep multi-perspective tradeoff analysis | **`/council`** | Dynamic panelists, iterative debate, step-back judge, Tradeoff Map |

**Use /council when**: the decision has significant tradeoffs, multiple valid options, and benefits from adversarial debate between distinct perspectives. If you just need a quick score or review, use a lighter skill.

### Cost Estimate

Council is the most agent-intensive skill. Approximate token/agent cost by mode:

| Mode | Agents Spawned | Estimated Rounds | Relative Cost |
|------|---------------|-----------------|---------------|
| Quick | 2~4 teammates | 1 (no cross-debate) | LOW (~3-5 agent calls) |
| Standard | 3~5 teammates (panelists + step-back) | 2~4 rounds x 1~3 cycles | MEDIUM (~10-20 agent calls) |
| Full | 4~6 (teammates + background agents) | 2~4 rounds x 1~3 cycles + external | HIGH (~15-30 agent calls) |

**Budget warning**: Full mode with 4 panelists and 3 debate cycles can produce 20+ agent round-trips. Consider Standard mode for most decisions.

---

## Data Flow Contract

| Phase | Input | Output Artifact | Consumed By |
|-------|-------|-----------------|-------------|
| Phase 1 | User args + topic | `committee_config` (panelist list, mode, topic) | Phase 2 |
| Phase 2 | `committee_config` | `debate_log[]` + `final_positions[]` + `stepback_reviews[]` + `community_sentiment` | Phase 3 |
| Phase 3 | All above | **Tradeoff Map** (final output to user) | User |

---

## Phase 1: Agenda Parsing + Committee Assembly

### 1.1 Input Parsing

Determine the deliberation target from arguments:

| Input | How to get content |
|-------|-------------------|
| `"A vs B"` text | Use directly as the deliberation topic |
| `file.md` or path | `Read(file_path)` — plan, proposal, or design doc |
| `--pr <number>` | `Bash("gh pr diff <number>")` and `Bash("gh pr view <number>")` |
| `--diff` | `Bash("git diff HEAD")` or `Bash("git diff main...HEAD")` |
| No args | Ask user what to deliberate via `AskUserQuestion` |

### 1.2 Dynamic Panelist Design

Analyze the topic and design **2~4 panelists** with distinct perspectives.
Do NOT use fixed roles — design roles that fit the specific topic.

**User customization**: If the user specifies particular perspectives (e.g., `/council "Redis vs Memcached" --perspectives "Security, Cost, DX"`) or a specific number of panelists, honor that request within the 2~4 range. If the user requests more than 4, cap at 4 and explain why. If they request fewer than 2, set to 2 minimum.

**Design rules:**
- **2~4 panelists** — keeps debate focused and token-efficient
- Each panelist must have a **distinct analytical lens** (not overlapping)
- At least one panelist should be **adversarial** (find problems)
- At least one panelist should be **constructive** (find value)
- Name each panelist with their lens: e.g., "Security Analyst", "DX Advocate", "Cost Optimizer"

**Examples of dynamic design:**

| Topic | Panelists (2~4) |
|-------|-----------|
| "Redis vs Memcached" | Performance Engineer, Ops Complexity Analyst, DX Advocate |
| "Monorepo migration" | Build System Expert, Team Workflow Analyst, Migration Risk Assessor |
| "New auth system" | Security Analyst, UX Impact Reviewer, Compliance Checker |

### 1.3 Capability Check

```bash
CODEX_AVAILABLE=$(command -v codex >/dev/null 2>&1 && echo "yes" || echo "no")
DEVSCAN_AVAILABLE="yes"
```

**Graceful degradation**: If a CLI is not found, skip that external LLM silently. Mark as `SKIPPED` in the final report.

### 1.4 Mode Selection

```
AskUserQuestion(
  question: "The committee has been assembled. Which mode would you like to proceed with?",
  options: [
    { label: "Full Council (Recommended)",
      description: "Iterative debate + external LLM + dev-scan + step-back judge. Deepest analysis." },
    { label: "Standard",
      description: "Iterative debate + step-back judge. Skips external LLM/dev-scan. Faster and more economical." },
    { label: "Quick",
      description: "Single debate cycle only. Proceeds to consensus without step-back judgment. Fastest." }
  ]
)
```

Display the panelist table before asking:

```
## Proposed Committee

| # | Panelist | Lens | Role in Debate | Phase |
|---|----------|------|----------------|-------|
| 1 | [name] | [analytical perspective] | Teammate (opus) | Phase 2 |
| 2 | [name] | [analytical perspective] | Teammate (opus) | Phase 2 |
| 3 | [name] | [analytical perspective] | Teammate (opus) | Phase 2 |
| 4 | Step-back Judge | Meta-level judge | Teammate (opus) | Phase 2 (loop) |
| 5 | Codex (external) | Independent external perspective | Background agent | Phase 2 (optional) |
| 6 | dev-scan | Community sentiment (optional) | Background agent (haiku) | Phase 2 (optional) |
```

### 1.5 State Init

```bash
SESSION_ID="[session ID]"
hoyeon-cli session set --sid $SESSION_ID --json '{"council": {"phase": 1, "mode": "[selected]", "topic": "[topic summary]", "status": "active"}}'
```

---

## Phase 2: Committee Deliberation (Iterative Debate Loop)

The core innovation: panelists AND step-back are all **teammates** spawned together.
After each debate round, the step-back judge evaluates and decides whether more debate is needed.
Panelists stay alive until the loop completes.

### 2.1 Setup — TeamCreate + Spawn ALL

**Step 1**: Create the council team.

```
TeamCreate(team_name: "council", description: "[topic summary]")
```

**Step 2**: Spawn ALL teammates + background agents — **all in ONE message**.

```
# Spawn ALL in a single message for parallel execution

# --- Panelist teammates ---
Agent(
  name="panelist-[kebab-name-1]",
  model="opus",
  subagent_type="general-purpose",
  mode="bypassPermissions",
  team_name="council",
  prompt="""
## Role
You are [panelist name], a council panelist analyzing from the perspective of **[analytical lens]**.

## Deliberation Topic
[full topic content]

## Debate Protocol
You are part of an iterative deliberation council. You will go through multiple cycles:

**Cycle 1 — Round 1 (NOW)**: Analyze the topic independently through your lens. Send your position to the team lead.

**Cycle 1 — Round 2 (after lead broadcasts)**: You will receive ALL panelists' positions. Then:
- SendMessage(type="message", recipient="panelist-[name]") to challenge positions you disagree with
- You MUST engage with at least 2 other panelists
- After debating, send your updated position to the team lead

**Subsequent Cycles (if step-back judge requests)**: The lead will message you with step-back feedback and specific questions. Respond by debating those specific points with the named panelists, then send your updated position to the lead.

**IMPORTANT**: Do NOT shut down after a round. Stay alive and wait for further instructions from the lead. Only shut down when you receive a shutdown_request.

## Position Output Format
Send this as a message to the team lead each time you update your position:

Position: [support_A | support_B | conditional | neutral]
Confidence: [0-100]
Key Argument: [your single strongest argument, 1-2 sentences]
Tradeoffs: [dimension → option_a pro/con, option_b pro/con]
Risks: [specific risks from your lens]
Conditions: [what would change your mind]
Evidence: [concrete evidence]
Cycle: [current cycle number]

Be specific and evidence-based. No generic statements.
""")

# ... repeat for each panelist (3 total) ...

# --- Step-back Judge teammate ---
Agent(
  name="step-back-judge",
  model="opus",
  subagent_type="general-purpose",
  mode="bypassPermissions",
  team_name="council",
  prompt="""
## Role
You are the Step-back Judge of a deliberation council. You operate at a META level — above the panelists. You do NOT argue for any option. You evaluate the QUALITY of the debate and decide whether more deliberation is needed.

## Deliberation Topic
[full topic content]

## Your Protocol
You will receive debate summaries from the team lead after each debate round. For each summary, you must:

1. Evaluate the debate quality
2. Return a VERDICT to the team lead

**IMPORTANT**: Do NOT analyze until the lead sends you a debate summary. Wait for the lead's message. Stay alive between cycles — only shut down when you receive a shutdown_request.

## Evaluation Criteria
When the lead sends you a debate summary, analyze:
1. **Framing Check**: Are panelists solving the right problem? Is there an Option C?
2. **Assumption Audit**: What shared assumptions are dangerous?
3. **Debate Quality**: Did positions shift, or just entrench? Are arguments evidence-based or hand-waving?
4. **Blind Spots**: What dimensions are panelists NOT discussing that matter?
5. **Convergence**: Is continued debate likely to produce new insights, or just noise?
6. **Groupthink Check**: If ALL panelists agree with high confidence in Cycle 1, this is a red flag. Challenge the consensus by returning FULL with a provocative counter-argument or hidden risk. Unanimous early agreement usually means the group missed something, not that the answer is obvious.

## Verdict Format
Send this to the team lead via SendMessage:

Verdict: [CONVERGED | PARTIAL | FULL]
Confidence: [0-100]
Framing Issues: [list or "none"]
Hidden Assumptions: [list or "none"]
Blind Spots: [list or "none"]
Option C: [alternative nobody mentioned, or "none"]

If PARTIAL:
  Target Panelists: [panelist-name-1, panelist-name-2]
  Debate Focus: [specific question or dimension they should address]

If FULL:
  Debate Focus: [what the entire group missed or needs to reconsider]

Meta Insight: [1-2 sentence high-level observation]

## Verdict Meanings
- **CONVERGED**: Debate quality is sufficient. Positions are well-reasoned with evidence. No major blind spots. OK to proceed to synthesis.
- **PARTIAL**: Specific panelists need to address specific gaps. Send only those panelists back to debate the named issue.
- **FULL**: The entire group missed something important (framing error, blind spot, Option C). All panelists need another full round.
""")

# --- Background agents (external LLMs, optional) ---

# Codex (if CODEX_AVAILABLE == "yes")
Agent(
  name="external-codex",
  model="sonnet",
  subagent_type="general-purpose",
  run_in_background=true,
  prompt="""
Run the following command and return its output:

codex exec <<'PROMPT'
## Deliberation Topic
[full topic content]

Analyze this topic independently. Provide:
1. Your position (support_A / support_B / conditional / neutral)
2. Key argument (1-2 sentences)
3. Tradeoffs you see
4. Risks
5. What conditions would change your mind

Return as JSON with keys: position, key_argument, tradeoffs, risks, conditions
PROMPT
""")

# dev-scan (optional — launch if user requested or topic benefits from community input)
Agent(
  name="community-scanner",
  model="haiku",
  subagent_type="general-purpose",
  run_in_background=true,
  prompt="""
You are a community sentiment researcher.

## Topic
[deliberation topic]

## Task
Search developer communities (Reddit, HN, dev blogs) for real-world opinions on this topic.
1. Search for relevant discussions
2. Collect pro/con sentiment
3. Note any strong warnings or endorsements from experienced practitioners

## Output Format
{
  "sentiment_summary": "overall lean (positive/negative/mixed)",
  "key_quotes": [
    { "source": "Reddit r/programming", "quote": "...", "sentiment": "positive/negative" }
  ],
  "warning_signals": ["..."],
  "endorsements": ["..."],
  "sample_size": N
}
""")
```

### 2.2 Debate Cycle — The Iterative Loop

```
cycle = 1
max_cycles = 3

LOOP:
  2.2a: Debate Round (panelists exchange positions)
  2.2b: Lead collects → sends summary to step-back judge
  2.2c: Step-back returns verdict
       ├─ CONVERGED → exit loop
       ├─ PARTIAL → lead sends targeted re-debate instructions
       └─ FULL → lead broadcasts re-debate instructions
  2.2d: cycle += 1, if cycle > max_cycles → exit loop
  REPEAT
```

#### 2.2a — Debate Round

**Cycle 1 follows the Round 1 → Round 2 pattern:**

1. Wait for all panelists to send their initial positions (Round 1)
2. Collect all positions into `positions[]`
3. Broadcast all positions to trigger cross-debate (Round 2):

```
SendMessage(
  type: "broadcast",
  content: """
## Cycle 1 — Cross-Debate Begins

All panelist positions:

### [Panelist 1] — [position] (confidence: [N]%)
[key argument + tradeoffs summary]

### [Panelist 2] — [position] (confidence: [N]%)
[key argument + tradeoffs summary]

[... all panelists ...]

## Instructions
Debate: challenge positions you disagree with by messaging those panelists directly.
You MUST engage with at least 2 other panelists.
After debating, send your updated position to the team lead.
""",
  summary: "Cycle 1 debate — all positions shared"
)
```

4. Wait for all panelists to send their updated positions after debate

**Subsequent cycles follow step-back judge instructions:**

For PARTIAL verdicts — send targeted messages:
```
SendMessage(
  type: "message",
  recipient: "panelist-[target-name]",
  content: """
## Step-back Judge Feedback — Cycle [N]

The step-back judge identified a gap in your analysis:

**Issue**: [debate focus from step-back]
**You need to address**: [specific question]
**Discuss with**: panelist-[other-name]

Debate this specific point, then send your updated position to the team lead.
""",
  summary: "Cycle [N] — targeted re-debate request"
)
```

For FULL verdicts — broadcast to all:
```
SendMessage(
  type: "broadcast",
  content: """
## Step-back Judge Feedback — Cycle [N]

The step-back judge found a significant gap:

**Issue**: [debate focus from step-back]
**Option C identified**: [if any]
**Everyone must address**: [specific question or reframing]

Debate this with other panelists, then send your updated position to the team lead.
""",
  summary: "Cycle [N] — full re-debate required"
)
```

#### 2.2b — Send Summary to Step-back Judge

After collecting all updated positions for the cycle, compile a summary and send to the step-back judge:

```
SendMessage(
  type: "message",
  recipient: "step-back-judge",
  content: """
## Debate Summary — Cycle [N]

### Current Positions
[Panelist 1]: [position] (confidence [N]%, shifted: yes/no from last cycle)
[Panelist 2]: [position] (confidence [N]%, shifted: yes/no)
[Panelist N]: [position] (confidence [N]%, shifted: yes/no)

### Key Debate Exchanges This Cycle
- [Panelist A] challenged [Panelist B] on [topic]: [summary]
- [Panelist C] agreed with [Panelist A] but added [nuance]

### External Data (if available)
Community sentiment: [dev-scan summary]
Codex opinion: [summary]

### Cycle History
Cycle 1: [positions and shifts]
Cycle [N]: [current]

Please evaluate and return your verdict (CONVERGED / PARTIAL / FULL).
""",
  summary: "Cycle [N] debate summary for judgment"
)
```

#### 2.2c — Process Step-back Verdict

Wait for the step-back judge to respond. Parse the verdict:

- **CONVERGED**: Log the step-back's meta-insights. Exit the loop.
- **PARTIAL**: Note target panelists and debate focus. Continue to next cycle with targeted messages.
- **FULL**: Note debate focus and Option C. Continue to next cycle with broadcast.

#### 2.2d — Circuit Breaker

```
if cycle > max_cycles:
  → Log: "Max cycles reached (circuit breaker). Producing PARTIAL verdict with remaining disagreements noted."
  → Set exit_reason = "CIRCUIT_BREAKER"
  → Exit loop
```

When the circuit breaker fires, the final report MUST label the verdict as **PARTIAL** (not CONVERGED) and include a "Dissenting Opinions" subsection listing unresolved disagreements. This signals to the user that the council did not reach natural convergence.

**Quick mode**: Skip the loop entirely. Run only Cycle 1 Round 1 (positions only, no cross-debate, no step-back). Proceed directly to Phase 3.

### 2.3 Collect External Results

While the debate loop runs, external background agents (Codex, dev-scan) complete independently. Collect their results.

- `external_opinions[]` (Codex)
- `community_sentiment` (dev-scan)

**Timing**: External results may arrive during any cycle. The lead includes them in the step-back summary as soon as available.

### 2.4 Shutdown All Teammates

After the loop exits (CONVERGED or max cycles):

```
# Shutdown each panelist
SendMessage(type: "shutdown_request", recipient: "panelist-[name-1]", content: "Deliberation complete")
SendMessage(type: "shutdown_request", recipient: "panelist-[name-2]", content: "Deliberation complete")
# ... for all panelists
SendMessage(type: "shutdown_request", recipient: "step-back-judge", content: "Deliberation complete")
```

Wait for all shutdown responses.

```
TeamDelete()
```

**Failure handling**:

| Situation | Detection | Action |
|-----------|-----------|--------|
| External LLM CLI not found | `command -v` check in Phase 1.3 | Skip, mark as UNAVAILABLE in report |
| External LLM call fails | Non-zero exit code or empty output | Mark as DEGRADED, proceed without |
| dev-scan fails or times out | Background agent returns error or no result | Mark as UNAVAILABLE |
| Panelist teammate unresponsive | No position received after broadcasting; send 1 reminder via SendMessage | After reminder, wait once more; if still no response, exclude from debate summary and mark as DROPPED in report |
| Step-back judge unresponsive | No verdict received after sending summary | Lead self-evaluates convergence using the same 6 criteria; log as "SELF-JUDGED" in step-back history |
| All panelists fail | No positions received from any teammate | Fall back to main agent self-analysis; mark report as "DEGRADED — single-agent fallback" |
| Team creation fails | TeamCreate returns error | Fall back to sequential Agent calls (non-team mode); mark as "DEGRADED — no team mode" |
| Fewer than 2 panelists remain | Panelists crashed/timed out leaving <2 active | Abort the debate and produce a **FAILED** verdict with explanation: "Insufficient panelists for meaningful deliberation." |

**Minimum quorum**: 2 active panelists required. If fewer than 2 panelists remain (due to crashes/timeouts), abort the debate and produce a FAILED verdict with explanation: "Insufficient panelists for meaningful deliberation."

```bash
hoyeon-cli session set --sid $SESSION_ID --json '{"council": {"phase": 2, "status": "active", "cycle": [N]}}'
```

---

## Phase 3: Tradeoff Map + Verdict

The main agent (lead) synthesizes everything. No more teammates needed.

**Quick mode note**: Only Cycle 1 Round 1 was conducted — no cross-debate, no step-back. Lead extracts contention points directly from initial positions.

### 3.1 Build Tradeoff Map

```markdown
## Council Deliberation Report

### Topic
[deliberation topic]

### Committee
| Panelist | Lens | Final Position | Confidence | Shifted? | Status |
|----------|------|----------------|------------|----------|--------|
| [name] | [lens] | [position] | [N]% | Yes/No (cycle X→Y) | AVAILABLE |
| Codex | External LLM | [position] | - | - | AVAILABLE/SKIPPED |
| dev-scan | Community | [sentiment] | - | - | AVAILABLE/SKIPPED |

### Debate Summary
**Cycles**: [N] cycles conducted (max: 3)
**Exit reason**: [CONVERGED at cycle N / Max cycles reached]
**Position shifts**: [N] panelists changed position across all cycles
**Step-back interventions**: [list of PARTIAL/FULL verdicts and their impact]
**Key debate moments**: [brief summary of most impactful exchanges]

### Tradeoff Map

| Dimension | Option A | Option B | Community | Weight |
|-----------|----------|----------|-----------|--------|
| [dim 1] | [pro/con] | [pro/con] | [sentiment] | HIGH/MED/LOW |
| [dim 2] | [pro/con] | [pro/con] | [sentiment] | HIGH/MED/LOW |
| [dim 3] | [pro/con] | [pro/con] | [sentiment] | HIGH/MED/LOW |

**Weight** = how many panelists flagged this dimension as important.
```

### 3.2 Contention Points

```markdown
### Contention Points

| Point | Side A | Side B | Debate Outcome | Step-back Comment |
|-------|--------|--------|----------------|-------------------|
| [disagreement] | [panelist]: [argument] | [panelist]: [counter] | [resolved/shifted/unresolved] | [step-back insight if any] |
```

### 3.2b Dissenting Opinions (required when verdict = PARTIAL)

When the circuit breaker fires and the verdict is PARTIAL, this subsection is **mandatory**. It captures unresolved disagreements so the user knows exactly where consensus was not reached.

```markdown
### Dissenting Opinions (required when verdict = PARTIAL)
| Panelist | Position | Key Argument |
|----------|----------|-------------|
| [name] | [their stance] | [their strongest argument] |
```

### 3.3 Step-back Insight (Aggregated)

Aggregate ALL step-back verdicts across cycles:

```markdown
### Step-back Insight

**Total cycles**: [N] (verdicts: [FULL, PARTIAL, CONVERGED])
**Framing issues raised**: [aggregated from all verdicts]
**Hidden assumptions found**: [aggregated]
**Blind spots surfaced**: [aggregated]
**Option C**: [if identified in any cycle]
**Debate quality trajectory**: [did quality improve across cycles? entrenchment vs convergence?]
**Final meta-recommendation**: [from last step-back verdict]
```

### 3.4 Preference Tally

```markdown
### Preference Tally

| Source | Preference | Rationale | Position History |
|--------|-----------|-----------|-----------------|
| [panelist 1] | Option A | [key argument] | A→A→A (stable) |
| [panelist 2] | Option B | [key argument] | A→B→B (shifted cycle 2) |
| [panelist 3] | Conditional | [condition] | B→conditional (shifted cycle 2) |
| Codex | Option A | [key argument] | - |
| Community | Option B | [top sentiment] | - |

**Tally**: Option A: N votes · Option B: M votes · Conditional: K
```

### 3.5 Final Recommendation

```markdown
### Council Recommendation

**Lean**: [Option A / Option B / No clear winner]

**Decision Confidence**: [N]%
- Average panelist confidence: [X]%
- Max contention gap: [Y] points
- Cycles to convergence: [N] (fewer = stronger consensus)
- Position shifts: [N] (some shifts = healthy debate, many shifts = unstable)
- Step-back final verdict: [CONVERGED / max cycles reached]
- Interpretation: >80% = strong consensus · 50-80% = moderate · <50% = highly contested

[2-3 sentence synthesis explaining the recommendation]

**Choose Option A if**: [conditions]
**Choose Option B if**: [conditions]
**Revisit the question if**: [step-back identified Option C or framing issues]

---

<details>
<summary>Full Debate Log</summary>

### Cycle 1
#### Round 1 — Initial Positions
[All panelist initial positions]

#### Round 2 — Cross-Debate
[Key exchanges between panelists]

#### Step-back Verdict
[Verdict + reasoning]

### Cycle 2 (if conducted)
#### Re-debate
[Targeted or full re-debate exchanges]

#### Step-back Verdict
[Verdict + reasoning]

### Cycle N...

</details>

<details>
<summary>Step-back Review History</summary>

[All step-back verdicts with full analysis]

</details>

<details>
<summary>External Opinions</summary>

[Codex results, if available]

</details>

<details>
<summary>Community Sentiment (dev-scan)</summary>

[Full dev-scan results, if available]

</details>
```

### 3.6 State Completion

```bash
hoyeon-cli session set --sid $SESSION_ID --json '{"council": {"phase": 3, "status": "completed"}}'
```

---

## Mode Summary

| Feature | Quick | Standard | Full |
|---------|-------|----------|------|
| Internal panelists | 2~4 (teammates) | 2~4 (teammates) | 2~4 (teammates) |
| Step-back judge | - | In-loop (teammate) | In-loop (teammate) |
| Debate cycles | 1 (no cross-debate) | Up to 3 | Up to 3 |
| Peer-to-peer debate | - | SendMessage exchanges | SendMessage exchanges |
| Step-back re-debate loop | - | CONVERGED/PARTIAL/FULL | CONVERGED/PARTIAL/FULL |
| External LLM | - | - | Codex |
| dev-scan | Optional | Optional | Optional |
| Tradeoff Map | Basic | Full | Full + community data |
| Estimated agents | 3 teammates | 4~5 (+ step-back) | 4~6 (+ bg agents) |

---

## Team Mode Constraints

Teammates (panelists + step-back) **CAN**:
- SendMessage to other teammates directly (peer-to-peer debate)
- SendMessage to the lead (report positions / verdicts)
- Read files, search code, run bash commands
- Use all standard tools (Read, Grep, Glob, Bash, etc.)

Teammates **CANNOT**:
- Spawn subagents (Agent tool not available)
- Create teams or manage tasks (TeamCreate/TeamDelete not available)
- Ask the user questions (AskUserQuestion not available)
- Call external LLMs (no agent spawning → must be done by lead via background agents)

**Implication**: External LLM calls (codex) MUST be launched by the lead as background agents, not delegated to teammates.

---

## Usage Examples

```bash
# Compare two technologies
/council "Redis vs Memcached for our session cache"

# Review a design proposal
/council design-proposal.md

# Review a PR with multiple perspectives
/council --pr 421

# Quick deliberation (1 cycle, no step-back loop)
/council --quick "Should we use TypeScript strict mode?"

# Full council with community data + iterative debate
/council --full "Monorepo migration: Nx vs Turborepo"
```

---

## Checklist Before Stopping

- [ ] Dynamic panelists designed (not fixed 3 roles)
- [ ] TeamCreate used to create the council team
- [ ] All panelists + step-back judge spawned as teammates in ONE message
- [ ] Cycle 1: positions collected + cross-debate conducted (Standard/Full)
- [ ] Step-back judge verdict received after each cycle
- [ ] Re-debate triggered if step-back returned PARTIAL/FULL
- [ ] Max 3 cycles enforced (circuit breaker)
- [ ] External LLM results collected (if launched)
- [ ] All teammates shut down + TeamDelete called
- [ ] Tradeoff Map generated as primary output
- [ ] Contention Points with debate outcomes + step-back comments
- [ ] Step-back Insight aggregated across all cycles
- [ ] Full debate log in collapsible details
- [ ] State updated at each phase transition
