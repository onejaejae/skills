#!/usr/bin/env bash
# create-subtask.sh — Jira REST API를 사용한 서브태스크 생성 헬퍼
#
# Usage:
#   ./create-subtask.sh \
#     --server "https://khc.atlassian.net" \
#     --auth "BASE64_AUTH_TOKEN" \
#     --project "DPHRS" \
#     --parent "DPHRS-8" \
#     --type-id "10487" \
#     --summary "[BE] SystemRole Enum 정의" \
#     --priority "High" \
#     --account-id "712020:xxxx" \
#     --labels "HRS" \
#     --body-file "/tmp/desc.md"
#
# jira:dispatch 스킬에서 호출하는 REST API 래퍼 스크립트.
# jira CLI 대신 curl + Jira REST API v2를 직접 사용한다.
#
# 2026-04-07 v1: REST API 직접 호출 방식으로 전환
# 2026-04-07 v2: Python JSON 빌드로 교체 (assignee 누락 + description 이스케이프 버그 수정)
#   - 기존: bash 문자열 조합으로 JSON 빌드 → 특수문자(:, \n 등)에서 깨짐
#   - 변경: Python json.dumps()로 안전한 JSON 생성
#   - Description: Jira Wiki Markup 사용 (Markdown은 Jira REST API v2에서 깨짐)

set -euo pipefail

# Parse arguments
SERVER=""
AUTH=""
PROJECT=""
PARENT=""
TYPE_ID=""
SUMMARY=""
PRIORITY="Medium"
ACCOUNT_ID=""
LABELS=""
BODY_FILE=""
BODY_TEXT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --server) SERVER="$2"; shift 2 ;;
    --auth) AUTH="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --parent) PARENT="$2"; shift 2 ;;
    --type-id) TYPE_ID="$2"; shift 2 ;;
    --summary) SUMMARY="$2"; shift 2 ;;
    --priority) PRIORITY="$2"; shift 2 ;;
    --account-id) ACCOUNT_ID="$2"; shift 2 ;;
    --labels) LABELS="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --body) BODY_TEXT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Validate required args
if [[ -z "$SERVER" || -z "$AUTH" || -z "$PROJECT" || -z "$PARENT" || -z "$TYPE_ID" || -z "$SUMMARY" ]]; then
  echo '{"error": "Missing required arguments: --server, --auth, --project, --parent, --type-id, --summary"}' >&2
  exit 1
fi

# Read body from file or use text
DESCRIPTION=""
if [[ -n "$BODY_FILE" && -f "$BODY_FILE" ]]; then
  DESCRIPTION=$(cat "$BODY_FILE")
elif [[ -n "$BODY_TEXT" ]]; then
  DESCRIPTION="$BODY_TEXT"
fi

# Export variables for Python subprocess
export PROJECT PARENT SUMMARY TYPE_ID PRIORITY DESCRIPTION ACCOUNT_ID LABELS SERVER

# Build JSON payload using Python (safe escaping, no manual string concat)
PAYLOAD=$(python3 << 'PYEOF'
import json, os, sys

fields = {
    "project": {"key": os.environ["PROJECT"]},
    "parent": {"key": os.environ["PARENT"]},
    "summary": os.environ["SUMMARY"],
    "issuetype": {"id": os.environ["TYPE_ID"]},
    "priority": {"name": os.environ["PRIORITY"]},
    "description": os.environ.get("DESCRIPTION", ""),
}

# Assignee — only add if account ID is provided
account_id = os.environ.get("ACCOUNT_ID", "")
if account_id:
    fields["assignee"] = {"accountId": account_id}

# Labels — comma-separated string to list
labels_str = os.environ.get("LABELS", "")
if labels_str:
    fields["labels"] = [l.strip() for l in labels_str.split(",") if l.strip()]
else:
    fields["labels"] = []

print(json.dumps({"fields": fields}, ensure_ascii=False))
PYEOF
)

# Make REST API call
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SERVER}/rest/api/2/issue" \
  -H "Authorization: Basic ${AUTH}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>&1)

# Parse response
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "201" ]]; then
  # Success — extract issue key and build response
  python3 -c "
import json, sys, os
d = json.load(sys.stdin)
key = d['key']
server = os.environ['SERVER']
print(json.dumps({'status': 'created', 'key': key, 'url': f'{server}/browse/{key}'}))
" <<< "$BODY"
elif [[ "$HTTP_CODE" == "401" ]]; then
  echo '{"status": "auth_error", "code": 401, "message": "Authentication failed"}' >&2
  exit 2
else
  # Parse error response
  python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    msgs = d.get('errorMessages', []) or []
    errs = d.get('errors', {}) or {}
    all_msgs = list(msgs) + [f'{k}: {v}' for k, v in errs.items()]
    msg = ' | '.join(all_msgs) if all_msgs else 'Unknown error'
except (json.JSONDecodeError, Exception) as e:
    msg = f'Parse error: {type(e).__name__}'
code = int(sys.argv[1]) if sys.argv[1].isdigit() else 0
print(json.dumps({'status': 'failed', 'code': code, 'message': msg}))
" "$HTTP_CODE" <<< "$BODY" >&2
  exit 1
fi
