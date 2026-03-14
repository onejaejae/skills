#!/usr/bin/env bash
# Multi-Model Code Review - Main Entry Point
# Usage: review.sh <command> [options]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
JOBS_DIR="${PROJECT_ROOT}/.claude/reviews/.jobs"
CONFIG_FILE="${SKILL_DIR}/review.config.yaml"

# Ensure jobs directory exists
mkdir -p "$JOBS_DIR"

# Color codes for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

show_help() {
    cat << 'EOF'
Multi-Model Code Review

Usage:
    review.sh start <PR_URL|--branch BRANCH> [options]
    review.sh wait <JOB_DIR> [--timeout SECONDS]
    review.sh status <JOB_DIR>
    review.sh results <JOB_DIR> [--json|--markdown] [--synthesis STRATEGY]
    review.sh cancel <JOB_DIR>
    review.sh list
    review.sh clean [--all|--older-than DAYS]

Commands:
    start       Start a new review job
    wait        Wait for job completion
    status      Check job status
    results     Get review results
    cancel      Cancel a running job
    list        List all jobs
    clean       Clean up old jobs

Options for 'start':
    --branch BRANCH     Review local branch against develop
    --focus AREAS       Comma-separated: security,performance,quality,testing
    --members MODELS    Comma-separated: claude,codex,gemini
    --timeout SECONDS   Override default timeout per model

Options for 'results':
    --json              Output in JSON format (default)
    --markdown          Output in Markdown format
    --synthesis STRATEGY  Override synthesis strategy:
                          merge    - Algorithmic merge (fast, no cost)
                          ai_merge - AI synthesis with Chairman (accurate, extra API call)

Examples:
    review.sh start https://github.com/org/repo/pull/123
    review.sh start --branch feature/new-feature
    review.sh start PR_URL --focus security,performance
    review.sh start PR_URL --members codex,gemini
    review.sh results JOB_DIR --synthesis ai_merge

EOF
}

# Check if running inside host agent context
is_host_agent_context() {
    # Check for Codex environment
    if [ -n "${CODEX_CACHE_FILE:-}" ]; then
        return 0
    fi
    # Check for no TTY (typical for tool execution)
    if [ ! -t 1 ] && [ ! -t 2 ]; then
        return 0
    fi
    return 1
}

# Validate required dependencies
check_dependencies() {
    local require_gh="${1:-true}"
    local missing=()

    if ! command -v node &> /dev/null; then
        missing+=("node")
    fi

    if [ "$require_gh" = "true" ] && ! command -v gh &> /dev/null; then
        missing+=("gh (GitHub CLI)")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing[*]}"
        exit 1
    fi
}

# Parse PR URL or branch option
parse_target() {
    local target=""
    local target_type=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --branch|-b)
                target="$2"
                target_type="branch"
                shift 2
                ;;
            http*)
                target="$1"
                target_type="pr_url"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ -z "$target" ]; then
        log_error "No PR URL or --branch specified"
        show_help
        exit 1
    fi

    echo "${target_type}:${target}"
}

# Start command - initiates a new review
cmd_start() {
    local target_info
    target_info=$(parse_target "$@")

    local target_type="${target_info%%:*}"
    local target="${target_info#*:}"

    # gh CLI is required only for GitHub PR URL reviews
    if [ "$target_type" = "pr_url" ]; then
        check_dependencies "true"
    else
        check_dependencies "false"
    fi

    # Parse additional options
    local focus=""
    local members=""
    local timeout=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --focus)
                focus="$2"
                shift 2
                ;;
            --members)
                members="$2"
                shift 2
                ;;
            --timeout)
                timeout="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    # Build arguments for Node.js script
    local node_args=("start")
    node_args+=("--target" "$target")
    node_args+=("--target-type" "$target_type")
    node_args+=("--config" "$CONFIG_FILE")
    node_args+=("--jobs-dir" "$JOBS_DIR")

    [ -n "$focus" ] && node_args+=("--focus" "$focus")
    [ -n "$members" ] && node_args+=("--members" "$members")
    [ -n "$timeout" ] && node_args+=("--timeout" "$timeout")

    # Execute via job wrapper
    "${SCRIPT_DIR}/review-job.sh" "${node_args[@]}"
}

# Wait command
cmd_wait() {
    local job_dir="$1"
    shift

    local timeout="300"
    if [[ "${1:-}" == "--timeout" ]]; then
        timeout="${2:-300}"
    fi

    if [ ! -d "$job_dir" ]; then
        log_error "Job directory not found: $job_dir"
        exit 1
    fi

    node "${SCRIPT_DIR}/review-job.js" wait \
        --job-dir "$job_dir" \
        --config "$CONFIG_FILE" \
        --timeout "$timeout"
}

# Status command
cmd_status() {
    local job_dir="$1"

    if [ ! -d "$job_dir" ]; then
        log_error "Job directory not found: $job_dir"
        exit 1
    fi

    node "${SCRIPT_DIR}/review-job.js" status --job-dir "$job_dir"
}

# Results command
cmd_results() {
    local job_dir="$1"
    shift

    local format="json"
    local synthesis=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --json)
                format="json"
                shift
                ;;
            --markdown)
                format="markdown"
                shift
                ;;
            --synthesis)
                synthesis="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ ! -d "$job_dir" ]; then
        log_error "Job directory not found: $job_dir"
        exit 1
    fi

    node "${SCRIPT_DIR}/review-job.js" results \
        --job-dir "$job_dir" \
        --config "$CONFIG_FILE" \
        --format "$format" \
        ${synthesis:+--synthesis "$synthesis"}
}

# Cancel command
cmd_cancel() {
    local job_dir="$1"

    if [ ! -d "$job_dir" ]; then
        log_error "Job directory not found: $job_dir"
        exit 1
    fi

    node "${SCRIPT_DIR}/review-job.js" cancel --job-dir "$job_dir"
}

# List command
cmd_list() {
    if [ ! -d "$JOBS_DIR" ]; then
        log_info "No jobs directory found"
        return 0
    fi

    local jobs
    jobs=$(find "$JOBS_DIR" -maxdepth 1 -type d -name "review-*" | sort -r)

    if [ -z "$jobs" ]; then
        log_info "No review jobs found"
        return 0
    fi

    echo "Review Jobs:"
    echo "============"

    while IFS= read -r job_dir; do
        local job_id
        job_id=$(basename "$job_dir")

        local status="unknown"
        if [ -f "$job_dir/job.json" ]; then
            status=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).state || 'unknown')" "$job_dir/job.json" 2>/dev/null || echo "unknown")
        fi

        printf "%-40s  %s\n" "$job_id" "$status"
    done <<< "$jobs"
}

# Clean command
cmd_clean() {
    local all=false
    local older_than=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --all)
                all=true
                shift
                ;;
            --older-than)
                older_than="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ ! -d "$JOBS_DIR" ]; then
        log_info "No jobs directory to clean"
        return 0
    fi

    if $all; then
        rm -rf "${JOBS_DIR:?}"/*
        log_success "Cleaned all jobs"
    elif [ -n "$older_than" ]; then
        if ! [[ "$older_than" =~ ^[0-9]+$ ]]; then
            log_error "Invalid --older-than value: must be a number"
            exit 1
        fi
        find "$JOBS_DIR" -maxdepth 1 -type d -name "review-*" -mtime "+${older_than}" -exec rm -rf {} \;
        log_success "Cleaned jobs older than $older_than days"
    else
        # Default: clean completed jobs older than 7 days
        find "$JOBS_DIR" -maxdepth 1 -type d -name "review-*" -mtime +7 -exec rm -rf {} \;
        log_success "Cleaned jobs older than 7 days"
    fi
}

# Main entry point
main() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        start)
            cmd_start "$@"
            ;;
        wait)
            cmd_wait "$@"
            ;;
        status)
            cmd_status "$@"
            ;;
        results)
            cmd_results "$@"
            ;;
        cancel)
            cmd_cancel "$@"
            ;;
        list)
            cmd_list "$@"
            ;;
        clean)
            cmd_clean "$@"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
