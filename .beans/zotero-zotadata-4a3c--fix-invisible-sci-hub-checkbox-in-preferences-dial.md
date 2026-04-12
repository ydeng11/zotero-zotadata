---
# zotero-zotadata-4a3c
title: Fix invisible Sci-Hub checkbox in preferences dialog
status: completed
type: bug
priority: normal
created_at: 2026-04-12T04:51:52Z
updated_at: 2026-04-12T04:52:39Z
---

The Sci-Hub toggle label renders in preferences, but the actual checkbox indicator is not visible in Zotero.

- [x] Add a failing test that expects a reliably rendered checkbox control
- [x] Replace the invisible Sci-Hub checkbox with a visible control in both dialog assets
- [x] Verify focused tests and summarize the fix

## Summary of Changes

- Replaced the Sci-Hub XUL checkbox with an HTML checkbox and label in both preferences dialog assets so the checkbox indicator is visibly rendered.
- Kept the existing `scihub-enabled-checkbox` ID and checked-state wiring, so the same preference still controls whether Sci-Hub is used.
- Verified the dialog asset test and TypeScript type-check after the change.
