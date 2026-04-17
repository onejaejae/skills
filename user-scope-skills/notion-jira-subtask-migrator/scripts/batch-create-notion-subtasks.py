#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
CREATE_SCRIPT = SCRIPT_DIR / "create-notion-subtask.sh"
RENDER_SCRIPT = SCRIPT_DIR / "render-notion-page-to-jira.py"


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        rows.append(json.loads(stripped))
    return rows


def load_completed_sources(log_path: Path) -> set[str]:
    completed = set()
    if not log_path.exists():
        return completed
    for line in log_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            row = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if row.get("status") in {"created", "skipped"}:
            marker = row.get("source_id") or row.get("source_url")
            if marker:
                completed.add(marker)
    return completed


def sort_rows(rows: list[dict], start_from: str) -> list[dict]:
    def key(row: dict):
        return (
            row.get("created_time") or "",
            row.get("source_title") or row.get("summary") or "",
        )

    reverse = start_from == "newest"
    return sorted(rows, key=key, reverse=reverse)


def ensure_body_file(row: dict) -> tuple[str, list[Path]]:
    temp_paths: list[Path] = []

    if row.get("body_file"):
        return str(Path(row["body_file"]).expanduser()), temp_paths

    if row.get("body"):
        tmp = Path(tempfile.mkstemp(prefix="notion-jira-body.", suffix=".md")[1])
        tmp.write_text(row["body"], encoding="utf-8")
        temp_paths.append(tmp)
        return str(tmp), temp_paths

    if row.get("content_file") and row.get("source_url") and row.get("source_title"):
        tmp = Path(tempfile.mkstemp(prefix="notion-jira-rendered.", suffix=".md")[1])
        subprocess.run(
            [
                str(RENDER_SCRIPT),
                "--title",
                row["source_title"],
                "--source-url",
                row["source_url"],
                "--content-file",
                str(Path(row["content_file"]).expanduser()),
                "--output-file",
                str(tmp),
            ],
            check=True,
        )
        temp_paths.append(tmp)
        return str(tmp), temp_paths

    raise ValueError("Each row requires body, body_file, or (content_file + source_url + source_title)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-create Jira subtasks from a JSONL manifest.")
    parser.add_argument("--parent", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--assignee-email")
    parser.add_argument("--labels")
    parser.add_argument("--priority", default="Medium")
    parser.add_argument("--log-file", required=True)
    parser.add_argument("--start-from", choices=["oldest", "newest"], default="oldest")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    manifest_path = Path(args.manifest).expanduser()
    log_path = Path(args.log_file).expanduser()
    log_path.parent.mkdir(parents=True, exist_ok=True)

    rows = sort_rows(load_jsonl(manifest_path), args.start_from)
    completed_sources = load_completed_sources(log_path) if args.resume else set()

    processed = 0
    for row in rows:
        marker = row.get("source_id") or row.get("source_url") or ""
        if args.resume and marker and marker in completed_sources:
            continue
        if args.limit is not None and processed >= args.limit:
            break

        summary = row.get("summary")
        if not summary:
            raise ValueError("Each row requires summary")

        body_file, temp_paths = ensure_body_file(row)
        cmd = [
            str(CREATE_SCRIPT),
            "--parent",
            args.parent,
            "--summary",
            summary,
            "--body-file",
            body_file,
            "--priority",
            row.get("priority", args.priority),
            "--log-file",
            str(log_path),
        ]

        assignee = row.get("assignee_email") or args.assignee_email
        if assignee:
            cmd.extend(["--assignee-email", assignee])

        labels = row.get("labels") or args.labels
        if labels:
            cmd.extend(["--labels", labels])

        if row.get("source_url"):
            cmd.extend(["--source-url", row["source_url"]])
        if row.get("source_id"):
            cmd.extend(["--source-id", row["source_id"]])
        if row.get("source_title"):
            cmd.extend(["--source-title", row["source_title"]])
        if args.dry_run:
            cmd.append("--dry-run")

        try:
            proc = subprocess.run(cmd, check=False, text=True, capture_output=True)
            if proc.stdout.strip():
                print(proc.stdout.strip())
            if proc.returncode != 0:
                if proc.stderr.strip():
                    print(proc.stderr.strip(), file=sys.stderr)
                return proc.returncode
        finally:
            for temp_path in temp_paths:
                temp_path.unlink(missing_ok=True)

        processed += 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
