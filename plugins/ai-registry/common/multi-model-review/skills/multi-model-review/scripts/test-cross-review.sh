#!/bin/bash
# =============================================================================
# Synthetic Cross-Review Test
#
# Tests that cross-review correctly produces AGREE, IGNORE, and PRIORITY_ADJUST
# actions by injecting synthetic findings with known expected outcomes.
#
# Usage: ./test-cross-review.sh <REAL_JOB_DIR>
#   REAL_JOB_DIR: existing job directory with diff.patch to reuse
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JOBS_DIR="$(dirname "$SCRIPT_DIR")/.jobs"
REAL_JOB_DIR="${1:?Usage: ./test-cross-review.sh <REAL_JOB_DIR>}"
TEST_JOB_ID="test-cross-review-$(date +%Y%m%d-%H%M%S)"
TEST_JOB_DIR="${JOBS_DIR}/${TEST_JOB_ID}"

echo "=== Synthetic Cross-Review Test ==="
echo "Source job: ${REAL_JOB_DIR}"
echo "Test job:   ${TEST_JOB_DIR}"
echo ""

# --- Step 1: Create test job directory ---
echo "[1/6] Creating synthetic job directory..."
mkdir -p "${TEST_JOB_DIR}/members/claude"
mkdir -p "${TEST_JOB_DIR}/members/gemini"
mkdir -p "${TEST_JOB_DIR}/members/codex"

# Copy real diff
cp "${REAL_JOB_DIR}/diff.patch" "${TEST_JOB_DIR}/diff.patch"

# Create status.json for each member
for model in claude gemini codex; do
    cat > "${TEST_JOB_DIR}/members/${model}/status.json" << 'EOF'
{"state":"done","startTime":"2026-03-06T00:00:00.000Z","endTime":"2026-03-06T00:05:00.000Z","exitCode":0,"error":null,"mode":"review"}
EOF
done

# --- Step 2: Inject synthetic Pass 1 findings ---
echo "[2/6] Injecting synthetic findings..."

# F1 (AGREE target): claude's finding - genuinely valid
# model_dump() without exclude_unset=True in PATCH endpoint
cat > "${TEST_JOB_DIR}/members/claude/output.txt" << 'HEREDOC'
{
  "summary": "PATCH endpoint implementation needs model_dump fix",
  "comments": [
    {
      "priority": "P2",
      "file": "src/controllers/research_data_validation.py",
      "line": 96,
      "category": "quality",
      "message": "PATCH 엔드포인트에서 model_dump() 사용 시 exclude_unset=True가 누락되어, 클라이언트가 전송하지 않은 필드도 None으로 서비스에 전달됩니다. PATCH 시맨틱(부분 업데이트)에 맞게 exclude_unset=True를 추가해야 합니다.",
      "confidence": "high"
    }
  ],
  "recommendation": "COMMENT"
}
HEREDOC

# F2 (IGNORE target): gemini's finding - obvious false positive
# SQL injection claim in Pydantic+SQLAlchemy environment is wrong
cat > "${TEST_JOB_DIR}/members/gemini/output.txt" << 'HEREDOC'
{
  "summary": "Security vulnerability found in code validation schema",
  "comments": [
    {
      "priority": "P1",
      "file": "src/schemas/research_data_validation.py",
      "line": 24,
      "category": "security",
      "message": "CodeGroupSchema의 codes 필드(list[str])가 SQL injection에 취약합니다. 사용자 입력 문자열이 검증 없이 데이터베이스 쿼리에 직접 삽입되어, 악의적인 SQL 구문이 실행될 수 있습니다. 즉시 입력 sanitization이 필요합니다.",
      "confidence": "high"
    }
  ],
  "recommendation": "REQUEST_CHANGES"
}
HEREDOC

# F3 (PRIORITY_ADJUST target): codex's finding - valid but wrong priority
# Whitespace formatting issue marked as P1 (should be P4)
cat > "${TEST_JOB_DIR}/members/codex/output.txt" << 'HEREDOC'
{
  "summary": "Critical code formatting inconsistency",
  "comments": [
    {
      "priority": "P1",
      "file": "src/repositories/research_data_validation_repository.py",
      "line": 86,
      "category": "quality",
      "message": "update 메서드 내 if 블록 간 공백 사용이 일관되지 않습니다. 전반부 필드(condition, medication 등)는 블록 사이에 공백이 없으나, 후반부 필드(nursing_note, medical_note 등)는 블록 사이에 빈 줄이 추가되어 있습니다. 이 불일치는 코드 가독성을 심각하게 저하시키며 즉시 수정이 필요합니다.",
      "confidence": "high"
    }
  ],
  "recommendation": "REQUEST_CHANGES"
}
HEREDOC

echo "  - claude: F1 (AGREE target) - model_dump() exclude_unset 누락 [P2]"
echo "  - gemini: F2 (IGNORE target) - SQL injection 오탐 [P1]"
echo "  - codex:  F3 (ADJUST target) - 공백 포매팅을 P1으로 과대평가 [P1]"

# --- Step 3: Run cross-review ---
echo ""
echo "[3/6] Starting cross-review pass..."
node "${SCRIPT_DIR}/review-job.js" cross-review \
    --job-dir "${TEST_JOB_DIR}" \
    --config "${SCRIPT_DIR}/../review.config.yaml"

# --- Step 4: Wait for completion ---
echo ""
echo "[4/6] Waiting for cross-review completion..."
node "${SCRIPT_DIR}/review-job.js" wait \
    --job-dir "${TEST_JOB_DIR}" \
    --config "${SCRIPT_DIR}/../review.config.yaml" \
    --timeout 360

# --- Step 5: Analyze results ---
echo ""
echo "[5/6] Analyzing cross-review results..."
echo ""

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_TESTS=0

check_action() {
    local model="$1"
    local finding_pattern="$2"
    local expected_action="$3"
    local label="$4"
    local output_file="${TEST_JOB_DIR}/cross-review/${model}/output.txt"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [ ! -f "$output_file" ]; then
        echo "  FAIL: ${label} - ${model} output not found"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
        return
    fi

    # Extract action for the matching finding_id
    local actual_action
    actual_action=$(python3 -c "
import json, sys, re
try:
    text = open('${output_file}').read()
    # Handle CLI envelope
    try:
        envelope = json.loads(text)
        if envelope.get('type') == 'result' and isinstance(envelope.get('result'), str):
            text = envelope['result']
    except: pass
    # Try direct JSON parse first, then extract JSON from mixed text
    data = None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Find JSON object in mixed text (text + JSON)
        brace_start = text.find('{')
        if brace_start >= 0:
            # Find matching closing brace
            depth = 0
            for i in range(brace_start, len(text)):
                if text[i] == '{': depth += 1
                elif text[i] == '}': depth -= 1
                if depth == 0:
                    try:
                        data = json.loads(text[brace_start:i+1])
                    except: pass
                    break
    if not data:
        print('PARSE_ERROR')
        sys.exit(0)
    votes = data.get('crossReviewVotes', [])
    for v in votes:
        fid = v.get('finding_id', '')
        if '${finding_pattern}' in fid:
            print(v.get('action', 'UNKNOWN'))
            sys.exit(0)
    print('NOT_FOUND')
except Exception as e:
    print(f'ERROR:{e}')
" 2>/dev/null)

    if [ "$actual_action" = "$expected_action" ]; then
        echo "  PASS: ${label} - ${model} -> ${actual_action} (expected: ${expected_action})"
        TOTAL_PASS=$((TOTAL_PASS + 1))
    elif [ "$actual_action" = "NOT_FOUND" ]; then
        echo "  SKIP: ${label} - ${model} did not review this finding"
    else
        echo "  FAIL: ${label} - ${model} -> ${actual_action} (expected: ${expected_action})"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
}

echo "--- F1: AGREE Target (model_dump exclude_unset) ---"
echo "  Expected: gemini AGREE, codex AGREE"
check_action "gemini" "claude_src/controllers" "AGREE" "F1"
check_action "codex"  "claude_src/controllers" "AGREE" "F1"

echo ""
echo "--- F2: IGNORE Target (SQL injection false positive) ---"
echo "  Expected: claude IGNORE, codex IGNORE"
check_action "claude" "gemini_src/schemas" "IGNORE" "F2"
check_action "codex"  "gemini_src/schemas" "IGNORE" "F2"

echo ""
echo "--- F3: PRIORITY_ADJUST Target (P1 formatting -> P4) ---"
echo "  Expected: claude PRIORITY_ADJUST, gemini PRIORITY_ADJUST"
check_action "claude" "codex_src/repositories" "PRIORITY_ADJUST" "F3"
check_action "gemini" "codex_src/repositories" "PRIORITY_ADJUST" "F3"

# --- Step 6: Summary ---
echo ""
echo "=========================================="
echo "[6/6] Test Summary"
echo "=========================================="
echo "  Passed: ${TOTAL_PASS}/${TOTAL_TESTS}"
echo "  Failed: ${TOTAL_FAIL}/${TOTAL_TESTS}"

# Check action type coverage
echo ""
echo "--- Action Type Coverage ---"
ALL_ACTIONS=$(python3 -c "
import json, glob, os
actions = set()
for f in glob.glob('${TEST_JOB_DIR}/cross-review/*/output.txt'):
    try:
        text = open(f).read()
        try:
            envelope = json.loads(text)
            if envelope.get('type') == 'result' and isinstance(envelope.get('result'), str):
                text = envelope['result']
        except: pass
        data = json.loads(text)
        for v in data.get('crossReviewVotes', []):
            actions.add(v.get('action', 'UNKNOWN'))
    except: pass
for a in sorted(actions):
    print(a)
" 2>/dev/null)

HAS_AGREE=false
HAS_IGNORE=false
HAS_ADJUST=false

while IFS= read -r action; do
    case "$action" in
        AGREE) HAS_AGREE=true; echo "  [x] AGREE" ;;
        IGNORE) HAS_IGNORE=true; echo "  [x] IGNORE" ;;
        PRIORITY_ADJUST) HAS_ADJUST=true; echo "  [x] PRIORITY_ADJUST" ;;
        *) echo "  [?] ${action}" ;;
    esac
done <<< "$ALL_ACTIONS"

$HAS_AGREE  || echo "  [ ] AGREE - NOT OBSERVED"
$HAS_IGNORE || echo "  [ ] IGNORE - NOT OBSERVED"
$HAS_ADJUST || echo "  [ ] PRIORITY_ADJUST - NOT OBSERVED"

echo ""
if $HAS_AGREE && $HAS_IGNORE && $HAS_ADJUST; then
    echo "RESULT: ALL 3 ACTION TYPES COVERED"
else
    echo "RESULT: INCOMPLETE COVERAGE"
fi

# Print raw outputs for inspection
echo ""
echo "--- Raw Outputs (for manual inspection) ---"
for model in claude gemini codex; do
    local_output="${TEST_JOB_DIR}/cross-review/${model}/output.txt"
    if [ -f "$local_output" ]; then
        echo ""
        echo "=== ${model} ==="
        python3 -c "
import json
text = open('${local_output}').read()
try:
    envelope = json.loads(text)
    if envelope.get('type') == 'result' and isinstance(envelope.get('result'), str):
        text = envelope['result']
except: pass
data = json.loads(text)
print(json.dumps(data, indent=2, ensure_ascii=False))
" 2>/dev/null || cat "$local_output"
    fi
done

echo ""
echo "Test job directory: ${TEST_JOB_DIR}"
