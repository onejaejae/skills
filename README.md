# workflow-bundle

통합 개발 워크플로우 (workflow command + 의존 skills)

## 설치

```bash
/plugin install workflow-bundle@ai-registry
```

## 사용법

### 명령어

```bash
workflow [task-description]
```

### 워크플로우 (8 Phase)

```text
Phase 0: Task 분석
    ├── Step 0.0: 요구사항 인터뷰 (interview)
    └── Step 0.1: Task Definition 생성
    ↓
Phase 1: Plan 수립 및 검증
    ├── Step 1.1: 구현 계획 생성 (plan-generator)
    ├── Step 1.2: 사용자 검토
    └── Step 1.3: 계획 검증 (plan-reviewer)
    ↓
Phase 2: Docs 생성 및 브랜치 준비
    ├── Step 2.0: Docs 페이지 생성 (조건부)
    └── Step 2.1: 브랜치 준비
    ↓
Phase 3: 개발 (Step별 구현 + Lint + 커밋)
    ↓
Phase 4: 테스트 (/test command)
    ↓
Phase 5: 리뷰 (code-reviewer)
    ↓
Phase 6: 문서화 (Notion + Postman, 조건부)
    ↓
Phase 7: PR 생성
```

### 포함된 Skills

| 스킬 | 용도 |
|-----|------|
| interview | 역인터뷰 기반 요구사항 추출 |
| task-definition-generator | 구조화된 Task Definition 생성 |
| plan-generator | 구현 계획 수립 |
| api-conventions | API 설계 규칙 |
| api-documentation | Notion/Postman 문서화 |
| code-standards | 코드 품질 기준 |
| test-planner | 테스트 시나리오 생성 |
| test-generator | 테스트 코드 생성 |
| test-healer | 테스트 실행 및 자동 수정 |

### 포함된 Commands

| 커맨드 | 용도 |
|-------|------|
| test | 테스트 파이프라인 실행 (Phase 4) |

### 참조 Agent

| 에이전트 | 용도 |
|---------|------|
| plan-reviewer | Plan 검증 (Phase 1) |
| code-reviewer | 코드 리뷰 (Phase 5) |

### 특징

- 각 Phase마다 사용자 확인
- 역인터뷰 기반 요구사항 추출 (Phase 0)
- Task Definition + Plan 자동 생성 및 검증
- 테스트 전용 Phase 분리 (Phase 4)
- 리뷰어 관점의 코드 리뷰 (Phase 5)
- API 문서 자동화 (Notion, Postman)
- Draft PR 생성 및 assignee 자동 할당

## 버전

- Current: 2.0.0
- [CHANGELOG](./CHANGELOG.md)
