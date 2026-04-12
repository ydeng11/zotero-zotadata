---
# zotero-zotadata-uw13
title: Fix preferences dialog layout and Sci-Hub settings
status: completed
type: bug
priority: normal
created_at: 2026-04-12T01:23:51Z
updated_at: 2026-04-12T01:52:42Z
---

## Goal
Fix the Zotadata settings dialog so it supports both Unpaywall and Sci-Hub configuration and renders with a usable themed layout.

## Todo
- [x] Review current preferences dialog markup and loading flow
- [x] Design updated settings layout for Unpaywall and Sci-Hub sections
- [x] Implement dialog styling/layout fixes and add Sci-Hub controls
- [x] Verify build/tests relevant to preferences dialog

## Summary of Changes
- Added a regression test covering packaged dialog assets and Sci-Hub controls.
- Reworked both preferences dialog XHTML files into one native-style layout with Access, PDF Sources, Behavior, and About sections.
- Added explicit dialog background styling and packaged skin registration so the shipped dialog is no longer transparent.
- Verification: npm test -- --run src/__tests__/unit/PreferencesDialogAssets.test.ts passed. npm run build packaged successfully but tsc --noEmit still fails on the pre-existing syntax error in src/__tests__/unit/SciHubService.test.ts:230.

## Follow-up\n- Added follow-up task for vertically stacked settings rows within the native dialog sections.
