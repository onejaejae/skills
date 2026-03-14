---
name: spec-pipeline
description: >
  3단계 기획 파이프라인을 순차 실행한다: spec-interview → spec-generator → spec-reviewer.
  전체 파이프라인을 한 번에 돌리거나, 특정 단계부터 시작할 수 있다.
  Triggers: "기획 파이프라인", "spec pipeline", "기획 전체 프로세스",
  "요구사항부터 리뷰까지", "spec 전체", "기획서 처음부터"
allowed-tools: "AskUserQuestion, Write, Read, Glob, Grep, Skill"
---

# Spec Pipeline

3개 스킬을 순차 실행하는 오케스트레이터. 각 단계의 산출물이 다음 단계의 입력이 된다.

```text
spec-interview → specs/{slug}-requirements.md
     ↓
spec-generator → specs/{slug}-spec.md
     ↓
spec-reviewer  → specs/{slug}-review.md (PASS/FAIL)
```

## When to Use

- 기능 아이디어를 처음부터 개발 Ready까지 한 번에 진행하고 싶을 때
- "이 기능 기획서 만들어줘"처럼 전체 프로세스가 필요할 때

**Do NOT use when:**
- 이미 요구사항이 정리되어 있음 → `/spec-generator`부터 시작
- 이미 기획서가 있고 리뷰만 필요 → `/spec-reviewer`만 실행
- 개발 스펙이 필요 → `/interview` 사용

## CRITICAL: 하위 스킬 호출 시 턴 분리 규칙

**Skill tool로 하위 스킬을 로드한 직후 같은 턴에서 AskUserQuestion을 호출하지 마세요.**

하위 스킬(spec-interview, spec-generator, spec-reviewer)은 각자 로드 직후 준비 단계를 완료하고 텍스트를 출력한 뒤 STOP합니다. 이 동작이 각 스킬의 CRITICAL 규칙에 명시되어 있습니다.

**오케스트레이터로서 올바른 흐름:**
1. Skill tool로 하위 스킬을 로드한다
2. 하위 스킬이 준비 완료 텍스트를 출력하고 STOP한다
3. 사용자가 응답한다
4. 하위 스킬이 다음 턴에서 AskUserQuestion을 포함한 본 작업을 수행한다
5. 하위 스킬이 산출물을 생성하고 완료된다
6. spec-pipeline이 다음 Stage로 전환 안내를 출력한다

**금지 패턴:**
- Skill tool 호출과 같은 응답 안에서 AskUserQuestion을 호출하는 것
- 하위 스킬의 STOP을 우회하도록 "빨리 진행해줘"를 덧붙이는 것

## Protocol

### Stage 0: 시작점 결정

사용자의 input을 분석하여 시작점을 결정한다:

인자가 있으면 파싱한다:
- `from:interview` 또는 `from:1` → Stage 1부터
- `from:generator` 또는 `from:2` → Stage 2부터
- `from:reviewer` 또는 `from:3` → Stage 3부터
- 인자 없음 → 아래 우선순위로 자동 판단

**시작점 결정 우선순위** (위에서 아래로 평가, 첫 매칭 적용):

| 우선순위 | 조건 | 시작점 |
|---------|------|--------|
| 1 | 사용자가 `from:*`으로 명시 지정 | 해당 단계 |
| 2 | `specs/{slug}-spec.md` 존재 | Stage 3 (spec-reviewer) |
| 3 | `specs/{slug}-requirements.md` 존재 | Stage 2 (spec-generator) |
| 4 | 그 외 (Input 없음 또는 모호한 아이디어) | Stage 1 (spec-interview) |

> **주의**: requirements.md와 spec.md가 동시에 존재하면 우선순위 2가 매칭되어 Stage 3(reviewer)부터 시작한다. 이미 작성된 spec을 다시 생성하지 않는다.

시작점을 사용자에게 알린다:
"[Stage N]부터 시작합니다. 전체 파이프라인: interview → generator → reviewer"

### Stage 1: spec-interview

Skill tool로 `spec-interview`를 실행한다.

**완료 조건**: `specs/{slug}-requirements.md` 파일이 생성됨.

**Stage 1 → 2 전환 안내**:
"요구사항이 정리되었습니다. 이어서 기획서를 생성하겠습니다."

### Stage 2: spec-generator

Skill tool로 `spec-generator`를 실행한다.
- Stage 1에서 생성된 requirements 파일을 자동으로 입력으로 사용

**완료 조건**: `specs/{slug}-spec.md` 파일이 생성됨.

**Stage 2 → 3 전환 안내**:
"기획서가 작성되었습니다. 이어서 개발 Ready 검증을 진행하겠습니다."

### Stage 3: spec-reviewer

Skill tool로 `spec-reviewer`를 실행한다.
- Stage 2에서 생성된 spec 파일을 자동으로 입력으로 사용

**완료 조건**: `specs/{slug}-review.md` 파일이 생성되고 PASS/FAIL 판정이 내려짐.

### Stage 4: 최종 안내

**PASS인 경우:**
```text
파이프라인 완료!

산출물:
- 요구사항: specs/{slug}-requirements.md
- 기획서:   specs/{slug}-spec.md
- 리뷰:     specs/{slug}-review.md → PASS

개발 Ready입니다. `/interview`로 개발 스펙을 작성하면 됩니다.
```

**FAIL인 경우:**
```text
파이프라인 완료 (리뷰 FAIL)

산출물:
- 요구사항: specs/{slug}-requirements.md
- 기획서:   specs/{slug}-spec.md
- 리뷰:     specs/{slug}-review.md → FAIL (Critical N개)

Critical 항목을 해소한 후:
- 기획서 수정 → `/spec-generator`로 재생성
- 리뷰 재실행 → `/spec-reviewer`
```

## 단계 간 데이터 흐름

| 흐름 | 전달 데이터 | 메커니즘 |
|------|------------|----------|
| interview → generator | 요구사항 + 미결 사항 | `specs/{slug}-requirements.md` 파일 |
| generator → reviewer | 기획서 + [추정] 마크 | `specs/{slug}-spec.md` 파일 |
| reviewer → 사용자 | PASS/FAIL + 질문 목록 | `specs/{slug}-review.md` 파일 |

**slug 일관성**: 파이프라인 전체에서 동일한 slug를 사용한다. Stage 1부터 시작하면 interview에서 결정된 slug를 사용하고, Stage 2/3부터 시작하면 기존 파일명에서 추출한다 (예: `specs/notification-requirements.md` → slug = `notification`).

## 중단과 재개

- 사용자가 중간에 중단하면, 이미 생성된 산출물은 유지된다
- 다음 세션에서 `/spec-pipeline`을 다시 실행하면, Stage 0에서 기존 산출물을 감지하여 이어서 진행한다
- 사용자가 "처음부터"라고 하면 Stage 1부터 재시작한다

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| 3개 스킬을 동시에 실행 | **순차 실행** — 이전 단계 완료 후 다음 진행 |
| 단계 전환 시 사용자 안내 없이 진행 | 각 전환점에서 진행 상황 안내 |
| slug가 단계마다 달라짐 | Stage 1의 slug를 전체 파이프라인에서 유지 |
| FAIL 후 자동으로 재시작 | 사용자에게 선택지 제공 (수정 후 재실행 or 종료) |
| Skill tool 호출 후 같은 턴에서 AskUserQuestion 호출 | 하위 스킬이 STOP할 때까지 기다린 후 다음 턴에서 진행 |

## Red Flags — STOP and Reassess

- Stage 1 없이 Stage 2를 시작하려는데 requirements 파일이 없음
- Stage 2 없이 Stage 3을 시작하려는데 spec 파일이 없음
- 각 스킬의 Red Flag 조건이 발생 (각 SKILL.md 참조)
- 사용자가 파이프라인 중간에 다른 기능으로 전환
