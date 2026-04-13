# Browser Session Setup

Use this reference when you need the concrete browser attachment strategy.

## Preferred order

1. Reuse an existing authenticated Chrome profile
2. Attach to an already running browser if possible
3. Use a persistent Playwright context with `user-data-dir`
4. Use exported `storageState` only when profile reuse is not practical

## What to look for

- Whether the user already has Chrome open and logged in
- The profile directory or session state location
- Whether the target page is visible in that exact browser profile
- Whether the site is blocked by login, SSO, or bot detection

## Practical guidance

- Prefer the same browser profile the user uses day to day
- Avoid anonymous sessions when the task depends on authenticated content
- If a page works only in one profile, preserve that profile instead of rebuilding access from scratch
- If automation opens the page but text is missing, wait for render before concluding that access failed

## Fallback rule

If the browser path fails twice and the page is still inaccessible, stop and ask for a screenshot, pasted text, or a manual export. Do not keep retrying blindly.
