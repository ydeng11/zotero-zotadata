---
# zotero-zotadata-h7ki
title: Handle metadata fetch translator miss and Google Books 503
status: completed
type: bug
priority: normal
created_at: 2026-05-10T18:10:56Z
updated_at: 2026-05-10T20:04:57Z
---

Investigate the Fetch Metadata log where Zotero reports no translator items and Google Books returns HTTP 503. Add focused tests and fix root cause so transient API failures are handled gracefully without noisy/failed metadata fetches.\n\n- [x] Trace metadata fetch flow for translator miss and Google Books 503\n- [x] Add focused regression coverage\n- [x] Implement root-cause fix\n- [x] Run validation\n- [x] Summarize changes

## Summary of Changes\n\n- Added regression coverage for a book metadata fallback path where Zotero translators return no item and Google Books responds with HTTP 503.\n- Updated book metadata HTTP calls to use Zotero.HTTP successCodes=false so non-2xx API responses are handled by Zotadata fallback logic instead of surfacing as Zotero request failures.\n- Classified 408/5xx book metadata responses as NETWORK_ERROR and kept 429 as RATE_LIMIT.\n- Updated local Zotero HTTP typings to allow successCodes=false.\n\n## Validation\n\n- npm test -- src/__tests__/unit/BookMetadataService.test.ts --run\n- npm run type-check\n- npm test -- --run

## Follow-up: Google Books User-Agent

Google Books now returns HTTP 503 unless requests include a browser-like User-Agent.

- [x] Add failing coverage for Google Books User-Agent headers
- [x] Add Mozilla/5.0 User-Agent to Google Books metadata requests
- [x] Add Mozilla/5.0 User-Agent to Google Books full-text requests
- [x] Run validation
- [x] Summarize follow-up changes

## Follow-up Summary of Changes

- Added Mozilla/5.0 User-Agent to Google Books metadata title and ISBN lookup requests while preserving Accept, timeout, and successCodes behavior.
- Added Mozilla/5.0 User-Agent to Google Books full-text lookup requests in FileFinder.
- Extended BookMetadataService regression coverage for Google Books ISBN and title-search request headers.
- Ran Code Simplifier cleanup on the touched test expectations.

## Follow-up Validation

- npm test -- src/__tests__/unit/BookMetadataService.test.ts --run
- npm run type-check
- npm test -- --run

## Follow-up: Screenshot Book Live Verification

Verify whether the screenshot book record can fetch metadata after adding the Google Books User-Agent. Screenshot values: title The Devils, author Joe Abercrombie, ISBN 978-1-3996-0359-1.

- [x] Check raw Google Books API response with Mozilla/5.0 User-Agent
- [x] Check BookMetadataService live metadata fetch path
- [x] Summarize verification result

## Screenshot Book Live Verification Result

- Raw Google Books request for ISBN 9781399603591 with User-Agent Mozilla/5.0 returned HTTP 429 RESOURCE_EXHAUSTED, not HTTP 503.
- BookMetadataService live fetch returned null for the screenshot book. It tried OpenLibrary and Google Books for ISBN candidates 9781399603591, 978-1-39960-359-1, and 1399603590.
- OpenLibrary returned HTTP 200 with empty `{}` for each candidate. Google Books requests included Accept application/json and User-Agent Mozilla/5.0, but returned HTTP 429 quota exceeded for each candidate.
- Conclusion: the header fix is present on the live service path, but this environment cannot currently fetch metadata for that screenshot because Google Books quota is exhausted and OpenLibrary has no record for the tested ISBN candidates.
