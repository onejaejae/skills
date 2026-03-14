# skill-test

TDD 기반 스킬 테스트 - subagent를 활용한 pressure scenario 테스트 및 검증

## 설치

```bash
/plugin install skill-test@ai-registry
```

## 사용법

### 트리거

- "스킬 테스트", "skill test"
- "pressure test", "baseline test"
- "스킬 검증", "verify skill"
- "rationalization 분석"

### TDD Cycle

```
RED → GREEN → REFACTOR → (반복)
```

| Phase | 목표 | 스킬 적용 |
|-------|------|----------|
| RED | Baseline 실패 기록 | 없음 |
| GREEN | Compliance 검증 | 적용 |
| REFACTOR | Loophole 제거 | 수정 후 재적용 |

### 핵심 원칙

**"NO SKILL WITHOUT A FAILING TEST FIRST"**

### References

- `references/pressure-scenarios.md` - Pressure Scenario 작성 가이드
- `references/rationalization-templates.md` - Rationalization 템플릿

## 버전

- Current: 1.0.0
- [CHANGELOG](./CHANGELOG.md)
