---
name: skill-forge
description: |
  Unified orchestrator for creating high-quality Claude Code skills through iterative
  test-score-improve loops. Chains define → research/clarify → plan → create → test → score → improve
  in a single pipeline with multi-model evaluation and automatic improvement targeting.
  Use whenever creating a new skill or significantly rewriting an existing one and you want
  maximum quality — not just a draft, but a tested, scored, and iteratively improved skill.
  "/skill-forge", "스킬 포지", "forge a skill", "스킬 만들어줘 제대로",
  "고품질 스킬", "skill forge", "스킬 제대로 만들자", "하네스로 스킬 만들자"
---

# skill-forge

Unified skill creation pipeline. Takes a skill idea through define → research → plan → create → test → score → improve → package, iterating on the test-score-improve loop until quality threshold is met.

```
Phase 0: DEFINE ─── 목적 + 복잡도 판단
    ↓
Phase 1: RESEARCH/CLARIFY ─── (복잡한 경우만)
    ↓
Phase 2: PLAN ─── 스킬 설계서 + eval 케이스 정의
    ↓
Phase 3: CREATE ─── SKILL.md 초안 + evals.json
    ↓
┌─ Phase 4: TEST ─── baseline vs with-skill 비교   ─┐
│  Phase 5: SCORE ── 4축 루브릭 (25% × 4)           │ ← max N회
│  Phase 6: IMPROVE ── 최약점 집중 개선              │
└────────────────────────────────────────────────────┘
    ↓
Phase 7: PACKAGE ─── 최종 산출물
```

---

## When to Use

| Skill | Purpose | When |
|-------|---------|------|
| **/skill-forge** | 전체 파이프라인 — 고품질 스킬 생산 | 새 스킬을 처음부터 체계적으로 만들 때 |
| /skill-creator | 스킬 생성 + eval 루프 | 빠르게 draft → test → improve 할 때 |
| /writing-skills | TDD 방법론 참고 | 기존 스킬의 방어력 강화할 때 |
| /rulph | 루브릭 기반 개선 루프 | 이미 있는 산출물을 점수 기반으로 개선할 때 |

## Cost Estimate

| Component | Per Iteration | Max (5 iterations) |
|-----------|--------------|---------------------|
| Test runs (with/without × eval cases) | ~4 LLM calls | ~20 |
| Multi-model scoring (Codex+Gemini+Claude) | 3 LLM calls | 15 |
| Improvement worker | 1 LLM call | 5 |
| **Total** | **~8 calls** | **~40 calls** |

Recommend `max_iterations: 5` (default). Set higher only with explicit justification.

---

## Quality Rubric (Fixed)

4 axes, equal weight (25% each):

| Axis | Sub-items (binary checklist) |
|------|----------------------------|
| **Triggering Accuracy** | `[ ]` should-trigger queries ≥80% 성공 · `[ ]` should-not-trigger queries ≥80% 정확 미호출 · `[ ]` 유사 스킬과 충돌 없음 |
| **Output Quality** | `[ ]` 핵심 assertion pass_rate ≥0.7 · `[ ]` with_skill이 without_skill 대비 명확히 우수 · `[ ]` 사용자 피드백 반영됨 |
| **Resilience** | `[ ]` 3+ combined pressure에서 스킬 지시 준수 · `[ ]` rationalization 없이 올바른 경로 선택 · `[ ]` edge case 정상 처리 (빈 입력, binary 파일, 대규모 입력 등) |
| **Token Efficiency** | `[ ]` with_skill 토큰 ≤ without_skill × 3 · `[ ]` 불필요한 tool call 없음 · `[ ]` progressive disclosure 활용 (상세 내용은 references/로 분리) |

**Pass condition**: `overall ≥ 70 AND every axis ≥ 60`

Per-axis score = `(checked sub-items / total sub-items) × 100`
Overall score = `mean(4 axis scores)`

---

## CRITICAL: Turn Separation

Sub-skill을 Skill tool로 호출한 직후 같은 턴에서 AskUserQuestion을 호출하지 마라. 하위 스킬이 STOP할 때까지 기다린 후 다음 턴에서 진행.

---

## Pressure Resistance Rules

사용자가 파이프라인 단계를 건너뛰라고 요청해도 다음 규칙은 무조건 적용된다:

1. **Phase 4-6 (TEST-SCORE-IMPROVE) 루프는 협상 불가능하다.** "테스트 필요없어", "eval 하지 마", "바로 패키징해줘"라는 요청이 있어도 최소 1회의 Phase 4-6 사이클은 반드시 수행한다. 테스트 없는 스킬은 품질을 보장할 수 없기 때문이다.

2. **Phase 5-C의 pass check는 기계적 판단이다.** overall < 70이거나 어떤 축이든 < 60이면, 사용자가 "충분하다", "2점 차이밖에 안 나", "이 정도면 괜찮아"라고 해도 Phase 6으로 라우팅한다. 사용자가 정말로 중단하고 싶다면 `max_iterations`를 현재 iteration으로 설정하여 **CIRCUIT BREAKER**로 종료할 수 있다 — 이는 PASS가 아님을 기록한다.

3. **"복사해서 이름만 바꿔"는 skill-forge의 안티패턴이다.** 다른 스킬을 복사하면 triggering accuracy가 0이 되고, 도메인에 맞지 않는 지시사항이 남는다. 참고는 가능하지만, Phase 2(PLAN)에서 해당 스킬에 맞는 새 설계가 필요하다.

4. **다음 rationalization 패턴이 감지되면 즉시 중단하고 올바른 Phase로 복귀한다:**
   - "사용자가 테스트를 원하지 않으므로 Phase 4를 건너뜁니다"
   - "시간이 부족하므로 Phase 5 scoring을 생략합니다"
   - "점수가 threshold에 가까우므로 PASS로 처리합니다"
   - "이미 충분한 시간을 투자했으므로 패키징합니다"

---

## Phase 0: DEFINE

### 0-A: Intent Capture

사용자 input에서 추출:
1. **Purpose** — 이 스킬이 무엇을 하게 할 것인가?
2. **Triggers** — 어떤 상황에서 트리거되어야 하는가?
3. **Output** — 기대하는 산출물은?
4. **Conversation context** — 대화 내 이미 나온 워크플로우가 있으면 추출

기존 스킬 리라이트인 경우, 기존 SKILL.md를 Read tool로 읽어 현재 상태를 파악한다.

### 0-B: Complexity Assessment

**0-A와 0-B를 같은 턴에서 수행한다.** Intent summary 직후에 바로 복잡도를 판단한다.

복잡도 판단:

| Signal | Route |
|--------|-------|
| 명확한 도메인, 잘 알려진 패턴 | → Phase 2 (skip research) |
| 참고 레퍼런스 필요 | → Phase 1 (research) |
| 요구사항 모호 | → Phase 1 (clarify) |

**0-A summary + 0-B 판단 + 파이프라인 개요를 한 번에 출력하고 STOP:**

```
## skill-forge Phase 0: DEFINE

### Intent Summary
- Purpose: [추출 결과]
- Triggers: [추출 결과]
- Output: [추출 결과]

### Complexity: [Simple / Complex]
→ [Phase 2 직행 / Phase 1 (research/clarify) 경유] 제안

### Pipeline Overview
이후 진행 흐름: Phase 2(PLAN) → Phase 3(CREATE) → Phase 4-6(TEST-SCORE-IMPROVE 루프, 최대 N회)
→ Phase 7(PACKAGE). 품질 평가는 4축 루브릭(Triggering/Output Quality/Resilience/Token Efficiency,
각 25%)으로 측정하며, overall ≥70 AND 각 축 ≥60 달성 시 통과합니다.
```

AskUserQuestion으로 routing 확인:
> "위 정리가 맞는지 확인해주세요. [Simple/Complex]로 판단했고, [Phase N]부터 시작할까요?"

---

## Phase 1: RESEARCH/CLARIFY (Optional)

필요에 따라 적절한 sub-skill을 Skill tool로 호출한다. **사용할 sub-skill 이름을 사용자에게 명시적으로 안내한 후 호출**:

| Need | Sub-skill | Output |
|------|-----------|--------|
| 구현 패턴/레퍼런스 필요 | `/reference-seek` | 참고 코드 리포트 |
| 도메인 깊은 조사 필요 | `/deep-research` | 리서치 리포트 |
| 요구사항 명확화 필요 | `/clarify:vague` | 구체화된 요구사항 |

안내 형식: "리서치가 필요하므로 `/reference-seek`을 실행하겠습니다."

Sub-skill 완료 후 결과를 Phase 2에 전달.

---

## Phase 2: PLAN

스킬 설계서를 작성한다. AskUserQuestion으로 사용자 승인을 받을 때까지 수정.

### 설계서 포함 사항

1. **스킬 구조**
   - 디렉토리 구성 (SKILL.md, references/, scripts/)
   - Progressive disclosure 전략 (metadata → body → references)

2. **Eval Cases** (최소 3개)
   - Realistic user prompts (구체적이고 상세한 — 파일 경로, 개인 context 포함)
   - Expected output descriptions
   - 최소 1개의 pressure scenario (3+ combined pressures)

3. **Trigger Eval Queries** (최소 16개)
   - 8+ should-trigger (다양한 표현, casual/formal mix)
   - 8+ should-not-trigger (near-miss — 키워드는 겹치지만 다른 스킬이 적합한 케이스)

4. **축별 Pass 조건** — 4축 루브릭의 구체적 기준을 이 스킬에 맞게 커스터마이즈

설계서가 승인되면 Phase 3으로 진행.

---

## Phase 3: CREATE

### 3-A: Write SKILL.md

**REQUIRED BACKGROUND**: `/skill-creator`의 Skill Writing Guide 섹션 참조.

핵심 원칙:
- description은 "when to use" 형태, 약간 pushy하게 (undertriggering 방지)
- 본문 500줄 이내, 상세 내용은 references/로 분리 (progressive disclosure)
- **200줄 초과 예상 시, references/ 분리를 먼저 설계한다** — bash 명령어 상세, 스키마 정의, 긴 예시는 references/로 이동 계획을 세운 뒤 SKILL.md를 작성. Phase 6에서 뒤늦게 분리하는 것보다 처음부터 분리하는 것이 효율적.
- why를 설명 — ALWAYS/NEVER 대신 이유를 전달
- 예시 포함 — Input/Output 형태
- edge case 명시 — binary 파일, 빈 입력, 대규모 입력 등의 처리 규칙 포함

### 3-B: Create Workspace

```
<skill-name>-workspace/
├── evals/
│   ├── evals.json          # eval cases
│   └── trigger-eval.json   # trigger eval queries
└── iteration-1/            # (Phase 4에서 생성)
```

evals.json과 trigger-eval.json을 Phase 2 설계서 기반으로 작성.

### 3-C: User Review

SKILL.md 초안 + eval cases를 사용자에게 제시. 승인 후 Phase 4 루프 진입.

---

## Phase 4: TEST

**REQUIRED BACKGROUND**: `/writing-skills`의 RED-GREEN-REFACTOR 방법론 참조.

### 4-A: Spawn All Runs (Single Message)

RED(baseline)와 GREEN(with-skill)을 **동시에** 실행:

```
# 모든 eval case에 대해 동시 실행
Agent(description="baseline eval-1", run_in_background=true,
      prompt="Task: <prompt>\nNO skill loaded. Save to: <workspace>/iteration-N/eval-1/without_skill/outputs/")

Agent(description="with-skill eval-1", run_in_background=true,
      prompt="Skill path: <path>\nTask: <prompt>\nSave to: <workspace>/iteration-N/eval-1/with_skill/outputs/")

# eval-2, eval-3도 동일하게...
```

### 4-B: Draft Assertions (While Runs In Progress)

Runs이 돌아가는 동안 assertions를 작성/검토. grading.json의 expectations 필드에 `text`, `passed`, `evidence` 사용.

### 4-C: Grade & Aggregate

Runs 완료 후:
1. **Grade** — `agents/grader.md` 참조하여 각 assertion 평가 → grading.json
2. **Aggregate** — `python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>`
3. **Viewer** — `python <skill-creator-path>/eval-viewer/generate_review.py <workspace>/iteration-N --skill-name <name> --benchmark <workspace>/iteration-N/benchmark.json`

Iteration 2+에서는 `--previous-workspace` 추가.

### 4-D: Pressure Test (Resilience Axis)

writing-skills의 pressure scenario 방법론으로 테스트:
- 3+ pressures 조합 (time + sunk cost + authority 등)
- 구체적인 A/B/C 선택 강제
- 실제 파일 경로와 제약 조건 사용
- Rationalization을 verbatim으로 기록

### 4-E: User Review

Eval viewer를 열고 사용자에게 알림:
> "결과를 브라우저에서 확인할 수 있습니다. Outputs 탭에서 각 케이스를 확인하고, Benchmark 탭에서 수치를 확인하세요. 완료되면 알려주세요."

사용자가 완료하면 feedback.json을 읽는다.

---

## Phase 5: SCORE

### 5-A: Collect Measurements

| Axis | Source | How |
|------|--------|-----|
| Triggering Accuracy | trigger-eval.json | `python -m scripts.run_eval --eval-set trigger-eval.json --skill-path <path>` |
| Output Quality | benchmark.json + feedback.json | pass_rate + 사용자 피드백 종합 |
| Resilience | Phase 4-D 결과 | pressure scenario pass/fail |
| Token Efficiency | benchmark.json | with_skill vs without_skill 토큰 비교 |

### 5-B: Multi-Model Scoring

rulph Phase 2 패턴 적용 — 3 evaluators를 **한 message에서 동시 launch** (run_in_background=true):

각 evaluator에게 전달:
- 현재 SKILL.md 전문
- 4축 루브릭 sub-items
- Phase 4 측정 데이터 (benchmark.json, pressure test 결과)
- Required output: JSON `{"scores": {"triggering": N, "output": N, "resilience": N, "tokens": N}, "suggestions": {...}}`

**Score isolation**: 이전 라운드 점수/히스토리 전달 금지. 현재 상태만 전달.

CLI availability check:
```bash
command -v codex && command -v gemini
```

**Codex 실행 방식**: 프롬프트를 파일에 저장 후 stdin으로 전달 (heredoc 직접 전달 시 대용량 프롬프트에서 timeout 발생):
```bash
cat /tmp/eval-prompt.txt | codex exec --skip-git-repo-check -
```

**Gemini 실행 방식**: `-p` 플래그로 직접 전달:
```bash
gemini -p "$(cat /tmp/eval-prompt.txt)"
```

Degradation: 3 models → full / 2 → reduced / 1 → low / 0 → self-eval.

### 5-C: Aggregate & Pass Check

```
overall = mean(triggering, output, resilience, tokens)
below_floor = [axis for axis in scores if axis < 60]

if overall >= 70 AND len(below_floor) == 0:
  → Phase 7 (PASSED)
if iteration > max_iterations:
  → Phase 7 (CIRCUIT BREAKER)
else:
  → Phase 6 (target = lowest axis, floor violations first)
```

Display:
```
Iteration [N] Score: XX/100
  Triggering: XX | Output: XX | Resilience: XX | Tokens: XX
  Threshold: 70 · Floor: 60
  Status: [PASS → Phase 7 / CONTINUE → targeting [weakest axis]]
```

---

## Phase 6: IMPROVE

### 6-A: Target Selection

Floor violations first, then lowest score. Tie-break: leftmost in rubric order.

### 6-B: Improvement Strategy

| Target Axis | Action |
|-------------|--------|
| **Triggering** | description 재작성 (CSO 최적화). `run_loop.py` 실행으로 자동 최적화 |
| **Output Quality** | SKILL.md 지시사항 보강. grading failures 패턴 분석 → 구체적 개선 |
| **Resilience** | 방어 구문 추가. 실패한 scenario의 rationalization 패턴을 차단하는 명시적 규칙 추가 |
| **Token Efficiency** | 불필요한 지시 제거. progressive disclosure 강화 (references/로 이동). 중복 tool call 제거 |

### 6-C: Apply & Re-verify

1. SKILL.md에 개선 적용
2. **Phase 5 re-scoring 1회 수행** — 개선 효과를 검증한다. 추정 점수가 아닌 실제 측정값으로 확인:
   - target axis 점수가 올랐는지 확인
   - **다른 축이 10pt 이상 하락했는지 확인** — 하락 발견 시 해당 개선을 rollback하고 다른 접근법으로 재시도. 한 축을 올리면서 다른 축을 깎는 것은 허용하지 않는다.
3. State update: `iteration += 1`
4. → Pass check 재수행: PASS면 Phase 7, FAIL이면 Phase 4로 복귀 (새 iteration-N+1/ 디렉토리)

### Stagnation Detection

| Pattern | Condition | Response |
|---------|-----------|----------|
| **Regression (overall)** | overall 하락 | 이전 SKILL.md로 rollback, 다른 접근 시도 |
| **Regression (per-axis)** | 어떤 축이든 10pt+ 하락 (overall이 올랐더라도) | 해당 개선을 rollback, target axis를 해치지 않는 다른 접근 시도 |
| **Plateau** | 2회 연속 ±2pt | 전략 변경 — 다른 축 타겟 or 근본적 재구성 |
| **Oscillation** | 3회 이상 특정 축 진동 | 축 간 coupling 분석, 동시 개선 시도 |

---

## Phase 7: PACKAGE

### 7-A: Final Report

```markdown
## Skill Forge Report: [name]

### Score History
| Iteration | Overall | Triggering | Output | Resilience | Tokens | Target |
|-----------|---------|------------|--------|------------|--------|--------|
| 1         | XX      | XX         | XX     | XX         | XX     | [axis] |
| ...       |         |            |        |            |        |        |
| N         | XX      | XX         | XX     | XX         | XX     | PASS   |

### Improvement Log
- Iteration 1→2: [what changed] → [effect on scores]
- ...

### Result: [PASSED at iteration N / CIRCUIT BREAKER at iteration N]
```

Save to `<workspace>/forge-report.md`.

### 7-B: Forge Registry (Layer 1 — 매 forge 필수)

매 forge 완료 시 registry에 기록한다. 이 데이터가 하네스 시스템 자체의 개선 기반이 된다.

```bash
mkdir -p ~/.claude/skills/skill-forge-workspace/registry
```

`registry/forge-log.jsonl`에 한 줄 append:
```json
{"skill": "<name>", "date": "<YYYY-MM-DD>", "type": "new|rewrite", "complexity": "simple|complex", "iterations": N, "final_scores": {"triggering": N, "output": N, "resilience": N, "tokens": N}, "bottleneck_axis": "<axis>", "key_fix": "<one-line description>"}
```

### 7-C: Cross-Forge Retrospective (Layer 2 — 매 3번째 forge 후)

forge-log.jsonl 누적이 3의 배수에 도달하면, 자동으로 패턴 분석을 수행:

1. forge-log.jsonl을 읽고 분석:
   - 가장 빈번한 bottleneck 축
   - 평균 iteration 수
   - complexity 판단 정확도 (simple인데 iteration이 많았던 케이스)
   - 가장 효과적이었던 개선 패턴

2. `registry/patterns.md`에 발견된 패턴 기록

3. **3회 이상 반복된 패턴만** skill-forge SKILL.md에 반영 (과적합 방지)

### 7-D: Package (Optional)

```bash
python -m scripts.package_skill <skill-directory>
```

### 7-E: Description Optimization (Optional)

Triggering score가 threshold 미만이면 추가 최적화:
```bash
python -m scripts.run_loop --eval-set trigger-eval.json --skill-path <path> --max-iterations 5
```

---

## Session State

hoyeon-cli로 루프 상태 관리:

```bash
SESSION_ID="$CLAUDE_SESSION_ID"
hoyeon-cli session set --sid "$SESSION_ID" --json "$(cat <<'EOF'
{"skill-forge": {
  "phase": "test",
  "iteration": 1,
  "max_iterations": 5,
  "skill_name": "<name>",
  "scores": [],
  "status": "active"
}}
EOF
)"
```

Phase 5에서 매 iteration마다 scores 배열에 추가. Phase 7에서 `status: "completed"`.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Phase 3에서 완벽한 스킬 작성 시도 | 초안은 빠르게 → 개선은 루프에서 |
| Pressure test 생략 | Resilience 축 점수가 0이 됨 — 반드시 포함 |
| eval query가 너무 단순/추상적 | 구체적이고 현실적인 프롬프트 사용 (파일 경로, 배경 context 포함) |
| 매 iteration 전체 재테스트 | 변경된 축 관련 eval 중심으로 재실행 가능 |
| Stagnation 무시하고 반복 | Plateau/Regression 감지 시 전략 변경 필수 |
| Phase 1 필요한데 건너뜀 | 도메인 지식 부족 → 결국 Phase 4에서 낮은 점수로 귀결 |
| Sub-skill 호출 후 같은 턴에서 AskUserQuestion | Turn separation rule 위반 → UI 렌더링 실패 |
