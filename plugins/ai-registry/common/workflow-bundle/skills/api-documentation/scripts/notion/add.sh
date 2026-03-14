#!/bin/bash
#
# Notion API 명세 추가 스크립트
# Usage: ./add.sh --name "API 이름" --method "POST" --endpoint "/api/v1/users" --tag "Users"
#
# Features:
#   - 자동으로 "API" suffix 추가 (--no-suffix로 비활성화)
#   - docs 페이지 생성 및 연결 (--create-docs 또는 --docs-id)
#   - 동적 Request Body 및 Response Schema 지원
#

set -e

# 스크립트 디렉토리
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../env.sh" 2>/dev/null || true

# 기본값
DATABASE_ID="${NOTION_DATABASE_ID:-2c7d87e517f480d88516e88afd3c2875}"
TASKS_DATABASE_ID="${NOTION_TASKS_DATABASE_ID:-a04b41f4f46e49d285cf04ce952db946}"
EPIC_ID="${NOTION_EPIC_ID:-}"
NOTION_API_KEY="${NOTION_API_KEY:-}"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# HTTP 상태 텍스트 함수
get_status_text() {
    case $1 in
        200) echo "200 성공" ;;
        201) echo "201 Created" ;;
        400) echo "400 Bad Request" ;;
        401) echo "401 Unauthorized" ;;
        403) echo "403 Forbidden" ;;
        404) echo "404 Not Found" ;;
        409) echo "409 Conflict" ;;
        500) echo "500 Internal Server Error" ;;
        *) echo "$1" ;;
    esac
}

# 도움말
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Notion 데이터베이스에 API 명세를 추가합니다."
    echo ""
    echo "Mode Options:"
    echo "  --mode          문서화 모드: draft (Phase 1) 또는 finalize (Phase 5, 기본값)"
    echo ""
    echo "Required Options:"
    echo "  --name          API 이름/설명 (필수, 자동으로 'API' suffix 추가)"
    echo "  --method        HTTP 메서드: GET, POST, PUT, PATCH, DELETE (필수)"
    echo "  --endpoint      API 엔드포인트 경로 (필수)"
    echo "  --tag           태그/카테고리 (필수)"
    echo "  --status        구현 여부 (기본값: draft=구현예정, finalize=구현완료)"
    echo "  --no-suffix     'API' suffix 자동 추가 비활성화"
    echo ""
    echo "Docs Options:"
    echo "  --create-docs   태스크 Database에 docs 페이지 생성 및 연결"
    echo "  --docs-id       기존 docs 페이지 ID로 연결 (page mention)"
    echo "  --docs-title    docs 페이지 제목 (기본값: [RE-AI] {name})"
    echo ""
    echo "Task Definition Options (Draft Mode):"
    echo "  --background    배경 설명 (Task의 목적과 맥락)"
    echo "  --requirements  주요 요구사항 (기능 요구사항 목록)"
    echo "  --notes         Notes (구현 시 참고사항)"
    echo ""
    echo "API Spec Options (Finalize Mode):"
    echo "  --api-row-id    API Database row ID (상태 업데이트용)"
    echo "  --request-body  Request Body JSON 또는 설명"
    echo "  --response      Response 예시 (반복 가능), 형식: \"상태코드:JSON\""
    echo "  --help          도움말 표시"
    echo ""
    echo "Environment Variables:"
    echo "  NOTION_TASKS_DATABASE_ID  태스크 Database ID (--create-docs 시 필수)"
    echo "  NOTION_EPIC_ID            연결할 에픽 ID (선택)"
    echo ""
    echo "Examples:"
    echo "  # Draft 모드 (Phase 1 - Task 분석)"
    echo "  $0 --mode draft --name \"게시글 생성\" --method POST --endpoint \"/api/v1/posts\" --tag Post \\"
    echo "     --create-docs \\"
    echo "     --background \"인증된 사용자가 게시글을 생성할 수 있는 기능\" \\"
    echo "     --requirements \"게시글 생성, 인증 필수, 작성자 연결\""
    echo ""
    echo "  # Finalize 모드 (Phase 5 - 문서화)"
    echo "  $0 --mode finalize --docs-id \"existing-page-id\" \\"
    echo "     --request-body '{\"title\":\"제목\",\"content\":\"내용\"}' \\"
    echo "     --response '201:{\"success\":true,\"data\":{...}}'"
}

# 인자 파싱
MODE="finalize"
NAME=""
METHOD=""
ENDPOINT=""
TAG=""
STATUS=""
NO_SUFFIX=false
CREATE_DOCS=false
DOCS_ID=""
DOCS_TITLE=""
REQUEST_BODY=""
BACKGROUND=""
REQUIREMENTS=""
NOTES=""
API_ROW_ID=""
TASK_UNIQUE_ID=""
declare -a RESPONSES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        --name)
            NAME="$2"
            shift 2
            ;;
        --method)
            METHOD="$2"
            shift 2
            ;;
        --endpoint)
            ENDPOINT="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --status)
            STATUS="$2"
            shift 2
            ;;
        --no-suffix)
            NO_SUFFIX=true
            shift
            ;;
        --create-docs)
            CREATE_DOCS=true
            shift
            ;;
        --docs-id)
            DOCS_ID="$2"
            shift 2
            ;;
        --api-row-id)
            API_ROW_ID="$2"
            shift 2
            ;;
        --docs-title)
            DOCS_TITLE="$2"
            shift 2
            ;;
        --background)
            BACKGROUND="$2"
            shift 2
            ;;
        --requirements)
            REQUIREMENTS="$2"
            shift 2
            ;;
        --notes)
            NOTES="$2"
            shift 2
            ;;
        --request-body)
            REQUEST_BODY="$2"
            shift 2
            ;;
        --response)
            RESPONSES+=("$2")
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# 모드에 따른 기본 STATUS 설정
if [[ -z "$STATUS" ]]; then
    if [[ "$MODE" == "draft" ]]; then
        STATUS="구현예정"
    else
        STATUS="구현완료"
    fi
fi

# API suffix 자동 추가
if [[ "$NO_SUFFIX" != true && ! "$NAME" =~ API$ ]]; then
    NAME="${NAME} API"
fi

# docs 제목 기본값
if [[ -z "$DOCS_TITLE" ]]; then
    DOCS_TITLE="[RE-AI] ${NAME}"
fi

# --create-docs 시 TASKS_DATABASE_ID 확인
if [[ "$CREATE_DOCS" == true && -z "$TASKS_DATABASE_ID" ]]; then
    echo -e "${RED}Error: NOTION_TASKS_DATABASE_ID가 설정되지 않았습니다.${NC}"
    echo "env.sh 파일에 NOTION_TASKS_DATABASE_ID를 설정하세요."
    exit 1
fi

# 모드별 필수 인자 확인
if [[ "$MODE" == "finalize" ]]; then
    # Finalize 모드: --docs-id 필수
    if [[ -z "$DOCS_ID" ]]; then
        echo -e "${RED}Error: finalize 모드에서는 --docs-id가 필수입니다.${NC}"
        show_help
        exit 1
    fi
else
    # Draft 모드: --name, --method, --endpoint, --tag 필수
    if [[ -z "$NAME" || -z "$METHOD" || -z "$ENDPOINT" || -z "$TAG" ]]; then
        echo -e "${RED}Error: draft 모드에서는 --name, --method, --endpoint, --tag가 필수입니다.${NC}"
        show_help
        exit 1
    fi
fi

# API Key 확인
if [[ -z "$NOTION_API_KEY" ]]; then
    echo -e "${RED}Error: NOTION_API_KEY가 설정되지 않았습니다.${NC}"
    echo "env.sh 파일을 생성하거나 환경변수를 설정하세요."
    exit 1
fi

# JSON 문자열 이스케이프 함수 (macOS/Linux 호환)
escape_json_string() {
    local input="$1"
    # JSON pretty print 시도, 실패하면 원본 사용
    local formatted=$(echo "$input" | jq '.' 2>/dev/null || echo "$input")
    # 줄바꿈과 특수문자 이스케이프 (macOS 호환)
    echo "$formatted" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | awk '{printf "%s\\n", $0}' | sed 's/\\n$//'
}

# Response 블록 생성 함수
generate_response_blocks() {
    local blocks=""

    if [[ ${#RESPONSES[@]} -gt 0 ]]; then
        # 동적 Response 블록 생성
        for response in "${RESPONSES[@]}"; do
            local status_code=$(echo "$response" | cut -d':' -f1)
            local response_body=$(echo "$response" | cut -d':' -f2-)
            local status_text=$(get_status_text "$status_code")

            # JSON pretty print
            local formatted_body=$(echo "$response_body" | jq '.' 2>/dev/null || echo "$response_body")
            local escaped_body=$(escape_json_string "$formatted_body")

            blocks="${blocks}
    {\"type\": \"heading_3\", \"heading_3\": {\"rich_text\": [{\"type\": \"text\", \"text\": {\"content\": \"${status_text}\"}}]}},
    {\"type\": \"code\", \"code\": {\"rich_text\": [{\"type\": \"text\", \"text\": {\"content\": \"${escaped_body}\"}}], \"language\": \"json\"}},"
        done
    else
        # --response 옵션 없음 경고
        echo -e "${YELLOW}Warning: --response 옵션이 없습니다. Response Schema가 생성되지 않습니다.${NC}" >&2
        blocks='
    {"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "⚠️ --response 옵션을 사용하여 Response Schema를 추가하세요."}}]}},'
    fi

    # 마지막 쉼표 제거
    echo "$blocks" | sed '$ s/,$//'
}

# Request Body 블록 생성 함수 (macOS/Linux 호환)
generate_request_body_block() {
    local content=""

    if [[ -n "$REQUEST_BODY" ]]; then
        # JSON인지 확인
        if echo "$REQUEST_BODY" | jq '.' > /dev/null 2>&1; then
            # JSON이면 pretty print (macOS 호환)
            content=$(echo "$REQUEST_BODY" | jq '.' | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | awk '{printf "%s\\n", $0}' | sed 's/\\n$//')
        else
            # JSON이 아니면 그대로 사용 (예: "없음 (GET 요청)")
            content="$REQUEST_BODY"
        fi
    else
        # --request-body 옵션 없음 경고
        echo -e "${YELLOW}Warning: --request-body 옵션이 없습니다.${NC}" >&2
        content="⚠️ --request-body 옵션을 사용하여 Request Body를 추가하세요."
    fi

    echo "$content"
}

# 페이지의 모든 블록 조회 함수
get_page_blocks() {
    local page_id="$1"
    curl -s -X GET "https://api.notion.com/v1/blocks/${page_id}/children?page_size=100" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28"
}

# 헤딩 텍스트로 블록 ID 찾기 함수
find_block_by_heading() {
    local blocks_json="$1"
    local heading_text="$2"

    echo "$blocks_json" | jq -r --arg text "$heading_text" '
      .results[] |
      select(.type == "heading_2" or .type == "heading_3") |
      select((.heading_2.rich_text[0].text.content // .heading_3.rich_text[0].text.content) == $text) |
      .id
    ' | head -1
}

# 헤딩 다음 블록 ID 찾기 함수
find_next_block_after_heading() {
    local blocks_json="$1"
    local heading_text="$2"

    local found=false
    echo "$blocks_json" | jq -r '.results[] | "\(.id)|\(.type)|\((.heading_2.rich_text[0].text.content // .heading_3.rich_text[0].text.content // .paragraph.rich_text[0].text.content // ""))"' | while IFS='|' read -r block_id block_type block_content; do
        if [[ "$found" == "true" ]]; then
            echo "$block_id"
            return
        fi
        if [[ "$block_content" == "$heading_text" ]]; then
            found=true
        fi
    done
}

# 블록 삭제 함수
delete_block() {
    local block_id="$1"
    curl -s -X DELETE "https://api.notion.com/v1/blocks/${block_id}" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28" > /dev/null
}

# 블록 뒤에 새 블록 추가 함수
append_block_after() {
    local parent_id="$1"
    local after_block_id="$2"
    local block_json="$3"

    curl -s -X PATCH "https://api.notion.com/v1/blocks/${parent_id}/children" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28" \
      -H "Content-Type: application/json" \
      -d "{\"children\": [${block_json}], \"after\": \"${after_block_id}\"}" > /dev/null
}

# 블록 내용 업데이트 함수
update_block_content() {
    local block_id="$1"
    local block_type="$2"
    local new_content="$3"

    local payload=""
    if [[ "$block_type" == "code" ]]; then
        payload="{\"code\": {\"rich_text\": [{\"type\": \"text\", \"text\": {\"content\": \"${new_content}\"}}]}}"
    elif [[ "$block_type" == "paragraph" ]]; then
        payload="{\"paragraph\": {\"rich_text\": [{\"type\": \"text\", \"text\": {\"content\": \"${new_content}\"}}]}}"
    elif [[ "$block_type" == "bulleted_list_item" ]]; then
        payload="{\"bulleted_list_item\": {\"rich_text\": [{\"type\": \"text\", \"text\": {\"content\": \"${new_content}\"}}]}}"
    fi

    curl -s -X PATCH "https://api.notion.com/v1/blocks/${block_id}" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28" \
      -H "Content-Type: application/json" \
      -d "$payload" > /dev/null
}

# Finalize 모드: docs 페이지 업데이트 함수
update_docs_page() {
    local docs_id="$1"

    echo -e "${YELLOW}docs 페이지 업데이트 중: ${docs_id}${NC}" >&2

    # 페이지 블록 조회
    local blocks_json=$(get_page_blocks "$docs_id")

    # Request Body 업데이트
    if [[ -n "$REQUEST_BODY" ]]; then
        local request_heading_id=$(find_block_by_heading "$blocks_json" "Request Body")
        if [[ -n "$request_heading_id" ]]; then
            # 헤딩 다음 블록(code) 찾기
            local found_heading=false
            local next_block_id=""
            local next_block_type=""

            while IFS='|' read -r block_id block_type; do
                if [[ "$found_heading" == "true" ]]; then
                    next_block_id="$block_id"
                    next_block_type="$block_type"
                    break
                fi
                if [[ "$block_id" == "$request_heading_id" ]]; then
                    found_heading=true
                fi
            done < <(echo "$blocks_json" | jq -r '.results[] | "\(.id)|\(.type)"')

            if [[ -n "$next_block_id" && "$next_block_type" == "code" ]]; then
                local escaped_body=$(escape_json_string "$REQUEST_BODY")
                update_block_content "$next_block_id" "code" "$escaped_body"
                echo -e "${GREEN}  ✓ Request Body 업데이트 완료${NC}" >&2
            fi
        fi
    fi

    # Response Schema 업데이트 (여러 응답 블록 교체)
    if [[ ${#RESPONSES[@]} -gt 0 ]]; then
        local response_heading_id=$(find_block_by_heading "$blocks_json" "Response Schema")
        if [[ -n "$response_heading_id" ]]; then
            # Response Schema 헤딩 다음의 모든 블록 삭제 (다음 heading_2까지)
            local in_response_section=false
            local blocks_to_delete=()

            while IFS='|' read -r block_id block_type; do
                if [[ "$in_response_section" == "true" ]]; then
                    if [[ "$block_type" == "heading_2" ]]; then
                        break
                    fi
                    blocks_to_delete+=("$block_id")
                fi
                if [[ "$block_id" == "$response_heading_id" ]]; then
                    in_response_section=true
                fi
            done < <(echo "$blocks_json" | jq -r '.results[] | "\(.id)|\(.type)"')

            # 기존 블록 삭제
            for block_id in "${blocks_to_delete[@]}"; do
                delete_block "$block_id"
            done

            # 새 Response 블록 추가
            local response_blocks=""
            for response in "${RESPONSES[@]}"; do
                local status_code=$(echo "$response" | cut -d':' -f1)
                local response_body=$(echo "$response" | cut -d':' -f2-)
                local status_text=$(get_status_text "$status_code")
                local formatted_body=$(echo "$response_body" | jq '.' 2>/dev/null || echo "$response_body")
                local escaped_body=$(escape_json_string "$formatted_body")

                response_blocks="${response_blocks}{\"type\": \"heading_3\", \"heading_3\": {\"rich_text\": [{\"type\": \"text\", \"text\": {\"content\": \"${status_text}\"}}]}},{\"type\": \"code\", \"code\": {\"rich_text\": [{\"type\": \"text\", \"text\": {\"content\": \"${escaped_body}\"}}], \"language\": \"json\"}},"
            done
            response_blocks="${response_blocks%,}"  # 마지막 쉼표 제거

            # Response Schema 헤딩 뒤에 새 블록 추가
            curl -s -X PATCH "https://api.notion.com/v1/blocks/${docs_id}/children" \
              -H "Authorization: Bearer ${NOTION_API_KEY}" \
              -H "Notion-Version: 2022-06-28" \
              -H "Content-Type: application/json" \
              -d "{\"children\": [${response_blocks}], \"after\": \"${response_heading_id}\"}" > /dev/null

            echo -e "${GREEN}  ✓ Response Schema 업데이트 완료 (${#RESPONSES[@]}개)${NC}" >&2
        fi
    fi

    echo -e "${GREEN}✅ docs 페이지 업데이트 완료${NC}"
}

# API row 상태 업데이트 함수
update_api_row_status() {
    local row_id="$1"
    local new_status="$2"

    echo -e "${YELLOW}API row 상태 업데이트 중: ${new_status}${NC}" >&2

    local payload=$(cat <<EOF
{
  "properties": {
    "구현 여부": {
      "rich_text": [
        {
          "text": {
            "content": "${new_status}"
          }
        }
      ]
    }
  }
}
EOF
)

    local response=$(curl -s -X PATCH "https://api.notion.com/v1/pages/${row_id}" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28" \
      -H "Content-Type: application/json" \
      -d "${payload}")

    if echo "$response" | grep -q '"object":"page"'; then
        echo -e "${GREEN}✅ API row 상태 업데이트 완료: ${new_status}${NC}"
    else
        echo -e "${RED}❌ API row 상태 업데이트 실패${NC}" >&2
        echo "$response" | jq . >&2
    fi
}

# docs 페이지 생성 함수 (태스크 Database에 row 추가)
create_docs_page() {
    local title="$1"
    local name="$2"
    local method="$3"
    local endpoint="$4"
    local tasks_db_id="$5"

    echo -e "${YELLOW}태스크 Database에 docs 페이지 생성 중: ${title}${NC}" >&2

    # 에픽 relation 설정
    local epic_relation=""
    if [[ -n "$EPIC_ID" ]]; then
        epic_relation='"에픽": {"relation": [{"id": "'"${EPIC_ID}"'"}]},'
    fi

    # 태스크 row 생성 payload (아이콘 포함)
    local task_payload=$(cat <<TASKEOF
{
  "parent": {
    "database_id": "${tasks_db_id}"
  },
  "icon": {
    "type": "external",
    "external": {
      "url": "https://www.notion.so/icons/checkmark-square_gray.svg"
    }
  },
  "properties": {
    "": {
      "title": [
        {
          "text": {
            "content": "${title}"
          }
        }
      ]
    },
    "상태": {
      "status": {
        "name": "TODO"
      }
    },
    "작업 분야": {
      "select": {
        "name": "Backend"
      }
    },
    "작업 유형": {
      "multi_select": [
        {"name": "신규 기능"}
      ]
    },
    ${epic_relation}
    "DoD": {
      "rich_text": [
        {
          "text": {
            "content": "${name} 구현 완료"
          }
        }
      ]
    }
  }
}
TASKEOF
)

    # 태스크 row 생성
    local task_response=$(curl -s -X POST "https://api.notion.com/v1/pages" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28" \
      -H "Content-Type: application/json" \
      -d "${task_payload}")

    local task_id=$(echo "$task_response" | jq -r '.id // empty')

    if [[ -z "$task_id" ]]; then
        echo -e "${RED}❌ 태스크 생성 실패${NC}" >&2
        echo "$task_response" | jq . >&2
        return 1
    fi

    # Task ID (unique_id) 추출 - 모든 properties를 순회하여 unique_id 타입 찾기
    TASK_UNIQUE_ID=$(echo "$task_response" | jq -r '
        .properties | to_entries[] |
        select(.value.type == "unique_id") |
        .value.unique_id |
        "\(.prefix)-\(.number)"
    ')

    # 동적 블록 생성
    local request_body_content=$(generate_request_body_block)
    local response_blocks=$(generate_response_blocks)

    # 배경 내용 결정
    local background_content="${BACKGROUND:-${name}의 구현 배경을 작성하세요.}"

    # 요구사항 내용 결정
    local requirements_content="${REQUIREMENTS:-기능 요구사항을 작성하세요.}"

    # Notes 내용 결정
    local notes_content="${NOTES:-구현 시 참고사항을 작성하세요.}"

    # 태스크 페이지에 API Spec 블록 추가
    local blocks_payload=$(cat <<BLOCKSEOF
{
  "children": [
    {"type": "heading_2", "heading_2": {"rich_text": [{"type": "text", "text": {"content": "배경"}}]}},
    {"type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": "${background_content}"}}]}},
    {"type": "heading_2", "heading_2": {"rich_text": [{"type": "text", "text": {"content": "주요 요구사항"}}]}},
    {"type": "heading_3", "heading_3": {"rich_text": [{"type": "text", "text": {"content": "기능 요구사항"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "${requirements_content}"}}]}},
    {"type": "heading_3", "heading_3": {"rich_text": [{"type": "text", "text": {"content": "비기능 요구사항"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "JWT 토큰 기반 인증"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "RESTful API 설계 원칙 준수"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "표준 HTTP 상태 코드 사용"}}]}},
    {"type": "heading_2", "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Notes"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "${notes_content}"}}]}},
    {"type": "heading_2", "heading_2": {"rich_text": [{"type": "text", "text": {"content": "API Spec"}}]}},
    {"type": "heading_3", "heading_3": {"rich_text": [{"type": "text", "text": {"content": "개요"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "Base URL: ${endpoint}"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "인증: JWT Token 필요"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": "Content-Type: application/json"}}]}},
    {"type": "heading_3", "heading_3": {"rich_text": [{"type": "text", "text": {"content": "${method} ${endpoint}"}}]}},
    {"type": "heading_3", "heading_3": {"rich_text": [{"type": "text", "text": {"content": "Request Body"}}]}},
    {"type": "code", "code": {"rich_text": [{"type": "text", "text": {"content": "${request_body_content}"}}], "language": "json"}},
    {"type": "heading_3", "heading_3": {"rich_text": [{"type": "text", "text": {"content": "요청 예시"}}]}},
    {"type": "code", "code": {"rich_text": [{"type": "text", "text": {"content": "curl -X '${method}' 'http://localhost:8000${endpoint}' \\\\\n  -H 'Authorization: Bearer {jwt_token}' \\\\\n  -H 'Content-Type: application/json' \\\\\n  -d '{}'"}}], "language": "bash"}},
    {"type": "heading_3", "heading_3": {"rich_text": [{"type": "text", "text": {"content": "Response Schema"}}]}},
    ${response_blocks}
  ]
}
BLOCKSEOF
)

    # 블록 추가
    curl -s -X PATCH "https://api.notion.com/v1/blocks/${task_id}/children" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28" \
      -H "Content-Type: application/json" \
      -d "${blocks_payload}" > /dev/null

    # task_id와 task_unique_id를 구분자로 반환
    echo "${task_id}|${TASK_UNIQUE_ID}"
}

# 모드별 처리
if [[ "$MODE" == "finalize" ]]; then
    # Finalize 모드: 기존 docs 페이지 업데이트 + API row 상태 업데이트
    update_docs_page "$DOCS_ID"

    # API row 상태 업데이트 (--api-row-id가 있는 경우)
    if [[ -n "$API_ROW_ID" ]]; then
        update_api_row_status "$API_ROW_ID" "구현완료"
    fi
else
    # Draft 모드: API row 생성 + docs 페이지 생성

    # docs 페이지 ID 결정
    DOCS_PAGE_ID=""
    if [[ "$CREATE_DOCS" == true ]]; then
        # create_docs_page는 "page_id|task_unique_id" 형식으로 반환
        DOCS_RESULT=$(create_docs_page "$DOCS_TITLE" "$NAME" "$METHOD" "$ENDPOINT" "$TASKS_DATABASE_ID")
        DOCS_PAGE_ID=$(echo "$DOCS_RESULT" | cut -d'|' -f1)
        TASK_UNIQUE_ID=$(echo "$DOCS_RESULT" | cut -d'|' -f2)
        if [[ -z "$DOCS_PAGE_ID" ]]; then
            exit 1
        fi
        echo -e "${GREEN}✅ 태스크 페이지 생성 완료: ${DOCS_PAGE_ID}${NC}"
    elif [[ -n "$DOCS_ID" ]]; then
        DOCS_PAGE_ID="$DOCS_ID"
    fi

    # Notion API 호출
    echo -e "${YELLOW}Notion에 API 명세 추가 중...${NC}"

    # docs 속성 생성 (page mention 또는 빈 값)
    if [[ -n "$DOCS_PAGE_ID" ]]; then
        DOCS_PROPERTY=$(cat <<DOCSEOF
"docs": {
      "rich_text": [
        {
          "type": "mention",
          "mention": {
            "type": "page",
            "page": {
              "id": "${DOCS_PAGE_ID}"
            }
          }
        }
      ]
    }
DOCSEOF
)
    else
        DOCS_PROPERTY=$(cat <<DOCSEOF
"docs": {
      "rich_text": []
    }
DOCSEOF
)
    fi

    PAYLOAD=$(cat <<EOF
{
  "parent": {
    "database_id": "${DATABASE_ID}"
  },
  "properties": {
    "설명": {
      "title": [
        {
          "text": {
            "content": "${NAME}"
          }
        }
      ]
    },
    "Method": {
      "multi_select": [
        {
          "name": "${METHOD}"
        }
      ]
    },
    "Endpoint": {
      "rich_text": [
        {
          "text": {
            "content": "${ENDPOINT}"
          }
        }
      ]
    },
    "Tag": {
      "multi_select": [
        {
          "name": "${TAG}"
        }
      ]
    },
    "구현 여부": {
      "rich_text": [
        {
          "text": {
            "content": "${STATUS}"
          }
        }
      ]
    },
    ${DOCS_PROPERTY}
  }
}
EOF
)

    RESPONSE=$(curl -s -X POST "https://api.notion.com/v1/pages" \
      -H "Authorization: Bearer ${NOTION_API_KEY}" \
      -H "Notion-Version: 2022-06-28" \
      -H "Content-Type: application/json" \
      -d "${PAYLOAD}")

    # 결과 확인
    if echo "$RESPONSE" | grep -q '"object":"page"'; then
        PAGE_ID=$(echo "$RESPONSE" | jq -r '.id')
        echo -e "${GREEN}✅ Notion에 API 명세가 추가되었습니다!${NC}"
        echo ""
        echo "  이름: ${NAME}"
        echo "  Method: ${METHOD}"
        echo "  Endpoint: ${ENDPOINT}"
        echo "  Tag: ${TAG}"
        echo "  API Row ID: ${PAGE_ID}"
        if [[ -n "$TASK_UNIQUE_ID" ]]; then
            echo "  Task ID: ${TASK_UNIQUE_ID}"
        fi
        if [[ -n "$DOCS_PAGE_ID" ]]; then
            echo "  Docs Page ID: ${DOCS_PAGE_ID}"
        fi
        if [[ ${#RESPONSES[@]} -gt 0 ]]; then
            echo "  Responses: ${#RESPONSES[@]}개 (동적)"
        fi
    else
        echo -e "${RED}❌ 오류 발생:${NC}"
        echo "$RESPONSE" | jq .
        exit 1
    fi
fi
