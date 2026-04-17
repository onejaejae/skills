#!/usr/bin/env python3
import argparse
import re
import sys
from pathlib import Path
from typing import Optional


SECTION_ALIASES = {
    "goal": ["goal", "purpose", "objective", "why", "목표", "배경", "목적"],
    "current_state": ["current state", "status", "finding", "result", "현황", "상태", "결과", "검증", "분석"],
    "blockers": ["blocker", "risk", "issue", "limitation", "dependency", "이슈", "리스크", "제약", "의존성", "막힘"],
    "actions": ["action", "next", "todo", "plan", "checklist", "task", "다음", "액션", "계획", "체크리스트", "할 일"],
    "done": ["done", "acceptance", "definition of done", "exit criteria", "완료 조건", "종료 조건", "done condition"],
}


def normalize_heading(text: str) -> str:
    text = re.sub(r"^[#\s]+", "", text).strip().lower()
    return re.sub(r"\s+", " ", text)


def infer_bucket(heading: str) -> Optional[str]:
    normalized = normalize_heading(heading)
    for bucket, aliases in SECTION_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                return bucket
    return None


def strip_line(text: str) -> str:
    return re.sub(r"^\s*[-*]\s*", "", text).strip()


def as_bullets(lines: list[str], fallback: str) -> str:
    cleaned = [strip_line(line) for line in lines if strip_line(line)]
    if not cleaned:
        return f"* {fallback}"
    return "\n".join(f"* {line}" for line in cleaned[:7])


def extract_sections(content: str) -> tuple[list[str], dict[str, list[str]]]:
    intro: list[str] = []
    sections = {key: [] for key in SECTION_ALIASES}
    current_bucket: Optional[str] = None

    for raw in content.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.lstrip().startswith("#"):
            current_bucket = infer_bucket(line)
            continue
        if current_bucket:
            sections[current_bucket].append(line)
        else:
            intro.append(line)

    return intro, sections


def first_paragraph(lines: list[str]) -> str:
    chunks: list[str] = []
    for line in lines:
        stripped = strip_line(line)
        if stripped:
            chunks.append(stripped)
        if len(" ".join(chunks)) > 240:
            break
    return " ".join(chunks[:4]) if chunks else "원문 참고"


def build_description(title: str, source_url: str, content: str) -> str:
    intro, sections = extract_sections(content)

    goal_text = first_paragraph(sections["goal"] or intro)
    current_state = as_bullets(sections["current_state"] or intro[1:5], "원문에서 현재 상태를 확인")
    blockers = as_bullets(sections["blockers"], "명시된 blocker 없음. 원문 확인 필요")
    actions = as_bullets(sections["actions"] or intro[5:10], "다음 액션 원문 확인")
    done = as_bullets(sections["done"], "완료 조건 원문 확인")

    lines = [
        "h2. Source",
        f"[{title}|{source_url}]",
        "",
        "h2. Goal",
        goal_text,
        "",
        "h2. Current State",
        current_state,
        "",
        "h2. Known Blockers",
        blockers,
        "",
        "h2. Next Actions",
        actions,
        "",
        "h2. Done Condition",
        done,
    ]
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render Notion-like markdown into Jira Wiki Markup summary.")
    parser.add_argument("--title", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--content-file", required=True)
    parser.add_argument("--output-file")
    args = parser.parse_args()

    content = Path(args.content_file).read_text(encoding="utf-8")
    description = build_description(args.title.strip(), args.source_url.strip(), content)

    if args.output_file:
        Path(args.output_file).write_text(description, encoding="utf-8")
    else:
        sys.stdout.write(description)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
