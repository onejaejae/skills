---
name: create-skill
description: >
  스킬 생성-테스트-개선 통합 워크플로우.
  Use when "/create-skill", "스킬 만들어줘", "create a skill", "새 스킬 생성"
allowed_tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
---

# /create-skill [skill-description]

스킬 생성 → 테스트 → 개선의 TDD 기반 개발 사이클.

## Workflow

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

---

## Phase 0: Scope 선택

AskUserQuestion을 사용하여 스킬 저장 위치 선택:

| Scope | 경로 | 용도 |
|-------|------|------|
| project | `./.claude/skills/` | 현재 프로젝트 전용 스킬 |
| user | `~/.claude/skills/` | 모든 프로젝트에서 사용 |

**완료 조건**: Scope 선택됨 (project 또는 user)

---

## Phase 1: 스킬 생성

`skill-creator` 스킬을 실행하여 SKILL.md 생성.

선택된 scope에 따라 `--path` 옵션 지정:
- project: `--path ./.claude/skills/{skill-name}`
- user: `--path ~/.claude/skills/{skill-name}`

**완료 조건**: SKILL.md 생성됨

---

## Phase 2: Baseline 테스트 (RED)

`skill-test` 스킬의 **RED Phase** 실행.

**완료 조건**: Baseline report 작성됨

---

## Phase 3: Compliance 검증 (GREEN)

`skill-test` 스킬의 **GREEN Phase** 실행.

**완료 조건**: Verification report 작성됨

---

## Phase 4: 결과 리뷰

테스트 결과 요약 출력 후 AskUserQuestion:
- "개선하시겠습니까?"

---

## Phase 5: 개선 (REFACTOR)

**조건**: 사용자가 "예" 선택 시

`skill-test` 스킬의 **REFACTOR Phase** 참조하여 스킬 수정.

→ Phase 2로 돌아가 반복
