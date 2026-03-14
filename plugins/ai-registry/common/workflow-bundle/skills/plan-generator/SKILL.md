---
name: plan-generator
description: >
  Use when a Task Definition is ready and implementation planning is needed.
  Trigger: plan generation, implementation planning, create plan from task definition,
  구현 계획, 플랜 생성.
---

# Plan Generator

Task Definition을 바탕으로 구현 계획을 수립합니다. 각 Step은 1 커밋 단위이며, 모든 수용 기준이 Plan에 매핑됩니다.

## Overview

Step 분해 순서는 고정된 유형별 템플릿이 아니라, **Task의 의존성 그래프에 따라 자연스럽게** 결정된다.

---

## 입력

대화 컨텍스트에서 Task Definition 문서를 받는다. Task Definition은 다음 항목을 포함한다:

- 유형, 요약, 목표, 범위
- 수용 기준 (AC-1, AC-2, ...)
- 영향 받는 파일 (파일 경로, 작업 유형, 설명)
- 의존성

---

## 참조 Skills

- `[api-conventions]`: API 설계 패턴, URL 컨벤션, 상태 코드, 응답 형식
- `[code-standards]`: 파일 구조, 네이밍, 테스트 패턴, 커밋 컨벤션

---

## 처리 흐름

### Step 1: Task Definition 파싱

Task Definition에서 추출:
- 영향 받는 파일 목록 (생성/수정 구분)
- 수용 기준 목록 (AC-N 식별자)
- 의존성 관계

### Step 2: 기존 코드 심층 분석

Task Definition의 영향 파일을 기반으로:
- **기존 파일**: Read로 현재 구현 확인 (클래스 구조, 메서드 시그니처, import 관계)
- **신규 파일**: 동일 계층의 기존 파일을 Read하여 패턴 파악
  - 예: 새 Controller 작성 시 기존 Controller 파일에서 라우터 등록, DI 패턴 확인
- **연관 설정 파일**: 변경 시 함께 수정이 필요한 파일 확인
  - DI 등록 파일 (`containers.py`)
  - 라우터 등록 파일 (`main.py`)
  - 공통 유틸리티/상수 파일

### Step 3: 구현 단계 분해

**원칙:**
- **각 Step = 1 커밋** (atomic, independently verifiable)
- **의존성 순서**: 의존 대상을 먼저 구현 (예: Repository가 Model에 의존하면 Model 먼저)
- **구현 코드만 포함**: 테스트 코드는 Plan에 포함하지 않는다. 테스트는 워크플로우 Phase 4에서 `/test` 커맨드가 전담한다.
- `[api-conventions]`, `[code-standards]` 참조하여 구현 상세 결정

### Step 4: 수용 기준 매핑

각 Step에 관련 AC-N을 매핑한다.

**자체 검증**: 출력 전 모든 AC가 최소 1개 Step에 커버되는지 확인. 누락이 있으면 Step을 추가한다.
단, 테스트 전용 AC는 Phase 4 `/test` 위임 Step으로 매핑할 수 있다.

### Step 5: 커밋 메시지 생성

CLAUDE.md 커밋 컨벤션(Conventional Commits) 적용:
- 형식: `타입(적용범위): 설명 #버전태그`
- 예: `feat(research): add favorites API #minor`
- task_id는 Phase 2 브랜치 생성 시 확정되므로, Plan 단계에서는 커밋 메시지에 포함하지 않는다
- Phase 3 개발 시 브랜치명에서 task_id를 추출하여 커밋 메시지에 반영한다

---

## 출력 형식

```markdown
## 구현 계획

### Step 1: [작업명]
- **파일**: [생성/수정할 파일 경로]
- **내용**: [구현 내용 요약]
- **커밋**: `타입(적용범위): 설명 #버전태그`
- **수용 기준**: AC-1, AC-2

### Step 2: [작업명]
- **파일**: [파일 경로]
- **내용**: [구현 내용]
- **커밋**: `타입(적용범위): 설명 #버전태그`
- **수용 기준**: AC-3
```

---

## 자체 검증 체크리스트 (형식 검증)

출력 전 아래 형식 항목을 점검한다. 통과하지 못하면 Plan을 수정한 후 출력한다.

- [ ] 모든 Step에 필수 필드(파일, 내용, 커밋, 수용 기준)가 포함되었는가?
- [ ] 모든 AC가 최소 1개 Step의 수용 기준에 매핑되었는가? (테스트 전용 AC는 Phase 4 위임 Step 허용)
- [ ] 출력 형식의 마크다운 구조가 올바른가?
- [ ] 파일 경로가 프로젝트 구조(`src/controllers/`, `src/services/` 등)와 일치하는가?
- [ ] **테스트 파일(`tests/`)이 Plan Step에 포함되어 있지 않은가?** (테스트는 Phase 4에서 `/test` 커맨드가 전담)

> **참고**: 논리적 검증(AC 매핑 완전성, 의존성 순서, 패턴 일관성 등)은 [plan-reviewer] agent가 담당합니다.

---

## 주의사항

- Step 분해 시 **과도한 세분화를 피한다**. 하나의 논리적 변경이 하나의 커밋이 되어야 한다.
- 커밋 메시지의 버전태그(`#patch`, `#minor`, `#major`)는 `[code-standards]`를 따른다.
- Plan은 사용자에게 보여준 후 [plan-reviewer] agent가 검증한다. 완벽할 필요는 없지만 구조는 갖추어야 한다.
