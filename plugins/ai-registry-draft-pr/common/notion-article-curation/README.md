# Notion Article Curation

AI 관련 아티클 링크를 Notion DB에 자동으로 추가하는 플러그인.

## 기능

- 링크 목록을 받아 Notion AI Articles Curation DB에 추가
- 중복 URL 자동 체크 및 스킵
- WebFetch로 원문 분석 후 Key Insight/Summary 자동 생성
- 카테고리 자동 분류 (Claude Code, Claude API, MCP, Agent SDK, AI Coding Tools, AI Trends)
- 30개 이상 대량 처리 시 병렬 Agent 활용

## 사전 요구사항

1. **Notion MCP 플러그인** (`Notion@claude-plugins-official`) 설치 및 OAuth 인증
2. 솔루션개발팀 Notion 워크스페이스 접근 권한

## 설치

```bash
claude install ai-registry --name notion-article-curation
```

## 사용법

```text
/notion-article-curation

https://example.com/article1
https://example.com/article2
https://example.com/article3
```

또는 대화 중 "아티클 추가", "링크 추가", "큐레이션" 등의 트리거로 자동 활성화.

## 대상 DB

- **AI Articles Curation** (솔루션개발팀 위키 하위)
- Data Source ID: `314d87e5-17f4-8198-be4c-000b127b0496`
