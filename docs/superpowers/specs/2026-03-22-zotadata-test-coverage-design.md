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
│       ├── metadata.test.ts       # Tier 2: metadata fetching
│       ├── arxiv-processing.test.ts # Tier 2: arXiv pipeline
│       ├── batch-processing.test.ts # Tier 3: batch operations
│       └── integration.test.ts    # Tier 3: end-to-end with full mocks
```

### Mock Strategy

- Extend existing `src/__tests__/setup.ts` for Zotero globals
- Create HTTP mock layer with fixture support for API responses
- Use `vi.fn()` for Zotero.HTTP.request mocking
- Create item factory for consistent test data

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
| `titleSimilarity` | Exact match, case insensitivity, stop word removal, punctuation handling, partial overlap, empty/null inputs |
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
| `extractDOI` | DOI field, URL extraction (doi.org patterns), extra field, multiple DOI formats, invalid DOI |
| `extractISBN` | ISBN field, ISBN-10/13, extra field, invalid ISBN |
| `extractArxivId` | URL patterns (arxiv.org/abs/), extra field patterns, old-style IDs |
| `isArxivItem` | publicationTitle "arxiv", URL arxiv.org, extra field arXiv ID, title "arxiv", non-arXiv |

### isbn-convert.test.ts

**Functions:**
- `convertISBN10to13(isbn10)` - Convert ISBN-10 to ISBN-13
- `convertISBN13to10(isbn13)` - Convert ISBN-13 to ISBN-10 (978 prefix only)

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `convertISBN10to13` | Valid conversion, checksum calculation, invalid length |
| `convertISBN13to10` | Valid 978 prefix conversion, non-978 rejection, checksum |

## Tier 2: High Priority Tests

### api-clients.test.ts

**Functions:**
- `searchCrossRefForDOI(item)` - CrossRef DOI search
- `searchOpenAlexExact(item, title)` - OpenAlex exact search
- `searchOpenAlexTitleOnly(item, title)` - OpenAlex title search
- `searchSemanticScholarForPublishedVersion(item)` - Semantic Scholar search
- `fetchCrossRefMetadata(doi)` - Fetch metadata from CrossRef

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `searchCrossRefForDOI` | Match with title similarity, multiple results, no results, HTTP error, rate limit |
| `searchOpenAlexExact` | DOI extraction, similarity threshold 0.95, no results |
| `searchOpenAlexTitleOnly` | Similarity threshold 0.90, cleaned title matching |
| `searchSemanticScholar` | DOI response, VENUE:TITLE format, arXiv filtering |
| `fetchCrossRefMetadata` | Metadata parsing, error handling |

### metadata.test.ts

**Functions:**
- `fetchDOIBasedMetadata(item)` - DOI-based metadata pipeline
- `fetchISBNBasedMetadata(item)` - ISBN-based metadata pipeline
- `updateItemWithMetadata(item, metadata)` - Apply CrossRef metadata
- `updateItemWithBookMetadata(item, metadata)` - Apply book metadata

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `fetchDOIBasedMetadata` | Existing DOI fetch, DOI discovery, translator fallback, error tagging |
| `fetchISBNBasedMetadata` | Existing ISBN fetch, ISBN discovery, alternative format fallback |
| `updateItemWithMetadata` | Title, authors, volume/issue/pages, URL |
| `updateItemWithBookMetadata` | Title, authors, publisher, date, pages |

### arxiv-processing.test.ts

**Functions:**
- `processArxivItem(item)` - Process single arXiv item
- `findPublishedVersion(item)` - Find published version of preprint
- `convertToPreprint(item)` - Convert journalArticle to preprint

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `processArxivItem` | arXiv item with published version, no published version → preprint, non-arXiv skip, error tagging |
| `findPublishedVersion` | arXiv ID search, CrossRef title fallback, Semantic Scholar fallback, null return |
| `convertToPreprint` | Type change, repository field, publicationTitle clear, tag added |

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

**Test Cases:**

| Function | Test Cases |
|----------|------------|
| `fetchMetadataForSelectedItems` | Batch processing, supported item filtering, summary output |
| `processArxivItems` | Candidate filtering, batch processing, statistics aggregation |
| `findSelectedFiles` | Items needing files, source selection, download attempts |

## Tier 4: Lower Priority Tests

Minimal tests for UI code with DOM mocking:

- `addToWindow()` - Element creation, event handler binding
- `showDialog()` - Zotero.Notifier and window mocking

## Estimated Coverage

| Test File | Tier | Functions | Est. Test Cases |
|-----------|------|-----------|-----------------|
| `utils.test.ts` | 1 | 4 | ~30 |
| `extractors.test.ts` | 1 | 4 | ~35 |
| `isbn-convert.test.ts` | 1 | 2 | ~15 |
| `api-clients.test.ts` | 2 | 5 | ~40 |
| `metadata.test.ts` | 2 | 4 | ~25 |
| `arxiv-processing.test.ts` | 2 | 3 | ~25 |
| `batch-processing.test.ts` | 3 | 2 | ~20 |
| `integration.test.ts` | 3 | 3 | ~10 |
| **Total** | | **27** | **~200** |

## Implementation Notes

1. **Mock reuse**: Extend existing `src/__tests__/setup.ts` rather than creating parallel mock infrastructure
2. **Fixture-driven**: API responses stored as fixtures for reproducible tests
3. **Item factory**: Create helper function to generate mock items with common configurations
4. **Isolation**: Each test file imports only the functions it tests (future extraction step)
5. **Coverage target**: Aim for 80%+ on Tier 1-2 functions, 50%+ on Tier 3, minimal on Tier 4