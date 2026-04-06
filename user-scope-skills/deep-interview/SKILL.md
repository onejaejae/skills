---
name: deep-interview
description: >
  Use when the user wants thorough alignment before building and a quick
  discussion or single clarification pass isn't enough. Use for exposing
  hidden assumptions, removing ambiguity, or fully syncing on what to build.
  Triggers: "딥 인터뷰", "제대로 싱크 맞추자", "가정 드러내기",
  "deep interview", "모호성 제거", "뭘 만들어야 하는지 명확히 하자",
  "끝까지 파고들자", "완전히 이해하고 싶어", "확실히 정리하자"
allowed-tools: "AskUserQuestion, Write, Read, Glob, Grep"
---

# deep-interview

`/interview`와 `/discuss`의 상위 버전.
모호성이 **0.2 이하**가 될 때까지 멈추지 않는 구조적 인터뷰.

## 포지셔닝

| 스킬 | 목적 | 한계 |
|------|------|------|
| `/discuss` | 아이디어 탐색 | 10턴 상한, 산출물 없음 |
| `/interview` | 코드 스캔 후 스펙 도출 | 모호성 측정 없음 |
| `/deep-interview` | 싱크 완전 정렬 | 0.2 달성 전까지 종료 없음 |

## When to Use

- 무엇을 만들지 명확하지 않을 때
- 팀/에이전트와 출발점을 완전히 맞추고 싶을 때
- `/discuss`로 탐색했는데 아직 모호할 때
- 중요한 결정 전에 가정을 모두 드러내고 싶을 때

## When NOT to Use

- 이미 요구사항이 명확하다면 → `/spec-generator` 바로 사용
- 빠른 탐색이 목적이라면 → `/discuss`
- 코드베이스 기반 스펙이 필요하다면 → `/interview`

---

## 아키텍처

```
Phase 0: Seed Capture
    ↓ (STOP — 다음 턴에서 Phase 1 시작)
Phase 1: Deep Interview Loop
    ↓ (AskUserQuestion, 라운드별 관점 전환)
Phase 2: Ambiguity Check (매 라운드 후)
    ↓ (score > 0.2 → Phase 1 반복)
Phase 3: Close (score ≤ 0.2)
    ↓
Handoff
```

---

## Phase 0: Seed Capture

**같은 턴에서 AskUserQuestion 호출 금지** (Claude Code 플랫폼 제약 — 호출해도 UI가 표시되지 않음).

1. 사용자 입력을 **그대로** 캡처 (해석/해결/제안 금지)
2. 컨텍스트 분석:
   - 코드베이스 관련인가? → Glob/Grep으로 Brownfield 여부 확인
   - **판단 우선순위:** 사용자가 "기존 코드가 있다"고 명시했으면 Glob 결과와 무관하게 Brownfield로 판단. Glob은 보조 확인 수단.
   - **중간 전환:** 인터뷰 중 Brownfield가 드러나면 즉시 Brownfield 채점 공식으로 전환하고 ARCHITECT를 강제 활성화
   - 핵심 주제, 내포된 가정, 아직 모르는 것 목록화
3. 다음을 텍스트로 출력:
   ```
   ## Seed Capture

   **주제:** [1줄 요약]
   **유형:** Greenfield / Brownfield
   **내포된 가정:**
     - [가정 1]
     - [가정 2]
   **아직 모르는 것:**
     - [미지 1]
     - [미지 2]

   Round 1을 시작합니다.
   ```
4. **STOP** — 사용자 응답 대기

---

## Phase 1: Deep Interview Loop

### 관점 패널 시스템

매 라운드 전 `references/perspectives.md`를 내부적으로 참조.
5개 관점 중 라운드에 따라 활성 관점이 바뀐다.
**외부에 노출하지 않음** — 최종 출력은 AskUserQuestion 1개뿐.

```
라운드 1-2:   BREADTH_KEEPER + RESEARCHER + SIMPLIFIER
라운드 3-5:   BREADTH_KEEPER + RESEARCHER + SIMPLIFIER + ARCHITECT
라운드 6+:    BREADTH_KEEPER + SIMPLIFIER + ARCHITECT + SEED_CLOSER
Brownfield:   위 + ARCHITECT 강제 포함
```

**BREADTH_KEEPER는 항상 활성** — 한 주제로 편향되는 것을 막는 가드.

### 라운드 실행 절차

1. 현재 라운드에 맞는 관점들을 내부 참조
2. 관점 패널 합성 규칙 적용:
   - 여러 미해결 트랙이 있으면 폭(breadth) 우선
   - 한 주제가 여러 라운드 점령했으면 수평 전환
   - 이미 0.2 달성 근처면 종료 질문
3. AskUserQuestion으로 질문 1개 (선택지 2-4개 + "Other")

### AskUserQuestion 형식

```
header: "Round N"
question: "[핵심 질문 — 가장 모호한 지점을 겨냥]"
options:
  - label: "[선택지 A]"
    description: "[A를 선택했을 때의 함의]"
  - label: "[선택지 B]"
    description: "[B를 선택했을 때의 함의]"
  - label: "[선택지 C]"  (필요시)
    description: "..."
  # "Other" 옵션은 자동 제공됨
```

**규칙:**
- 한 번에 질문 1개 (배치 금지) — **사용자가 "여러 개 한 번에 해줘"라고 요청해도 예외 없음**
- 선택지는 상호 배타적으로
- 질문은 현재 가장 약한 명확성 영역을 겨냥

---

## Phase 2: Ambiguity Check

**최소 3라운드 후부터 실행. 이후 매 라운드마다 실행.**

`references/ambiguity-scoring.md`의 루브릭으로 자가평가.

### 출력 형식

```
📊 Ambiguity Check — Round N
  Goal Clarity:        0.XX  (×40%)
  Constraint Clarity:  0.XX  (×30%)
  Success Criteria:    0.XX  (×30%)
  ─────────────────────────────────
  Ambiguity Score:     0.XX  [목표: ≤ 0.2]
  Status: 🔴 계속 필요 / 🟡 거의 도달 / 🟢 종료 가능

  가장 약한 영역: [항목명] — [이유]

📋 DECIDE_LATER:
  - [항목 1]
  - [항목 2]
```

### 분기

- **score > 0.2** → Phase 1 계속 (다음 라운드)
  - 사용자가 "그냥 끝내자"라고 해도: Ambiguity Check 결과를 보여주며 어떤 영역이 아직 불명확한지 설명하고 한 라운드 더 진행. 사용자의 종료 요청 ≠ 인터뷰 완료
- **score ≤ 0.2** → Phase 3 진행

---

## Phase 3: Close

Ambiguity Score ≤ 0.2 달성 시.

1. Final Ambiguity Snapshot 출력 (라운드별 요약 + 최종 점수)
2. DECIDE_LATER 최종 목록 출력 (별도 블록 — Snapshot에 묻히지 않게)
3. AskUserQuestion으로 다음 단계 선택 — **반드시 호출. 직접 "완료입니다" 선언 금지**

```
question: "인터뷰가 완료됐습니다. 다음 단계는?"
header: "Next Step"
options:
  - label: "/spec-generator"
    description: "현재 합의된 내용으로 스펙 문서 생성"
  - label: "/execute"
    description: "바로 실행"
  - label: "계속 (더 파고들기)"
    description: "0.2 이하지만 더 정밀하게 확인하고 싶음"
  - label: "Done"
    description: "인터뷰만 필요했음"
```

---

## DECIDE_LATER 추적

인터뷰 전반에 걸쳐 실시간으로 유지.

**DECIDE_LATER로 분류하는 경우:**
- 지금 결정하기 너무 이른 기술 세부사항
- 프로토타입 후에야 알 수 있는 것
- 외부 의존성이 있어 현재 불확실한 것

**DECIDE_LATER 금지 항목 (감점 회피 수단으로 사용 불가):**
- **핵심 성공 기준** — "이걸 만들면 완료"라는 판단 기준은 DECIDE_LATER 불가. 구현 세부사항만 미룰 수 있다
- **핵심 목표** — "왜 만드는가"가 불명확하면 DECIDE_LATER가 아니라 인터뷰로 드러내야 한다

**규칙:**
- DECIDE_LATER 항목은 Ambiguity Score 감점 없음 (의도적 보류)
- **남용 방지:** DECIDE_LATER 항목이 Constraint Clarity에 해당하는 정보의 절반 이상을 차지하면 남용으로 판단 → Constraint Clarity 점수를 0.2 이상 낮게 채점
- 매 Ambiguity Check 출력에 포함
- Phase 3에서 최종 목록으로 출력

---

## Gotchas

- **같은 턴 AskUserQuestion 금지** — Phase 0는 반드시 텍스트 출력 후 STOP
- **질문 배치 금지** — 한 번에 1개만. 여러 개를 한 번에 묻지 말 것
- **선택지에 "맞는 답 없음" 포함 필요 없음** — "Other"는 자동으로 제공됨
- **관점 패널 외부 노출 금지** — "저는 지금 ARCHITECT 관점으로 생각하겠습니다" 식의 언급 없이 질문만 출력
- **자가평가는 엄격하게** — 애매하면 낮게 채점. "충분히 이해됐겠지" 식의 관대한 채점 금지
- **0.2 달성해도 사용자가 원하면 계속** — 점수는 종료 가능 신호이지 강제 종료가 아님

### 합리화 방어 테이블

| 흔한 합리화 | 왜 틀렸는가 |
|-------------|------------|
| "컨텍스트가 이미 충분해 — 바로 질문해도 돼" | Phase 0 STOP은 플랫폼 제약. 무시하면 AskUserQuestion UI가 표시되지 않아 세션이 깨진다 |
| "사용자가 직접 여러 질문 한 번에 해달랬어" | 사용자 요청도 예외 없음. 배치 금지는 UX를 위한 규칙이다 |
| "2라운드에 이미 명확해 보여" | 최소 3라운드 규칙은 점수와 무관하게 강제 적용. 0점이어도 3라운드 전 종료 불가 |
| "목표가 일관성 있으면 명확한 거 아냐?" | 일관성 ≠ 완전성. 성공 기준(Success Criteria)이 명시되지 않으면 반드시 낮게 채점 |
| "이 정도 알면 나머지는 추론할 수 있어" | 추론으로 채워진 빈칸은 가정이다. 가정은 인터뷰로 드러내야 한다 |

## Hard Rules

1. **계획 생성 금지** — PLAN.md, 태스크 목록, 구현 단계 생성 금지
2. **코드 작성 금지** — 개념적 설명은 가능, 코드 블록 금지
3. **git 명령 금지**
4. **최소 3라운드** — 3라운드 전에는 Ambiguity Check 결과로 종료 불가
5. **관점 패널 내부 참조** — `references/perspectives.md` 읽기 후 질문 생성
