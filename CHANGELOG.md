# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-04-02

### Added
- **`calendar-today` skill 추가** (user-scope-skills)
  - 오늘/이번 주/내일 일정 조회. '오늘 일정', 'calendar', '스케줄' 트리거
- **`canary` skill 추가** (user-scope-skills)
  - 배포 후 실시간 모니터링 및 베이스라인 비교, 헬스 스코어링
  - 관찰 전용 — 코드 변경 없음
- **`cso` skill 추가** (user-scope-skills)
  - 보안 감사, 취약점 스캔, 위협 모델링
  - Daily(간단 스캔) / Comprehensive(월간 심층 감사) 두 가지 모드
- **`investigate` skill 추가** (user-scope-skills)
  - 복잡하고 재현이 어려운 버그 디버깅
  - 가설 기반 체계적 조사 방식
- **`qmd` skill 추가** (user-scope-skills)
  - 마크다운 지식 베이스, 노트, 문서 검색
  - `npm install -g @tobilu/qmd` 설치 필요
- **`plannotator-compound` skill 추가** (user-scope-skills)
  - Plannotator 플랜 아카이브 분석으로 거절 패턴 및 피드백 추출

## [2.0.0] - 2026-02-27

### Added
- **`interview` skill 추가** (Phase 0에서 사용)
  - 코드베이스 컨텍스트 기반 역인터뷰로 요구사항 추출
  - AskUserQuestion을 활용한 다중 라운드 인터뷰
  - 산출물: `specs/{topic-slug}.md` 파일
- **`test` command 추가** (Phase 4에서 사용)
  - planner → generator → healer 3단계 테스트 파이프라인
- **`test-planner` skill 추가** - 테스트 시나리오 자동 생성
- **`test-generator` skill 추가** - 시나리오 기반 테스트 코드 생성
- **`test-healer` skill 추가** - 테스트 실행 및 실패 자동 수정
- **Phase 4: 테스트 Phase 신설**
  - `/test` command 실행으로 planner → generator → healer 전체 플로우 실행
  - 구현 코드 문제 발견 시 Phase 3 복귀 옵션
- **Phase 1에 Step 1.2 (사용자 검토) 추가**
  - Plan 생성 후 plan-reviewer 검증 전에 사용자 승인 단계 삽입
  - "승인" / "수정 요청" 분기 처리

### Changed
- **Phase 0: clarify → interview로 대체** (BREAKING)
  - 4항목 점수제 평가 방식에서 역인터뷰 방식으로 전환
  - 최종 산출물이 clarified 요구사항에서 `specs/` 파일로 변경
- **Phase 구조 8단계로 재편** (BREAKING)
  - Phase 0: Task 분석 (interview + task-definition-generator)
  - Phase 1: Plan 수립 및 검증 (사용자 검토 추가)
  - Phase 2: Docs 생성 및 브랜치 준비
  - Phase 3: 개발 (테스트 분리)
  - Phase 4: 테스트 (NEW)
  - Phase 5: 리뷰 & PR
  - Phase 6: 문서화
  - Phase 7: PR 생성
- **Phase 3 개발에서 테스트 분리**
  - 기존: 구현 + 테스트 + Lint + 커밋
  - 변경: 구현 + Lint + 커밋 (테스트는 Phase 4로)
- **브랜치명 컨벤션 변경** (BREAKING)
  - 기존: `[task_id].[type]_` (feat, fix, docs 등)
  - 변경: `[task_id].[행위]_` (add, update, remove 등)
- **allowed-tools에 Task 추가**
- **api-documentation Phase 참조 업데이트**
  - Finalize 모드: Phase 5 → Phase 6

### Removed
- **`clarify` skill 제거** (interview로 대체)

## [1.2.0] - 2026-02-13

### Added
- **`task-definition-generator` skill 추가** (Phase 0에서 사용)
  - 코드베이스 탐색 기반 구조화된 Task Definition 자동 생성
  - 영향 분석 (영향 파일, 의존성, 생성/수정 구분)
  - AC-N 식별자 기반 수용 기준 작성
- **`plan-generator` skill 추가** (Phase 1에서 사용)
  - Task Definition 기반 구현 계획 수립
  - 각 Step = 1 커밋 단위, 의존성 순서 반영
  - AC-N <-> Step 매핑 및 자체 검증
- **Phase 1에 `plan-reviewer` agent 검증 단계 추가**
  - 정합성, 실현 가능성, 리스크 3차원 검증
  - APPROVED / CHANGES_REQUESTED 분기 처리
- **Phase 4 리뷰에 APPROVED/CHANGES_REQUESTED 분기 추가**
  - "수정" / "무시" 선택 옵션

### Changed
- **Phase 구조 재편**
  - Phase 0: Task 분석 (clarify + task-definition-generator)
  - Phase 1: Plan 수립 **및 검증** (plan-generator + plan-reviewer)
  - Phase 2: **Docs 생성 및** 브랜치 준비 (api-documentation draft 이동)
- **Docs 생성을 Phase 2로 이동** (기존 Phase 0에서 분리)
  - 문서화 필요 여부 Yes/No 사전 질문 추가
  - No 선택 시 Phase 5도 자동 건너뛰기
- **Phase 6 PR 생성 개선**
  - `gh api user` 기반 assignee 자동 할당
  - `--draft` 옵션 추가
- **`code-standards` skill 커밋 컨벤션 업데이트**
  - Conventional Commits 형식 적용: `타입(적용범위): task_id 설명 #버전태그`
  - 타입 테이블 추가 (feat, fix, improve, refactor 등)
- **`api-documentation` Phase 참조 정합성 수정**
  - SKILL.md, notion-guide.md의 Phase 번호를 워크플로우와 일치시킴

## [1.1.0] - 2025-01-22

### Added
- **Phase 0에 Step 0.1 (요구사항 명확화) 추가**
  - 4항목 점수제로 Task 명확성 자동 평가 (Goal, Scope, Success Criteria, Constraints)
  - 2점 이상이면 clarify skill 자동 실행
  - clarify 완료 후 명확화된 요구사항으로 Task 분석 진행
- 참조 Skills 목록에 `clarify` 추가

### Changed
- Phase 0의 "수행 작업"을 "Step 0.2: Task 분석"으로 명칭 변경

## [1.0.0] - 2025-01-20

### Added
- 초기 릴리스
- **workflow command**: 6단계 개발 파이프라인 (Phase 0-6)
  - Phase 0: Task 분석
  - Phase 1: Plan 수립
  - Phase 2: 브랜치 준비
  - Phase 3: 개발
  - Phase 4: 리뷰 & PR
  - Phase 5: 문서화
  - Phase 6: PR 생성
- **Skills**:
  - `clarify`: 요구사항 명확화
  - `api-conventions`: RESTful API 설계 컨벤션
  - `api-documentation`: Notion/Postman 문서화
  - `code-standards`: 코드 및 테스트 표준
