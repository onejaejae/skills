---
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, AskUserQuestion, Skill, Agent
argument-hint: [task-description]
description: 전체 개발 워크플로우를 단계별로 진행합니다. 각 Phase마다 사용자 확인을 받습니다.
---

# 통합 개발 워크플로우

전체 개발 파이프라인을 Phase별로 진행합니다. 각 Phase 완료 후 사용자 확인을 받고 다음 단계로 진행합니다.

## 입력된 Task

$ARGUMENTS

---

## Phase 0: Task 분석

### Step 0.0: 요구사항 인터뷰

[interview] skill을 실행하여 raw 요청사항을 구체화합니다.

- 최종 산출물: `specs/{topic}.md` 파일

### Step 0.1: Task Definition 생성

[task-definition-generator] skill에 Step 0.0의 spec 파일 경로(`specs/{topic}.md`)를 인자로 전달하여 Task Definition을 생성합니다.

- 최종 산출물: Task Definition 문서 (영향 파일, 수용 기준, 의존성 포함)

### 사용자 확인 요청

Task Definition을 보여준 후 다음을 출력하세요:

> **Phase 0 Task Definition 완료**
>
> 위 Task Definition이 맞습니까? 수정이 필요하면 말씀해주세요.
> 계속 진행하려면 "진행"이라고 입력하세요.

사용자가 "진행"이라고 하면 Phase 1로 넘어가세요.

---

## Phase 1: Plan 수립 및 검증

### Step 1.1: 구현 계획 생성

[plan-generator] skill을 실행하여 Task Definition 기반 구현 계획을 생성합니다.

- 최종 산출물: 각 Step = 1 커밋 단위, 모든 AC-N이 매핑된 구현 계획

### Step 1.2: 사용자 검토

생성된 구현 계획을 사용자에게 보여주고 검토를 요청합니다.

> **구현 계획이 생성되었습니다.**
>
> [생성된 Plan 내용]
>
> 위 계획을 검토해주세요.
> - "승인": Plan Review를 진행합니다 (Step 1.3)
> - "수정 요청": 수정 사항을 말씀해주세요 (Step 1.1로 돌아감)

**"수정 요청"인 경우:**
사용자의 피드백을 반영하여 Step 1.1로 돌아가 Plan을 재생성합니다.

### Step 1.3: 계획 검증

사용자가 승인한 Plan에 대해 [plan-reviewer] agent를 실행하여 자동 검증합니다.

### 검증 결과에 따른 분기

**APPROVED인 경우:**

> **Phase 1 완료 - Plan 검증 통과!**
>
> 계속 진행하려면 "진행"이라고 입력하세요.

**CHANGES_REQUESTED인 경우:**

> **Plan 수정 필요**
>
> Plan Reviewer가 다음 이슈를 발견했습니다:
> [이슈 요약]
>
> - "수정": 이슈를 반영하여 Plan을 재생성합니다 (Step 1.1로 돌아감)
> - "무시": 이슈를 인지하고 현재 Plan으로 즉시 Phase 2로 진행합니다

**Phase 2 진행 조건:**
- APPROVED → 사용자가 "진행" 입력 시 Phase 2로 이동
- CHANGES_REQUESTED → "수정" 선택 시 Step 1.1로 복귀, "무시" 선택 시 즉시 Phase 2로 이동

---

## Phase 2: Docs 생성 및 브랜치 준비

### Step 2.0: Docs 페이지 생성

**문서화 필요 여부 확인 (먼저 질문):**

사용자에게 다음을 질문합니다:
> 이 Task는 API 문서화가 필요한가요? (Yes/No)
> - Yes: 아래 docs 페이지 생성 절차 실행
> - No: 건너뛰기 (버그 수정, 내부 리팩토링 등)

**Yes인 경우 — docs 페이지 생성:**

[api-documentation] skill (draft 모드)로 docs 페이지 초안을 생성합니다.

1. Task Definition의 요약, 목표, 요구사항을 기반으로 draft 모드 실행
2. 스크립트 실행 결과에서 다음 ID를 저장하세요:
   - `task_id`: Task ID (예: DPT-10309) - **브랜치 생성 및 Phase 7 PR 생성 시 사용**
   - `docs_page_id`: docs 페이지 ID - Phase 6에서 사용
   - `api_row_id`: API Database row ID - Phase 6에서 사용

**Draft 스크립트 실패 시:**

> 스크립트 실행에 실패했습니다.
>
> - "재시도": 환경 설정 확인 후 다시 실행
> - "수동 입력": task_id를 직접 입력합니다. **`skip_documentation = true`로 설정하세요.** (Phase 6 건너뜀)
> - 환경 설정 확인: `.claude/skills/api-documentation/scripts/env.sh`

**No인 경우 — 건너뛰기:**
- 사용자에게 Notion task_id를 요청합니다: "Notion Task ID를 입력하세요 (예: DPT-10309):"
- **`skip_documentation = true`로 기억하세요.** Phase 5, 6에서 분기에 사용됩니다.

### Step 2.1: 브랜치 준비

develop 브랜치를 최신화하고 `task_id`를 사용하여 feature 브랜치를 생성합니다.

CLAUDE.md의 "브랜치 전략" 컨벤션에 따라 브랜치를 생성합니다.

```bash
# 1. develop 최신화
git checkout develop
git pull origin develop

# 2. feature 브랜치 생성 (task_id 사용, CLAUDE.md 브랜치 전략 참조)
git checkout -b [task_id].[type]_[feature-name]
```

### 사용자 확인 요청

브랜치 생성 전 사용자에게 브랜치 타입을 확인하세요.

브랜치 생성 후 다음을 출력하세요:

> **Phase 2 완료**
>
> 브랜치가 준비되었습니다: `[task_id].[type]_[기능명]`
> 계속 진행하려면 "진행"이라고 입력하세요.

사용자가 "진행"이라고 하면 Phase 3으로 넘어가세요.

---

## Phase 3: 개발

### 수행 작업

Plan의 각 Step을 순서대로 구현합니다. **구현 코드(`src/`)만 작성합니다.**

**주의: 테스트 코드(`tests/`)는 Phase 3에서 작성하지 않습니다.** 테스트는 Phase 4에서 `/test` 커맨드가 전담합니다. Plan에 테스트 Step이 포함되어 있다면 해당 Step은 건너뜁니다.

각 Step마다:

1. **코드 구현** - [api-conventions], [code-standards] skill 내용을 참조하여 컨벤션 준수
2. **Lint 검사 및 수정** - `poetry run black src && poetry run isort src`
3. **커밋** - CLAUDE.md의 Commit Conventions 적용

### Step 진행 보고

각 Step 완료 후:

```
✅ Step [N]/[Total] 완료: [작업명]
- 구현: ✅
- Lint: ✅
- 커밋: [해시 또는 메시지]

다음 Step을 진행할까요? (진행/중단)
```

### 모든 Step 완료 후: Regression Test

구현 완료 후 기존 테스트가 깨지지 않았는지 전체 테스트를 실행합니다.

```bash
ENV=test poetry run pytest tests/ -v --tb=short
```

**전체 테스트 통과 시:**

> **Phase 3 완료**
>
> 모든 구현이 완료되었습니다. 기존 테스트도 모두 통과합니다.
> 테스트를 진행하려면 "진행"이라고 입력하세요.

**기존 테스트 실패 시 (최대 3회 수정 시도):**

실패한 테스트를 분석하여 구현 코드를 수정합니다. 수정 후 다시 전체 테스트를 실행합니다. 이 루프는 최대 3회 반복합니다.

> **기존 테스트 실패 발견** (시도 N/3)
>
> 구현 변경으로 인해 기존 테스트가 실패합니다:
> [실패 테스트 목록]
>
> - "수정": 구현 코드를 수정하고 전체 테스트를 재실행합니다
> - "무시": 현재 상태로 Phase 4를 진행합니다 (권장하지 않음)

**3회 시도 후에도 실패 시:**

> 3회 수정 시도 후에도 기존 테스트가 실패합니다.
> 수동으로 확인이 필요합니다. "무시"로 진행하거나 워크플로우를 "중단"하세요.

---

## Phase 4: 테스트

### 수행 작업

[test] command를 실행하여 전체 feature의 테스트를 작성하고 검증합니다.

입력값: Task Definition에서 정의된 feature명 (예: `research_design`, `research_favorite`)

### 실행

```bash
/test [feature-name]
```

test.md의 planner → generator → healer 전체 플로우가 실행됩니다.

### 완료 조건

- 모든 테스트 통과

### Lint 및 커밋

```bash
poetry run black src tests && poetry run isort src tests
```

```text
test(scope): add tests for [feature] #이슈번호
```

### 구현 코드 문제 발견 시

test-healer가 구현 코드 문제를 보고한 경우:

> **구현 코드 문제 발견**
>
> 테스트 중 구현 코드 문제가 발견되었습니다:
> [이슈 요약]
>
> - "수정": 구현 코드를 수정 → lint → 커밋 → Regression Test (`ENV=test poetry run pytest tests/ -v --tb=short`) 통과 확인 후 Phase 4를 재시작합니다
> - "무시": 현재 상태로 Phase 5 리뷰를 진행합니다

### 사용자 확인 요청

> **Phase 4 완료**
>
> 테스트가 완료되었습니다.
> 리뷰를 진행하려면 "진행"이라고 입력하세요.

---

## Phase 5: 리뷰 & PR

### 수행 작업

[code-reviewer] agent를 실행하여 전체 변경사항을 리뷰합니다.

Agent가 생성한 Code Review Report의 Verdict(APPROVED/CHANGES_REQUESTED)에 따라 분기합니다.

### 사용자 확인 요청

**APPROVED인 경우:**

`skip_documentation`에 따라 분기:
- `skip_documentation = false` → "진행" 시 Phase 6으로 이동
- `skip_documentation = true` → "진행" 시 Phase 7로 직행

> **Phase 5 완료 - 리뷰 통과!**
>
> - `skip_documentation = false`: 문서화를 진행하려면 "진행"을 입력하세요. (Phase 6)
> - `skip_documentation = true`: PR 생성을 진행하려면 "진행"을 입력하세요. (Phase 7)
> PR을 바로 생성하려면 "PR"이라고 입력하세요. (Phase 6 건너뛰고 Phase 7로 직행)

**CHANGES_REQUESTED인 경우:**

> **수정 필요**
>
> Code Reviewer가 다음 이슈를 발견했습니다:
> [이슈 요약]
>
> - "수정": Critical 이슈를 수정한 후 다시 리뷰를 진행합니다 (Phase 5 재실행)
> - "무시": 이슈를 인지하고 다음 Phase로 진행합니다 (문서화 건너뛴 경우 Phase 7로 직행)

---

## Phase 6: 문서화

**참고**: Phase 2에서 문서화를 건너뛴 경우 이 Phase도 건너뜁니다.

### 수행 작업

[api-documentation] skill (finalize 모드)로 구현된 API를 Notion과 Postman에 문서화합니다.

### 실행 절차

1. 구현된 코드 분석 (DTO, Service, Controller)
2. Phase 2에서 저장한 `docs_page_id`와 `api_row_id`로 finalize 모드 실행
3. Request Body, Response Schema 업데이트 + API row 상태 "구현완료"로 변경
4. Postman에 추가: `postman-guide.md` 참조

### 완료 조건

- [ ] Notion 스크립트 실행 성공 (docs 페이지 연결 확인)
- [ ] Postman 스크립트 실행 성공

### 결과 보고

```
📝 문서화 결과
- Notion: ✅ 성공 / ❌ 실패 (사유)
- Postman: ✅ 성공 / ❌ 실패 (사유)
```

### 사용자 확인 요청

**성공 시:**

> **Phase 6 완료**
>
> API 문서화가 완료되었습니다.
> PR을 생성하려면 "진행"이라고 입력하세요.

**실패 시:**

> **Phase 6 미완료**
>
> - 환경 설정 확인: `.claude/skills/api-documentation/scripts/env.sh`
> - 재시도하려면 "재시도"
> - 건너뛰려면 "스킵" (권장하지 않음)

---

## Phase 7: PR 생성

### 수행 작업

[gh-draft-pr-create] skill을 실행하여 Draft PR을 생성합니다.
Phase 2에서 저장한 `task_id`를 티켓 링크에 사용합니다.

### 사용자 확인 요청

> **Phase 7 완료 - PR 생성!**
>
> PR URL: [생성된 PR URL]
> 리포트를 생성하려면 "진행"이라고 입력하세요.

사용자가 "진행"이라고 하면 Phase 8로 넘어가세요.

---

## Phase 8: 작업 완료 리포트

[work-report] skill을 실행하여 작업 완료 리포트를 생성합니다.

### 사용자 확인 요청

> **Phase 8 완료 - 작업 완료 리포트 생성!**
>
> 📄 상세 리포트: `reports/[task_id]_report.md`
>
> 리포트 내용을 수정하시겠습니까?
> - "완료": 워크플로우를 종료합니다
> - "수정": 리포트 내용을 수정합니다 (수정 완료 후 다시 "완료"/"수정" 재질문)

---

## 워크플로우 완료

사용자가 "완료"를 선택하면:

> **워크플로우 완료!**
>
> ### 요약
>
> - Task: [요약]
> - 커밋: [N]개
> - PR: [URL] (생성된 경우)
> - 리포트: `reports/[task_id]_report.md`
>
> ### 다음 단계
>
> - GitHub Actions 자동 코드 리뷰 대기
> - 리뷰어 피드백 반영
> - 머지

---

## 주의사항

- 각 Phase는 사용자 확인 후 다음으로 진행
- 문제 발생 시 언제든 "중단"하고 수동 진행 가능
- Phase 8은 CLAUDE.md의 "작업 완료 시 회고"를 대체합니다 (워크플로우 사용 시)
- 참조 Skills: [api-conventions], [code-standards], [api-documentation], [interview], [task-definition-generator], [plan-generator], [gh-draft-pr-create], [work-report]
- 참조 Commands: [test] (Phase 4)
- 참조 Agents: [code-reviewer] (Phase 5), [plan-reviewer] (Phase 1)
