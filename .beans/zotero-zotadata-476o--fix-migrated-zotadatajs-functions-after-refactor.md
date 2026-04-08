---
# zotero-zotadata-476o
title: Fix migrated zotadata.js functions after refactor
status: completed
type: bug
priority: normal
created_at: 2026-04-04T05:00:54Z
updated_at: 2026-04-05T05:08:23Z
---

## Goal

Restore migrated functionality so current TypeScript modules behave like the original zotadata.js implementation, allowing only changes required by library upgrades or the new structure.

## Todo

- [x] Identify migrated functions and current breakage surface
- [x] Compare original zotadata.js behavior against refactored modules
- [x] Add failing tests that capture the intended legacy behavior
- [x] Fix migrated functions with minimal compatibility adjustments
- [x] Run targeted verification and summarize changes

## Summary of Changes

Restored legacy-compatible metadata, arXiv, and file-finding entry points in the refactored TypeScript modules by porting behavior from zotadata.js. Added compatibility-focused unit tests for MetadataFetcher, FileFinder, and ArxivProcessor, then verified the full Vitest suite, type-check, and production build all pass.

## Reopened

User reported runtime regressions after the previous pass: metadata fetch still does not update items in Zotero, and PDF download still fails in live use. Reopening to debug against actual runtime symptoms and the original zotadata.js behavior.

## Reopened Todo

- [x] Reproduce the live runtime regressions with failing tests
- [x] Restore legacy DOI discovery and PDF download fallback behavior
- [x] Re-run verification and summarize the runtime fixes

## Runtime Fix Summary

- Restored the original stored-file PDF fallback in FileFinder: `importFromURL` now falls back to manual binary download plus stored attachment creation when direct import fails.
- Restored legacy DOI discovery behavior in MetadataFetcher for Google Scholar parsing and Semantic Scholar `externalIds.DOI` lookups.
- Added regression tests for the live runtime gaps and re-ran `npx vitest run`, `npm run type-check`, and `npm run build` successfully.

## Reopened Again

Live Zotero still reports Fetch Metadata success without actually updating the item. Investigating translator-success/no-change behavior and API fallback logic for the metadata path.

## Metadata Follow-up Fix

- Translator-based metadata fetch now only counts as success when it actually mutates the Zotero item.
- If the translator returns an item but contributes no useful changes, the DOI path now falls through to CrossRef instead of reporting a false success.
- Added a regression test for translator-no-op DOI fetches and re-ran `npx vitest run`, `npm run type-check`, and `npm run build` successfully.

## DOI-Specific Metadata Fix

- Root cause for DOI `10.4414/saez.2013.01673`: CrossRef resolves the article metadata but exposes no authors, while OpenAlex does expose the missing author record.
- The DOI metadata path now supplements CrossRef results with OpenAlex when DOI metadata is incomplete, so missing authors can still be applied.
- The DOI path also no longer reports success when neither the translator nor the DOI APIs actually changed the Zotero item.
- Added a regression test covering this DOI shape and re-ran `npx vitest run`, `npm run type-check`, and `npm run build` successfully.
