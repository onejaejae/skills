---
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
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

- 입력된 Task를 주제로 interview skill 실행
- 코드베이스 컨텍스트를 반영한 깊이 있는 질문 (기술적 트레이드오프, 엣지케이스, 비기능 요구사항 등)
- 이미 구체적인 Task인 경우 1-2라운드로 빠르게 완료
- 최종 산출물: `specs/{topic}.md` 파일

### Step 0.1: Task Definition 생성

[task-definition-generator] skill이 interview 결과(spec 파일)를 기반으로 Task Definition을 생성합니다:

1. Spec 파일의 요구사항과 기술 결정사항 반영 (자동)
2. 코드베이스 탐색 — 키워드 기반 관련 파일 검색 + 계층 추적 (자동)
3. 영향 분석 정리 — 영향 받는 파일, 의존성, 신규 생성 필요 파일 (자동)
4. Task 유형 분류 — API 추가 / 기능 개선·수정 / 버그 수정 (자동)
5. 구조화된 Task Definition 문서 생성 (자동)

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

[plan-generator] skill을 실행하여 구현 계획을 생성합니다.

이 skill은 다음을 수행합니다:

1. Task Definition의 영향 받는 파일 기반 코드 심층 분석
2. 구현 단계 분해 (각 Step = 1 커밋, 의존성 순서 반영)
3. 수용 기준(AC-N) ↔ Step 매핑
4. [api-conventions], [code-standards] 참조하여 구현 상세 결정

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

검증 차원:

1. **정합성**: 수용 기준 ↔ Step 매핑 완전성, 영향 파일 반영 여부
2. **실현 가능성**: 파일 경로, 패턴 일관성, 필수 단계(DI 등록 등) 누락 여부
3. **리스크**: 마이그레이션, 기존 테스트 영향, 외부 의존성, 성능

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
> - "수동 입력": task_id를 직접 입력하고 Phase 6 문서화는 건너뜁니다
> - 환경 설정 확인: `.claude/skills/api-documentation/scripts/env.sh`

**No인 경우 — 건너뛰기:**
- 사용자에게 Notion task_id를 요청합니다: "Notion Task ID를 입력하세요 (예: DPT-10309):"
- Phase 6 문서화도 자동으로 건너뜁니다

### Step 2.1: 브랜치 준비

develop 브랜치를 최신화하고 `task_id`를 사용하여 feature 브랜치를 생성합니다.

### 브랜치명 컨벤션

```
[task_id].[행위]_[세부항목]

행위: add, update, remove, clean-up, write 등

주의: 세부항목은 반드시 영어로 작성 (kebab-case, `-`로 구분)

예시:
- DPT-10296.add_attachment-to-notice-api
- DPT-10297.update_login-token-expiry
- DPT-10298.write_api-documentation
```

### 명령어

```bash
# 1. develop 최신화
git checkout develop
git pull origin develop

# 2. feature 브랜치 생성 (task_id 사용)
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

Plan의 각 Step을 순서대로 구현합니다.

각 Step마다:

1. **코드 구현** - [api-conventions], [code-standards] skill 적용
2. **Lint 검사 및 수정** - `poetry run black . && poetry run isort .`
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

### 모든 Step 완료 후

> **Phase 3 완료**
>
> 모든 구현이 완료되었습니다.
> 테스트를 진행하려면 "진행"이라고 입력하세요.

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

### 커밋

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
> - "수정": Phase 3으로 돌아가 구현 코드를 수정합니다
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

1. 전체 변경사항 분석 (`git diff`)
2. 코드 품질, 보안, 성능 검토
3. 리뷰 리포트 출력

### 리뷰 체크리스트

- [ ] 코드 품질 (가독성, 네이밍, 중복)
- [ ] 보안 (입력 검증, 인증/인가)
- [ ] 성능 (N+1 쿼리, 불필요한 연산)
- [ ] 테스트 (커버리지, 엣지케이스)

### 출력 형식

```markdown
# Code Review Report

## Summary

| Category   | Count |
| ---------- | ----- |
| Critical   | [N]   |
| Warning    | [N]   |
| Suggestion | [N]   |

## Issues

(Critical/Warning/Suggestion 이슈 목록)

## Verdict

**[APPROVED / CHANGES_REQUESTED]**
```

### 사용자 확인 요청

**APPROVED인 경우:**

> **Phase 5 완료 - 리뷰 통과!**
>
> 문서화를 진행하려면 "진행"이라고 입력하세요.
> PR을 바로 생성하려면 "PR"이라고 입력하세요.

**CHANGES_REQUESTED인 경우:**

> **수정 필요**
>
> Code Reviewer가 다음 이슈를 발견했습니다:
> [이슈 요약]
>
> - "수정": Critical 이슈를 수정한 후 다시 리뷰를 진행합니다 (Phase 5 재실행)
> - "무시": 이슈를 인지하고 현재 코드로 Phase 6으로 진행합니다 (문서화 건너뛴 경우 Phase 7로 직행)

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

리뷰와 문서화가 완료된 후 PR을 생성합니다.

### 명령어

```bash
# 1. GitHub 사용자명 조회 (assignee 자동 할당용)
gh api user --jq '.login'

# 2. 브랜치 push & Draft PR 생성 (assignee 자동 할당)
git push -u origin [브랜치명]
gh pr create --draft --base develop --assignee [GitHub username] --title "[제목]" --body "[본문]"
```

### PR 본문 템플릿

`.github/pull_request_template.md` 형식을 따릅니다.
Phase 2에서 저장한 `task_id`를 티켓 링크에 사용합니다.

```markdown
# 🔗 티켓 링크
[task_id]

# 📋 작업 내용
[구현한 기능 요약]

- [주요 변경사항 1]
- [주요 변경사항 2]

## 🧐 주요 검토 필요 사항
- [리뷰어가 집중해서 봐야 할 부분]

## 📌 검토하지 않아도 되는 사항 (optional)

## 🚀 추후에 개선할 사항 (백로그 링크)(optional)

## 📸 스크린샷 (optional)

# ✅ 체크리스트

- [x] 나는 코드 셀프 리뷰를 하였다.
- [x] 나는 수정사항에 대해 철저하게 테스트 하였다.
- [x] 코드 변경 사이즈가 적절하다 생각한다. (500줄 미만. 단순 삭제는 OK)
```

### 사용자 확인 요청

> **Phase 7 완료 - PR 생성!**
>
> PR URL: [생성된 PR URL]

---

## 워크플로우 완료

모든 Phase 완료 후:

> **워크플로우 완료!**
>
> ### 요약
>
> - Task: [요약]
> - 커밋: [N]개
> - PR: [URL] (생성된 경우)
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
- 참조 Skills: [api-conventions], [code-standards], [api-documentation], [interview], [task-definition-generator], [plan-generator]
- 참조 Commands: [test] (Phase 4)
- 참조 Agents: [code-reviewer] (Phase 5), [plan-reviewer] (Phase 1)
