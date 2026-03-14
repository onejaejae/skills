#!/bin/bash
#
# Notion 태스크 생성 스크립트
# Usage: ./create-task.sh --title "태스크 제목" [OPTIONS]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# env.sh 탐색: 스킬 로컬 → 프로젝트 경로 → 환경변수 fallback
if [[ -f "${SCRIPT_DIR}/env.sh" ]]; then
    source "${SCRIPT_DIR}/env.sh"
elif [[ -n "${CLUE_PROJECT_DIR:-}" && -f "${CLUE_PROJECT_DIR}/.claude/skills/api-documentation/scripts/env.sh" ]]; then
    source "${CLUE_PROJECT_DIR}/.claude/skills/api-documentation/scripts/env.sh"
fi

# 기본값
DATABASE_ID="${NOTION_TASKS_DATABASE_ID:-a04b41f4f46e49d285cf04ce952db946}"
API_KEY="${NOTION_API_KEY:-}"
EPIC_ID="${NOTION_EPIC_ID:-}"
DEFAULT_ASSIGNEE_ID="2dfd872b-594c-8157-9253-00022f1bad22"  # enzo.cho(조원제)

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

show_help() {
    echo "Usage: $0 --title \"태스크 제목\" [OPTIONS]"
    echo ""
    echo "Notion 태스크 Database에 태스크를 생성합니다."
    echo ""
    echo "Required:"
    echo "  --title       태스크 제목"
    echo ""
    echo "Optional:"
    echo "  --status      상태 (기본: TODO)"
    echo "  --area        작업 분야: Backend, Frontend, Infra, 기획 (기본: Backend)"
    echo "  --type        작업 유형 (쉼표 구분, 기본: 신규 기능)"
    echo "  --epic        에픽 페이지 ID (기본: env의 NOTION_EPIC_ID)"
    echo "  --dod         Definition of Done"
    echo "  --body        본문 마크다운 (\\n으로 줄바꿈)"
    echo "  --assignee    담당자 Notion user ID (기본: enzo.cho)"
    echo "  --no-assignee 담당자 미지정"
    echo "  --icon        아이콘 suffix (기본: checkmark-square_gray)"
    echo "  --help        도움말"
}

# 인자 파싱
TITLE=""
STATUS="TODO"
AREA="Backend"
TYPE="신규 기능"
DOD=""
BODY=""
ICON="checkmark-square_gray"
ASSIGNEE_ID="$DEFAULT_ASSIGNEE_ID"

while [[ $# -gt 0 ]]; do
    case $1 in
        --title)   TITLE="$2"; shift 2 ;;
        --status)  STATUS="$2"; shift 2 ;;
        --area)    AREA="$2"; shift 2 ;;
        --type)    TYPE="$2"; shift 2 ;;
        --epic)    EPIC_ID="$2"; shift 2 ;;
        --dod)     DOD="$2"; shift 2 ;;
        --body)    BODY="$2"; shift 2 ;;
        --assignee)    ASSIGNEE_ID="$2"; shift 2 ;;
        --no-assignee) ASSIGNEE_ID=""; shift ;;
        --icon)    ICON="$2"; shift 2 ;;
        --help)    show_help; exit 0 ;;
        *)         echo -e "${RED}Error: Unknown option $1${NC}"; show_help; exit 1 ;;
    esac
done

# 필수 인자 확인
if [[ -z "$TITLE" ]]; then
    echo -e "${RED}Error: --title은 필수입니다.${NC}"
    show_help
    exit 1
fi

if [[ -z "$API_KEY" ]]; then
    echo -e "${RED}Error: NOTION_API_KEY가 설정되지 않았습니다.${NC}"
    echo "scripts/env.sh를 생성하거나 환경변수를 설정하세요."
    exit 1
fi

# jq로 안전한 JSON 생성
build_payload() {
    # 기본 properties
    local payload
    payload=$(jq -n \
        --arg db_id "$DATABASE_ID" \
        --arg icon "https://www.notion.so/icons/${ICON}.svg" \
        --arg title "$TITLE" \
        --arg status "$STATUS" \
        --arg area "$AREA" \
        '{
            parent: {database_id: $db_id},
            icon: {type: "external", external: {url: $icon}},
            properties: {
                "": {title: [{text: {content: $title}}]},
                "상태": {status: {name: $status}},
                "작업 분야": {select: {name: $area}}
            }
        }')

    # 작업 유형 (multi_select, 쉼표 구분)
    local type_arr='[]'
    IFS=',' read -ra TYPES <<< "$TYPE"
    for t in "${TYPES[@]}"; do
        t=$(echo "$t" | xargs)
        type_arr=$(echo "$type_arr" | jq --arg name "$t" '. + [{name: $name}]')
    done
    payload=$(echo "$payload" | jq --argjson types "$type_arr" '.properties["작업 유형"] = {multi_select: $types}')

    # 에픽 (선택)
    if [[ -n "$EPIC_ID" ]]; then
        payload=$(echo "$payload" | jq --arg eid "$EPIC_ID" '.properties["에픽"] = {relation: [{id: $eid}]}')
    fi

    # DoD (선택)
    if [[ -n "$DOD" ]]; then
        payload=$(echo "$payload" | jq --arg dod "$DOD" '.properties["DoD"] = {rich_text: [{text: {content: $dod}}]}')
    fi

    # 담당자 (기본: enzo.cho)
    if [[ -n "$ASSIGNEE_ID" ]]; then
        payload=$(echo "$payload" | jq --arg uid "$ASSIGNEE_ID" '.properties["담당자"] = {people: [{object: "user", id: $uid}]}')
    fi

    echo "$payload"
}

# 본문 블록 생성 (jq 기반)
build_body_blocks() {
    local body="$1"
    if [[ -z "$body" ]]; then
        return
    fi

    local blocks='[]'
    # \n을 실제 줄바꿈으로 변환
    body=$(echo -e "$body")

    while IFS= read -r line; do
        if [[ "$line" =~ ^###[[:space:]]+(.*) ]]; then
            blocks=$(echo "$blocks" | jq --arg t "${BASH_REMATCH[1]}" \
                '. + [{type: "heading_3", heading_3: {rich_text: [{type: "text", text: {content: $t}}]}}]')
        elif [[ "$line" =~ ^##[[:space:]]+(.*) ]]; then
            blocks=$(echo "$blocks" | jq --arg t "${BASH_REMATCH[1]}" \
                '. + [{type: "heading_2", heading_2: {rich_text: [{type: "text", text: {content: $t}}]}}]')
        elif [[ "$line" =~ ^-[[:space:]]+(.*) ]]; then
            blocks=$(echo "$blocks" | jq --arg t "${BASH_REMATCH[1]}" \
                '. + [{type: "bulleted_list_item", bulleted_list_item: {rich_text: [{type: "text", text: {content: $t}}]}}]')
        elif [[ -n "$line" ]]; then
            blocks=$(echo "$blocks" | jq --arg t "$line" \
                '. + [{type: "paragraph", paragraph: {rich_text: [{type: "text", text: {content: $t}}]}}]')
        fi
    done <<< "$body"

    echo "$blocks"
}

# 메인: 태스크 생성
echo -e "${YELLOW}태스크 생성 중: ${TITLE}${NC}"

PAYLOAD=$(build_payload)

RESPONSE=$(curl -s -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

# 결과 확인
PAGE_ID=$(echo "$RESPONSE" | jq -r '.id // empty')

if [[ -z "$PAGE_ID" ]]; then
    echo -e "${RED}태스크 생성 실패${NC}" >&2
    echo "$RESPONSE" | jq . >&2
    exit 1
fi

# Task unique ID 추출
TASK_UNIQUE_ID=$(echo "$RESPONSE" | jq -r '
    .properties | to_entries[] |
    select(.value.type == "unique_id") |
    .value.unique_id |
    "\(.prefix)-\(.number)"
')

# 본문 추가
if [[ -n "$BODY" ]]; then
    BODY_BLOCKS=$(build_body_blocks "$BODY")
    if [[ "$BODY_BLOCKS" != "[]" && -n "$BODY_BLOCKS" ]]; then
        BLOCKS_PAYLOAD=$(jq -n --argjson children "$BODY_BLOCKS" '{children: $children}')
        curl -s -X PATCH "https://api.notion.com/v1/blocks/${PAGE_ID}/children" \
          -H "Authorization: Bearer ${API_KEY}" \
          -H "Notion-Version: 2022-06-28" \
          -H "Content-Type: application/json" \
          -d "${BLOCKS_PAYLOAD}" > /dev/null
    fi
fi

echo -e "${GREEN}태스크 생성 완료${NC}"
echo ""
echo "  Task ID: ${TASK_UNIQUE_ID}"
echo "  Page ID: ${PAGE_ID}"
echo "  Title: ${TITLE}"
echo "  Status: ${STATUS}"
echo "  Area: ${AREA}"
echo "  Type: ${TYPE}"
if [[ -n "$DOD" ]]; then
    echo "  DoD: ${DOD}"
fi
