---
# zotero-zotadata-go4j
title: Make preferences dialog self-contained
status: completed
type: bug
priority: normal
created_at: 2026-04-12T04:12:02Z
updated_at: 2026-04-12T04:13:47Z
---

## Goal
Fix the preferences dialog runtime errors by removing the missing external skin dependency, resolving Zotero from the opener window, and improving the native inline layout.

## Todo
- [x] Add regression coverage for self-contained preferences dialog runtime assumptions
- [x] Update both preferences dialog files to resolve Zotero safely and use inline native layout
- [x] Verify the targeted preferences asset test passes

## Summary of Changes
- Removed the external chrome://zotadata/skin/zotadata.css dependency from both preferences dialog files.
- Added a getZotero helper so the dialog resolves Zotero from the opener window when it is not available as a local global.
- Reworked the dialog layout to use self-contained inline spacing and width rules, which keeps the settings grouped and uncluttered even without packaged CSS.
- Verification: npm test -- --run src/__tests__/unit/PreferencesDialogAssets.test.ts passed.
