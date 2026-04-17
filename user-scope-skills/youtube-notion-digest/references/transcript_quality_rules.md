# Transcript Quality Rules

Use this file when transcript selection, cleanup, or confidence needs a precise rule.

## Track selection order

Choose the best caption track in this order:

1. manual subtitle in the user's language
2. manual subtitle in the video's original language
3. automatic caption in the video's original language
4. translated subtitle only as a fallback

Never silently use a translated caption as if it were the original transcript.

## Confidence rubric

Use one label in the final artifact:

- `High`: manual subtitle in original language, clean phrasing, low duplication
- `Medium`: automatic subtitle in original language, understandable with minor noise
- `Low`: translated caption, fragmented auto caption, or clear ASR degradation

Interpretation ceiling:

- `High`: nuance-level interpretation allowed
- `Medium`: strategic interpretation allowed, quote-level nuance is cautious
- `Low`: limit to section-level synthesis; avoid fine-grained intent claims

## Normalization rules

The cleanup step should:

- strip sequence numbers
- preserve `start` and `end`
- collapse broken line wraps
- remove adjacent duplicated caption text
- trim filler repeats caused by ASR stutter
- keep speaker wording mostly intact without over-editing

Do not rewrite the transcript into polished prose before analysis. Cleanup is for noise removal, not interpretation.

## Chunking strategy

Switch to chunked analysis when any of these is true:

- transcript text exceeds about 12,000 words
- normalized text exceeds about 80,000 characters
- the video is long enough that one-pass synthesis would lose section boundaries

Target chunk size:

- 4,000 to 6,000 characters per chunk
- keep natural timestamp continuity
- avoid splitting a caption cue mid-line

## Evidence discipline

For each important takeaway, preserve at least one of:

- a timestamp range
- the chunk identifier
- an explicit note that the point is a synthesis across multiple nearby chunks

If a point cannot be traced back to the transcript, it belongs in `Inference`, not `Facts`.

For insight quality:

- every top insight must include one timestamp and one boundary condition
- if boundary condition is missing, downgrade from `Insight` to `Observation`
