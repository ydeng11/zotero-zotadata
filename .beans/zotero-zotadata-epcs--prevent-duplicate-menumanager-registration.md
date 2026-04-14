---
# zotero-zotadata-epcs
title: Prevent duplicate MenuManager registration
status: completed
type: bug
priority: normal
created_at: 2026-04-12T04:16:07Z
updated_at: 2026-04-12T04:16:55Z
---

## Goal

Stop Zotadata from attempting to register the same MenuManager menu twice during startup or window lifecycle.

## Todo

- [x] Trace duplicate registerMenusWithMenuAPI call path
- [x] Add or update regression coverage for duplicate menu registration
- [x] Implement a guard so MenuManager registration happens once per plugin lifecycle
- [x] Verify relevant menu registration tests pass

## Summary of Changes

- Root cause: init() registered the Zotero 8 MenuManager menu successfully, and onMainWindowReady() attempted to register the same menuID again.
- Added a menuManagerRegistered lifecycle flag so successful MenuManager registration only happens once per plugin instance, while still allowing retry if registerMenu returns false.
- Updated the MenuRegistration unit test to cover the duplicate onMainWindowReady path and align expectations with the current submenu structure.
- Verification: npm test -- --run src/**tests**/unit/MenuRegistration.test.ts passed.
