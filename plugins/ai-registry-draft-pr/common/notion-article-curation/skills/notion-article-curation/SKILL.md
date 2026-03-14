---
name: notion-article-curation
description: >
  Notion AI Articles Curation DB에 아티클 링크를 추가하는 스킬.
  Use when "아티클 추가", "링크 추가", "article curation", "큐레이션",
  "링크 정리해줘", "이 링크들 노션에 추가", "아티클 큐레이션", "add articles".
---

# Notion Article Curation

링크 목록을 받아 AI Articles Curation DB에 중복 없이 추가하고, Key Insight/Summary를 자동 생성.

## Prerequisites

- **Notion MCP 플러그인** (`Notion@claude-plugins-official`) 설치 및 OAuth 인증 필수
- 솔루션개발팀 Notion 워크스페이스 접근 권한 필요

## Target Database

- **DB**: AI Articles Curation (솔루션개발팀 위키)
- **Data Source ID**: `314d87e5-17f4-8198-be4c-000b127b0496`
- **Schema**:

| Property | Type | 설명 |
|----------|------|------|
| Title | title | 아티클 제목 |
| Category | select | `Claude Code`, `Claude API`, `MCP`, `Agent SDK`, `AI Coding Tools`, `AI Trends` |
| Key Insight | text | 핵심 인사이트 1문장 (한국어) |
| Summary | text | 요약 2-3문장 (한국어) |
| URL | url | 원본 링크 (`userDefined:URL` 프리픽스 필수) |

## Workflow

### Step 1: 링크 수집

사용자로부터 링크 목록을 입력받는다. 형식 무관 (줄바꿈, 쉼표, 리스트 등).

### Step 2: 중복 체크

기존 DB에서 URL을 조회하여 이미 존재하는 링크를 제외한다.

```text
notion-search로 각 URL의 핵심 키워드 검색 (data_source_url 지정)
→ 기존 URL과 정확히 일치하는 항목 제외
→ 새 링크만 남김
```

**중복 판정 기준**: URL의 핵심 부분(도메인 + path)이 동일하면 중복. query parameter(utm 등) 차이는 무시.

**Rate Limit 주의**: notion-search를 **최대 5개씩** 병렬 호출. 한 번에 10개 이상 호출하면 429 에러 발생.

```text
❌ 14개 동시 검색 → 429 rate limit
✅ 5개씩 3회로 나눠서 검색
```

결과를 사용자에게 보고:
```text
📋 입력: N개 링크
  ├─ 🔄 중복: X개 (스킵)
  └─ ✅ 신규: Y개 (추가 예정)
```

### Step 3: 콘텐츠 분석 및 분류

각 신규 링크에 대해 WebFetch로 원문을 분석한다. **WebFetch는 최대 7개씩** 병렬 호출.

1. **WebFetch**로 원문 내용 추출
2. **Title**: 페이지 제목 추출 (원문의 핵심 주제를 반영한 명확한 한국어 제목)
3. **Category**: 내용 기반 분류
   - `Claude Code` - Claude Code CLI, 스킬, 플러그인, 훅, 워크플로우
   - `Claude API` - Anthropic API, Claude SDK, 모델 사용법
   - `MCP` - Model Context Protocol, MCP 서버/클라이언트
   - `Agent SDK` - Agent 프레임워크, 에이전트 개발
   - `AI Coding Tools` - Cursor, Copilot, Windsurf, 코딩 도구 전반
   - `AI Trends` - AI 업계 동향, 일반 AI 뉴스, 위 카테고리에 해당하지 않는 것
4. **Key Insight**: 핵심 메시지 1문장 (한국어)
5. **Summary**: 핵심 내용 2-3문장 (한국어)

### Step 4: DB에 추가

`notion-create-pages`로 일괄 생성:

```json
{
  "parent": {"data_source_id": "314d87e5-17f4-8198-be4c-000b127b0496"},
  "pages": [
    {
      "properties": {
        "Title": "아티클 제목",
        "Category": "카테고리명",
        "Key Insight": "핵심 인사이트 1문장",
        "Summary": "요약 2-3문장",
        "userDefined:URL": "https://..."
      }
    }
  ]
}
```

**배치 규칙**:
- 25개 이하: 단일 호출
- 26개 이상: 25개씩 분할하여 순차 호출

### Step 5: 결과 보고

```text
✅ 추가 완료!

| # | Title | Category | Key Insight |
|---|-------|----------|-------------|
| 1 | ... | Claude Code | ... |
| 2 | ... | AI Trends | ... |

총 Y개 추가 / X개 중복 스킵
```

## 대량 처리 (30개 이상)

30개 이상일 경우 Step 3~4를 **병렬 Background Agent**로 처리:

1. 링크를 15-20개씩 배치 분할
2. 각 배치를 별도 background Task agent에 할당
3. 각 agent가 WebFetch → 분류 → Key Insight/Summary 생성 → notion-create-pages 실행
4. 모든 agent 완료 후 결과 종합 보고

**Agent 프롬프트에 반드시 포함할 정보**:
- Data Source ID: `314d87e5-17f4-8198-be4c-000b127b0496`
- 카테고리 목록 및 분류 기준
- Property 형식 (특히 `userDefined:URL`)
- Key Insight/Summary 생성 규칙 (한국어, 문장 수)

## Common Mistakes

| 실수 | 해결 |
|------|------|
| `URL` 대신 `userDefined:URL` 미사용 | Notion MCP 규칙: url/id 이름은 `userDefined:` 프리픽스 필수 |
| 중복 체크 없이 추가 | Step 2 반드시 선행 |
| WebFetch 실패 시 빈 값 | Title은 URL에서 추출, Category는 `AI Trends` 기본값 |
| notion-search 10개+ 동시 호출 | **최대 5개씩** 병렬 호출. 초과 시 429 rate limit |
| WebFetch 10개+ 동시 호출 | **최대 7개씩** 병렬 호출. 나머지는 다음 라운드에서 |
| notion-create-pages에 100개 한번에 | 안정성 위해 **25개 이하**로 분할 |
