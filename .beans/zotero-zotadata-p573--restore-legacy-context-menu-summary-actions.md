---
# zotero-zotadata-p573
title: Restore legacy context menu summary actions
status: completed
type: feature
priority: normal
created_at: 2026-04-07T03:04:32Z
updated_at: 2026-04-07T03:10:23Z
---

Bring the Zotero item context menu back in line with legacy zotadata.js summary actions.

## Todo

- [x] Compare current context menu registration with legacy zotadata.js labels and order
- [x] Propose the menu restoration approach and confirm desired behavior
- [x] Add or update failing tests for the expected context menu entries
- [x] Implement the approved context menu changes
- [x] Run verification and record results

## Summary of Changes

Restored the Zotadata item context submenu labels to the legacy zotadata.js wording and order: Validate References, Update Metadata, Process Preprints, and Retrieve Files. Updated the Zotero 8 Fluent labels, legacy XUL fallback labels, the shared menu label constants, and the backup UI menu definition for consistency. Added a unit assertion covering the expected legacy-facing labels, then verified the change with the targeted menu registration test and a full TypeScript type-check.
