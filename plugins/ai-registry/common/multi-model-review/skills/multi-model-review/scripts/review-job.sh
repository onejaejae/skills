#!/usr/bin/env bash
# Multi-Model Code Review - Job Wrapper
# Wrapper script that invokes the Node.js job orchestrator

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check Node.js availability
if ! command -v node &> /dev/null; then
    echo '{"error": "Node.js not found. Please install Node.js 18+"}' >&2
    exit 1
fi

# Execute the main Node.js script with all arguments
exec node "${SCRIPT_DIR}/review-job.js" "$@"
