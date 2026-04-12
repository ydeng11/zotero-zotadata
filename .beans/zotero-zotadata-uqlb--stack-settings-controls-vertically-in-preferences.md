---
# zotero-zotadata-uqlb
title: Stack settings controls vertically in preferences dialog
status: completed
type: task
priority: normal
created_at: 2026-04-12T01:52:42Z
updated_at: 2026-04-12T01:53:34Z
---

## Goal
Adjust the Zotadata preferences dialog so each control within the existing sections is vertically stacked with its label and helper text.

## Todo
- [ ] Add a regression test for vertically stacked settings rows
- [ ] Update both preferences dialog files to use stacked setting rows
- [ ] Adjust shared dialog styles for vertical alignment
- [x] Verify the targeted test passes

## Summary of Changes
- Replaced inline grid rows with stacked setting rows in both preferences dialog files.
- Added shared setting-row styling so labels, controls, and descriptions align vertically within each section.
- Extended the preferences asset test to lock in the stacked layout.
- Verification: npm test -- --run src/__tests__/unit/PreferencesDialogAssets.test.ts passed.
