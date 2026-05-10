---
# zotero-zotadata-ho69
title: Fix eISBN book metadata fallback
status: completed
type: bug
priority: normal
created_at: 2026-05-09T04:15:11Z
updated_at: 2026-05-10T18:10:57Z
---

Implement guarded book metadata fallback when exact ISBN lookup fails.\n\n- [x] Add failing regression tests for eISBN fallback and rejection cases\n- [x] Implement guarded title/author fallback ISBN discovery\n- [x] Store accepted fallback ISBN in Extra and expose it in changes/dialog text\n- [x] Run targeted tests and type check\n- [x] Run Code Simplifier review if patch exceeds 50 changed lines\n- [x] Complete bean with summary

## Summary of Changes\n\nImplemented guarded book metadata fallback for ISBN lookup misses. Exact ISBN and mechanical variants still run first; if they fail, Zotadata searches OpenLibrary then Google Books by title/author, validates title and author overlap, uses the accepted sibling ISBN for metadata lookup, records it in Extra as a Zotadata fallback edition, and surfaces the fallback ISBN in changes and batch progress details. Added regression coverage for fallback success, mismatch rejection, exact lookup short-circuiting, and progress detail display.\n\nValidated with targeted Vitest tests, type-check, build, and full Vitest suite.

## Reopened\n\nUser reported the built XPI still returns Book API failed for ISBN 978-1399603591 in Zotero. Investigating real item-shape mismatch and adding a follow-up fix.

## Follow-up Fix\n\nResolved the Zotero runtime failure for the reported item shape: title "Joe Abercrombie - The Devils", empty Author field, and ISBN 978-1399603591. The fallback now derives a title/author query from author-prefixed titles, searching OpenLibrary as title "The Devils" with author "Joe Abercrombie" before broad title-only fallback. Live diagnostic against that exact shape passed and was removed after verification. Rebuilt the XPI for testing.

## Reopened Again

User confirmed the corrected Zotero item still fails: Title "The Devils", Author "Joe Abercrombie" as a full-name creator, ISBN "978-1-3996-0359-1". Remove title-derived author fallback and fix runtime author extraction for Zotero full-name creator rows.

## Correction

Removed the author-prefixed title fallback. The reported corrected Zotero item now uses the actual full-name Author creator row for fallback search, including Zotero runtime creatorTypeID shapes. Added regressions for full-name author fallback and for not deriving author data from a prefixed title. Revalidated with targeted tests, type-check, full test suite, live OpenLibrary probe, and production build.

## Reopened Live Failure

User reports the corrected Zotero item still returns Book API Failed. Need run a service-level live test through the search fallback path for Title The Devils, Author Joe Abercrombie, ISBN 978-1-3996-0359-1 and identify the actual rejection point.

## Live Search Path Result

Ran a temporary service-level live Vitest diagnostic for the reported item: Title The Devils, Author Joe Abercrombie as a Zotero internal full-name creator, ISBN 978-1-3996-0359-1. Both BookMetadataService.fetchISBNBasedMetadata and the menu-facing MetadataFetcher.fetchMetadataForItem succeeded. Trace: OpenLibrary direct ISBN lookups for the ebook variants returned empty objects, Google Books returned 429 quota errors, OpenLibrary title+author search returned fallback ISBN 9781399603560, and OpenLibrary metadata lookup for that ISBN returned publisher Orion Publishing Co and date 06 May 2025. Result changes included Used fallback edition ISBN: 9781399603560 and Stored fallback edition ISBN in Extra. The built XPI also contains the creatorTypeID fallback code. Remaining likely causes are stale installed XPI / Zotero extension caching, or a runtime creator shape not covered by the diagnostic.

## Logging Follow-up

Add targeted Zotero.log diagnostics to the book ISBN fallback search path so runtime failures can be traced from Zotero Debug Output without relying on local live tests.

## Search Path Logging

Added Zotero.log diagnostics throughout the book ISBN fallback path. Logs now include ISBN extraction, exact ISBN candidates, translator/OpenLibrary/Google metadata lookup outcomes, fallback query title/authors plus creator runtime shape, OpenLibrary and Google fallback search status/counts, accepted/rejected candidate documents, fallback ISBN attempts, and final all-path failure. Rebuilt .scaffold/dist/zotadata.xpi with the logging and verified the bundle contains the Zotadata BookMetadataService log prefix.

## Outer Branch Logging Follow-up

User only sees menu and Zotero translator logs, not BookMetadataService logs. Add MetadataFetcher-level logging to identify the item type and branch before the code reaches either book ISBN handling or general translator/search handling.

## Outer Branch Logging

Added Zotero.log diagnostics in MetadataFetcher.fetchMetadataForItem. Logs now show the Zotero itemTypeID/itemType/title/ISBN before branching, whether the book ISBN path is entered, whether the book result is returned, and when the item falls through to general metadata search. Rebuilt .scaffold/dist/zotadata.xpi and verified both Zotadata MetadataFetcher and Zotadata BookMetadataService log prefixes are in the bundle.

## Extra Persistence Follow-up

User reports metadata now updates but fallback ISBN is not visible in Extra. Move fallback Extra append to after successful non-translator metadata update and add logs for whether the line was appended, already present, and what Extra contains after setField.

## Extra Persistence Fix

Changed fallback Extra storage timing so the fallback line is appended after a successful non-translator book metadata update instead of before updateItemWithBookMetadata saves other fields. Translator metadata still stores before its final save. Added logs for already-present fallback lines and for previous/next/read-back Extra content after setField. Rebuilt .scaffold/dist/zotadata.xpi and verified the bundle contains the new Extra write diagnostics.

## Remove Book API Failed Tag

User requested removing the Book API Failed tag side effect while preserving failure reporting through returned errors/results.

## Removed Failure Tag

Removed the Zotero tag side effect for Book API Failed while preserving the returned error string for UI/reporting. Updated the legacy unit expectation to assert the item is not tagged on book API failure. Rebuilt .scaffold/dist/zotadata.xpi and verified the bundle no longer contains a Book API Failed tag write.
