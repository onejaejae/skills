---
name: pdf-to-llm
description: >
  Use when the user wants to read, summarize, analyze, compare, or ask
  questions about a PDF and the built-in PDF reader produces noisy or
  incomplete results. Also use when the user mentions PDF parsing, markdown
  extraction, OCR, scanned PDFs, or preparing documents for LLM input.
  Triggers: "PDF 변환", "PDF 읽어줘", "PDF 분석", "스캔 PDF", "OCR",
  "PDF to markdown", "pdf-to-llm", "PDF 파싱", "문서 변환",
  "convert PDF", "extract text from PDF", "PDF 텍스트 추출".
---

# pdf-to-llm

Convert PDFs into clean Markdown and structured JSON using `opendataloader-pdf`, so you can work with the content instead of fighting layout noise.

## Why this skill exists

The built-in PDF reader (Read tool) works for simple PDFs but struggles with complex layouts, tables, multi-column documents, and scanned pages. `opendataloader-pdf` handles these cases by producing structured Markdown (for reading) and JSON (for page-level citations and coordinates). The difference matters most for documents where layout carries meaning — research papers, financial reports, contracts, forms.

## Preflight

Before converting, check dependencies in this order:

1. Confirm the input PDF path or URL exists.
2. Check `java -version` — Java 11+ is required. If missing, stop and tell the user.
3. Check if `opendataloader-pdf` is installed: `pip show opendataloader-pdf`

If not installed:

```bash
pip install -U opendataloader-pdf
```

Only install the heavier hybrid package when the PDF is scanned, image-based, or OCR-dependent:

```bash
pip install -U "opendataloader-pdf[hybrid]"
```

## Conversion modes

### Fast mode (default)

Use this first for normal digital PDFs. It handles most cases well.

```bash
opendataloader-pdf INPUT.pdf \
  --output-dir OUTPUT_DIR \
  --format markdown,json \
  --use-struct-tree \
  --quiet
```

`--use-struct-tree` is safe to try first — tagged PDFs benefit, untagged ones fall back to visual heuristics.

### Hybrid mode (OCR / scanned PDFs)

Escalate to hybrid only when fast mode fails or produces clearly degraded output:
- No selectable text in the PDF
- Scanned or image-only pages
- Badly broken tables or reading order
- Multilingual OCR (e.g., Korean + English)

Start the hybrid server:

```bash
opendataloader-pdf-hybrid --port 5002 --force-ocr --ocr-lang "ko,en"
```

Then convert:

```bash
opendataloader-pdf INPUT.pdf \
  --output-dir OUTPUT_DIR \
  --format markdown,json \
  --hybrid docling-fast \
  --quiet
```

For formulas or image descriptions, add `--hybrid-mode full` on the client side.

## Working with the output

**Prefer Markdown for reading, JSON for structure.**

- Read the generated `.md` file first — it's the primary artifact.
- Use `.json` only when page numbers, element types, or bounding boxes matter (citations, coordinates).
- Don't paste the whole converted file into chat. Quote only the relevant section and keep the full file on disk.
- Ignore repeated headers/footers unless the user asks for them.
- Summarize from Markdown, not from raw OCR output.

## After conversion, always report

- Where the `.md` and `.json` files were written
- Whether fast or hybrid mode was used
- Whether OCR was required
- Any obvious caveats (broken tables, missing text, garbled sections)

## Common tasks

| Task | Approach |
|------|----------|
| **PDF 요약** | Convert to markdown → read → summarize by section (not by page) |
| **PDF 2개 비교** | Convert both in one batch → compare headings, sections, tables from Markdown |
| **스캔된 PDF** | Install hybrid deps → start server with OCR flags → convert with `--hybrid docling-fast` |
| **특정 페이지만** | Convert full PDF first, then read only the relevant section from Markdown |

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Dumping the entire converted file into chat | Quote only relevant sections — the full file stays on disk |
| Using JSON as the reading format | JSON is for structure/citations. Read from Markdown. |
| Installing hybrid deps for a normal digital PDF | Try fast mode first. Only escalate when output is clearly degraded. |
| Skipping the preflight check | Java missing = cryptic errors downstream. Always verify. |
| Running OCR without specifying language | Set `--ocr-lang` explicitly for better accuracy, especially with Korean. |

## Failure handling

- **Java missing**: Stop immediately, tell the user Java 11+ is required.
- **Fast mode output is degraded**: Retry with hybrid before concluding the PDF is unreadable.
- **Hybrid deps unavailable**: Fall back to fast mode and note the caveats explicitly.
- **Remote PDF**: Download to a temp file first, then convert.
