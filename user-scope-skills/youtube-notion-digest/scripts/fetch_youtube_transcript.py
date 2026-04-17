#!/usr/bin/env python3
"""Fetch YouTube metadata and the best available caption track via yt-dlp."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


DEFAULT_LANGS = ["ko-orig", "ko", "en-orig", "en"]
EXT_PRIORITY = ["vtt", "srt", "ttml", "srv3", "srv2", "srv1"]


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def choose_format(formats: list[dict]) -> str:
    available = {item.get("ext") for item in formats if item.get("ext")}
    for ext in EXT_PRIORITY:
        if ext in available:
            return ext
    return next(iter(available), "vtt")


def choose_track(
    tracks: dict[str, list[dict]], preferred_langs: list[str]
) -> tuple[str | None, str | None]:
    for lang in preferred_langs:
        if lang in tracks:
            return lang, choose_format(tracks[lang])
    for lang, formats in tracks.items():
        return lang, choose_format(formats)
    return None, None


def normalize_url(url: str) -> str:
    return url.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument(
        "--lang-preferences",
        default=",".join(DEFAULT_LANGS),
        help="Comma-separated language preference order",
    )
    args = parser.parse_args()

    url = normalize_url(args.url)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    preferred_langs = [item.strip() for item in args.lang_preferences.split(",") if item.strip()]

    metadata = json.loads(run(["yt-dlp", "--skip-download", "--dump-single-json", url]).stdout)
    subtitles = metadata.get("subtitles") or {}
    automatic = metadata.get("automatic_captions") or {}

    track_type = None
    lang, ext = choose_track(subtitles, preferred_langs)
    if lang:
        track_type = "manual"
    else:
        lang, ext = choose_track(automatic, preferred_langs)
        if lang:
            track_type = "automatic"

    result = {
        "video_id": metadata.get("id"),
        "title": metadata.get("title"),
        "channel": metadata.get("channel"),
        "uploader": metadata.get("uploader"),
        "duration": metadata.get("duration"),
        "language": metadata.get("language"),
        "upload_date": metadata.get("upload_date"),
        "webpage_url": metadata.get("webpage_url") or url,
        "track_type": track_type,
        "track_language": lang,
        "track_ext": ext,
        "caption_file": None,
    }

    if not lang or not ext:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    prefix = output_dir / metadata["id"]
    command = [
        "yt-dlp",
        "--skip-download",
        "--sub-langs",
        lang,
        "--sub-format",
        ext,
        "-o",
        str(prefix) + ".%(ext)s",
    ]
    command.append("--write-subs" if track_type == "manual" else "--write-auto-sub")
    command.append(url)
    run(command)

    caption_path = output_dir / f"{metadata['id']}.{lang}.{ext}"
    if not caption_path.exists():
        matches = sorted(output_dir.glob(f"{metadata['id']}.{lang}.*"))
        if matches:
            caption_path = matches[0]

    result["caption_file"] = str(caption_path) if caption_path.exists() else None
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(exc.stderr or str(exc))
        raise
