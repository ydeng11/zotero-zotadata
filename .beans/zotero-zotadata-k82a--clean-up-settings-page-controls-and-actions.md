---
# zotero-zotadata-k82a
title: Clean up settings page controls and actions
status: completed
type: bug
priority: normal
created_at: 2026-04-12T04:23:34Z
updated_at: 2026-04-12T04:47:36Z
---

User reported settings page regressions and missing controls.

- [x] Inspect current settings page structure and related preference code
- [x] Define UI/content changes for Sci-Hub, retry fallback removal, lower-page cleanup, and save/cancel actions
- [x] Produce decision-complete implementation plan
- [x] Add failing tests for the settings dialog cleanup and fixed Sci-Hub threshold
- [x] Implement the settings dialog, preference, and Sci-Hub changes
- [x] Run tests, simplify if needed, and summarize the completed work

## Summary of Changes

- Simplified the settings dialog to email, CORE API key, the Sci-Hub toggle, and explicit Save/Cancel buttons.
- Removed the Sci-Hub retry preference and dead bottom settings from dialog markup, prefs defaults, typings, and manager plumbing.
- Switched Sci-Hub session disabling to a fixed internal two-failure threshold and updated the related tests to match.
- Tightened FileFinder defaults and test helpers so the full Vitest suite and TypeScript checks pass.
