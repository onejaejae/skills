# session-init: State Management Commands

## 이전 State 검색

```bash
# 최근 5개 state 파일에서 session-init 키 검색
for f in $(ls -t ~/.hoyeon/*/state.json 2>/dev/null | head -5); do
  has_init=$(cat "$f" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'session-init' in d else 'no')" 2>/dev/null)
  if [ "$has_init" = "yes" ]; then
    echo "FOUND: $f"
    cat "$f" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['session-init'], indent=2, ensure_ascii=False))"
    break
  fi
done
```

## 자동 감지

```bash
# 현재 branch
git branch --show-current 2>/dev/null

# 현재 branch의 PR
gh pr list --head "$(git branch --show-current)" --json number,title,url --jq '.[0]' 2>/dev/null

# 현재 worktree
pwd

# 최근 변경 파일
git diff --name-only HEAD~3..HEAD 2>/dev/null | head -10
```

## Non-Git 디렉토리 처리

git 명령이 실패하면 (exit code != 0):
1. "현재 디렉토리는 git 저장소가 아닙니다" 안내
2. 프로젝트 경로를 사용자에게 요청
3. 경로를 받으면 해당 디렉토리에서 자동 감지 재실행

## State 저장

```bash
SESSION_ID="$CLAUDE_SESSION_ID"
mkdir -p "$HOME/.hoyeon/$SESSION_ID/files"
hoyeon-cli session set --sid "$SESSION_ID" --json "$(jq -n \
  --arg task "[task]" \
  --arg branch "[branch]" \
  --arg pr "[pr or null]" \
  --arg worktree "[worktree]" \
  --arg scope "[scope]" \
  --arg approach "[approach or null]" \
  --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{"session-init": {
    task: $task, branch: $branch, pr: $pr, worktree: $worktree,
    scope: $scope, approach: $approach, created_at: $created_at,
    status: "active"
  }}')"
```

## Context 파일 생성

```bash
cat > "$HOME/.hoyeon/$SESSION_ID/files/session-context.md" << 'CTXEOF'
# Session Context

| 항목 | 값 |
|------|---|
| **Task** | [task] |
| **Branch** | [branch] |
| **PR** | [pr] |
| **Worktree** | [worktree] |
| **Scope** | [scope] |
| **Approach** | [approach] |
| **Started** | [timestamp] |

## Scope Rules
- 수정 가능: [scope에 포함된 파일/디렉토리]
- scope 밖 수정 시: 사용자 확인 필요
CTXEOF
```

## State JSON Schema

```json
{
  "session-init": {
    "task": "string (필수)",
    "branch": "string (필수)",
    "pr": "string | null",
    "worktree": "string",
    "scope": "string (기본: '전체')",
    "approach": "string | null",
    "created_at": "ISO-8601",
    "status": "active | completed"
  }
}
```
