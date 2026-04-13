---
name: jira-recon
description: |
  Use when "/jira:recon", "지라 리서치", "지라 분석", "티켓 분석", "티켓 리서치",
  "지라 정리", "jira research", "jira recon", "ticket research",
  "analyze jira ticket", "이 티켓 정리해줘", "JIRA 티켓 조사".
  Also use when the user shares a Jira URL containing "atlassian.net/browse/" and
  asks for analysis, research, or investigation of the ticket.
---

# /jira:recon — Jira Ticket A-Z Research

Jira 티켓을 받아 모든 관련 정보를 병렬로 수집하고 구조화된 리서치 리포트를 생성한다.
리포트의 주요 소비자는 `jira:assess` 스킬(기계 파싱)이므로 섹션 구조가 고정되고 예측 가능해야 한다.

```
Phase 0: Parse & Validate → STOP
Phase 1: Fetch ticket + subtasks + epic (direct CLI)
Phase 2: Extract + classify URLs (direct)
Phase 3: Parallel link fetching (direct MCP + CLI)
Phase 4: Synthesis → ~/.claude/specs/{KEY}-research.md
```

## Phase 0: Parse & Validate

1. **티켓 키 추출**: 입력에서 Jira 키를 파싱한다.
   - URL: `https://khc.atlassian.net/browse/DPHRS-8?...` → `DPHRS-8`
   - Bare key: `DPHRS-8` → `DPHRS-8`
   - Regex: `([A-Z][A-Z0-9]+-\d+)`
   - 파싱 실패 시: "Jira 키를 파싱할 수 없습니다. DPHRS-8 형태의 키 또는 URL을 입력해주세요." → STOP

2. **jira CLI 확인**:
   ```bash
   command -v jira && jira me 2>&1
   ```
   - CLI 없음: "jira CLI가 설치되어 있지 않습니다." → STOP
   - 인증 실패: "jira CLI 인증이 필요합니다. `jira init`을 실행해주세요." → STOP

3. **출력 디렉토리 확인**:
   ```bash
   mkdir -p ~/.claude/specs
   ```
   기존 `specs/{KEY}-research.md`가 있으면 **자동 덮어쓰기** (이전 리서치 갱신 목적).

4. **상태 출력**:
   ```
   ## jira:recon — {KEY}
   Researching ticket {KEY}...
   Output: ~/.claude/specs/{KEY}-research.md
   ```
   그 후 바로 Phase 1로 진행한다. 사용자 입력 대기 불필요 — 이 스킬은 자율적으로 끝까지 실행.

## Phase 1: Fetch Jira Data (Main + Subtasks + Epic)

**직접 실행한다 (에이전트 불필요).** Jira CLI 호출은 빠르므로 순차 실행이 효율적이다.

### 실행 순서

1. **메인 티켓 fetch**:
   ```bash
   jira issue view {KEY} --plain --comments 10
   ```
   메인 티켓의 모든 필드와 최근 10개 코멘트를 수집한다.
   - 코멘트가 10개 초과인 경우: Section 6 (Open Questions)에 "코멘트 {N}개 중 최근 10개만 수집됨. 이전 코멘트에 중요 결정사항이 있을 수 있음" 기록.
   - 코멘트 총 수 확인: `jira issue view` 출력에서 comments count 파싱. 불가하면 무시.

2. **서브태스크 목록 fetch**:
   ```bash
   jira issue list -q "parent = {KEY}" --plain --no-truncate
   ```
   **주의**: `--parent` 플래그는 동작하지 않음 (Known Issue). JQL로 서브태스크를 조회한다.

3. **각 서브태스크 상세 fetch** (발견된 만큼):
   - 서브태스크 description에 `"Created by /jira:dispatch"` 마커가 있는지 확인
   - **마커 있음** → 상세 fetch 스킵. Section 3 테이블에 제목/상태만 기록하고 `[dispatch-created, not fetched]` 표시
   - **마커 없음** → 상세 fetch 실행:
   ```bash
   jira issue view {SUBTASK_KEY} --plain --comments 5
   ```

4. **에픽 link 확인 및 fetch** (필수 확인 단계):
   - 메인 티켓 출력에서 Epic Link 필드를 반드시 확인한다
   - **에픽 링크 있음** → fetch 실행:
     ```bash
     jira issue view {EPIC_KEY} --plain
     ```
     - fetch 실패 시: `[FETCH FAILED: epic]` 마킹, Section 1 Overview에 기록, Phase 2로 계속 진행
   - **에픽 링크 없음** → Section 1 Overview의 Epic 필드에 "N/A (no epic link)" 기록
   - **확인 자체를 건너뛰지 않는다** — 에픽이 있든 없든 이 단계를 반드시 거친다

5. 모든 Jira 텍스트에서 **URL을 즉시 추출**하여 Phase 2 입력으로 전달.

이 방식이 에이전트 2개를 생성하는 것보다 빠르다 — Jira CLI 호출은 각각 1-3초이므로 에이전트 오버헤드가 더 크다.

## Phase 2: URL Extraction & Classification

에이전트 결과에서 모든 URL을 추출하고 분류한다. 이 단계는 오케스트레이터가 직접 수행한다 (에이전트 불필요).

### URL 패턴 (references/link-extraction-patterns.md 참조)

| 유형 | 패턴 | Fetch 방법 |
|------|------|-----------|
| Notion | `notion.so/*`, `notion.site/*` | `mcp__claude_ai_Notion__notion-fetch` |
| GitHub Issue/PR | `github.com/{owner}/{repo}/(issues\|pull)/{num}` | `gh issue view` / `gh pr view` |
| Google Sheets | `docs.google.com/spreadsheets/d/*` | `WebFetch` |
| Google Docs | `docs.google.com/document/d/*` | `WebFetch` |
| Jira Cross-ref | `atlassian.net/browse/{KEY}` | `jira issue view` |
| Google Chat | `chat.google.com/*` | 참조만 기록 (fetch 불가) |

### 처리 규칙

1. **중복 제거**: 동일 URL은 1회만 fetch
2. **도메인 경계**: notion.so, github.com, docs.google.com, atlassian.net 도메인만 fetch. 기타 URL은 Links Index에 기록만.
3. **방문 추적**: `visited_urls` 집합으로 재귀 fetch 시 중복 방지

분류 완료 후 요약 출력:
```
Links found: {N}
  Notion: {n1} | GitHub: {n2} | Google: {n3} | Jira: {n4} | Other: {n5}
Fetching...
```

**URL이 0개인 경우**: Phase 3 전체 스킵, Phase 4로 직행. Links Index는 비어있는 상태로 생성.

## Phase 3: Parallel Link Fetching

분류된 URL을 **유형별로 병렬** fetch한다.

### 직접 fetch (에이전트 불필요)

빠른 CLI 호출은 직접 실행한다:
- **GitHub**: `gh issue view {num} --repo {owner}/{repo}` 또는 `gh pr view`
- **Jira Cross-ref**: `jira issue view {CROSS_KEY} --plain`
- **Google Sheets/Docs**: `WebFetch(url: "{url}")`

### Notion 페이지 fetch (직접 MCP 호출)

Notion URL은 `mcp__claude_ai_Notion__notion-fetch`를 직접 호출한다:
```
mcp__claude_ai_Notion__notion-fetch(id: "{notion_url}")
```

여러 Notion 페이지가 있으면 **병렬로 호출** (단일 메시지에 여러 tool call).

Notion 콘텐츠에서 발견되는 추가 Notion URL도 fetch한다:
1. `visited_urls`에 없는 URL만 필터
2. 추가 Notion fetch 실행
3. 반복 — 새 URL이 발견되지 않을 때까지
4. **안전 장치**: 총 fetch 페이지 수 30개 캡. 캡 초과 URL은 Links Index에 `[NOT FETCHED: cap reached]`로 기록.

### Notion 콘텐츠 후처리

Notion fetch 응답에서 다음을 수행한다:

1. **S3 이미지 URL 제거**: `https://s3.*.amazonaws.com/`, `https://prod-files-secure.s3.*.amazonaws.com/`, `https://*.cloudfront.net/` 패턴의 이미지 URL을 감지하여 제거
   - `![alt](s3_url)` → `![alt](image stripped)` (alt text 보존)
   - 인라인 이미지 URL만 단독으로 있으면 → 삭제
   - 제거한 이미지 수를 기록: "Stripped {N} image URLs from Notion content"
2. **Why**: Notion S3 이미지 URL은 총 토큰의 40-60%를 차지하지만 텍스트 리서치에 가치 없음 (DPHRS-8 E2E에서 확인)

### 에러 처리 및 재시도

개별 fetch 실패 시:
1. **1차 재시도**: 동일 요청 재실행
2. **1회 실패 후**: `[FETCH FAILED: {reason}]` 마커 기록, 계속 진행

재시도를 2회→1회로 줄인 이유: iteration-1에서 실패한 소스는 대부분 권한/존재하지 않음 문제이므로 재시도해도 결과가 동일했다.

## Phase 4: Synthesis

수집된 모든 데이터를 고정된 7-섹션 구조로 합성하여 `~/.claude/specs/{KEY}-research.md`에 저장한다.

### Confidence 계산

| 등급 | 조건 |
|------|------|
| **HIGH** | 모든 소스 fetch 성공 |
| **MED** | 1-2개 소스 실패 |
| **LOW** | 3개 이상 소스 실패 |

### 리포트 템플릿

`references/report-template.md`의 구조를 정확히 따른다. 섹션 번호와 헤더는 변경하지 않는다 — jira:assess가 이 구조에 의존한다.

핵심 규칙:
- **Section 5 (Domain-Specific Data)**: Notion 콘텐츠에 마크다운 테이블이 감지되면 구조화 추출. 감지되지 않으면 이 섹션에 "No structured domain data detected." 기록하고 Section 4에 원본 덤프.
- **Section 6 (Open Questions)**: 티켓/스펙에서 발견된 미결 항목, TBD 마크, 논의 필요 표시, 소스 간 모순을 목록화.
- **Section 7 (Links Index)**: 유형별로 분류된 모든 URL. fetch 성공/실패 상태 포함.

### 완료 출력

```
## jira:recon Complete

**Confidence: {HIGH|MED|LOW}** — {fetched}/{total} sources
**Report**: ~/.claude/specs/{KEY}-research.md
**Sections**: 7 | **Subtasks**: {N} | **Links**: {N} fetched, {N} failed

{Failed sources list if any}

Next: /jira:assess {KEY}
```

## Hard Rules

1. **자율 실행** — Phase 0 → 4까지 사용자 입력 대기 없이 끝까지 자율 실행
2. **섹션 구조 고정** — 7개 섹션의 번호와 헤더를 변경하지 않는다
3. **도구 직접 호출 우선** — CLI(jira, gh)와 MCP(notion-fetch)는 에이전트 없이 직접 호출. 에이전트는 병렬이 필요할 때만.
4. **방문 URL 추적** — 동일 URL 중복 fetch 방지
5. **30페이지 캡** — 총 Notion 페이지 fetch 수 (재귀 포함) 30개 제한. 캡 도달 시 나머지는 Links Index에 `[NOT FETCHED: cap reached]`
6. **1회 재시도 후 계속** — 개별 실패는 1회 재시도 후 `[FETCH FAILED: {reason}]` 마킹하고 진행. 재시도해도 동일 결과 예상 시(401, 404) 재시도 생략.
7. **메인 티켓 필수** — 메인 티켓 fetch 실패 시만 전체 중단. 메인 티켓 fetch 성공이지만 description/코멘트/서브태스크가 모두 비어있으면 Confidence를 LOW로 설정하고 Section 6에 "티켓 정보 불충분: description, 코멘트, 서브태스크 모두 없음" 기록
8. **코드 수정 금지** — 리서치만 수행, 코드 파일 수정하지 않음
9. **Section 4 간결화** — Notion 원본은 페이지당 최대 500자(한글 기준, 영문은 ~1000자) 핵심 요약 (원문 전체 복사 금지). 테이블/코드블록은 원형 보존. 구조화 가능한 테이블/매트릭스는 Section 5로 추출.
10. **Open Questions 최소 1개** — Section 6에 미결 항목이 0개면 TBD/논의 필요/미정/? 마커를 재스캔. 재스캔 후에도 0개면 "No open questions identified after re-scan" 기록하고 빈 섹션으로 유지 (강제 생성하지 않음). 대부분의 티켓에는 1개 이상의 미결 사항이 존재하지만, 정말로 없을 수도 있다.
11. **에픽 확인 필수** — Phase 1 step 4는 건너뛸 수 없다. 에픽 링크 유무를 반드시 확인하고, 있으면 fetch, 없으면 "N/A" 기록. (DPHRS-8 E2E에서 누락 발생)
12. **Dispatch 서브태스크 스킵** — description에 "Created by /jira:dispatch" 마커가 있는 서브태스크는 상세 fetch 스킵. Section 3 테이블에 기본 정보만 기록. (토큰 절감)
13. **Notion 이미지 URL 제거** — S3/CloudFront 이미지 URL은 Phase 3에서 제거. alt text만 보존. (DPHRS-8 E2E에서 토큰 60% 차지 확인)
