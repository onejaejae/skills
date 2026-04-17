#!/usr/bin/env python3
"""Normalize SRT/VTT captions into timestamped JSON."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


TIMESTAMP_RE = re.compile(
    r"(?P<start>\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(?P<end>\d{2}:\d{2}:\d{2}[,.]\d{3})"
)


def clean_text(text: str) -> str:
    text = text.replace("\u200b", " ")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def strip_overlap(previous: str | None, current: str) -> str:
    if not previous:
        return current
    if current == previous:
        return ""
    if current.startswith(previous):
        return current[len(previous) :].strip()
    if previous.endswith(current):
        return ""

    max_overlap = min(len(previous), len(current))
    for size in range(max_overlap, 5, -1):
        if previous[-size:] == current[:size]:
            return current[size:].strip()
    return current


def parse_blocks(raw: str) -> list[dict[str, str]]:
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    raw = re.sub(r"^WEBVTT.*?\n", "", raw, count=1, flags=re.DOTALL)
    blocks = re.split(r"\n\s*\n", raw)
    cues: list[dict[str, str]] = []
    previous_full_text = None
    previous_emitted_text = None

    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        if lines[0].isdigit():
            lines = lines[1:]
        if not lines:
            continue
        match = TIMESTAMP_RE.match(lines[0])
        if not match:
            continue
        text = clean_text(" ".join(lines[1:]))
        if not text:
            continue
        delta = strip_overlap(previous_full_text, text)
        previous_full_text = text
        if not delta:
            continue
        if delta == previous_emitted_text:
            continue
        previous_emitted_text = delta
        cues.append(
            {
                "start": match.group("start").replace(",", "."),
                "end": match.group("end").replace(",", "."),
                "text": delta,
            }
        )
    return cues


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("caption_file")
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    caption_path = Path(args.caption_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    cues = parse_blocks(caption_path.read_text(encoding="utf-8"))
    payload = {
        "source_file": str(caption_path),
        "segment_count": len(cues),
        "segments": cues,
        "plain_text": "\n".join(segment["text"] for segment in cues),
    }

    output_path = output_dir / f"{caption_path.stem}.normalized.json"
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(str(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
