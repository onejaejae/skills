---
name: youtube-notion-digest
description: >
  Use when the user shares a YouTube video URL and wants transcript extraction,
  a structured digest, expanded insights, a quality audit, or a polished Notion page.
  Trigger on requests like "유튜브 영상 정리", "영상 스크립트 가져와",
  "이 유튜브 노션에 정리", "transcript this YouTube video",
  "summarize this talk into Notion", "영상 인사이트 정리", or a bare
  YouTube link plus a request to summarize, archive, or extract learnings.
  Prefer this over generic digest when the source is a YouTube video and the
  user wants transcript-grounded analysis rather than a lightweight summary.
---

# YouTube Notion Digest

Turn a YouTube video into a transcript-grounded analysis artifact and, when requested, a polished Notion page.

This skill is not a generic "summarize a video" prompt. It is a reliability-first workflow:

1. fetch the best available transcript
2. normalize and chunk it deterministically
3. produce a digest that separates evidence from inference
4. render the result into a Notion-ready structure

If transcript quality is weak, say so explicitly. Do not overclaim certainty from auto captions.

If the user says "인사이트가 없다", treat this as a quality failure and switch to a decision-grade rewrite mode.

## When this skill is the right tool

Use this skill when the user wants one or more of the following from a YouTube URL:

- transcript extraction
- structured digest or learning notes
- insight expansion beyond a plain summary
- a page created or updated in Notion
- a repeatable archive workflow for videos

Do not use this skill when:

- the user only wants a generic article or webpage summary
- the user only wants existing Notion content beautified
  In that case, use `notion-visualizer`.
- there is no YouTube source and no transcript-oriented workflow

## Core standard

Every output must keep these layers separate:

- `Transcript-grounded facts`: what the speaker actually said
- `Inference`: interpretation derived from the transcript
- `External validation`: extra research used to verify or enrich unstable claims

If those layers blur together, the page becomes polished but untrustworthy.

Every output must also be useful for action:

- `Decision relevance`: what to adopt, what to avoid, what to test next
- `Novelty`: insights that are not just paraphrases of the transcript
- `Boundaries`: where each idea fails or should be downgraded

## Workflow

### Step 0: Confirm the target mode

Choose one of these modes based on the user's request:

- `extract`: transcript only
- `digest`: transcript + structured analysis
- `notion-create`: create a new Notion page from the analysis
- `notion-update`: update an existing Notion page
- `notion-polish`: polish an existing Notion page with notion-visualizer pass

Default to `digest` if the user asks for understanding, and to `notion-create` if the user mentions Notion without specifying an existing page.

Then capture the user's decision context in one line:

- who is the audience?
- what decision should this document improve?
- what time horizon matters (today, this sprint, this quarter)?

If the user did not provide this explicitly, infer it from context and state the assumption in the output.

### Step 1: Fetch metadata and transcript

Use the helper script first:

```bash
python3 scripts/fetch_youtube_transcript.py "<youtube-url>" --output-dir /tmp/youtube-notion-digest
```

The script chooses the best available caption track and writes a JSON summary to stdout.

Selection priority:

1. manual subtitles in preferred languages
2. original-language automatic captions
3. translated captions only if no original-language track exists

If no usable transcript exists:

- state that clearly
- do not fabricate a transcript
- offer a fallback limited to metadata-based notes only if the user explicitly wants that lower-confidence path

Read `references/transcript_quality_rules.md` if track choice or confidence is ambiguous.
Read `references/insight_quality_rubric.md` before finalizing.

### Step 2: Normalize and chunk before analysis

Run the deterministic cleanup pipeline:

```bash
python3 scripts/normalize_captions.py "<caption-file>" --output-dir /tmp/youtube-notion-digest
python3 scripts/chunk_transcript.py "<normalized-json>" --output-dir /tmp/youtube-notion-digest
```

Why this matters:

- auto captions contain repeated lines and broken line wraps
- long videos should not be analyzed in one pass
- timestamps must survive normalization so later claims can be traced

### Step 3: Build the digest in two passes

For short transcripts, one analytical pass is fine. For long transcripts, do this:

1. summarize each chunk with timestamps preserved
2. synthesize the full video from chunk summaries

Use the `digest` skill's thinking pattern, not its output shape:

- one-line summary
- context
- restructured core content
- insight and judgment
- practical implications

But the final artifact for this skill must follow the fixed schema in `references/notion_page_template.md`.

Use this extraction order:

1. `Evidence map`: list the strongest timestamped claims first
2. `Tension map`: identify tradeoffs/conflicts between claims
3. `Decision map`: convert insights into adopt/watch/reject or test-now/later

Do not write the final prose before you have all three maps.

### Step 4: Enrich carefully

Add extra insight only after the transcript-grounded digest exists.

Allowed enrichments:

- implicit assumptions the speaker seems to hold
- missing counterpoints
- practical implications for a practitioner
- targeted external verification for unstable facts, product claims, benchmarks, or recent events

Rules:

- cap external verification to the 1-3 most important unstable claims
- cite the source category in prose
- mark clearly when something is an inference rather than a quoted or timestamped point

If the video is mostly opinion or storytelling, external research is optional. Do not force it.

If external validation is skipped, explicitly say so and explain why.

### Step 5: Render to Notion (Content Pass)

Use the Notion page skeleton from `references/notion_page_template.md`.

Before creating a new page:

- if the user provided a target page or database, inspect it first
- if a database is involved, search for an existing entry by exact YouTube URL or video ID
- prefer update over duplicate create when the same video is already archived

When writing the Notion page in this step:

- create the information structure first
- keep the page evidence-first, not decoration-first

### Step 6: Visual Pass with notion-visualizer

For `notion-create` and `notion-update`, run a visual pass after the content pass.

Default behavior:

- if the user asked for Notion output and did not request plain/minimal formatting, run notion-visualizer pass
- preserve meaning, timestamps, and decision sections
- improve hierarchy, scannability, and emphasis only

Do not claim `notion-visualizer` was used unless it was explicitly invoked.

## Required output structure

Always include these sections unless the user asks for a narrower mode:

1. `Video Metadata`
2. `Decision Context`
3. `One-Line Summary`
4. `Interview Signal Audit` (what is strong, what is weak)
5. `Key Points With Timestamps`
6. `Non-Obvious Insights` (3-5 only)
7. `Decision Matrix` (Adopt / Watch / Reject)
8. `30-Day Experiments`
9. `Blind Spots Or Counterpoints`
10. `Open Questions`
11. `Transcript Quality Note`
12. `Visualization Pass Note` (executed / skipped + reason)

For long videos, also include:

- `Section Timeline`
- `Per-Section Summary`

## Quality gates

Do not ship the final result until these are true:

- every major claim maps to at least one transcript timestamp
- inference is visually or verbally separated from evidence
- external facts were only added where needed
- the Notion page can be scanned top-down without reading every paragraph
- transcript quality limitations are disclosed

And all of these are true:

- at least 3 insights include: evidence, why non-obvious, boundary condition, action
- no more than 5 key insights (force prioritization)
- each recommendation has an owner type and a time horizon
- at least one counterpoint materially challenges the main thesis
- for Notion outputs: notion-visualizer pass executed, or skipped with explicit reason

Run a quick pass with `references/insight_quality_rubric.md`.

## Failure handling

When the workflow degrades, fail specifically:

- no transcript: say transcript unavailable
- only translated captions: mark as translation-derived
- weak auto captions: lower confidence, reduce interpretation strength
- very long transcript: switch to chunked workflow
- Notion destination unclear: stop before page creation and ask for the target only if a safe default is not available

Read `references/failure_modes.md` when the path is unclear.

Also use failure mode "Insight-free polished output" as a hard stop.

## Minimal report style

Keep the top of the final answer concise:

- what was extracted
- what transcript quality was available
- whether Notion was created or updated
- what confidence caveats matter

Then present the artifact or summary.

## Anti-patterns to avoid

- Generic management advice not anchored to timestamps
- Repeating the same thesis in multiple sections
- Long narrative without decision consequences
- Inflating certainty from low-quality auto captions
- Decorative Notion formatting that hides weak insight

## Example triggers

- "이 유튜브 영상 스크립트 뽑고 노션에 정리해줘"
- "이 강연 핵심이 뭐야? 인사이트까지 깊게 정리해줘"
- "YouTube 링크 줄게. transcript 기반으로 digest 만들고 Notion page까지 생성해"
- "이 영상 아카이빙하고 싶어. 핵심 내용이랑 실행 포인트 위주로"
