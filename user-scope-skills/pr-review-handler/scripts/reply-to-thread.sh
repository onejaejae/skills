#!/bin/bash
# PR Review Thread에 Reply 추가 스크립트
# Usage: ./reply-to-thread.sh <THREAD_ID> <BODY>

set -e

THREAD_ID=$1
BODY=$2

if [ -z "$THREAD_ID" ] || [ -z "$BODY" ]; then
    echo "Usage: $0 <THREAD_ID> <BODY>"
    echo "  THREAD_ID: Review thread ID (PRRT_... format)"
    echo "  BODY: Reply message"
    exit 1
fi

gh api graphql -f query='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
    comment {
      id
      body
      url
      createdAt
      author { login }
    }
  }
}' -F threadId="$THREAD_ID" -F body="$BODY"
