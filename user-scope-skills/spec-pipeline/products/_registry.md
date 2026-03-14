# Product Registry

spec-pipeline이 제품별 knowledge context를 로드하기 위한 레지스트리.

## 사용법

1. 사용자 입력에서 키워드를 매칭하여 제품을 식별한다
2. 매칭된 제품의 `products/{product-id}/` 디렉토리에서 context를 로드한다
3. 복수 매칭 시 사용자에게 확인한다

## 등록된 제품

| product-id | 제품명 | 키워드 | backend-repo | 비고 |
|------------|--------|--------|-------------|------|
| clue-research-ai | HRS AI 연구지원 | 연구지원, 연구검색, 연구설계, AI연구, clue, HRS, 임상연구, 코호트, 데이터검증, 코드set, CDW, research-ai | clue-research-ai | 연구자가 자연어로 연구주제 입력 → AI가 연구설계 자동 생성 + CDW 데이터 검증 |

## 제품 추가 방법

1. `products/{product-id}/` 디렉토리 생성
2. `domain.md` 작성 — 제품의 도메인 knowledge (비즈니스 규칙, 용어, 사용자, 핵심 플로우)
3. `codebase-summary.md` 작성 — 백엔드 코드 요약 (DB 모델, API 엔드포인트, 서비스 로직, 아키텍처 제약)
4. 이 파일의 "등록된 제품" 테이블에 행 추가

## Context 로드 우선순위

| Tier | 파일 | 로드 시점 | 토큰 예산 |
|------|------|----------|----------|
| 1 | domain.md 상단 요약 | 제품 식별 직후 | ~500 |
| 2 | codebase-summary.md 관련 모듈 | interview/generator 시작 시 | ~2K |
| 3 | 전체 context | 특정 질문/검증 시 | ~5K |
