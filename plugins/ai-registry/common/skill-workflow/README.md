# skill-workflow

스킬 생성-테스트-개선 통합 워크플로우

## 설치

```bash
/plugin install skill-workflow@ai-registry
```

## 사용법

### 명령어

```bash
/create-skill [skill-description]
```

### 트리거

- "/create-skill", "스킬 만들어줘"
- "create a skill", "새 스킬 생성"

### 워크플로우

```
Phase 0: Scope 선택 (project vs user)
    ↓
Phase 1: 스킬 생성 (skill-creator)
    ↓
Phase 2: Baseline 테스트 (skill-test RED)
    ↓
Phase 3: Compliance 검증 (skill-test GREEN)
    ↓
Phase 4: 결과 리뷰 & 사용자 확인
    ↓
[개선 필요?]
    ├── Yes → Phase 5: 개선 (REFACTOR) → Phase 2로
    └── No  → 완료
```

### Scope 선택

| Scope | 경로 | 용도 |
|-------|------|------|
| project | `./.claude/skills/` | 현재 프로젝트 전용 스킬 |
| user | `~/.claude/skills/` | 모든 프로젝트에서 사용 |

### 번들된 스킬

- `skill-creator` - 스킬 생성 가이드
- `skill-test` - TDD 기반 테스트

## 버전

- Current: 1.1.0
- [CHANGELOG](./CHANGELOG.md)
