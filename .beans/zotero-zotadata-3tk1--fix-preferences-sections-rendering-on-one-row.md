---
# zotero-zotadata-3tk1
title: Fix preferences sections rendering on one row
status: completed
type: bug
priority: normal
created_at: 2026-04-12T04:04:23Z
updated_at: 2026-04-12T04:04:54Z
---

## Goal
Fix the preferences dialog so the top-level sections stack vertically instead of rendering across a single row.

## Todo
- [x] Add regression coverage for vertically stacked top-level sections
- [x] Update both preferences dialog files to force vertical section layout
- [x] Verify the targeted preferences asset test passes

## Summary of Changes
- Added regression coverage requiring the preferences pane to declare vertical orientation.
- Updated both dialog files to set orient="vertical" on the prefpane, which prevents the top-level sections from rendering across one row.
- Verification: npm test -- --run src/__tests__/unit/PreferencesDialogAssets.test.ts passed.
