#!/usr/bin/env python3
"""Chunk normalized transcript JSON into analysis-sized sections."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("normalized_json")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--max-chars", type=int, default=5500)
    args = parser.parse_args()

    source_path = Path(args.normalized_json)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    data = json.loads(source_path.read_text(encoding="utf-8"))
    segments = data.get("segments", [])

    chunks = []
    current = []
    current_chars = 0

    for segment in segments:
        text = segment["text"]
        next_size = current_chars + len(text) + 1
        if current and next_size > args.max_chars:
            chunks.append(
                {
                    "chunk_id": len(chunks) + 1,
                    "start": current[0]["start"],
                    "end": current[-1]["end"],
                    "text": "\n".join(item["text"] for item in current),
                    "segment_count": len(current),
                }
            )
            current = []
            current_chars = 0

        current.append(segment)
        current_chars += len(text) + 1

    if current:
        chunks.append(
            {
                "chunk_id": len(chunks) + 1,
                "start": current[0]["start"],
                "end": current[-1]["end"],
                "text": "\n".join(item["text"] for item in current),
                "segment_count": len(current),
            }
        )

    output = {
        "source_file": str(source_path),
        "chunk_count": len(chunks),
        "chunks": chunks,
    }
    output_path = output_dir / f"{source_path.stem}.chunks.json"
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(str(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
