# Failure Modes

Use this file when the workflow is at risk of producing a polished but low-trust result.

## 1. Transcript absent

Symptoms:

- `yt-dlp` reports no subtitles and no automatic captions

Required behavior:

- say transcript extraction failed
- do not summarize as if the transcript exists
- offer either to stop or to create a lower-confidence metadata-only note

## 2. Transcript exists but is low quality

Symptoms:

- many duplicated lines
- untranslated names or jargon mangled by ASR
- sentence boundaries broken beyond easy repair

Required behavior:

- lower the confidence label
- reduce claims about nuance or tone
- prefer section-level synthesis over quote-level interpretation

## 3. Analysis drift

Symptoms:

- output contains strong claims with no timestamp anchor
- "insight" repeats generic wisdom unrelated to the actual video

Required behavior:

- cut unsupported claims
- add timestamped evidence
- move speculative content into `Inference` or `Open Questions`

## 4. Notion over-formatting

Symptoms:

- too many callouts
- decorative sections added without informational value
- the page looks polished but becomes harder to scan

Required behavior:

- revert to the core outline
- keep styling restrained
- preserve evidence-first layout

## 5. Duplicate archive pages

Symptoms:

- the same video URL or ID already exists in the target database or parent page

Required behavior:

- prefer updating the existing page
- only create a new page if the user explicitly wants a separate variant

## 6. Insight-free polished output

Symptoms:

- document looks complete but does not change any decision
- insights are paraphrases of the speaker's claims
- practical section is generic and reusable across any video

Required behavior:

- stop and rewrite with a decision context
- reduce insight count to top 3-5 and add boundary conditions
- add an explicit adopt/watch/reject matrix
- include at least one strong counterpoint to the main thesis

## 7. Visual pass silently skipped

Symptoms:

- Notion page was created/updated but visual clarity pass was not run
- output message implies polish although notion-visualizer was never invoked

Required behavior:

- run notion-visualizer pass by default for Notion outputs
- if skipped, write explicit reason (plain/minimal request, or blocked access)
- never claim visualizer execution without invocation
