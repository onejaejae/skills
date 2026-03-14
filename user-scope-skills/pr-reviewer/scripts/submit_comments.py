#!/usr/bin/env python3
"""
PR 코멘트 일괄 제출 스크립트

JSON 파일로 작성한 리뷰 코멘트를 GitHub PR에 한 번에 제출합니다.

사용법:
    python submit_comments.py comments.json
    python submit_comments.py comments.json --repo owner/repo
    python submit_comments.py comments.json --dry-run

입력 JSON 형식:
{
    "pr": 123,
    "event": "COMMENT",  // COMMENT, APPROVE, REQUEST_CHANGES
    "body": "전체 리뷰 요약 (선택)",
    "comments": [
        {"path": "src/main.py", "line": 10, "body": "[제안] 설명"},
        {"path": "src/utils.py", "line": 25, "side": "RIGHT", "body": "[필수] 설명"}
    ]
}
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path


def get_current_repo() -> str:
    """현재 디렉토리의 GitHub 레포지토리 정보를 가져옵니다."""
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError("GitHub 레포지토리 정보를 가져올 수 없습니다. gh auth login을 확인하세요.")
    return result.stdout.strip()


def get_latest_commit(pr_number: int, repo: str) -> str:
    """PR의 최신 커밋 SHA를 가져옵니다."""
    result = subprocess.run(
        ["gh", "api", f"repos/{repo}/pulls/{pr_number}", "-q", ".head.sha"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"PR #{pr_number}의 커밋 정보를 가져올 수 없습니다.")
    return result.stdout.strip()


def submit_review(repo: str, pr_number: int, commit_id: str, body: str,
                  event: str, comments: list, dry_run: bool = False) -> None:
    """GitHub API를 통해 리뷰를 제출합니다."""

    # API 요청 페이로드 구성
    payload = {
        "commit_id": commit_id,
        "event": event,
        "comments": []
    }

    if body:
        payload["body"] = body

    # 코멘트 형식 변환
    for comment in comments:
        review_comment = {
            "path": comment["path"],
            "body": comment["body"],
        }

        # line 또는 position 설정
        if "line" in comment:
            review_comment["line"] = comment["line"]
            review_comment["side"] = comment.get("side", "RIGHT")

        payload["comments"].append(review_comment)

    if dry_run:
        print("=== Dry Run ===")
        print(f"Repository: {repo}")
        print(f"PR: #{pr_number}")
        print(f"Event: {event}")
        print(f"Body: {body or '(없음)'}")
        print(f"Comments ({len(comments)}개):")
        for c in payload["comments"]:
            print(f"  - {c['path']}:{c.get('line', 'N/A')} - {c['body'][:50]}...")
        return

    # gh api 호출
    payload_json = json.dumps(payload)
    result = subprocess.run(
        [
            "gh", "api",
            "-X", "POST",
            f"repos/{repo}/pulls/{pr_number}/reviews",
            "--input", "-"
        ],
        input=payload_json,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"오류: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    response = json.loads(result.stdout)
    print(f"리뷰가 성공적으로 제출되었습니다!")
    print(f"URL: {response.get('html_url', 'N/A')}")


def main():
    parser = argparse.ArgumentParser(
        description="PR 코멘트를 일괄 제출합니다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
    python submit_comments.py review.json
    python submit_comments.py review.json --repo anthropics/claude-code
    python submit_comments.py review.json --dry-run
        """
    )
    parser.add_argument("json_file", type=Path, help="코멘트가 담긴 JSON 파일")
    parser.add_argument("--repo", help="대상 레포지토리 (기본: 현재 디렉토리)")
    parser.add_argument("--dry-run", action="store_true", help="실제 제출 없이 미리보기")

    args = parser.parse_args()

    # JSON 파일 읽기
    if not args.json_file.exists():
        print(f"오류: 파일을 찾을 수 없습니다: {args.json_file}", file=sys.stderr)
        sys.exit(1)

    with open(args.json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 필수 필드 검증
    if "pr" not in data:
        print("오류: JSON에 'pr' 필드가 필요합니다.", file=sys.stderr)
        sys.exit(1)

    pr_number = data["pr"]
    event = data.get("event", "COMMENT")
    body = data.get("body", "")
    comments = data.get("comments", [])

    # event 검증
    valid_events = ["COMMENT", "APPROVE", "REQUEST_CHANGES"]
    if event not in valid_events:
        print(f"오류: event는 {valid_events} 중 하나여야 합니다.", file=sys.stderr)
        sys.exit(1)

    # 레포지토리 결정
    repo = args.repo or get_current_repo()

    # 최신 커밋 가져오기
    commit_id = get_latest_commit(pr_number, repo)

    # 리뷰 제출
    submit_review(repo, pr_number, commit_id, body, event, comments, args.dry_run)


if __name__ == "__main__":
    main()
