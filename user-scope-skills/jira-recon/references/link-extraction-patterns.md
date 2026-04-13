# Link Extraction Patterns

Phase 2에서 URL을 추출하고 분류할 때 사용하는 패턴.

## Notion URLs
```
Pattern: https?://(?:www\.)?notion\.(?:so|site)/[^\s)\]>"']+
```
- `https://www.notion.so/khcmst/Page-Title-abc123def456`
- `https://notion.so/workspace/abc123`
- `https://myspace.notion.site/Page-Title-abc123`

## GitHub Issue/PR URLs
```
Pattern: https?://github\.com/([^/]+)/([^/]+)/(issues|pull)/(\d+)
Groups: owner, repo, type(issues|pull), number
```
- `https://github.com/khc-dp/clue-client/issues/1152`
- `https://github.com/khc-dp/clue-api/pull/728`

## Google Sheets
```
Pattern: https?://docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)
```

## Google Docs
```
Pattern: https?://docs\.google\.com/document/d/([a-zA-Z0-9_-]+)
```

## Jira Cross-References
```
Pattern: https?://[^/]*atlassian\.net/browse/([A-Z][A-Z0-9]+-\d+)
```

## Google Chat (reference only, not fetchable)
```
Pattern: https?://chat\.google\.com/[^\s)\]>"']+
```

## Domain Boundary

Fetch 대상 도메인:
- `notion.so`, `notion.site`
- `github.com`
- `docs.google.com`
- `*.atlassian.net`

기타 도메인 URL은 Links Index에 기록만 하고 fetch하지 않는다.
