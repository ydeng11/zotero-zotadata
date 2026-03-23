# Test Coverage Design for zotadata.js

**Date:** 2026-03-22
**Context:** Major refactoring and TypeScript migration - need comprehensive test coverage as safety net

## Overview

This design provides stratified test coverage for `addon/chrome/content/scripts/zotadata.js` (4,348 lines, ~80 functions). Tests are prioritized by refactoring risk to maximize safety during TypeScript migration.

## Approach: Stratified Coverage by Risk

Tests are organized into four tiers based on refactoring risk:

1. **Critical (Tier 1)**: Pure functions with edge cases - comprehensive tests
2. **High Priority (Tier 2)**: API clients and processors - mock-based tests
3. **Medium Priority (Tier 3)**: Batch processing and file operations - functional tests
4. **Lower Priority (Tier 4)**: UI/menu code - minimal mock tests

## Test Infrastructure

### Directory Structure

```
tests/
├── __mocks__/
│   ├── zotero.ts              # Core Zotero mock (extend setup.ts)
│   ├── zotero-items.ts        # Item mock factory
│   ├── zotero-http.ts         # HTTP request mock with fixtures
│   ├── zotero-translate.ts    # Zotero.Translate.Search mock
│   ├── zotero-prefs.ts        # Zotero.Prefs mock
│   └── fixtures/
│       ├── crossref.ts        # CrossRef API response fixtures
│       ├── openalex.ts        # OpenAlex API response fixtures
│       ├── semanticscholar.ts # Semantic Scholar response fixtures
│       └── arxiv.ts           # arXiv API response fixtures
├── unit/
│   └── zotadata/
│       ├── utils.test.ts          # Tier 1: titleSimilarity, sanitize, validate
│       ├── extractors.test.ts     # Tier 1: DOI, ISBN, arXiv extraction
│       ├── isbn-convert.test.ts   # Tier 1: ISBN-10/13 conversion
│       ├── api-clients.test.ts    # Tier 2: HTTP clients with mocks
│       ├── discovery.test.ts      # Tier 2: DOI/ISBN discovery orchestration
│       ├── metadata.test.ts       # Tier 2: metadata fetching
│       ├── arxiv-processing.test.ts # Tier 2: arXiv pipeline
│       ├── file-operations.test.ts # Tier 2-3: file finding and download
│       ├── batch-processing.test.ts # Tier 3: batch operations
│       └── integration.test.ts    # Tier 3: end-to-end with full mocks
```

### Mock Strategy

- Extend existing `src/__tests__/setup.ts` for Zotero globals
- Create HTTP mock layer with fixture support for API responses
- Use `vi.fn()` for Zotero.HTTP.request mocking
- Create item factory for consistent test data
- Mock `Zotero.Translate.Search` for translator-based metadata fetching
- Mock `Zotero.Prefs` for email configuration tests
- Mock `Zotero.Item` with full method set (getField, setField, saveTx, etc.)

## Tier 1: Critical Tests

### utils.test.ts

**Functions:**
- `titleSimilarity(title1, title2)` - Jaccard similarity with normalization
- `sanitizeFileName(filename)` - Clean special characters, length limits
- `cleanDownloadUrl(url)` - URL normalization
- `validatePDFData(data)` - PDF magic bytes validation

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `titleSimilarity` | Exact match, case insensitivity, stop word removal, punctuation handling, partial overlap, empty/null inputs, unicode/international chars, mathematical symbols (LaTeX-style), very long titles |
| `sanitizeFileName` | Special chars (/\:*?"<>|), length limits, unicode, empty input |
| `cleanDownloadUrl` | URL encoding, query params, fragments, invalid URLs |
| `validatePDFData` | PDF header %PDF-, %%EOF trailer, minimum size, non-PDF data |

### extractors.test.ts

**Functions:**
- `extractDOI(item)` - Extract DOI from fields
- `extractISBN(item)` - Extract ISBN from fields
- `extractArxivId(item)` - Extract arXiv ID from item
- `isArxivItem(item)` - Detect if item is from arXiv

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `extractDOI` | DOI field, URL extraction (doi.org patterns), extra field, multiple DOI formats (10.xxxx/xxxx), invalid DOI |
| `extractISBN` | ISBN field, ISBN-10/13, extra field, invalid ISBN |
| `extractArxivId` | URL patterns (arxiv.org/abs/), extra field patterns, old-style IDs (subject-class/xxxxx) |
| `isArxivItem` | publicationTitle "arxiv", URL arxiv.org, extra field arXiv ID, title "arxiv", non-arXiv |

### isbn-convert.test.ts

**Functions:**
- `convertISBN10to13(isbn10)` - Convert ISBN-10 to ISBN-13
- `convertISBN13to10(isbn13)` - Convert ISBN-13 to ISBN-10 (978 prefix only)
- `formatISBNWithHyphens(isbn)` - Format ISBN with hyphens for display

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `convertISBN10to13` | Valid conversion, checksum calculation, invalid length |
| `convertISBN13to10` | Valid 978 prefix conversion, non-978 rejection, checksum |
| `formatISBNWithHyphens` | ISBN-10 formatting, ISBN-13 formatting, invalid input |

## Tier 2: High Priority Tests

### api-clients.test.ts

**Functions:**
- `searchCrossRefForDOI(item)` - CrossRef DOI search
- `searchOpenAlexExact(item, title)` - OpenAlex exact search
- `searchOpenAlexTitleOnly(item, title)` - OpenAlex title search
- `searchSemanticScholarForDOI(item)` - Semantic Scholar DOI search
- `fetchCrossRefMetadata(doi)` - Fetch metadata from CrossRef
- `searchCrossRefByArxivId(arxivId)` - CrossRef search by arXiv ID
- `searchCrossRefForPublishedVersion(item)` - CrossRef published version search

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `searchCrossRefForDOI` | Match with title similarity, multiple results, no results, HTTP error, rate limit |
| `searchOpenAlexExact` | DOI extraction, similarity threshold 0.95, no results |
| `searchOpenAlexTitleOnly` | Similarity threshold 0.90, cleaned title matching |
| `searchSemanticScholarForDOI` | DOI response, VENUE:TITLE format, arXiv filtering |
| `fetchCrossRefMetadata` | Metadata parsing, error handling |
| `searchCrossRefByArxivId` | arXiv ID query, journal-article type, proceedings-article type |
| `searchCrossRefForPublishedVersion` | Exclude arXiv container, title similarity 0.9 |

### discovery.test.ts

**Functions:**
- `discoverDOI(item)` - Orchestrate DOI discovery across multiple APIs
- `discoverISBN(item)` - Orchestrate ISBN discovery across multiple APIs

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `discoverDOI` | CrossRef found first, fallback to OpenAlex, fallback to Semantic Scholar, fallback to DBLP, fallback to Google Scholar, all fail → null |
| `discoverISBN` | OpenLibrary found first, fallback to Google Books, all fail → null |

### metadata.test.ts

**Functions:**
- `fetchDOIBasedMetadata(item)` - DOI-based metadata pipeline
- `fetchISBNBasedMetadata(item)` - ISBN-based metadata pipeline
- `updateItemWithMetadata(item, metadata)` - Apply CrossRef metadata
- `updateItemWithBookMetadata(item, metadata)` - Apply book metadata
- `fetchBookMetadataViaTranslator(isbn, item)` - Zotero translator for books
- `fetchDOIMetadataViaTranslator(doi, item)` - Zotero translator for DOI

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `fetchDOIBasedMetadata` | Existing DOI fetch, DOI discovery, translator fallback, CrossRef API fallback, error tagging |
| `fetchISBNBasedMetadata` | Existing ISBN fetch, ISBN discovery, translator success, alternative format fallback |
| `updateItemWithMetadata` | Title, authors, volume/issue/pages, URL |
| `updateItemWithBookMetadata` | Title, authors, publisher, date, pages |
| `fetchBookMetadataViaTranslator` | Translator found, no translator, apply fields |
| `fetchDOIMetadataViaTranslator` | Translator found, no translator, apply fields |

### arxiv-processing.test.ts

**Functions:**
- `processArxivItem(item)` - Process single arXiv item
- `findPublishedVersion(item)` - Find published version of preprint
- `convertToPreprint(item)` - Convert journalArticle to preprint
- `updateItemAsPublishedVersion(item, publishedInfo)` - Update item with published info
- `searchSemanticScholarForPublishedVersion(item)` - Semantic Scholar published search

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `processArxivItem` | arXiv item with published version, no published version → preprint, non-arXiv skip, error tagging |
| `findPublishedVersion` | arXiv ID search, CrossRef title fallback, Semantic Scholar fallback, null return |
| `convertToPreprint` | Type change, repository field, publicationTitle clear, tag added |
| `updateItemAsPublishedVersion` | VENUE format → conferencePaper, DOI format → journalArticle, metadata fetch |
| `searchSemanticScholarForPublishedVersion` | Exclude arXiv venue, similarity threshold, DOI extraction |

### file-operations.test.ts

**Functions:**
- `findFileForItem(item)` - Find PDF from multiple sources
- `itemHasPDF(item)` - Check if item has valid PDF attachment
- `verifyStoredAttachment(attachment)` - Verify attachment is stored file
- `findUnpaywallPDF(doi)` - Find PDF via Unpaywall
- `findArxivPDF(item)` - Find arXiv PDF for item
- `findPublishedPDF(doi)` - Find published PDF from multiple sources

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `findFileForItem` | ISBN → InternetArchive/OpenLibrary/LibGen, DOI → Unpaywall/CORE/LibGen, arXiv → direct PDF |
| `itemHasPDF` | Has PDF attachment, has non-PDF, has broken PDF, no attachments |
| `verifyStoredAttachment` | Stored file, linked file, URL link, invalid attachment |
| `findUnpaywallPDF` | Open access PDF found, no OA, email required, HTTP error |
| `findArxivPDF` | arXiv ID found, search by title, no match |
| `findPublishedPDF` | Unpaywall found, CORE fallback, none found |

## Tier 3: Medium Priority Tests

### batch-processing.test.ts

**Functions:**
- `processBatch(items, processFn, options)` - Generic batch processor
- `simpleAttachmentCheckBatch(item)` - Batch attachment validation

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `processBatch` | Batch size, concurrent processing, inter-batch delay, progress callback, error collection, return structure |
| `simpleAttachmentCheckBatch` | No attachments, valid files, broken files removed, weblinks kept, error handling |

### integration.test.ts

**Functions:**
- `fetchMetadataForSelectedItems()` - Full metadata pipeline
- `processArxivItems()` - Full arXiv processing pipeline
- `findSelectedFiles()` - Full file retrieval pipeline
- `checkSelectedItems()` - Full attachment validation pipeline
- `fetchItemMetadata(item)` - Single item metadata fetch

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `fetchMetadataForSelectedItems` | Batch processing, supported item filtering, summary output |
| `processArxivItems` | Candidate filtering, batch processing, statistics aggregation |
| `findSelectedFiles` | Items needing files, source selection, download attempts |
| `checkSelectedItems` | Batch validation, statistics aggregation |
| `fetchItemMetadata` | Journal article path, book path, unsupported type |

## Tier 4: Lower Priority Tests

Minimal tests for UI code with DOM mocking:

- `addToWindow()` - Element creation, event handler binding
- `showDialog()` - Zotero.Notifier and window mocking

## Intentionally Excluded Functions

The following functions are excluded from test coverage with rationale:

| Function | Reason |
|----------|--------|
| `init()` | Trivial initialization, no logic to test |
| `addToAllWindows()` | Thin wrapper around addToWindow |
| `removeFromWindow()` | DOM cleanup, tested indirectly |
| `removeFromAllWindows()` | Thin wrapper |
| `storeAddedElement()` | Trivial array push |
| `log()` | Debug output, no business logic |
| `showZoteroPopup()` | UI-only, requires extensive DOM mocking |
| `showBatchSummary()` | String formatting + showDialog |
| `showGenericBatchSummary()` | String formatting + showDialog |
| `createProgressWindow()` | UI-only, requires Zotero window mocking |
| `updateProgressWindow()` | UI-only |
| `closeProgressWindow()` | UI-only |
| `configureEmail()` | UI prompt + Prefs, minimal logic |
| `getConfiguredEmail()` | Prefs read + UI prompt |
| `createPublishedVersion()` | Creates new item - integration test only |
| `updateAttachmentsForPublishedVersion()` | Attachment manipulation - hard to mock |
| `moveAttachmentsWithPreprintSuffix()` | Attachment manipulation |
| `downloadPublishedVersion()` | File download + attachment - integration level |
| `downloadAndAttachFile()` | File download + attachment creation |
| `manualDownloadAndImport()` | File download + filesystem |
| `createAttachmentFromData()` | Filesystem + attachment creation |
| `createAttachmentFromDataLegacy()` | Legacy filesystem operations |
| `validateWrittenPDFFile()` | Filesystem operations |
| `debugDownloadedContent()` | Debug helper, no business logic |
| `searchGoogleScholarForDOI()` | Scraping, unreliable, anti-bot measures |
| `tryCustomResolvers()` | External resolver configuration |
| `tryCustomResolver()` | External resolver |
| `getCustomResolvers()` | Configuration retrieval |
| `getNestedProperty()` | Utility, trivial |
| `cleanScihubUrl()` | URL cleaning for specific service |
| `searchLibGen*` functions | External service, unreliable |
| `findInternetArchiveBook()` | External service |
| `checkInternetArchivePDF()` | External service |
| `findOpenLibraryPDF()` | External service |
| `findGoogleBooksFullText()` | External service |

## Estimated Coverage

| Test File | Tier | Functions | Est. Test Cases |
|-----------|------|-----------|-----------------|
| `utils.test.ts` | 1 | 4 | ~35 |
| `extractors.test.ts` | 1 | 4 | ~40 |
| `isbn-convert.test.ts` | 1 | 3 | ~20 |
| `api-clients.test.ts` | 2 | 7 | ~50 |
| `discovery.test.ts` | 2 | 2 | ~20 |
| `metadata.test.ts` | 2 | 6 | ~35 |
| `arxiv-processing.test.ts` | 2 | 5 | ~35 |
| `file-operations.test.ts` | 2-3 | 6 | ~40 |
| `batch-processing.test.ts` | 3 | 2 | ~20 |
| `integration.test.ts` | 3 | 5 | ~20 |
| **Total** | | **44** | **~315** |

## Implementation Notes

1. **Mock reuse**: Extend existing `src/__tests__/setup.ts` rather than creating parallel mock infrastructure
2. **Fixture-driven**: API responses stored as fixtures for reproducible tests
3. **Item factory**: Create helper function to generate mock items with common configurations
4. **Isolation**: Each test file imports only the functions it tests (future extraction step)
5. **Coverage target**: Aim for 80%+ on Tier 1-2 functions, 50%+ on Tier 3, minimal on Tier 4
6. **Mock translators**: `Zotero.Translate.Search` needs custom mock for `fetchBookMetadataViaTranslator` and `fetchDOIMetadataViaTranslator` tests
7. **File mocking**: For file operations, mock `Zotero.Attachments.importFromURL`, `Zotero.Attachments.importFromFile`