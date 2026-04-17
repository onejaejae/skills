#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  create-notion-subtask.sh \
    --parent DPHRS-16 \
    --summary "[BE][HRS] Example" \
    (--body-file /tmp/body.md | --body "inline body") \
    [--priority Medium] \
    [--assignee-email enzo.cho@kakaohealthcare.com] \
    [--labels HRS] \
    [--source-url https://www.notion.so/...] \
    [--source-id 329d87e517f481a9981fc12e622e4558] \
    [--source-title "Notion Page Title"] \
    [--log-file /tmp/notion-jira-migration.jsonl] \
    [--dry-run]

Notes:
  - Jira config is loaded from ~/.config/.jira/.config.yml
  - JIRA_API_TOKEN must be set
  - If --labels is omitted, parent issue labels are inherited
  - Exact-summary duplicate under the same parent is skipped
  - If source markers are provided, existing subtasks are also checked by source URL / source ID
  - JSONL logging is optional and records created / skipped / failed / dry_run
  - Script avoids bash 4-only features for macOS compatibility
EOF
}

PARENT=""
SUMMARY=""
BODY_FILE=""
BODY_TEXT=""
PRIORITY="Medium"
ASSIGNEE_EMAIL=""
LABELS=""
SOURCE_URL=""
SOURCE_ID=""
SOURCE_TITLE=""
LOG_FILE=""
DRY_RUN="false"

append_log() {
  local status="$1"
  local key="${2:-}"
  local reason="${3:-}"
  local message="${4:-}"
  local url="${5:-}"
  local raw="${6:-}"

  [[ -z "$LOG_FILE" ]] && return 0

  python3 - "$LOG_FILE" "$status" "$PARENT" "$SUMMARY" "$SOURCE_URL" "$SOURCE_ID" "$SOURCE_TITLE" "$key" "$reason" "$message" "$url" "$raw" <<'PY'
import json, sys
from datetime import datetime, timezone

log_path, status, parent, summary, source_url, source_id, source_title, key, reason, message, url, raw = sys.argv[1:]
record = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "status": status,
    "parent": parent,
    "summary": summary,
}
if source_url:
    record["source_url"] = source_url
if source_id:
    record["source_id"] = source_id
if source_title:
    record["source_title"] = source_title
if key:
    record["jira_key"] = key
if reason:
    record["reason"] = reason
if message:
    record["message"] = message
if url:
    record["jira_url"] = url
if raw:
    try:
        record["raw"] = json.loads(raw)
    except Exception:
        record["raw"] = raw

with open(log_path, "a", encoding="utf-8") as f:
    f.write(json.dumps(record, ensure_ascii=False) + "\n")
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parent) PARENT="${2:-}"; shift 2 ;;
    --summary) SUMMARY="${2:-}"; shift 2 ;;
    --body-file) BODY_FILE="${2:-}"; shift 2 ;;
    --body) BODY_TEXT="${2:-}"; shift 2 ;;
    --priority) PRIORITY="${2:-}"; shift 2 ;;
    --assignee-email) ASSIGNEE_EMAIL="${2:-}"; shift 2 ;;
    --labels) LABELS="${2:-}"; shift 2 ;;
    --source-url) SOURCE_URL="${2:-}"; shift 2 ;;
    --source-id) SOURCE_ID="${2:-}"; shift 2 ;;
    --source-title) SOURCE_TITLE="${2:-}"; shift 2 ;;
    --log-file) LOG_FILE="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -z "$PARENT" || -z "$SUMMARY" ]]; then
  echo "Missing required arguments" >&2
  usage >&2
  exit 1
fi

if [[ -n "$BODY_FILE" && -n "$BODY_TEXT" ]]; then
  echo "Use either --body-file or --body, not both" >&2
  exit 1
fi

if [[ -z "$BODY_FILE" && -z "$BODY_TEXT" ]]; then
  echo "Either --body-file or --body is required" >&2
  exit 1
fi

if [[ -n "$BODY_FILE" && ! -f "$BODY_FILE" ]]; then
  echo "Body file not found: $BODY_FILE" >&2
  exit 1
fi

if [[ -z "${JIRA_API_TOKEN:-}" ]]; then
  echo "JIRA_API_TOKEN is not set" >&2
  exit 1
fi

if [[ -n "$LOG_FILE" ]]; then
  mkdir -p "$(dirname "$LOG_FILE")"
fi

CFG_JSON=$(python3 <<'PY'
import json, os, yaml
cfg_path = os.path.expanduser("~/.config/.jira/.config.yml")
with open(cfg_path, "r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f)

subtask_type_id = ""
for item in cfg.get("issue", {}).get("types", []):
    if item.get("subtask"):
        subtask_type_id = item.get("id", "")
        break

print(json.dumps({
    "server": cfg["server"].rstrip("/"),
    "login": cfg["login"],
    "project": cfg.get("project", ""),
    "subtask_type_id": subtask_type_id,
}))
PY
)

eval "$(
  CFG_JSON="$CFG_JSON" python3 <<'PY'
import json, os, shlex
cfg = json.loads(os.environ["CFG_JSON"])
print(f'CFG_SERVER={shlex.quote(cfg["server"])}')
print(f'CFG_LOGIN={shlex.quote(cfg["login"])}')
print(f'CFG_PROJECT={shlex.quote(cfg["project"])}')
print(f'CFG_SUBTASK_TYPE_ID={shlex.quote(cfg["subtask_type_id"])}')
PY
)"

SERVER="$CFG_SERVER"
LOGIN="$CFG_LOGIN"
DEFAULT_PROJECT="$CFG_PROJECT"
TYPE_ID="$CFG_SUBTASK_TYPE_ID"

AUTH=$(printf "%s" "${LOGIN}:${JIRA_API_TOKEN}" | base64)

MYSELF=$(curl -s "${SERVER}/rest/api/2/myself" \
  -H "Authorization: Basic ${AUTH}" \
  -H "Content-Type: application/json")

DEFAULT_ACCOUNT_ID=$(MYSELF_JSON="$MYSELF" python3 <<'PY'
import json, os
data = json.loads(os.environ["MYSELF_JSON"])
print(data["accountId"])
PY
)

if [[ -z "$ASSIGNEE_EMAIL" || "$ASSIGNEE_EMAIL" == "$LOGIN" ]]; then
  ACCOUNT_ID="$DEFAULT_ACCOUNT_ID"
else
  USER_SEARCH=$(curl -s "${SERVER}/rest/api/2/user/search?query=${ASSIGNEE_EMAIL}" \
    -H "Authorization: Basic ${AUTH}" \
    -H "Content-Type: application/json")
  ACCOUNT_ID=$(USER_SEARCH_JSON="$USER_SEARCH" TARGET_EMAIL="$ASSIGNEE_EMAIL" python3 <<'PY'
import json, os
users = json.loads(os.environ["USER_SEARCH_JSON"])
target = os.environ["TARGET_EMAIL"].lower()
for user in users:
    if user.get("emailAddress", "").lower() == target:
        print(user["accountId"])
        raise SystemExit
if users:
    print(users[0].get("accountId", ""))
else:
    print("")
PY
)
fi

PARENT_ISSUE=$(curl -s "${SERVER}/rest/api/2/issue/${PARENT}?fields=project,labels,subtasks" \
  -H "Authorization: Basic ${AUTH}" \
  -H "Content-Type: application/json")

PROJECT=$(PARENT_ISSUE_JSON="$PARENT_ISSUE" DEFAULT_PROJECT="$DEFAULT_PROJECT" python3 <<'PY'
import json, os
data = json.loads(os.environ["PARENT_ISSUE_JSON"])
print(data.get("fields", {}).get("project", {}).get("key") or os.environ["DEFAULT_PROJECT"])
PY
)

if [[ -z "$LABELS" ]]; then
  LABELS=$(PARENT_ISSUE_JSON="$PARENT_ISSUE" python3 <<'PY'
import json, os
data = json.loads(os.environ["PARENT_ISSUE_JSON"])
labels = data.get("fields", {}).get("labels", []) or []
print(",".join(labels))
PY
)
fi

DUPLICATE_SUMMARY=$(PARENT_ISSUE_JSON="$PARENT_ISSUE" SUMMARY="$SUMMARY" python3 <<'PY'
import json, os
data = json.loads(os.environ["PARENT_ISSUE_JSON"])
summary = os.environ["SUMMARY"].strip()
for subtask in data.get("fields", {}).get("subtasks", []) or []:
    fields = subtask.get("fields", {})
    if fields.get("summary", "").strip() == summary:
        print(json.dumps({
            "status": "skipped",
            "reason": "duplicate_summary",
            "key": subtask.get("key"),
        }, ensure_ascii=False))
        raise SystemExit
print("")
PY
)

if [[ -n "$DUPLICATE_SUMMARY" ]]; then
  append_log "skipped" "$(DUPLICATE_JSON="$DUPLICATE_SUMMARY" python3 <<'PY'
import json, os
print(json.loads(os.environ["DUPLICATE_JSON"]).get("key", ""))
PY
)" "duplicate_summary" "" "" "$DUPLICATE_SUMMARY"
  echo "$DUPLICATE_SUMMARY"
  exit 0
fi

SOURCE_MARKER_URL=""
SOURCE_MARKER_ID=""
if [[ -n "$SOURCE_URL" ]]; then
  SOURCE_MARKER_URL="Source URL: ${SOURCE_URL}"
fi
if [[ -n "$SOURCE_ID" ]]; then
  SOURCE_MARKER_ID="Source ID: ${SOURCE_ID}"
fi

SUBTASK_KEYS=$(PARENT_ISSUE_JSON="$PARENT_ISSUE" python3 <<'PY'
import json, os
data = json.loads(os.environ["PARENT_ISSUE_JSON"])
for subtask in data.get("fields", {}).get("subtasks", []) or []:
    key = subtask.get("key", "")
    if key:
        print(key)
PY
)

if [[ -n "$SOURCE_MARKER_URL" || -n "$SOURCE_MARKER_ID" ]]; then
  while IFS= read -r subtask_key; do
    [[ -z "$subtask_key" ]] && continue
    SUBTASK_DETAIL=$(curl -s "${SERVER}/rest/api/2/issue/${subtask_key}?fields=description" \
      -H "Authorization: Basic ${AUTH}" \
      -H "Content-Type: application/json")
    DUPLICATE_SOURCE=$(SUBTASK_JSON="$SUBTASK_DETAIL" SUBTASK_KEY="$subtask_key" SOURCE_MARKER_URL="$SOURCE_MARKER_URL" SOURCE_MARKER_ID="$SOURCE_MARKER_ID" python3 <<'PY'
import json, os
data = json.loads(os.environ["SUBTASK_JSON"])
desc = data.get("fields", {}).get("description", "") or ""
marker_url = os.environ["SOURCE_MARKER_URL"]
marker_id = os.environ["SOURCE_MARKER_ID"]
matched = ""
if marker_url and marker_url in desc:
    matched = "duplicate_source_url"
elif marker_id and marker_id in desc:
    matched = "duplicate_source_id"
if matched:
    print(json.dumps({
        "status": "skipped",
        "reason": matched,
        "key": os.environ["SUBTASK_KEY"],
    }, ensure_ascii=False))
PY
)
    if [[ -n "$DUPLICATE_SOURCE" ]]; then
      append_log "skipped" "$(DUPLICATE_JSON="$DUPLICATE_SOURCE" python3 <<'PY'
import json, os
print(json.loads(os.environ["DUPLICATE_JSON"]).get("key", ""))
PY
)" "$(DUPLICATE_JSON="$DUPLICATE_SOURCE" python3 <<'PY'
import json, os
print(json.loads(os.environ["DUPLICATE_JSON"]).get("reason", ""))
PY
)" "" "" "$DUPLICATE_SOURCE"
      echo "$DUPLICATE_SOURCE"
      exit 0
    fi
  done <<< "$SUBTASK_KEYS"
fi

DESCRIPTION=$(BODY_FILE="$BODY_FILE" BODY_TEXT="$BODY_TEXT" SOURCE_URL="$SOURCE_URL" SOURCE_ID="$SOURCE_ID" SOURCE_TITLE="$SOURCE_TITLE" python3 <<'PY'
import os

body_file = os.environ.get("BODY_FILE", "")
body_text = os.environ.get("BODY_TEXT", "")
source_url = os.environ.get("SOURCE_URL", "")
source_id = os.environ.get("SOURCE_ID", "")
source_title = os.environ.get("SOURCE_TITLE", "")

if body_file:
    with open(body_file, "r", encoding="utf-8") as f:
        description = f.read().rstrip()
else:
    description = body_text.rstrip()

markers = []
if source_url:
    markers.append(f"Source URL: {source_url}")
if source_id:
    markers.append(f"Source ID: {source_id}")
if source_title:
    markers.append(f"Source Title: {source_title}")

if markers:
    if description:
        description += "\n\n----\n"
    description += "\n".join(markers)

print(description)
PY
)

if [[ "$DRY_RUN" == "true" ]]; then
  DRY_RUN_JSON=$(SUMMARY="$SUMMARY" PARENT="$PARENT" PRIORITY="$PRIORITY" ASSIGNEE_EMAIL="$ASSIGNEE_EMAIL" LABELS="$LABELS" SOURCE_URL="$SOURCE_URL" SOURCE_ID="$SOURCE_ID" python3 <<'PY'
import json, os
data = {
    "status": "dry_run",
    "parent": os.environ["PARENT"],
    "summary": os.environ["SUMMARY"],
    "priority": os.environ["PRIORITY"],
    "assignee_email": os.environ["ASSIGNEE_EMAIL"],
    "labels": [x for x in os.environ["LABELS"].split(",") if x],
}
if os.environ.get("SOURCE_URL"):
    data["source_url"] = os.environ["SOURCE_URL"]
if os.environ.get("SOURCE_ID"):
    data["source_id"] = os.environ["SOURCE_ID"]
print(json.dumps(data, ensure_ascii=False))
PY
)
  append_log "dry_run" "" "" "" "" "$DRY_RUN_JSON"
  echo "$DRY_RUN_JSON"
  exit 0
fi

TMP_BODY_FILE="$(mktemp /tmp/notion-jira-body.XXXXXX.md)"
trap 'rm -f "$TMP_BODY_FILE"' EXIT
printf '%s' "$DESCRIPTION" > "$TMP_BODY_FILE"

set +e
CREATE_OUTPUT=$(/Users/chowonjae/.claude/skills/jira-dispatch/scripts/create-subtask.sh \
  --server "$SERVER" \
  --auth "$AUTH" \
  --project "$PROJECT" \
  --parent "$PARENT" \
  --type-id "$TYPE_ID" \
  --summary "$SUMMARY" \
  --priority "$PRIORITY" \
  --account-id "$ACCOUNT_ID" \
  --labels "$LABELS" \
  --body-file "$TMP_BODY_FILE" 2>&1)
CREATE_EXIT=$?
set -e

if [[ $CREATE_EXIT -eq 0 ]]; then
  CREATE_STATUS=$(CREATE_JSON="$CREATE_OUTPUT" python3 <<'PY'
import json, os
print(json.loads(os.environ["CREATE_JSON"]).get("status", ""))
PY
)
  CREATE_KEY=$(CREATE_JSON="$CREATE_OUTPUT" python3 <<'PY'
import json, os
print(json.loads(os.environ["CREATE_JSON"]).get("key", ""))
PY
)
  CREATE_URL=$(CREATE_JSON="$CREATE_OUTPUT" python3 <<'PY'
import json, os
print(json.loads(os.environ["CREATE_JSON"]).get("url", ""))
PY
)
  append_log "${CREATE_STATUS:-created}" "$CREATE_KEY" "" "" "$CREATE_URL" "$CREATE_OUTPUT"
  echo "$CREATE_OUTPUT"
  exit 0
fi

FAIL_STATUS=$(CREATE_JSON="$CREATE_OUTPUT" python3 <<'PY'
import json, os
try:
    data = json.loads(os.environ["CREATE_JSON"])
except Exception:
    print("failed")
    raise SystemExit
print(data.get("status", "failed"))
PY
)
FAIL_MESSAGE=$(CREATE_JSON="$CREATE_OUTPUT" python3 <<'PY'
import json, os
try:
    data = json.loads(os.environ["CREATE_JSON"])
except Exception:
    print(os.environ["CREATE_JSON"])
    raise SystemExit
print(data.get("message", ""))
PY
)
append_log "$FAIL_STATUS" "" "" "$FAIL_MESSAGE" "" "$CREATE_OUTPUT"
echo "$CREATE_OUTPUT" >&2
exit $CREATE_EXIT
