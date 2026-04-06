# Ambiguity Scoring 루브릭

deep-interview의 자가평가 시스템. 매 라운드 후 Claude가 직접 채점한다.

---

## 목표 임계값

**Ambiguity Score ≤ 0.2** → 인터뷰 종료 가능
(Ouroboros와 동일. 0.0 = 완전 명확, 1.0 = 완전 모호)

---

## 채점 공식

```
Ambiguity Score = 1.0 - (Goal × weight + Constraint × weight + Success × weight)
```

각 항목을 0.0(불명확) ~ 1.0(완전 명확)으로 평가 후 가중 평균.

---

## Greenfield (새 프로젝트, 기본값)

| 항목 | 가중치 | 평가 기준 |
|------|--------|----------|
| Goal Clarity | 40% | 무엇을 만드는지, 왜 만드는지 명확한가 |
| Constraint Clarity | 30% | 기술, 시간, 범위 제약이 명확한가 |
| Success Criteria | 30% | 완료 판단 기준이 체크 가능한가 |

---

## Brownfield (기존 코드베이스에 추가/수정)

| 항목 | 가중치 | 평가 기준 |
|------|--------|----------|
| Goal Clarity | 35% | 무엇을 만드는지, 왜 만드는지 명확한가 |
| Constraint Clarity | 25% | 기술, 시간, 범위 제약이 명확한가 |
| Success Criteria | 25% | 완료 판단 기준이 체크 가능한가 |
| Context Clarity | 15% | 기존 코드와의 관계, 영향 범위가 명확한가 |

---

## 매 라운드 후 출력 형식

```
📊 Ambiguity Check — Round N
  Goal Clarity:        0.XX  (×40%)
  Constraint Clarity:  0.XX  (×30%)
  Success Criteria:    0.XX  (×30%)
  ─────────────────────────────────
  Ambiguity Score:     0.XX  [목표: ≤ 0.2]
  Status: 🔴 계속 필요 / 🟡 거의 도달 / 🟢 종료 가능

  가장 약한 영역: [항목명] — [구체적 이유]

📋 DECIDE_LATER 목록:
  - [항목 1]
  - [항목 2]
```

---

## DECIDE_LATER 처리 규칙

- DECIDE_LATER로 마킹된 항목은 **점수 감점 없음** (의도적 보류)
- 단, DECIDE_LATER 항목이 너무 많으면 Constraint Clarity에 반영
- 최종 Close 단계에서 별도 목록으로 출력

---

## 채점 가이드

### Goal Clarity 높은 경우 (0.8+)
- "무엇을" + "왜"가 모두 1문장으로 설명 가능
- 사용자/고객이 누구인지 명확
- 성공과 실패를 구별하는 기준이 있음

### Goal Clarity 낮은 경우 (0.3 이하)
- "그냥 만들고 싶어" 수준의 모호한 목표
- 여러 가능한 해석이 존재
- 왜 지금 필요한지 불명확

### Constraint Clarity 높은 경우 (0.8+)
- 기술 스택 결정됨
- 범위 명확 (무엇이 IN, 무엇이 OUT)
- 시간/리소스 제약 알려짐
- **헤지 언어 경고:** "probably", "아마도", "생각에는" 등 불확실한 표현이 있으면 해당 제약은 확정된 것이 아님 → 점수 낮게 반영

### Goal Clarity 중간 범위 (0.4-0.7) 채점 주의사항
- **일관성 ≠ 완전성:** 답변들이 논리적으로 연결되어 있어도 "왜"가 없으면 0.6 이하
- "human oversight", "개선하고 싶어" 같은 방향성만 있고 결과물이 불명확하면 0.5-0.6
- "무엇을" + "왜"가 둘 다 1문장으로 설명 가능할 때만 0.7 이상

### Success Criteria 높은 경우 (0.8+)
- "이것이 되면 완료" 체크리스트 존재
- 측정 가능한 기준 (수치, 동작, 상태)
- 엣지케이스 처리 방식 결정됨

### Success Criteria 낮은 경우 (0.3 이하)
- "이해할 수 있어야 한다", "잘 작동해야 한다" — 품질 목표이지 완료 기준이 아님
- 성공 기준이 전혀 언급 안 됐으면 → **0.1 이하로 채점. 추론으로 채우지 말 것**
