# Notion 문서화 가이드

API 명세를 Notion Database에 추가하는 상세 가이드입니다.

---

## 스크립트 위치

```bash
.claude/skills/api-documentation/scripts/notion/add.sh
```

## 기본 사용법

### Draft 모드 (Phase 2)
```bash
./scripts/notion/add.sh --mode draft \
  --name "API 이름" \
  --method POST \
  --endpoint "/api/v1/..." \
  --tag "Tag" \
  --create-docs
```

### Finalize 모드 (Phase 6)
```bash
./scripts/notion/add.sh --mode finalize \
  --docs-id "docs-page-id" \
  --api-row-id "api-row-id" \
  --request-body '{"field":"value"}' \
  --response '200:{"success":true,"data":{...}}'
```

## 옵션 상세

### 모드 옵션

| 옵션 | 설명 |
|------|------|
| `--mode` | 문서화 모드: `draft` (Phase 2) 또는 `finalize` (Phase 6, 기본값) |

### Draft 모드 기본 옵션

| 옵션 | 설명 |
|------|------|
| `--name` | API 이름 (자동으로 "API" suffix 추가) |
| `--method` | HTTP 메서드 (GET, POST, PUT, PATCH, DELETE) |
| `--endpoint` | API 경로 |
| `--tag` | 카테고리 |

### Docs 옵션

| 옵션 | 설명 |
|------|------|
| `--create-docs` | docs 페이지 자동 생성 |
| `--docs-id` | 기존 docs 페이지 연결 |
| `--docs-title` | docs 페이지 제목 (기본: [RE-AI] {name}) |

### Task Definition 옵션 (Draft 모드용)

| 옵션 | 설명 |
|------|------|
| `--background` | 배경 설명 (Task의 목적과 맥락) |
| `--requirements` | 주요 요구사항 (기능 요구사항 목록) |
| `--notes` | Notes (구현 시 참고사항) |

### API Spec 옵션 (Finalize 모드용)

| 옵션 | 설명 |
|------|------|
| `--api-row-id` | API Database row ID (상태를 "구현완료"로 업데이트) |
| `--request-body` | Request Body JSON 또는 설명 (DTO에서 추출) |
| `--response` | Response 예시 (반복 가능), 형식: `상태코드:JSON` |

---

## 사용 시나리오

### 시나리오 0: Draft 모드 (Phase 2 - Docs 생성)

Task Definition 완료 후 docs 페이지 초안 생성:

```bash
./scripts/notion/add.sh --mode draft \
  --name "게시글 생성" \
  --method POST \
  --endpoint "/api/v1/posts" \
  --tag "Post" \
  --create-docs \
  --background "인증된 사용자가 게시글을 생성할 수 있는 기능 구현" \
  --requirements "게시글 생성 기능, 인증 필수, 작성자 자동 연결" \
  --notes "authorId는 JWT 토큰에서 추출"
```

생성되는 docs 페이지 구조:
- 배경
- 주요 요구사항 (기능/비기능)
- Notes
- API Spec (Request Body, Response Schema - Phase 6에서 업데이트)

---

### 시나리오 1: Finalize 모드 - docs 페이지 + API row 업데이트 (권장)

**Phase 2에서 생성된 docs 페이지와 API row를 실제 구현 기반으로 업데이트:**

```bash
./scripts/notion/add.sh --mode finalize \
  --docs-id "phase2-에서-생성된-docs-page-id" \
  --api-row-id "phase2-에서-생성된-api-row-id" \
  --request-body '{"title":"string","content":"string"}' \
  --response '201:{"success":true,"data":{"id":"uuid","title":"제목","content":"내용","authorId":"uuid","createdAt":"2024-01-01T00:00:00.000Z"}}' \
  --response '400:{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Title is required"}}' \
  --response '401:{"success":false,"error":{"code":"AUTH_UNAUTHORIZED","message":"Unauthorized"}}'
```

**업데이트 내용:**
- docs 페이지: Request Body, Response Schema
- API row: 구현 여부 "구현예정" -> "구현완료"

### 시나리오 2: Draft 모드 - 여러 API 동시 생성 (CRUD)

```bash
# 첫 번째 API (docs 페이지 생성)
./scripts/notion/add.sh --mode draft \
  --name "사용자 목록 조회" \
  --method GET \
  --endpoint "/api/v1/users" \
  --tag "User" \
  --create-docs \
  --docs-title "[RE-AI] 사용자 CRUD 구현" \
  --background "사용자 관리 기능" \
  --requirements "목록 조회, 상세 조회, 수정, 삭제"

# 나머지 API (기존 docs 페이지 연결)
./scripts/notion/add.sh --mode draft \
  --name "사용자 상세 조회" \
  --method GET \
  --endpoint "/api/v1/users/:id" \
  --tag "User" \
  --docs-id "위에서-생성된-docs-page-id"
```

### 시나리오 3: Draft 모드 - API suffix 불필요 (헬스체크 등)

```bash
./scripts/notion/add.sh --mode draft \
  --name "헬스체크" \
  --method GET \
  --endpoint "/health" \
  --tag "System" \
  --no-suffix
```

---

## 모드별 필수 옵션

### Draft 모드 (Phase 2)

| 필수 옵션 | 설명 |
|----------|------|
| `--name` | API 이름 |
| `--method` | HTTP 메서드 |
| `--endpoint` | API 경로 |
| `--tag` | 카테고리 |

선택 옵션: `--create-docs`, `--background`, `--requirements`, `--notes`

### Finalize 모드 (Phase 6)

| 필수 옵션 | 설명 |
|----------|------|
| `--docs-id` | 업데이트할 docs 페이지 ID |
| `--request-body` | Request Body JSON |
| `--response` | Response 예시 (1개 이상) |

선택 옵션: `--api-row-id` (API row 상태를 "구현완료"로 업데이트)

### 정보 추출 방법 (Finalize 모드)

| 옵션 | 추출 위치 |
|------|----------|
| `--request-body` | 구현된 DTO 클래스에서 필드 구조 추출 |
| `--response` (성공) | Service의 Response 타입에서 추출 |
| `--response` (에러) | Controller/Service의 예외 처리에서 에러 코드 추출 |

---

## 워크플로우 통합

### Phase 2 (Docs 생성) - Draft 모드

Task Definition 완료 후 Claude가:

1. Task 요구사항 분석
2. API 정보 도출 (name, method, endpoint, tag)
3. Draft 모드로 docs 페이지 + API row 생성
4. **task_id, docs_page_id, api_row_id 저장** (Phase 6, 7에서 사용)

```bash
# Phase 2에서 실행
./scripts/notion/add.sh --mode draft \
  --name "게시글 생성" --method POST --endpoint "/api/v1/posts" --tag "Post" \
  --create-docs \
  --background "인증된 사용자가 게시글을 생성할 수 있는 기능" \
  --requirements "게시글 생성, 인증 필수, 작성자 연결"

# 출력:
# Task ID: DPT-10309       <- Phase 7 PR 생성 시 사용
# API Row ID: xyz-456-ghi  <- Phase 6에서 사용
# Docs Page ID: abc-123-def <- Phase 6에서 사용
```

### Phase 6 (문서화) - Finalize 모드

구현 완료 후 Claude가:

1. 구현된 코드 분석 (DTO, Service, Controller)
2. E2E 테스트에서 예시 응답 추출
3. Phase 2에서 저장한 docs_page_id, api_row_id로 업데이트
4. **docs 페이지 내용 + API row 상태 업데이트**

```bash
# Phase 5에서 실행
./scripts/notion/add.sh --mode finalize \
  --docs-id "abc-123-def" \
  --api-row-id "xyz-456-ghi" \
  --request-body '{"title":"string","content":"string"}' \
  --response '201:{"success":true,"data":{...}}' \
  --response '400:{"success":false,"error":{...}}'
```

---

## 환경 설정

```bash
cd .claude/skills/api-documentation/scripts
cp env.sh.example env.sh
vi env.sh
```

```bash
# env.sh
export NOTION_API_KEY="secret_xxxxx"
export NOTION_DATABASE_ID="database-id"
export NOTION_TASKS_DATABASE_ID="tasks-db-id"  # --create-docs 시 필수
export NOTION_EPIC_ID="epic-id"                # 선택
```

## Notion Integration 연결

1. https://www.notion.so/my-integrations 에서 Integration 생성
2. API Database 페이지에서 Integration 연결 (Share -> Invite)
3. Database ID는 페이지 URL에서 추출

---

## Response 형식 규칙

`--response` 옵션 형식: `상태코드:JSON`

| 상태코드 | 표시 텍스트 |
|----------|------------|
| 200 | 200 성공 |
| 201 | 201 Created |
| 400 | 400 Bad Request |
| 401 | 401 Unauthorized |
| 403 | 403 Forbidden |
| 404 | 404 Not Found |
| 409 | 409 Conflict |
| 500 | 500 Internal Server Error |
