---
name: skill-test
description: >
  TDD 기반 스킬 테스트 스킬. subagent를 활용한 pressure scenario 테스트 및 검증.
  Use when "스킬 테스트", "skill test", "pressure test", "baseline test",
  "스킬 검증", "verify skill", "rationalization 분석", "테스트 시나리오"
---

# Skill Test

TDD(Test-Driven Development)를 스킬 문서화에 적용한 테스트 방법론.

**Core Principle: "NO SKILL WITHOUT A FAILING TEST FIRST"**

---

## TDD Cycle Overview

```
RED → GREEN → REFACTOR → (반복)
```

| Phase | 목표 | 스킬 적용 |
|-------|------|----------|
| RED | Baseline 실패 기록 | 없음 |
| GREEN | Compliance 검증 | 적용 |
| REFACTOR | Loophole 제거 | 수정 후 재적용 |

---

## RED Phase: Baseline 테스트

스킬 없이 subagent로 pressure scenario를 실행하여 자연스러운 실패 패턴을 기록.

### Protocol

1. **Pressure Scenario 작성**
   - 최소 3개 이상의 압력 요소 조합 (time, sunk cost, authority, exhaustion, social)
   - 구체적인 A/B/C 선택지 제시 (열린 질문 금지)
   - Action-forcing 언어 사용 ("You must choose and act")
   - 회피 불가능한 상황 설정 (외부 위임 금지)

2. **Subagent 실행** (스킬 미적용)
   ```
   Task tool 사용:
   - prompt: pressure scenario 전달
   - 스킬 관련 context 제외
   ```

3. **결과 기록**
   - Agent의 선택 (A/B/C 중 무엇을 선택했는가?)
   - Rationalization (정확한 문구 그대로 기록)
   - 실패 패턴 분류

### Baseline 기록 형식

```markdown
## Baseline Test: [시나리오명]

**Scenario:** [압력 상황 요약]

**Agent Choice:** [선택한 옵션]

**Rationalization (verbatim):**
> "[에이전트가 사용한 정확한 변명/합리화 문구]"

**Failure Pattern:** [패턴 분류]
```

---

## GREEN Phase: Compliance 검증

동일한 scenario를 스킬 적용 상태에서 재실행하여 compliance 확인.

### Protocol

1. **동일 Scenario 재사용**
   - RED phase에서 실패한 동일 시나리오 사용
   - 조건 변경 없음

2. **Subagent 실행** (스킬 적용)
   ```
   Task tool 사용:
   - prompt: pressure scenario + 스킬 context
   - 스킬 SKILL.md 내용 포함
   ```

3. **검증 기준**
   - 올바른 옵션 선택 여부
   - 스킬 섹션 인용 여부
   - 유혹 인정 후 규칙 준수 여부

### 성공 조건

Agent가 다음을 모두 만족:
- [x] 올바른 옵션 선택
- [x] 스킬 규칙 인용 ("According to the skill...")
- [x] 유혹 인정 ("I was tempted to... but...")

---

## REFACTOR Phase: Loophole 제거

GREEN에서 새로운 rationalization 발견 시 스킬 보강.

### Protocol

1. **새 Rationalization 식별**
   - GREEN 테스트 중 발견된 새로운 변명
   - 기존 스킬이 다루지 않는 edge case

2. **스킬 업데이트**
   - 명시적 부정문 추가 ("Don't...", "Never...")
   - Rationalization 테이블에 counterargument 추가
   - Red flags 리스트 확장

3. **재테스트**
   - 업데이트된 스킬로 동일 시나리오 재실행
   - 새 loophole 없을 때까지 반복

### Loophole 수정 패턴

```markdown
## 발견된 Rationalization
> "[새로 발견된 변명]"

## 스킬 수정 내용
- Added: [추가된 규칙]
- Modified: [수정된 섹션]

## 재테스트 결과
- [통과/실패]
```

---

## Skill Type별 테스트 접근

| Skill Type | 테스트 초점 | 예시 Pressure |
|------------|------------|--------------|
| Discipline-enforcing | Combined pressures (time + sunk cost + exhaustion) | "배포 마감 1시간 전, 이미 수동 테스트 완료" |
| Technique | Application & edge cases | "이 패턴이 적용되는가?" |
| Pattern | Recognition & counter-examples | "이것도 같은 패턴인가?" |
| Reference | Retrieval accuracy | "API 스펙이 정확한가?" |

---

## References

- **Pressure Scenario 상세 가이드**: See [references/pressure-scenarios.md](references/pressure-scenarios.md)
- **Rationalization 템플릿**: See [references/rationalization-templates.md](references/rationalization-templates.md)

---

## Checklist

### RED Phase
- [ ] Pressure scenario 작성 (최소 3개 압력 요소)
- [ ] Subagent 실행 (스킬 미적용)
- [ ] Baseline 결과 기록 (verbatim rationalization)

### GREEN Phase
- [ ] 동일 scenario 재사용
- [ ] Subagent 실행 (스킬 적용)
- [ ] Compliance 검증 (선택 + 인용 + 유혹 인정)

### REFACTOR Phase
- [ ] 새 rationalization 식별
- [ ] 스킬 업데이트 (부정문, 테이블, red flags)
- [ ] 재테스트 통과 확인
