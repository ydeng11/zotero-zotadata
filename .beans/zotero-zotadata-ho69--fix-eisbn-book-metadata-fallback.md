---
# zotero-zotadata-ho69
title: Fix eISBN book metadata fallback
status: completed
type: bug
priority: normal
created_at: 2026-05-09T04:15:11Z
updated_at: 2026-05-10T03:26:49Z
---

Implement guarded book metadata fallback when exact ISBN lookup fails.\n\n- [x] Add failing regression tests for eISBN fallback and rejection cases\n- [x] Implement guarded title/author fallback ISBN discovery\n- [x] Store accepted fallback ISBN in Extra and expose it in changes/dialog text\n- [x] Run targeted tests and type check\n- [x] Run Code Simplifier review if patch exceeds 50 changed lines\n- [x] Complete bean with summary

## Summary of Changes\n\nImplemented guarded book metadata fallback for ISBN lookup misses. Exact ISBN and mechanical variants still run first; if they fail, Zotadata searches OpenLibrary then Google Books by title/author, validates title and author overlap, uses the accepted sibling ISBN for metadata lookup, records it in Extra as a Zotadata fallback edition, and surfaces the fallback ISBN in changes and batch progress details. Added regression coverage for fallback success, mismatch rejection, exact lookup short-circuiting, and progress detail display.\n\nValidated with targeted Vitest tests, type-check, build, and full Vitest suite.

## Reopened\n\nUser reported the built XPI still returns Book API failed for ISBN 978-1399603591 in Zotero. Investigating real item-shape mismatch and adding a follow-up fix.

## Follow-up Fix\n\nResolved the Zotero runtime failure for the reported item shape: title "Joe Abercrombie - The Devils", empty Author field, and ISBN 978-1399603591. The fallback now derives a title/author query from author-prefixed titles, searching OpenLibrary as title "The Devils" with author "Joe Abercrombie" before broad title-only fallback. Live diagnostic against that exact shape passed and was removed after verification. Rebuilt the XPI for testing.

## Reopened Again

User confirmed the corrected Zotero item still fails: Title "The Devils", Author "Joe Abercrombie" as a full-name creator, ISBN "978-1-3996-0359-1". Remove title-derived author fallback and fix runtime author extraction for Zotero full-name creator rows.

## Correction

Removed the author-prefixed title fallback. The reported corrected Zotero item now uses the actual full-name Author creator row for fallback search, including Zotero runtime creatorTypeID shapes. Added regressions for full-name author fallback and for not deriving author data from a prefixed title. Revalidated with targeted tests, type-check, full test suite, live OpenLibrary probe, and production build.
