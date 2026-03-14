# Rationalization Templates

Agent의 rationalization(합리화/변명)을 체계적으로 기록하고 대응하기 위한 템플릿.

---

## Rationalization 기록 형식

### 단일 기록

```markdown
## Rationalization: [식별자]

**Verbatim Quote:**
> "[에이전트가 사용한 정확한 문구]"

**Context:** [어떤 상황에서 발생했는가]

**Underlying Assumption:** [숨겨진 가정]

**Counterargument:** [반박 논리]

**Skill Update Required:** [스킬에 추가할 내용]
```

### 예시

```markdown
## Rationalization: R001

**Verbatim Quote:**
> "I already manually tested the payment flow twice, so writing automated tests would be redundant."

**Context:** 긴급 버그 수정 시 테스트 생략 정당화

**Underlying Assumption:** 수동 테스트가 자동 테스트를 대체할 수 있다

**Counterargument:**
- 수동 테스트는 재현 불가능
- 회귀 테스트에서 동일 확인 불가
- "Tested" ≠ "Has tests"

**Skill Update Required:**
- Add: "Manual testing does NOT replace automated tests"
- Add to Red Flags: "I already tested it manually"
```

---

## Rationalization 분류 테이블

스킬별로 수집된 rationalization을 분류하여 관리.

### 테이블 템플릿

```markdown
| ID | Rationalization | Category | Counterargument | Status |
|----|-----------------|----------|-----------------|--------|
| R001 | "Too simple to test" | Effort-minimizing | Simple code breaks; testing takes 30 seconds | Addressed |
| R002 | "I manually verified it" | False equivalence | Manual ≠ Automated | Addressed |
| R003 | "Deadline pressure" | External blame | Deadline doesn't change correctness | Pending |
```

### Category 분류

| Category | 설명 | 예시 |
|----------|------|------|
| **Effort-minimizing** | 노력 최소화 | "Too simple", "Not worth it" |
| **False equivalence** | 잘못된 동치 | "Same as...", "Equivalent to..." |
| **External blame** | 외부 책임 전가 | "They said...", "Deadline..." |
| **Pragmatism appeal** | 실용주의 호소 | "Being practical", "Real world..." |
| **Authority appeal** | 권위 호소 | "Senior said...", "Best practice is..." |
| **Exception claim** | 예외 주장 | "This case is special", "Just this once" |

---

## Red Flags 리스트 템플릿

스킬에 포함할 자기 점검용 red flags 리스트.

```markdown
## Red Flags

다음 생각이 들면 규칙 위반 가능성 높음:

- [ ] "이건 너무 간단해서..."
- [ ] "이미 수동으로 확인했으니..."
- [ ] "이번 한 번만..."
- [ ] "시간이 없어서..."
- [ ] "실용적으로 생각하면..."
- [ ] "다른 사람들도 이렇게 하니까..."
- [ ] "나중에 하면 되니까..."
```

---

## Counterargument 매핑 테이블

자주 사용되는 rationalization과 대응 논리.

| Rationalization | Reality Check |
|-----------------|---------------|
| "Too simple to need tests" | Simple code breaks. Testing takes 30 seconds. |
| "I already tested manually" | Manual testing is not reproducible. |
| "Deadline is too tight" | Deadline doesn't change code correctness. |
| "Being pragmatic, not dogmatic" | Rules exist because violations hurt. |
| "Just this one exception" | Exceptions become patterns. |
| "Will add tests later" | Later never comes. Technical debt compounds. |
| "The framework handles this" | Framework bugs exist. Verify assumptions. |
| "It works on my machine" | Production environment differs. |

---

## Baseline Report 템플릿

RED phase 완료 후 작성하는 종합 보고서.

```markdown
# Baseline Report: [스킬명]

## Test Summary

| Metric | Value |
|--------|-------|
| Scenarios tested | [N] |
| Failures observed | [N] |
| Unique rationalizations | [N] |

## Scenarios

### Scenario 1: [제목]
- **Pressures:** [적용된 압력들]
- **Agent Choice:** [선택한 옵션]
- **Expected:** [기대했던 옵션]
- **Result:** FAIL / PASS

### Scenario 2: ...

## Collected Rationalizations

| ID | Quote | Frequency |
|----|-------|-----------|
| R001 | "..." | 3/5 scenarios |
| R002 | "..." | 2/5 scenarios |

## Skill Requirements

Based on failures, the skill must address:
1. [필요한 규칙 1]
2. [필요한 규칙 2]
3. [필요한 규칙 3]

## Red Flags to Include

- [ ] [Red flag 1]
- [ ] [Red flag 2]
```

---

## Verification Report 템플릿

GREEN phase 완료 후 작성하는 검증 보고서.

```markdown
# Verification Report: [스킬명]

## Test Summary

| Metric | Value |
|--------|-------|
| Scenarios re-tested | [N] |
| Compliance achieved | [N]/[N] |
| New rationalizations | [N] |

## Results

### Scenario 1: [제목]
- **With Skill:** [선택한 옵션]
- **Expected:** [기대 옵션]
- **Skill Citation:** [인용 여부 Y/N]
- **Temptation Acknowledged:** [Y/N]
- **Result:** PASS / FAIL

## New Rationalizations (if any)

| ID | Quote | Addressed in Skill? |
|----|-------|---------------------|
| R003 | "..." | No → REFACTOR needed |

## Conclusion

- [ ] All scenarios pass
- [ ] No new rationalizations
- [ ] Ready for deployment

OR

- [ ] REFACTOR required for: [목록]
```
