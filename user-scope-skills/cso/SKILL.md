---
name: cso
description: |
  Use when performing security audits, vulnerability scanning, or threat modeling.
  Two modes: Daily (zero-noise quick scan) and Comprehensive (monthly deep audit).
  Observation only — no code changes, no exploitation.
  Triggers: "/cso", "security audit", "보안 점검", "보안 감사",
  "취약점 분석", "threat model", "OWASP check", "security scan",
  "시크릿 검사", "dependency audit", "의존성 감사"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Agent
  - Write
  - AskUserQuestion
validate_prompt: |
  Must produce a Security Audit Report with:
  1. Mode tag (DAILY/COMPREHENSIVE) with confidence threshold applied
  2. Findings table (Severity, Category, Location, Description, Confidence)
  3. OWASP Top 10 coverage matrix (all 10 categories checked)
  4. False-positive filter log (which filters applied, what excluded)
  5. Trend comparison (if previous audit in .dev/security/)
  Must save report to .dev/security/{date}-{mode}.md
  Must NOT: modify code, suggest inline fixes, exploit vulnerabilities
---

# /cso

Systematic security audit with OWASP Top 10 coverage, STRIDE threat modeling, and false-positive filtering.

## Iron Law

```
OBSERVATION ONLY.
No code changes. No exploitation. No inline fix suggestions.
Every finding requires: file:line + pattern match + confidence score.
```

**Violating the letter of this rule IS violating the spirit.**

## When to Use (Differentiator)

| Skill | Purpose | Pick when |
|-------|---------|-----------|
| **/cso** | Systematic security audit with structured report | Need comprehensive or quick security check |
| /check | Pre-push rule validation | Verifying changes against project rules |
| /investigate | Root cause debugging | Debugging a specific bug |

## Two Modes

**Daily (default):** Zero-noise scan. Only findings with confidence >= 8/10. Fast, focused.
**Comprehensive:** Monthly deep scan. Findings with confidence >= 2/10. Includes STRIDE. Thorough.

Select mode:
- Explicit request for "comprehensive", "deep", "full", "전체", "월간" → COMPREHENSIVE
- Everything else → DAILY

## Workflow

```
Phase 0: Project Detection
    ↓
Phase 1: Parallel Scan (5 categories)
    ↓
Phase 2: STRIDE Threat Model (COMPREHENSIVE only)
    ↓
Phase 3: False-Positive Filtering
    ↓
Phase 4: Confidence Gating
    ↓
Phase 5: Trend Comparison
    ↓
Phase 6: Report
```

## Phase 0: Project Detection

Detect project type to scope the audit:
- Language (Python/JS/Go/etc)
- Framework (FastAPI/Express/etc)
- Package manager (pip/npm/etc)
- Check `.dev/security/` for previous audit reports

## Phase 1: Parallel Scan (5 agents)

Launch 5 agents concurrently, each with a specific focus:

**Agent 1: Secrets Scanner**
- Hardcoded API keys, tokens, passwords in source
- `.env` files committed to git
- Secrets in git history (`git log -p --all -S 'password'`)
- Private keys in repo

**Agent 2: Dependency Auditor**
- Run `pip-audit` / `npm audit` / `go vuln check` (whichever applies)
- Check for known CVEs
- Flag end-of-life dependencies
- Check lockfile integrity

**Agent 3: OWASP Code Patterns**
- Read `references/owasp-top10-checklist.md`
- Check all 10 categories systematically
- Injection, XSS, CSRF, auth bypass, SSRF patterns
- Each finding must cite specific file:line

**Agent 4: Infrastructure Scanner**
- Dockerfile security (running as root, secrets in build args)
- CI/CD pipeline configs (GitHub Actions, Cloud Build)
- Cloud IAM / service account permissions
- LLM/AI security (prompt injection, unvalidated LLM output)

**Agent 5: Configuration Auditor**
- CORS settings
- CSP headers
- Error message information disclosure
- Debug mode in production
- Cookie flags (httponly, secure, samesite)

Each agent returns findings in this format:
```
| Severity | Category | Location | Description | Confidence |
|----------|----------|----------|-------------|------------|
| CRITICAL | A02 | constant.py:3 | Hardcoded webhook URL with token | 9/10 |
```

## Phase 2: STRIDE Threat Model (COMPREHENSIVE only)

Synthesize Phase 1 results through STRIDE framework:
- **S**poofing: Can identities be faked?
- **T**ampering: Can data be modified in transit/at rest?
- **R**epudiation: Can actions be denied?
- **I**nformation Disclosure: Can sensitive data leak?
- **D**enial of Service: Can service be disrupted?
- **E**levation of Privilege: Can permissions be escalated?

## Phase 3: False-Positive Filtering

Read `references/false-positive-filters.md`. Apply all 17 filters to each finding.

For each finding, check:
1. Is it in a test/mock/fixture path? → Filter 1
2. Is it in documentation/examples? → Filter 2
3. Is it a known-safe pattern (Google Chat webhook = URL-based auth)? → Filter 13
4. Is it a public identifier (GitHub App ID)? → Filter 14
...

**Log every filter application:**
```
| Finding | Filter Applied | Action |
|---------|---------------|--------|
| constant.py:3 webhook URL | #13 Internal-Only Webhook | Confidence 9→4 |
| constant.py:7 GITHUB_APP_ID | #14 Public GitHub App ID | EXCLUDED |
```

## Phase 4: Confidence Gating

- **DAILY mode:** Only findings with confidence >= 8/10 survive
- **COMPREHENSIVE mode:** Findings with confidence >= 2/10 survive

Excluded findings are logged but not shown in the main report.

## Phase 5: Trend Comparison

If previous audit exists in `.dev/security/`:
- Read the most recent report
- Categorize each current finding as:
  - **NEW:** Not in previous report
  - **PERSISTENT:** Also in previous report
  - **RESOLVED:** In previous report but not current

If no previous audit: skip this phase, note "First audit — no trend data."

## Phase 6: Report

Save to `.dev/security/{YYYY-MM-DD}-{daily|comprehensive}.md`:

```markdown
# Security Audit Report

## Meta
- Mode: DAILY / COMPREHENSIVE
- Date: {date}
- Project: {project name}
- Confidence threshold: {8 or 2}/10

## Summary
- Total findings (pre-filter): X
- After false-positive filter: Y
- After confidence gate: Z
- Severity breakdown: X CRITICAL, Y HIGH, Z MEDIUM, W LOW

## Findings

| # | Severity | OWASP | Location | Description | Confidence | Status |
|---|----------|-------|----------|-------------|------------|--------|
| 1 | HIGH | A01 | main.py:104 | No webhook signature verification | 9/10 | NEW |

## OWASP Top 10 Coverage Matrix

| Category | Checked | Findings | Notes |
|----------|---------|----------|-------|
| A01 Broken Access Control | Y | 2 | ... |
| A02 Cryptographic Failures | Y | 1 | ... |
| ... | | | |

## False-Positive Filter Log

| Finding | Filter | Action |
|---------|--------|--------|
| ... | ... | ... |

## Trend (vs previous audit)
- NEW: X findings
- PERSISTENT: Y findings
- RESOLVED: Z findings
```

## Red Flags — STOP and Re-read Iron Law

- About to suggest a code fix → STOP (observation only)
- About to modify a source file → STOP
- Reporting a finding without file:line evidence → STOP (add evidence first)
- Reporting without confidence score → STOP (add score)
- Skipping OWASP categories → STOP (all 10 must be checked)

## Rationalization Table

| Excuse | Reality |
|--------|---------|
| "이건 바로 고칠 수 있으니 수정하겠습니다" | Observation only. Report it, don't fix it. |
| "당연히 CRITICAL이죠" | Every finding needs a confidence score. No defaults. |
| "테스트 파일의 시크릿도 위험합니다" | Apply false-positive filters. Test fixtures are Filter #1. |
| "OWASP A03~A10은 해당 없습니다" | "해당 없음" is a valid result, but you MUST check each one and explain why. |
| "빠른 체크라서 일부만 보면 됩니다" | Daily mode reduces noise via confidence gate, not by skipping categories. |
| "Webhook URL이 노출되면 위험합니다" | Apply Filter #13. Google Chat webhooks use URL-based auth — assess actual risk. |
| "App ID가 노출되면 위험합니다" | Apply Filter #14. GitHub App ID is public. Only private key is secret. |
