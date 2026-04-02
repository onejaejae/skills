---
name: canary
description: |
  Use after deploying code to production or staging for real-time monitoring
  with baseline comparison and health scoring. Observation only — no code
  changes during monitoring.
  Triggers: "/canary", "canary check", "post-deploy watch", "배포 후 모니터링",
  "카나리", "배포 확인", "deploy monitoring", "health check after deploy",
  "배포 후 괜찮아?", "배포 상태 확인"
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
validate_prompt: |
  Must produce a Canary Monitoring Report with:
  1. Baseline snapshot (captured or loaded from .dev/canary/)
  2. At least 1 monitoring cycle completed
  3. Health status per cycle: HEALTHY / DEGRADED / BROKEN with score
  4. Transient tolerance applied (2 consecutive confirmations for alerts)
  5. Final summary with timeline
  Must save baseline to .dev/canary/{timestamp}-baseline.md
  Must save report to .dev/canary/{timestamp}-report.md
  Must NOT: modify code, restart services, apply hotfixes, investigate bugs
---

# /canary

Post-deployment real-time monitoring with baseline comparison and health scoring.

## Iron Law

```
OBSERVATION ONLY.
No code changes. No service restarts. No hotfixes. No debugging.
Canary watches. It does not act.
```

**If the deployment is broken, report it and suggest `/investigate` or `/bugfix`. Do NOT start fixing.**

## When to Use (Differentiator)

| Skill | Purpose | Pick when |
|-------|---------|-----------|
| **/canary** | Post-deploy monitoring with health scoring | Just deployed, want to verify stability |
| /investigate | Root cause debugging | Found a bug, need to understand why |
| /bugfix | Quick fix for known issue | Know the root cause, need to fix |

## Arguments

```
/canary <URL>                    # Monitor specific URL
/canary --baseline               # Capture baseline only (before deploy)
/canary --duration 5m            # Monitor for 5 minutes (default: 3m)
/canary --interval 30            # Check every 30 seconds (default: 60s)
```

## Workflow

```
Phase 0: Setup (parse args, detect tools)
    ↓
Phase 1: Baseline (capture or load existing)
    ↓
Phase 2: Monitoring Loop
    ↓  repeat at interval until duration expires
    ↓  each cycle: check → compare → score → flag/alert
    ↓
Phase 3: Final Report
```

## Phase 0: Setup

1. Parse arguments (URL, duration, interval)
2. **Input validation:** If duration < interval (or duration <= 0), clamp to interval (minimum 1 cycle guaranteed). The validate_prompt requires "at least 1 monitoring cycle."
3. If no URL provided, ask user
4. Check tool availability:
   - **chromux available?** → Full mode (screenshots + console + performance)
   - **chromux unavailable?** → HTTP-only mode (curl: status code + response time + body check)
4. Create `.dev/canary/` directory if needed
5. Check for existing baseline

```
Tool detection:
  chromux available → FULL MODE (screenshots, console, performance)
  chromux unavailable → HTTP-ONLY MODE (curl-based, no screenshots)
```

## Phase 1: Baseline Capture

If `--baseline` flag or no existing baseline:

**FULL MODE (chromux):**
```bash
# Navigate and capture
chromux goto <URL>
chromux screenshot baseline.png
chromux console                    # capture console errors
chromux js "JSON.stringify(performance.timing)"  # performance metrics
```

**HTTP-ONLY MODE (curl):**
```bash
curl -s -o /dev/null -w '{"status":%{http_code},"time":%{time_total},"size":%{size_download}}' <URL>
```

Save baseline to `.dev/canary/{timestamp}-baseline.md`:
```markdown
# Canary Baseline
- URL: <url>
- Timestamp: <iso8601>
- Mode: FULL / HTTP-ONLY
- HTTP Status: 200
- Response Time: 0.234s
- Console Errors: 0
- Screenshot: baseline.png (FULL mode only)
```

**If `--baseline` flag:** Stop after capturing. Do not proceed to monitoring.

## Phase 2: Monitoring Loop

Repeat every `interval` seconds until `duration` expires:

### Each Cycle:

**Step 1: Capture current state** (same metrics as baseline)

**Step 2: Compare against baseline** (change-based, NOT absolute)

**Step 3: Calculate Health Score** (read `references/health-score-calc.md`)
- Start at 100, subtract per issue found
- Score = max(0, 100 - total_deductions)

**Step 4: Determine status**
- HEALTHY (80-100)
- DEGRADED (40-79)
- BROKEN (0-39)

**Step 5: Apply Transient Tolerance (4-state machine)**
```
FLAG    → first detection, record internally, do NOT alert
ALERT   → same anomaly in NEXT cycle, report to user (fires ONCE)
ACTIVE  → same anomaly persists after ALERT, NO repeated alert (deduplicated)
CLEAR   → anomaly disappears, reset state
```

State transitions:
- New anomaly → FLAG
- FLAG + same anomaly next cycle → ALERT (user notified)
- ALERT + same anomaly persists → ACTIVE (no new alert, cycle result line only)
- ACTIVE + same anomaly persists → ACTIVE (still no alert)
- Any state + anomaly disappears → CLEAR
- ACTIVE/CLEAR + NEW different anomaly → FLAG (restart for new anomaly)

**Alert deduplication rule:** Once an anomaly is ALERTed, it transitions to ACTIVE. No repeated alerts for the same anomaly. A new ALERT only fires if a *different* anomaly appears or severity worsens (e.g., DEGRADED → BROKEN).

**No exceptions to transient tolerance:**
- Not "but it's a 500 error" → still wait for 2nd confirmation
- Not "but it looks really bad" → still wait
- Only exception: if user explicitly asked for immediate alerts

**Step 6: Report cycle result**
```
Cycle 3/5: HEALTHY (95/100) | Status: 200 | Time: 0.245s (+5%) | Flags: 0
```

### Early Exit Conditions:
- BROKEN for 2 consecutive cycles → alert user immediately, continue monitoring
- User interrupts → proceed to Phase 3

## Phase 3: Final Report

Save to `.dev/canary/{timestamp}-report.md`:

```markdown
# Canary Monitoring Report

## Summary
- URL: <url>
- Duration: 3m (5 cycles at 60s interval)
- Mode: FULL / HTTP-ONLY
- Final Status: HEALTHY / DEGRADED / BROKEN
- Final Score: XX/100

## Timeline

| Cycle | Time | Status | Score | HTTP | Response Time | Alerts |
|-------|------|--------|-------|------|---------------|--------|
| 1 | 14:30:00 | HEALTHY | 100 | 200 | 0.234s | - |
| 2 | 14:31:00 | HEALTHY | 95 | 200 | 0.312s | - |
| 3 | 14:32:00 | DEGRADED | 70 | 200 | 1.205s | FLAG: perf -20 |
| 4 | 14:33:00 | DEGRADED | 65 | 200 | 1.150s | ALERT: perf degradation confirmed |
| 5 | 14:34:00 | HEALTHY | 90 | 200 | 0.280s | CLEAR: perf recovered |

## Alerts Fired
- [14:33:00] Performance degradation: response time 1.15s (baseline 0.234s, +392%)

## Baseline vs Final
| Metric | Baseline | Final | Change |
|--------|----------|-------|--------|
| HTTP Status | 200 | 200 | - |
| Response Time | 0.234s | 0.280s | +20% |
| Console Errors | 0 | 0 | - |

## Verdict
HEALTHY — Minor transient performance spike in cycles 3-4, recovered by cycle 5.
No action needed.
```

Present summary to user:
```
🟢 HEALTHY (90/100) after 5 cycles
  - 1 transient perf spike (recovered)
  - 0 confirmed alerts
  Report: .dev/canary/{timestamp}-report.md
```

Or if issues found:
```
🟡 DEGRADED (65/100) after 5 cycles
  - 2 confirmed alerts: perf degradation, new console error
  - Suggest: /investigate for root cause analysis
  Report: .dev/canary/{timestamp}-report.md
```

## Red Flags — STOP and Re-read Iron Law

- About to edit a source file → STOP (canary watches, it does not act)
- About to run `/investigate` or `/bugfix` → STOP (report and suggest, don't do)
- About to skip transient tolerance → STOP (wait for 2nd confirmation)
- About to alert on absolute values without baseline comparison → STOP (compare against baseline)
- About to continue past duration without user request → STOP (respect duration limit)

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "프로덕션이 죽었으니 바로 고쳐야 합니다" | Canary reports. User decides to fix. Suggest /bugfix. |
| "500이면 당연히 바로 알려야죠" | Transient tolerance. 2회 연속 확인 후 알림. |
| "baseline 없어도 절대값으로 판단할 수 있잖아요" | 첫 체크를 baseline으로 사용. 비교 기준 없이 판단 금지. |
| "빠르게 한 번만 확인하면 됩니다" | 그건 canary가 아니라 ad-hoc check. 최소 1회 baseline + 1회 체크. |
| "문제를 발견했으니 바로 조사하겠습니다" | Canary의 scope는 모니터링. 조사는 /investigate로. |
| "모니터링 시간이 너무 길어요" | duration 파라미터를 조정. 기본 3분은 최소 기준. |
