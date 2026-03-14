#!/bin/bash
# PR Review Threads 조회 + 파싱 스크립트
# Usage: get-review-threads.sh [PR_NUMBER] [OWNER/REPO]
# - PR_NUMBER 생략 시: 현재 브랜치의 PR 자동 감지
# - OWNER/REPO 생략 시: 현재 git repo에서 자동 감지

set -e

# --- Auto-detect OWNER/REPO ---
if [ -n "$2" ]; then
    OWNER=$(echo "$2" | cut -d'/' -f1)
    REPO=$(echo "$2" | cut -d'/' -f2)
else
    REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login) \(.name)"')
    OWNER=$(echo "$REPO_INFO" | cut -d' ' -f1)
    REPO=$(echo "$REPO_INFO" | cut -d' ' -f2)
fi

# --- Auto-detect PR number ---
if [ -n "$1" ]; then
    PR_NUMBER=$1
else
    BRANCH=$(git branch --show-current)
    PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" = "null" ]; then
        echo "ERROR: No PR found for branch '$BRANCH'" >&2
        exit 1
    fi
fi

# --- Fetch review threads via GraphQL ---
RAW=$(gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      url
      title
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 20) {
            nodes {
              id
              body
              author { login }
              createdAt
              path
              line
            }
          }
        }
      }
    }
  }
}' -F owner="$OWNER" -F repo="$REPO" -F pr="$PR_NUMBER")

# --- Parse and summarize with jq ---
echo "$RAW" | jq -r --arg owner "$OWNER" --arg repo "$REPO" --arg pr "$PR_NUMBER" '
.data.repository.pullRequest as $pr |
$pr.reviewThreads.nodes as $threads |

# Count by status
($threads | map(select(.isResolved)) | length) as $resolved |
($threads | map(select(.isOutdated and (.isResolved | not))) | length) as $outdated |
($threads | map(select(.isResolved | not) | select(.isOutdated | not)) | length) as $active |

"PR_URL: \($pr.url)",
"PR_TITLE: \($pr.title)",
"TOTAL: \($threads | length) | RESOLVED: \($resolved) | OUTDATED: \($outdated) | ACTIVE: \($active)",
"",

# Skipped threads
"## SKIPPED",
($threads | to_entries[] |
  select(.value.isResolved or .value.isOutdated) |
  .value as $t |
  $t.comments.nodes[0] as $c |
  (if $t.isResolved then "RESOLVED" else "OUTDATED" end) as $status |
  "\($t.id)\t\($status)\t\($c.author.login)\t\($c.path // "-"):\($c.line // "-")\t\($c.body | gsub("\n"; " ") | .[:100])"),

"",
"## ACTIVE",
($threads | to_entries[] |
  select(.value.isResolved | not) |
  select(.value.isOutdated | not) |
  .value as $t |
  $t.comments.nodes[0] as $c |
  ($t.comments.nodes | length) as $reply_count |
  "\($t.id)\tACTIVE\t\($c.author.login)\t\($c.path // "-"):\($c.line // "-")\t\($reply_count) replies\t\($c.body | gsub("\n"; " ") | .[:150])")
'
