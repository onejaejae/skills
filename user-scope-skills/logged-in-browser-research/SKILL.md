---
name: logged-in-browser-research
description: Use when the user says "logged in Chrome", "my browser session", "current Chrome profile", "persistent user-data-dir", "already signed in", or asks for a private LinkedIn, Notion, X, Slack, SSO dashboard, paywalled page, chromux, cookies, or JS-heavy page that only works in their authenticated browser.
---

# Logged-In Browser Research

## Overview

Use a real browser session when public fetch, plain HTTP, or search results are not enough. The point is to reuse the user's own authenticated state, extract what is visible in that session, and turn it into a reliable research summary.

Treat access as a dependency, not as something to paper over. If the page is blocked, say so clearly and capture the failure mode instead of guessing.

## When to Use

Use this skill when the request includes any of these signals:

- The user says the content is behind login, SSO, a company workspace, or an invite-only page
- The user wants you to inspect LinkedIn, Notion, X, Gmail, Slack, internal dashboards, or other authenticated surfaces
- A page is visibly JS-heavy, lazy-loaded, or rendered only after browser interaction
- Public search or fetch returns partial content, missing text, or a login wall
- The user explicitly wants reuse of an existing Chrome profile, browser session, cookies, or `chromux`

Do not use this skill when the full content is already pasted, when public web access is enough, or when the task is purely general web research with no authenticated page access.

## Core Rule

Always prefer the user's own logged-in browser context over creating a fresh anonymous session.

Why:
- It preserves the exact page state the user can already see
- It reduces re-authentication friction
- It is the most realistic way to inspect content that public tools cannot reach

## Access Strategy

Choose the lightest working path first:

| Situation | Preferred path | Why |
|---|---|---|
| Existing Chrome profile available | Attach to that profile with `chromux` or a persistent Playwright context | Reuses the user's session cookies and local state |
| Existing Chrome already open | Attach to the running browser if possible | Avoids a second login and keeps tabs/state intact |
| Need repeatable automation | Use a persistent `user-data-dir` or saved `storageState` | Makes repeated runs stable |
| Browser tooling fails | Ask the user for pasted text, screenshots, or a manual export | Keeps progress moving without fake access |

If you are unsure which path is available, ask for the minimum needed detail: profile path, whether Chrome is already open, and whether the site is visible in that session.

## Workflow

1. Identify the exact URL or page target.
2. Determine whether the user has an authenticated Chrome session available.
3. Open the page in that session and wait for render.
4. Extract visible text, title, and any relevant metadata.
5. Check whether the page is fully loaded or only partially rendered.
6. If the page is blocked, record the blocker precisely.
7. Summarize findings with evidence and URLs.

## Extraction Checklist

Capture the following when relevant:

- Page title
- Canonical URL or visible page URL
- Main body text
- Important headings and labels
- Dates, authors, counts, or quoted claims
- Any visible evidence that proves the page was actually accessed

When the user asks for synthesis, separate:

- What was directly observed
- What is an inference
- What could not be verified

## Common Failure Modes

- The browser opens but the page body is empty
- The page loads but content is hidden behind a click, tab, or expansion
- The page shows a login wall even though the user is logged in elsewhere
- The page loads in one browser profile but not another
- The site detects automation and serves partial content

When that happens, do not invent the missing content. Note the blocker, then try the next fallback or ask the user for a screenshot or pasted text.

## Output Format

Prefer this structure:

```markdown
# Research Summary
## Access Status
- Accessed via: [existing Chrome profile / attached session / fallback]
- Blockers: [none / login wall / partial render / bot protection]

## Findings
- [finding 1]
- [finding 2]

## Evidence
- URL: ...
- Title: ...
- Extracted text: ...

## Notes
- [what is inferred]
- [what could not be verified]
```

## References

Read these only when you need setup details or a more specific extraction pattern:

- `references/browser-session.md` for Chrome profile reuse and attachment strategies
- `references/research-output.md` for reporting conventions and failure handling
