#!/bin/bash
#
# Postman Collection에 API 추가 스크립트
# Usage: ./add.sh --name "API 이름" --method "POST" --endpoint "/api/v1/users" [--example "이름:상태코드:JSON"]
#

set -e

# 스크립트 디렉토리
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../env.sh" 2>/dev/null || true

# 기본값
COLLECTION_ID="${POSTMAN_COLLECTION_ID:-410bece5-689a-4fa5-babc-aa39887a59a8}"
POSTMAN_API_KEY="${POSTMAN_API_KEY:-}"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# HTTP 상태 텍스트 함수
get_status_text() {
    case $1 in
        200) echo "OK" ;;
        201) echo "Created" ;;
        400) echo "Bad Request" ;;
        401) echo "Unauthorized" ;;
        403) echo "Forbidden" ;;
        404) echo "Not Found" ;;
        409) echo "Conflict" ;;
        500) echo "Internal Server Error" ;;
        *) echo "Unknown" ;;
    esac
}

# 도움말
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Postman Collection에 API Request를 추가합니다."
    echo ""
    echo "Options:"
    echo "  --name        API 이름/설명 (필수)"
    echo "  --method      HTTP 메서드: GET, POST, PUT, PATCH, DELETE (필수)"
    echo "  --endpoint    API 엔드포인트 경로 (필수)"
    echo "  --body        Request Body JSON (선택)"
    echo "  --example     Response Example (선택, 반복 가능)"
    echo "                형식: \"이름:상태코드:JSON\""
    echo "  --help        도움말 표시"
    echo ""
    echo "Example:"
    echo "  $0 --name \"회원가입\" --method POST --endpoint \"/api/v1/auth/signup\" \\"
    echo "     --body '{\"email\":\"...\",\"password\":\"...\"}' \\"
    echo "     --example '성공:201:{\"success\":true,\"data\":{...}}' \\"
    echo "     --example '중복 이메일:409:{\"success\":false,\"error\":{...}}'"
}

# 인자 파싱
NAME=""
METHOD=""
ENDPOINT=""
BODY=""
declare -a EXAMPLES=()

while [[ $# -gt 0 ]]; do
    case $1 in
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
        --body)
            BODY="$2"
            shift 2
            ;;
        --example)
            EXAMPLES+=("$2")
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

# 필수 인자 확인
if [[ -z "$NAME" || -z "$METHOD" || -z "$ENDPOINT" ]]; then
    echo -e "${RED}Error: --name, --method, --endpoint는 필수입니다.${NC}"
    show_help
    exit 1
fi

# API Key 확인
if [[ -z "$POSTMAN_API_KEY" ]]; then
    echo -e "${RED}Error: POSTMAN_API_KEY가 설정되지 않았습니다.${NC}"
    echo "env.sh 파일을 생성하거나 환경변수를 설정하세요."
    exit 1
fi

echo -e "${YELLOW}Postman Collection에 API 추가 중...${NC}"

# 1. 현재 Collection 가져오기
COLLECTION=$(curl -s "https://api.getpostman.com/collections/${COLLECTION_ID}" \
  -H "X-Api-Key: ${POSTMAN_API_KEY}")

if echo "$COLLECTION" | grep -q '"error"'; then
    echo -e "${RED}❌ Collection을 가져오는 데 실패했습니다.${NC}"
    echo "$COLLECTION" | jq .
    exit 1
fi

# 2. Body 처리
BODY_JSON="null"
if [[ -n "$BODY" ]]; then
    ESCAPED_BODY=$(echo "$BODY" | jq -c '.' | jq -Rs '.')
    BODY_JSON="{\"mode\":\"raw\",\"raw\":${ESCAPED_BODY},\"options\":{\"raw\":{\"language\":\"json\"}}}"
fi

# 3. Path 배열 생성
PATH_ARRAY=$(echo "$ENDPOINT" | sed 's|^/||' | tr '/' '\n' | jq -R . | jq -s .)

# 4. Response Examples 처리
RESPONSES_JSON="[]"
if [[ ${#EXAMPLES[@]} -gt 0 ]]; then
    # 임시 파일에 examples 저장
    TEMP_FILE=$(mktemp)
    echo "[" > "$TEMP_FILE"

    FIRST=true
    for EXAMPLE in "${EXAMPLES[@]}"; do
        # 형식: "이름:상태코드:JSON"
        EXAMPLE_NAME=$(echo "$EXAMPLE" | cut -d':' -f1)
        EXAMPLE_STATUS=$(echo "$EXAMPLE" | cut -d':' -f2)
        EXAMPLE_BODY=$(echo "$EXAMPLE" | cut -d':' -f3-)

        STATUS_TEXT=$(get_status_text "$EXAMPLE_STATUS")

        # JSON 이스케이프
        ESCAPED_EXAMPLE_BODY=$(echo "$EXAMPLE_BODY" | jq -c '.' 2>/dev/null | jq -Rs '.' || echo "\"$EXAMPLE_BODY\"")

        if [[ "$FIRST" != true ]]; then
            echo "," >> "$TEMP_FILE"
        fi
        FIRST=false

        cat >> "$TEMP_FILE" <<EOF
{
    "name": "${EXAMPLE_NAME}",
    "originalRequest": {
        "method": "${METHOD}",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": ${BODY_JSON},
        "url": {
            "raw": "{{baseUrl}}${ENDPOINT}",
            "host": ["{{baseUrl}}"],
            "path": ${PATH_ARRAY}
        }
    },
    "status": "${STATUS_TEXT}",
    "code": ${EXAMPLE_STATUS},
    "_postman_previewlanguage": "json",
    "header": [{"key": "Content-Type", "value": "application/json"}],
    "body": ${ESCAPED_EXAMPLE_BODY}
}
EOF
    done

    echo "]" >> "$TEMP_FILE"
    RESPONSES_JSON=$(cat "$TEMP_FILE")
    rm "$TEMP_FILE"
fi

# 5. 새 Request 생성 (임시 파일 사용)
REQUEST_FILE=$(mktemp)
cat > "$REQUEST_FILE" <<EOF
{
    "name": "${NAME}",
    "request": {
        "method": "${METHOD}",
        "header": [{"key": "Content-Type", "value": "application/json", "type": "text"}],
        "body": ${BODY_JSON},
        "url": {
            "raw": "{{baseUrl}}${ENDPOINT}",
            "host": ["{{baseUrl}}"],
            "path": ${PATH_ARRAY}
        },
        "description": "${NAME}"
    },
    "response": ${RESPONSES_JSON}
}
EOF

NEW_REQUEST=$(cat "$REQUEST_FILE")
rm "$REQUEST_FILE"

# 6. Collection에 item 추가
UPDATED_COLLECTION=$(echo "$COLLECTION" | jq --argjson newReq "$NEW_REQUEST" '
  .collection.item += [$newReq]
')

# 7. Collection 업데이트
RESPONSE=$(curl -s -X PUT "https://api.getpostman.com/collections/${COLLECTION_ID}" \
  -H "X-Api-Key: ${POSTMAN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$UPDATED_COLLECTION")

# 결과 확인
if echo "$RESPONSE" | grep -q '"collection"'; then
    ITEM_COUNT=$(echo "$RESPONSE" | jq '.collection.item | length')
    echo -e "${GREEN}✅ Postman Collection에 API가 추가되었습니다!${NC}"
    echo ""
    echo "  이름: ${NAME}"
    echo "  Method: ${METHOD}"
    echo "  Endpoint: ${ENDPOINT}"
    echo "  Examples: ${#EXAMPLES[@]}개"
    echo "  Collection 총 API 수: ${ITEM_COUNT}"
else
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error.message // .message // "Unknown error"')
    echo -e "${RED}❌ 오류 발생: ${ERROR_MSG}${NC}"
    echo ""
    echo "Response:"
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
