---
# zotero-zotadata-3x5s
title: Add tests for README features
status: completed
type: task
priority: normal
created_at: 2026-04-05T17:45:15Z
updated_at: 2026-04-05T20:14:12Z
---

Create tests verifying README-described features: mock Zotero items for given publications (journal/preprint), ensure invalid attachments are removed, metadata updates run, preprints processed and missing PDFs retrieved.

## Notes\n- Plan-phase blocked: .planning directory missing; need to run $gsd-new-project to init planning before generating plans/tests.

## Todo
- [x] Tighten typed Zotero item and attachment mock factories
- [x] Add live HTTP and live attachment adapters in test setup
- [x] Add publication fixtures and live README workflow integration tests
- [x] Add opt-in live test script and verify targeted test runs
- [x] Run code simplifier if changes exceed project threshold
- [x] Run verification and update bean summary

## Summary of Changes

Added an opt-in live integration test lane for README workflows, upgraded the shared Zotero item mocks to typed registry-backed factories, installed real HTTP and live attachment adapters for `LIVE_API_TESTS=1`, added publication fixtures for the requested examples, and verified both the default and live test suites plus type-checking.


Follow-up: adjusted live test helpers so transient `download_failed` results from live PDF retrieval are skipped instead of failing the suite; added unit coverage for that helper path.
