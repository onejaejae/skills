---
name: jira-dispatch
description: |
  Use when "/jira:dispatch", "서브태스크 생성", "지라 태스크 생성", "jira dispatch",
  "jira subtask", "create subtasks", "태스크 디스패치",
  "이 태스크들 지라에 올려줘", "서브태스크 만들어줘".
  Also use as the final step after /jira:assess completes.
---

# /jira:dispatch — Jira Subtask Batch Creator

Scope 리포트(`specs/{KEY}-scope.md`)의 Section 6 (Task Definition Candidates)을 파싱하여
사용자 확인 후 **Jira REST API로 직접** 서브태스크를 일괄 생성한다.

```
Phase 0: Parse & Validate (소스 파싱 + 인증 + 중복 체크)
Phase 1: Task Preview + Confirm (사용자 확인)
Phase 2: Sequential Creation (REST API로 서브태스크 생성)
Phase 3: Report (결과 보고)
```

## Phase 0: Parse & Validate

1. **티켓 키 추출**: 입력에서 부모 Jira 키를 파싱한다.
   - URL: `https://khc.atlassian.net/browse/DPHRS-8` → `DPHRS-8`
   - Bare key: `DPHRS-8` → `DPHRS-8`
   - Regex: `([A-Z][A-Z0-9]+-\d+)`
   - 파싱 실패 시 → STOP

2. **태스크 소스 로드**: 두 가지 소스를 순서대로 시도한다.
   - **1순위**: `~/.claude/specs/{KEY}-scope.md` 파일의 Section 6
   - **2순위**: 사용자가 인라인으로 제공한 마크다운 테이블
   - 둘 다 없으면 → STOP with "먼저 `/jira:assess {KEY}`를 실행해주세요."

3. **마크다운 테이블 파싱**: Section 6의 테이블에서 태스크를 추출한다.
   ```
   기대 형식:
   | # | Task | Priority | Assignee | Dependencies | Effort | DoD |
   |---|------|----------|----------|-------------|--------|-----|
   | 1 | {title} | HIGH | - | - | 5h | {dod} |
   ```
   각 행에서:
   - `#`: 태스크 번호
   - `Task`: 서브태스크 제목
   - `Priority`: HIGH → High, MED → Medium, LOW → Low, 기타 → Medium
   - `Assignee`: `-` 이면 기본 담당자(현재 사용자) 사용
   - `Dependencies`: 의존 태스크 번호 (Jira description에 포함)
   - `Effort`: 공수 추정 (Jira description에 포함)
   - `DoD`: 완료 기준 (Jira description에 포함). 비어있으면 "{title}이 정상 동작함" 기본값.

4. **Jira 인증 확인 (REST API)**:
   jira CLI의 config에서 인증 정보를 추출한다:
   ```bash
   # jira CLI config에서 서버/로그인 정보 확인
   cat ~/.config/.jira/.config.yml
   ```
   필요 정보:
   - `server`: Jira 서버 URL (예: `https://khc.atlassian.net`)
   - `login`: 이메일 (예: `enzo.cho@kakaohealthcare.com`)
   - API 토큰: 환경변수 `JIRA_API_TOKEN` (config 파일에는 없음)

   **Auth 토큰 구성** (반드시 이 순서로):
   1. config에서 `login`을 읽고, `JIRA_API_TOKEN` 환경변수에서 토큰을 가져온다
   2. **server URL trailing slash 제거**: `server="${server%/}"` (이중 슬래시 방지)
   3. Basic Auth 토큰 생성: `echo -n "{login}:${JIRA_API_TOKEN}" | base64`
   4. 결과를 `{auth_token}`으로 사용

   **인증 테스트**:
   ```bash
   curl -s "https://{server}/rest/api/2/myself" \
     -H "Authorization: Basic {auth_token}" \
     -H "Content-Type: application/json"
   ```
   - 성공: 현재 사용자의 `accountId`와 `displayName` 캡처
   - 실패 → STOP with "Jira 인증 실패. `jira init`을 실행해주세요."

5. **현재 사용자 account ID 확인**:
   REST API `/rest/api/2/myself` 응답에서:
   - `accountId`: 서브태스크 assignee에 사용 (예: `712020:bbef064a-b726-40d1-9e80-71ea963b7d90`)
   - `displayName`: Preview에 표시
   - **중요**: email이 아닌 accountId를 사용해야 assignee 할당이 동작함

6. **프로젝트 키 + 서브태스크 이슈 타입 ID 확인**:
   부모 티켓을 조회하여 프로젝트 키와 서브태스크 이슈 타입 ID를 확인한다:
   ```bash
   curl -s "https://{server}/rest/api/2/issue/{KEY}" \
     -H "Authorization: Basic {auth_token}"
   ```
   응답에서:
   - `fields.project.key`: 프로젝트 키 (예: `DPHRS`)
   - 부모 티켓 존재 확인
   - 부모 미존재 → STOP

   서브태스크 이슈 타입 ID 확인 (순서대로 시도):
   1. 기존 서브태스크가 있으면 → 응답의 `fields.subtasks[0].fields.issuetype.id` 추출
   2. 없으면 → createmeta에서 subtask 여부(`subtask: true`)인 타입 조회:
   ```bash
   curl -s "https://{server}/rest/api/2/issue/createmeta?projectKeys={PROJECT}" \
     -H "Authorization: Basic {auth_token}"
   ```
   응답의 `projects[0].issuetypes` 중 `"subtask": true`인 항목의 `id`를 사용.
   **주의**: `issuetypeNames`에 "하위 작업"을 하드코딩하지 않는다 — Jira 인스턴스 언어에 따라 "Sub-task" 등 다를 수 있다.

7. **기존 서브태스크 중복 체크**:
   ```bash
   jira issue list -q "parent = {KEY}" -p {PROJECT} --plain --no-truncate
   ```
   또는 REST API:
   ```bash
   curl -s "https://{server}/rest/api/2/search?jql=parent={KEY}" \
     -H "Authorization: Basic {auth_token}"
   ```
   - 기존 서브태스크 제목 목록을 수집
   - 새 태스크와 비교하여 중복 판정:

   **중복 매칭 알고리즘**:

   **Step 1: 정규화**
   - 양쪽 제목에서 leading/trailing 공백 제거, 연속 공백을 단일 공백으로
   - 대소문자 통일 (한국어는 해당 없음, 영문은 lowercase)

   **Step 2: 정확 일치 검사**
   - 정규화된 제목이 동일하면 → 즉시 **SKIP**

   **Step 3: 토큰 기반 유사도 검사** (정확 일치 아닌 경우)
   - 토큰화: 공백 + 특수문자(`[`, `]`, `(`, `)`, `-`, `_`, `/`)로 분리
   - 불용어 제거: `의`, `및`, `등`, `를`, `을`, `이`, `가`, `에`, `for`, `the`, `a`, `an`, `and`, `or`
   - Jaccard 유사도 계산: `J(A, B) = |A ∩ B| / |A ∪ B|`
   - **J >= 0.70** → SKIP 후보 (Phase 1 Preview에서 `SKIP?` 표시, 사용자 확인)
   - **J < 0.70** → NEW (생성 대상)

   **예시**:
   ```
   기존: "사용자 권한 관리 API"     새: "사용자 권한 관리 API"     → 정확 일치, SKIP
   기존: "사용자 권한 관리 API"     새: "사용자 권한 관리"          → J=0.75, SKIP?
   기존: "사용자 추가"              새: "권한 추가"                → J=0.33, NEW
   기존: "[BE] DB 마이그레이션"     새: "DB 마이그레이션 작성"     → J=0.67, NEW
   ```

   - 모든 태스크 SKIP → STOP

## Phase 1: Task Preview + Confirm

파싱한 태스크를 사용자에게 보여주고 확인을 받는다.

### Preview 출력

```markdown
## Subtask Preview for {KEY}

**Parent**: {KEY} — {parent_title}
**Assignee**: {displayName} ({accountId 앞 8자...})
**Source**: specs/{KEY}-scope.md Section 6

| # | Title | Priority | Assignee | Status |
|---|-------|----------|----------|--------|
| 1 | {task_title} | High | {displayName} | NEW |
| 2 | {task_title} | Medium | {displayName} | NEW |
| 3 | {task_title} | - | - | SKIP (exists: {existing_key}) |

**NEW**: {count} tasks to create
**SKIP**: {count} tasks (already exist)

### Task Details
{For each NEW task:}
**#{n}: {title}**
- Priority: {priority}
- Effort: {effort}
- Dependencies: {deps}
- DoD: {dod}
```

### 사용자 확인

AskUserQuestion으로 확인:
1. **Create All** — {NEW_count}개 서브태스크 생성
2. **Edit** — 태스크 수정 요청 (수정 반영 후 Preview 재표시 → 재확인, 최대 3회)
3. **Cancel** — 생성 취소 → STOP

**Edit 동작 상세**:
- 사용자가 자연어로 수정 요청 (예: "Task #3 삭제해줘", "Task #1 제목 변경")
- 오케스트레이터가 메모리 내 태스크 목록을 수정 (scope.md는 수정하지 않음)
- 태스크 삭제 시: 해당 태스크 제거, **번호 리넘버링 하지 않음** (원래 번호 유지, 빈 번호는 SKIP)
- 태스크 추가 시: 마지막 번호 다음으로 추가
- 수정 반영 후 Preview 재출력 → AskUserQuestion 재확인

**3회 Edit 소진 시**: AskUserQuestion으로 **Create All** / **Cancel** 2지선다 강제.

## Phase 2: Sequential Creation (REST API)

확인된 NEW 태스크를 **Jira REST API로 직접** 순서대로 생성한다.

### 생성 방법

`scripts/create-subtask.sh` 헬퍼 스크립트를 사용한다 (JSON 이스케이프, 에러 파싱 내장):

```bash
~/.claude/skills/jira-dispatch/scripts/create-subtask.sh \
  --server "{server}" \
  --auth "{auth_token}" \
  --project "{PROJECT_KEY}" \
  --parent "{PARENT_KEY}" \
  --type-id "{subtask_type_id}" \
  --summary "{task_title}" \
  --priority "{priority}" \
  --account-id "{account_id}" \
  --labels "{labels}" \
  --body-file "/tmp/{KEY}-task-{n}.md"
```

description은 `/tmp/{KEY}-task-{n}.md`에 임시 파일로 작성 후 `--body-file`로 전달한다.

### Labels 처리

Labels는 **부모 티켓의 labels를 상속**한다:
- Phase 0에서 부모 티켓 조회 시 `fields.labels` 캡처
- 부모 labels가 있으면 동일 labels 적용
- 부모 labels가 없으면 빈 배열 `[]`

### Assignee 처리

1. **기본**: Phase 0에서 확인한 현재 사용자의 `accountId` 사용
2. **scope.md에서 지정된 경우**: 이름으로 검색하여 accountId 조회
   ```bash
   curl -s "https://{server}/rest/api/2/user/search?query={name}" \
     -H "Authorization: Basic {auth_token}"
   ```
3. **조회 실패 시**: assignee 필드 생략 (미지정 상태로 생성, 에러 방지)
4. **"-" 또는 빈 값**: 현재 사용자의 accountId로 할당

### Description 템플릿

**중요**: Jira REST API v2의 description 필드는 **Jira Wiki Markup**을 사용한다. Markdown(`##`, `-`)을 사용하면 렌더링이 깨진다.

```
h2. Description
{task_title}

h2. Dependencies
{dependencies — #N을 실제 Jira 키로 치환한 값. 예: "DPHRS-63, DPHRS-64" or "None"}

h2. Effort Estimation
{effort}

h2. Definition of Done
* {dod_item_1}
* {dod_item_2}
* {dod_item_3}

----
_Created by /jira:dispatch from specs/{KEY}-scope.md_
```

**Wiki Markup 변환 규칙**:
| Markdown | Jira Wiki Markup |
|----------|-----------------|
| `## Header` | `h2. Header` |
| `### Header` | `h3. Header` |
| `- item` | `* item` |
| `**bold**` | `*bold*` |
| `*italic*` | `_italic_` |
| `---` | `----` |
| `` `code` `` | `{{code}}` |

description을 `/tmp/{KEY}-task-{n}.md` 임시 파일에 작성할 때 반드시 Wiki Markup으로 작성한다.

**특수문자 이스케이프**:
- `[text]`: Jira가 유효한 링크가 아니면 무시. `[DPHRS-123]` 같은 이슈 키는 자동 링크화 (의도된 동작).
- `|` (파이프): Wiki Markup 테이블 구분자. description 본문에 `|`가 포함되면 `\|`로 이스케이프. 단, h2./h3. 헤더와 `*` 불릿 내부에서는 테이블 컨텍스트가 아니므로 이스케이프 불필요.
- `{` `}` (중괄호): Wiki Markup 매크로 구분자. `{code}`, `{color}` 등으로 해석될 수 있음. description에 중괄호가 포함되면 (예: Python dict `{"key": "value"}`) → `\{` `\}`로 이스케이프하거나, `{code}...{code}` 블록 안에 넣어 보호.
- summary 필드는 plain text 처리되므로 이스케이프 불필요.

**DoD 줄바꿈 처리**: scope.md Section 6의 DoD 셀에 줄바꿈이나 여러 항목이 있으면, 각 항목을 `* ` 접두사로 분리하여 Wiki Markup 불릿 리스트로 변환. 구분자: `, ` 또는 `\n` 또는 실제 줄바꿈.

**코드블록 변환**: DoD에 마크다운 코드블록(```)이 포함된 경우 → Jira `{code}...{code}` 블록으로 변환.

### 실행 규칙

1. **순차 실행**: 번호 순서대로 하나씩 생성
2. **개별 실패 허용**: 실패해도 나머지 계속
3. **키 캡처 + 맵 유지**: 생성 성공 시 `{태스크번호 → Jira키}` 맵에 기록. 예: `{1: "DPHRS-63", 2: "DPHRS-64", ...}`
4. **Dependencies 키 치환**: description 작성 시, Dependencies 값의 `#N` 참조를 맵에서 조회하여 실제 Jira 키로 치환
   - `#1, #2, #3` → `DPHRS-63, DPHRS-64, DPHRS-65`
   - 맵에 없는 번호 (생성 실패 or SKIP된 태스크) → `#N (미생성)` 그대로 유지
   - **치환은 description 임시 파일 작성 시점에 수행** (create-subtask.sh 호출 전)
5. **진행률 출력**:
   ```
   [1/5] Created DPHRS-63: SystemRole Enum + Role ORM 모델 정의
   [2/5] Created DPHRS-64: DB 마이그레이션
   [3/5] FAILED: 관리자 역할 관리 API — 400 Bad Request: {error}
   ```

### 에러 처리

| 에러 | 동작 |
|------|------|
| 400 Bad Request | 에러 메시지 파싱, 기록 후 다음 태스크 |
| 401 Unauthorized | 전체 중단 (인증 만료) |
| 403 Forbidden | 에러 기록, 다음 태스크 |
| 네트워크 타임아웃 | 1회 재시도, 실패 시 기록 후 진행 |
| JSON 파싱 에러 | 에러 기록, 다음 태스크 |

## Phase 3: Report

### 결과 출력

```markdown
## jira:dispatch Complete — {KEY}

| # | Key | Title | Priority | Assignee | Result |
|---|-----|-------|----------|----------|--------|
| 1 | DPHRS-63 | {title} | High | {name} | Created |
| 2 | DPHRS-64 | {title} | Medium | {name} | Created |
| 3 | - | {title} | - | - | Skipped (exists: DPHRS-42) |
| 4 | - | {title} | High | {name} | Failed: {reason} |

### Summary
- **Created**: {count}
- **Skipped**: {count}
- **Failed**: {count}

### Created Issues
- https://{server}/browse/DPHRS-63
- https://{server}/browse/DPHRS-64
```

## Hard Rules

1. **사용자 확인 필수** — Phase 1에서 Create All 확인 없이 절대 생성하지 않음
2. **중복 생성 금지** — 기존 서브태스크와 제목이 동일하면 SKIP
3. **개별 실패 허용** — 개별 태스크 실패가 배치 전체를 중단하지 않음 (401 제외)
4. **REST API 직접 호출** — jira CLI `issue create` 대신 curl + REST API 사용 (안정성)
5. **accountId 사용** — assignee는 반드시 accountId로 지정 (email/displayName 불가)
6. **코드 수정 금지** — Jira 서브태스크만 생성, 코드 파일을 수정하지 않음
7. **Edit 루프 제한** — 최대 3회 편집 후 Create All 또는 Cancel 강제
8. **순차 생성** — 병렬 생성하지 않음 (Jira API rate limit 방지)
9. **DoD 필수** — DoD가 비어있으면 "{title}이 정상 동작함" 기본값 사용
10. **Description 포함** — 모든 서브태스크에 Dependencies, Effort, DoD를 description에 포함

## Known Issues & Workarounds

### jira CLI `issue create` 안정성 문제 (2026-04-07 발견)
- **증상**: `jira issue create -t "Sub-task"` 실행 시 issue type config 에러, assignee 매칭 실패, 명령 hang
- **원인**: jira CLI config에 issue type ID 누락, assignee가 email로 매칭 안됨
- **해결**: REST API 직접 호출로 전환. jira CLI는 조회(`issue view`, `issue list`, `me`)에만 사용.

### create-subtask.sh 환경변수 export 누락 (2026-04-09 발견)
- **증상**: Python heredoc에서 `os.environ["PROJECT"]` → KeyError
- **원인**: bash 변수를 Python subprocess에 전달하려면 `export` 필요하나 누락
- **해결**: `export PROJECT PARENT SUMMARY TYPE_ID PRIORITY DESCRIPTION ACCOUNT_ID LABELS SERVER` 추가

### assignee email 매칭 불가 (2026-04-07 발견)
- **증상**: `-a "enzo.cho@kakaohealthcare.com"` → "Unable to find associated user"
- **원인**: Jira Cloud에서 email 기반 사용자 검색이 비활성화되어 있음
- **해결**: `/rest/api/2/myself`에서 accountId 확인 후 사용. 타인 assignee는 `/rest/api/2/user/search` 사용.

## Error Handling

| Scenario | Action |
|----------|--------|
| scope.md 미존재 | STOP with "먼저 /jira:assess를 실행해주세요" |
| Section 6 파싱 실패 | STOP with "Section 6 테이블 형식이 올바르지 않습니다" |
| Jira 인증 실패 (REST API) | STOP with "Jira 인증이 만료되었습니다. `jira init`을 실행해주세요" |
| 부모 티켓 미존재 | STOP with "부모 티켓이 존재하지 않습니다" |
| 서브태스크 이슈 타입 ID 조회 실패 | STOP with "서브태스크 이슈 타입을 찾을 수 없습니다" |
| 모든 태스크 SKIP | STOP with "모든 태스크가 이미 존재합니다" |
| 개별 생성 실패 | 기록 후 다음 태스크로 진행, Phase 3에서 보고 |
| 401 응답 (인증 만료) | 전체 중단, 인증 재설정 안내 |
| 사용자 Cancel | STOP with "서브태스크 생성이 취소되었습니다" |
