---
name: notion-jira-subtask-migrator
description: >
  Migrate Notion pages or child pages into Jira subtasks. Use when the user says
  "노션 페이지를 지라 하위작업으로 옮겨줘", "노션 하위 페이지를 서브태스크로",
  "notion to jira", "jira subtask로 이식", "하위 작업 추가", "지라로 옮겨",
  or provides a Notion page URL and a Jira parent issue together. Prefer a one-page
  test first, then batch-create the rest sequentially. Supports fixed assignee
  values like enzo.cho / enzo.cho@kakaohealthcare.com and relies on Jira's default
  create status, which should verify as To Do after creation.
---

# Notion Jira Subtask Migrator

Notion 페이지를 Jira 부모 이슈의 서브태스크로 옮기는 스킬이다.

## 핵심 원칙

- Notion 원문은 `notion_fetch`로 읽는다.
- 상위 페이지에서 대상을 고를 때는 `notion_fetch`로 child page URL 목록을 먼저 확보한다.
- 작성자 제한이 있으면 `notion_get_users(user_id="self")` 또는 대상 사용자 조회로 user id를 확보한 뒤 `notion_search(..., filters.created_by_user_ids=[...])`를 사용한다.
- 생성 순서가 중요하면 `notion_search` 결과의 `timestamp`를 기준으로 정렬하되, 반드시 상위 페이지 child 목록과 교집합을 취해 scope leakage를 막는다.
- Jira 생성은 반드시 `scripts/create-notion-subtask.sh`를 사용한다.
- Notion 원문 markdown을 Jira Wiki Markup 요약으로 바꿀 때는 `scripts/render-notion-page-to-jira.py`를 우선 사용한다.
- 생성 시 status를 억지로 세팅하지 않는다. Jira 기본 생성 상태를 사용하고, 생성 후 실제 status를 검증한다.
- description은 Jira Wiki Markup으로 작성한다.
- 표, mermaid, callout은 그대로 우겨 넣지 말고 핵심 내용으로 요약한다.
- 항상 Notion source URL을 description 맨 위에 남긴다.
- description 하단에는 `Source URL`, `Source ID`, `Source Title` marker를 남겨 source 기반 중복 검사를 가능하게 한다.

## 추천 워크플로우

### 1. 범위 확인

- 사용자가 Notion 상위 페이지를 줬으면 먼저 하위 페이지 목록을 본다.
- 사용자 지정이 없으면 먼저 1개만 테스트한다.
- 기본 테스트 대상은 최근 페이지이거나 실행 단위가 명확한 페이지를 우선한다.
- 작성자 제한이 있으면:
  - 상위 페이지 child 링크 목록 확보
  - `created_by_user_ids`로 검색
  - search 결과와 child 링크 교집합만 대상에 포함
  - `timestamp ASC`로 정렬해 앞에서부터 진행
- 중복 생성분처럼 제목이 비슷한 페이지가 있으면 title만 보지 말고 URL id까지 확인한다.

### 2. Notion 페이지 읽기

- 대상 페이지 URL을 `notion_fetch`로 읽는다.
- 다음 정보를 추출한다:
  - page title
  - source URL
  - goal / purpose
  - current state
  - blockers / risks
  - action items / checklist
  - done condition

### 3. Jira summary 규칙

- 기본값은 Notion 페이지 제목을 유지한다.
- 부모 이슈의 기존 서브태스크가 `[BE][HRS]` 같은 prefix를 쓰면 같은 스타일을 맞춘다.
- 중복 방지를 위해 부모 이슈의 기존 subtasks summary를 확인한다.

### 4. Jira description 규칙

항상 아래 구조를 기본으로 사용한다.

```text
h2. Source
[Notion page title|https://...]

h2. Goal
...

h2. Current State
* ...

h2. Key Sections
* ...

h2. Known Blockers
* ...

h2. Next Actions
* ...

h2. Done Condition
* ...

----
_Created from Notion page migration._
```

세부 규칙:

- Markdown `- item`은 Jira `* item`으로 바꾼다.
- 링크는 `[text|url]` 형식을 쓴다.
- 표는 핵심 행만 bullet로 재서술한다.
- mermaid는 직접 넣지 말고 "diagram exists in source" 또는 구조 요약으로 대체한다.
- 원문을 완전히 잃지 않도록 source URL은 반드시 남긴다.

가능하면 본문은 수동 편집하지 말고 아래 렌더러로 생성한다.

```bash
python3 ~/.claude/skills/notion-jira-subtask-migrator/scripts/render-notion-page-to-jira.py \
  --title "65. Preview Environment Execution Plan — #751 기준 Build · Deploy · Validation Task Breakdown" \
  --source-url "https://www.notion.so/..." \
  --content-file "/tmp/notion-page-65.md" \
  --output-file "/tmp/DPHRS-16-page65-body.md"
```

입력 규칙:

- `content-file`에는 `notion_fetch`로 읽은 본문을 저장한다.
- 렌더러는 heading keyword를 기준으로 `Goal / Current State / Known Blockers / Next Actions / Done Condition`을 자동 추출한다.
- 구조가 애매한 문서는 렌더 후 결과를 한 번 훑고 생성한다.

### 5. Jira 생성

body 파일을 직접 만들거나, 위 렌더러 출력 파일을 사용해 아래 스크립트를 호출한다.

```bash
~/.claude/skills/notion-jira-subtask-migrator/scripts/create-notion-subtask.sh \
  --parent "DPHRS-16" \
  --summary "[BE][HRS] 65. Preview Environment Execution Plan — #751 기준 Build · Deploy · Validation Task Breakdown" \
  --body-file "/tmp/DPHRS-16-page65-body.md" \
  --source-url "https://www.notion.so/..." \
  --source-id "329d87e517f481a9981fc12e622e4558" \
  --source-title "65. Preview Environment Execution Plan — #751 기준 Build · Deploy · Validation Task Breakdown" \
  --log-file "/tmp/notion-jira-migration.jsonl" \
  --assignee-email "enzo.cho@kakaohealthcare.com"
```

옵션:

- `--parent`: 부모 Jira 키
- `--summary`: 서브태스크 제목
- `--body-file`: Jira Wiki Markup 본문 파일
- `--body`: inline Jira Wiki Markup 본문
- `--priority`: 기본 `Medium`
- `--assignee-email`: 기본값은 Jira CLI 로그인 이메일
- `--labels`: 생략 시 부모 labels 상속
- `--source-url`, `--source-id`, `--source-title`: source marker 및 중복 검사 기준
- `--log-file`: `created / skipped / failed / dry_run` JSONL 로그
- `--dry-run`: 실제 생성 없이 중복 검사와 payload 점검만 수행

### 6. 생성 후 검증

생성 직후 Jira issue를 다시 조회해서 최소 아래를 확인한다.

- parent가 맞는지
- assignee가 요청값과 일치하는지
- status가 `TO DO`인지
- labels가 기대값인지

검색 API를 쓸 때는 Jira Cloud의 deprecated v2 search 대신 v3를 사용한다.

```bash
GET /rest/api/3/search/jql
```

## 테스트 후 배치 이관

- 1건 테스트 성공 후 나머지를 순차 생성한다.
- 순차 생성 중 summary exact match 또는 source marker 중복이 있으면 skip한다.
- 각 생성 결과를 `created / skipped / failed`로 구분해 사용자에게 보고한다.
- 배치 중간에 실패가 나면 전체를 롤백하지 말고, 실패 건만 분리 보고 후 다음 건으로 진행할지 판단한다.

배치는 JSONL manifest를 기준으로 진행한다.

manifest 한 줄 예시:

```json
{"created_time":"2026-03-20T00:31:00.000Z","summary":"[BE][HRS] 1. WRITE 성능 벤치마크 (2026-03-20)","source_url":"https://www.notion.so/...","source_id":"page-id","source_title":"1. WRITE 성능 벤치마크 (2026-03-20)","content_file":"/tmp/notion-page-01.md"}
```

배치 실행 예시:

```bash
python3 ~/.claude/skills/notion-jira-subtask-migrator/scripts/batch-create-notion-subtasks.py \
  --parent "DPHRS-16" \
  --manifest "/tmp/notion-dphrs16.jsonl" \
  --assignee-email "enzo.cho@kakaohealthcare.com" \
  --start-from oldest \
  --log-file "/tmp/notion-jira-migration.jsonl" \
  --resume
```

배치 옵션:

- `--manifest`: JSONL 입력 파일
- `--start-from oldest|newest`: 생성 순서
- `--limit`: 일부만 실행
- `--dry-run`: 실제 생성 없이 순회
- `--resume`: JSONL 로그를 읽어 이미 `created/skipped` 처리된 source는 건너뜀

## 이번 작업에서 배운 운영 규칙

- Notion search는 page scope를 줘도 넓게 잡힐 수 있으므로, parent child 목록과 search 결과를 반드시 교차 검증한다.
- macOS 기본 bash 호환성을 고려해 `readarray` 같은 bash 4+ 전용 문법은 피한다.
- Jira 요약 제목만 exact duplicate 체크하면 충분하지 않으므로, Notion page id와 source URL marker를 description에 남기고 source 기반 중복 검사를 같이 쓴다.

## 이번 세션 기준 검증 사례

- Parent: `DPHRS-16`
- Test page: `65. Preview Environment Execution Plan — #751 기준 Build · Deploy · Validation Task Breakdown`
- Created issue: `DPHRS-114`
- Verified assignee: `enzo.cho`
- Verified status: `TO DO`
