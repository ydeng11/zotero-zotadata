# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Zotero 10 support** with updated version constraints (`strict_max_version: "10.*"`)

### Changed

- Collection selection uses `getSelectedCollections()` (required in Zotero 10, which allows multi-select and throws on the old singular getter), with a fallback to `getSelectedCollection()` on Zotero 8/9

## [1.5.5] - 2026-08-21

### Fixed

- **Institution and affiliation creators** — Crossref affiliation rows are no
  longer written as authors during metadata retrieval.
- **Corporate authors and editors** — Corporate authors retain Zotero's
  single-field mode, while editors preserve their editor creator role.
- **Malformed Crossref contributors** — Invalid or incomplete contributor
  entries are ignored without producing blank or `undefined` creators.

## [1.5.4] - 2026-06-03

### Fixed

- **Infinite author duplication** — `isAuthorCreator()` was calling
  `Zotero.CreatorTypes.getPrimaryIDForType("author")` which takes an item type
  ID (e.g. `"journalArticle"`), not a creator type name. Returned `false` for
  ALL creators, so every duplicate was treated as a non-author and preserved.
  Each run appended 4 more authors. Fixed to `Zotero.CreatorTypes.getID("author")`.
- **Author count check rejecting valid matches** — `shouldRewriteAuthorsForMetadata`
  and `validateMetadataMatch` compared raw item author counts (including
  accumulated duplicates, e.g. 20) against candidate counts (e.g. 4), rejecting
  the match. Deduplicated with `new Set()` before the comparison.
- **Simplified trust model** — `shouldRewriteAuthorsForMetadata` now trusts DOI
  matches and high-confidence sources (≥0.9) unconditionally, removing fragile
  author-overlap rejection logic that caused false rejections.
- **OpenAlex 400 on search** — removed unsupported `.search` suffix from
  `authorships.author.display_name` filter. Added try-catch around DOI discovery
  strategies so one API failure doesn't crash the entire metadata fetch.
- **2-minute HTTP retry on 5xx** — Zotero's `HTTP.request()` has a built-in
  retry delaying 2 minutes on 5xx responses. Added `errorDelayMax: 0` to all
  calls to disable retry.
- **DOI search fallback blocked** — removed guard that skipped the search
  path when a DOI exists on the item. When all DOI-specific sources fail,
  the search path now runs as a fallback.
- **Pre-translator creator restore** — capture `item.getCreators()` before
  `translate()` and restore after Zotero's auto-append side effect, ensuring
  `setCreators` replaces instead of appending.

### Removed

- Dead exports: `calculateStringSimilarity`, `findBestMatch`,
  `levenshteinSimilarity`, `updateItemFields`, `setFieldIfEmpty`,
  `updateItemAuthors`, `clearCache`, `getCacheStats`.

### Changed

- Added `Zotero.debug` logging with source names throughout
  `MetadataFetcher`, `MetadataUpdateService`, `BookMetadataService`.
- Added `dev:launch` npm script with Zotero debug flags.
- Updated typings to include `errorDelayMax`.

## [1.5.3] - 2026-05-31

### Changed

#### Metadata Authorship Validation

- **Validated author rewrites** - Paper metadata updates now rewrite authors only when the response validates as the same paper using title, DOI, year, author overlap, and author-count sanity checks
- **Consistent author replacement** - CrossRef, OpenAlex supplement, search-result metadata, and DOI translator paths now share the same author rewrite policy
- **Non-author preservation** - Editors and other non-author creators remain preserved during validated author rewrites

### Fixed

- **Destructive author overwrites** - Prevents stale DOI, weak search, or translator responses with mismatched authors from replacing existing authorship
- **Duplicate author accumulation** - Repeated validated metadata updates remain idempotent and do not append duplicate authors

### Tests

- Added regression coverage for CrossRef, OpenAlex supplement, search-result metadata, and DOI translator authorship updates
- Added idempotence coverage for repeated metadata updates

---

## [1.5.2] - 2025-05-10

### Added

#### Google Books API Key Support

- **Configurable API key** - Added `api.googlebooks.key` preference for authenticated Google Books API calls with higher quotas
- **Enable/disable toggle** - Added `api.googlebooks.enabled` preference to toggle Google Books integration on/off
- **Settings UI entries** - Both preferences visible in the \"API Settings\" section of the plugin preferences dialog
- **URL construction** - API key appended as `&key=...` query parameter to all Google Books API requests when configured

### Changed

- **BookMetadataService** constructor now accepts optional `googleBooksApiKey` and `googleBooksEnabled` parameters
- **MetadataFetcher** wires `PreferencesManager` through to `BookMetadataService` for API key access
- **Google Books calls skipped** entirely when `api.googlebooks.enabled` is set to `false`

### Fixed

- **Code quality** - Replaced `let` with `const` in `buildGoogleBooksUrl` helper

---

## [1.5.1] - 2025-05-02

### Fixed

#### Book Metadata Author Handling

- **Author replacement for books** - Fixed bug where fetching metadata for books would append authors instead of replacing them, causing duplicate author entries
- **Empty creators guard** - Added guard to preserve existing authors when translator returns empty creators array
- **Consistent behavior** - Book metadata author handling now matches DOI-based (journal article) behavior

#### Code Quality

- **Removed dead code** - Cleaned up unused `allowMoreCompleteReplacement` option from translator metadata methods

---

## [1.5.0] - 2025-04-30

### Added

#### Semantic Scholar API Improvements

- **Publication types support** - Added `publicationTypes` and `publicationDate` fields to search results
- **DOI extraction from externalIds** - Fixed DOI retrieval using `externalIds.DOI` instead of invalid `doi` field
- **Publication type mapping** - Maps Semantic Scholar types to Zotero item types (journalArticle, conferencePaper, preprint, etc.)

#### Bibliographic Metadata Capture

- **Extended SearchResult fields** - Added `containerTitle`, `volume`, `issue`, `pages`, `language`, and `itemType`
- **API response enrichment** - All APIs now capture bibliographic metadata (CrossRef, OpenAlex, Semantic Scholar)
- **Better metadata completeness** - Volume, issue, pages now populated from API responses

### Fixed

#### Metadata Matching Quality (Issue #12)

- **Exact title matching** - Replaced fuzzy similarity scoring with exact title matching to prevent weak matches from overwriting correct metadata
- **Abbreviation expansion** - Common abbreviations expanded for better matching (nets→networks, ml→machine learning)
- **Prevents incorrect matches** - Cases like "GAN" matching unrelated papers or quantum ML papers matching adversarial ML papers are now rejected

#### Author Handling (Issue #13)

- **Author replacement instead of appending** - Fixed duplicate authors bug where metadata fetch would append new authors instead of replacing existing ones
- **Creator type preservation** - Non-author creators (editors, translators) are preserved during author updates

#### Semantic Scholar Query Building

- **Single author queries** - Use only first author for queries (matching CrossRef approach)
- **URLSearchParams encoding** - Proper query parameter encoding
- **DOI filter format** - Fixed DOI filter to use full URL format (doi:https://doi.org/xxx)

#### OpenAlex API Query Building

- **Search parameter fix** - Use recommended 'search' parameter instead of deprecated 'title.search' filter
- **Single author queries** - Query only first author instead of multiple with OR logic
- **DOI filter format** - Fixed DOI filter to use full URL format
- **Additional metadata fields** - Added biblio, type_crossref, language to select fields

#### Book Metadata Improvements

- **OpenLibrary fields parameter** - Added `fields=title,isbn,author_name` to fix null ISBN bug that caused "Book API failed" errors (estimated 30% → 90%+ success rate improvement)
- **ISBN-13 preference** - Prefers ISBN-13 over ISBN-10 for better compatibility with modern databases
- **Author overlap validation** - Added 40% author overlap threshold; rejects metadata if overlap < 40% when both item and fetched data have authors (changed from 60%)
- **No tags added** - Failure reasons reported in progress window dialogue instead of adding tags to items
- **Author validation skipped** - When item or fetched data has no authors, validation is skipped and metadata accepted
- **Comprehensive error logging** - All book API failures now logged with context (title, ISBN, HTTP status, error message)
- **Progress window for batches** - Shows real-time progress with ISBN display: "Title (ISBN: 978...)" for successful items, "Failed: Title - {reason}" for failures
- **Auto-close behavior** - Progress window auto-closes after 3 seconds on success, stays open for failures (click to close)

### Changed

#### Metadata Fetcher Refactoring

- **Removed DOI discovery tags** - "DOI Added" and "No DOI Found" tags removed as DOI discovery is an internal detail
- **Cleaner workflow** - DOI discovery no longer adds visual clutter to items

#### Exact Match Implementation

- **Centralized exact matching** - New `isExactTitleMatch()` function in similarity.ts
- **Updated validation logic** - authorValidation.ts, ArxivProcessor.ts, FileFinder.ts, BookMetadataService.ts now use exact match checks
- **Tests updated** - All tests verify exact match behavior

#### Recommended Workflow Documentation

- **README updated** - Added comprehensive book metadata workflow section
- **ISBN discovery explained** - Documented how books use ISBN for metadata matching
- **Author validation behavior** - Clarified 40% threshold, rejection behavior, and no-authors case
- **Failure reasons documented** - Added failure message format and common failure scenarios
- **Progress tracking guide** - Updated batch operation workflow with failure display format

---

## [1.4.0] - 2025-04-18

### Added

#### Zotero 9 Compatibility

- **Zotero 9 support** with updated version constraints (`strict_max_version: "9.*"`)
- **zotero-plugin-scaffold 0.8.6** update for latest build tool compatibility
- Tested and verified working on both Zotero 8.x and 9.x

#### Modular Architecture

- **DOIDiscoveryService** - Extracted DOI search logic with:
  - Multi-API DOI discovery (CrossRef, OpenAlex, SemanticScholar, DBLP, GoogleScholar)
  - Proper API call ordering with rate limit delays
  - Service-level dependency injection support
- **BookMetadataService** - Extracted ISBN/book handling:
  - ISBN discovery from OpenLibrary and Google Books
  - ISBN conversion utilities (ISBN-10 ↔ ISBN-13)
  - Translator-based book metadata fetching
- **MetadataUpdateService** - Extracted field update operations:
  - CrossRef metadata field updates
  - Author supplementation from OpenAlex
  - Title and author update heuristics
- **Utility Modules**:
  - `src/utils/isbn.ts` - ISBN conversion and validation
  - `src/utils/similarity.ts` - Title similarity calculations
  - `src/utils/itemFields.ts` - Field update helpers

#### Dependency Injection Pattern

- **Testable architecture** with injectable services
- **Mock-friendly design** for unit testing
- **Service interfaces** for API and service injection
- All core services now accept optional dependencies in constructors

### Changed

#### API Rate Limit Optimization

- **Default strategy changed** from `parallel` to `fallback` for better rate limit compliance
- **SemanticScholar rate limit fixed** from incorrect 100/sec to correct 100/min
- **Inter-API delays added** (100-200ms) between failed API calls
- **API priority reorder**:
  1. CrossRef (50/sec - best DOI coverage)
  2. OpenAlex (100/sec - good coverage)
  3. DBLP (no documented limit)
  4. SemanticScholar (100/MIN - strictest, use last)
  5. GoogleScholar (scraping - unreliable, use last)

#### Code Refactoring

- **MetadataFetcher.ts** reduced from 2252 lines to ~1000 lines
- **Code modularization** improves maintainability and testability
- **Test architecture** rewritten with dependency injection pattern
- All tests now inject mock services for reliable, isolated testing

### Technical Details

#### File Changes

- 17 files changed
- 2,716 insertions(+)
- 2,704 deletions(-)

#### New Modules

- `src/modules/metadata/DOIDiscoveryService.ts` - DOI discovery service
- `src/modules/metadata/BookMetadataService.ts` - Book metadata service
- `src/modules/metadata/MetadataUpdateService.ts` - Metadata update service
- `src/modules/metadata/types.ts` - Shared type definitions
- `src/utils/isbn.ts` - ISBN utilities
- `src/utils/similarity.ts` - Similarity calculations
- `src/utils/itemFields.ts` - Field helpers

#### Architecture Improvements

- Service-based architecture with clear separation of concerns
- Dependency injection for testability
- Shared utility modules reduce code duplication
- Consistent error handling across services

---

## [1.3.0] - 2025-01-14

### Added

#### Author Validation & Disambiguation

- **Author overlap validation** for accurate metadata matching, preventing incorrect matches for papers with identical titles
- **Author count similarity check** to reject matches with drastically different author lists
- **Year proximity scoring** to prioritize chronologically relevant results
- **arXiv DOI fallback** when published DOI is not found for preprints
- New `authorValidation.ts` module with `normalizeLastName()`, `calculateAuthorOverlap()`, and `validateMetadataMatch()` functions

#### CORE API Integration

- **CORE API key authentication** for higher rate limits (configurable in Settings)
- Improved metadata fetching reliability with authenticated requests

#### Sci-Hub Integration (Optional)

- **Opt-in Sci-Hub support** as a fallback PDF source (disabled by default)
- **Automatic mirror discovery** via sci-hub.pub
- **Safety mechanisms**: Auto-disable after configurable failure threshold
- **Settings controls**: Toggle enable/disable, configure max attempts (1-3)
- Clear legal disclaimer and acknowledgment required before enabling

#### User Experience Improvements

- **Zotadata submenu** for organized context menu access
- **Completion toasts** for operation feedback
- **Enhanced preferences dialog** with improved layout and organization
- **Multilingual support**: English and Chinese locales updated

#### Testing Infrastructure

- **Integration test suite** with live API testing support (`npm run test:live`)
- **Comprehensive unit test coverage** for:
  - Author validation functions
  - CrossRef, OpenAlex, Semantic Scholar APIs
  - Metadata fetching workflows
  - File finder and download manager
  - Sci-Hub service
- **Live test utilities** for validating against real APIs
- **Diagnostic tests** for specific paper scenarios (GAN paper, adversarial ML, etc.)

#### Developer Experience

- **AGENTS.md** with comprehensive development guidelines and conventions
- **README documentation** with usage examples, best practices, and API details
- **Author disambiguation documentation** explaining matching algorithm

### Changed

#### Metadata Fetching

- **Multi-author search queries** now include up to 3 authors for better matching
- **Improved DOI discovery** for papers with identical or similar titles
- **Enhanced validation scoring** with cleaner, more accurate formula
- **Semi-supervised paper support** for partial metadata scenarios

#### Preferences & Settings

- **Stabilized preferences dialog** with fixed rendering issues
- **Restored Sci-Hub toggle** with proper state management
- **Simplified preferences architecture** for better maintainability
- **Clean settings page layout** with organized controls

#### File Retrieval

- **Respects official DOIs** before arXiv PDFs when finding files
- **Restored compatibility** for metadata and file finder features
- **Improved error handling** for download failures

#### Code Quality

- **TypeScript strict mode** enforcement throughout codebase
- **Removed legacy JavaScript files** (zotadata.js)
- **Fixed unsafe type casts** for Zotero.Prefs.get() return values
- **Removed redundant saveTx()** calls to prevent race conditions
- **Consistent code style** with ESLint 9 and Prettier

### Fixed

- **DOI validation** for papers with identical titles (e.g., "Generative Adversarial Nets")
- **Metadata fetching** for papers without DOI or with partial information
- **CrossRef incorrect match** handling when results don't match the query
- **Preferences sections rendering** on a single row
- **Duplicate MenuManager registration** preventing proper cleanup
- **Sci-Hub checkbox visibility** in preferences dialog
- **Author validation edge cases** for papers with no listed authors
- **ArXiv fallback integration** for published papers not yet in DOI databases

### Technical Details

#### File Changes

- 165 files changed
- 16,007 insertions(+)
- 4,886 deletions(-)

#### New Modules

- `src/utils/authorValidation.ts` - Author matching and validation
- `src/services/SciHubService.ts` - Sci-Hub integration service
- `src/utils/itemSearchQuery.ts` - Item search query utilities
- `src/__tests__/integration/` - Integration test suite

#### API Improvements

- Enhanced `CrossRefAPI` with better DOI resolution
- Improved `OpenAlexAPI` with author-based queries
- Updated `SemanticScholarAPI` with validation support
- New `CORE` API integration with authentication

---

## [1.2.0] - Previous Release

### Added

- Zotero 8 compatibility
- Multi-API metadata fetching (CrossRef, OpenAlex, Semantic Scholar, OpenLibrary, Google Books)
- PDF retrieval from multiple sources (Unpaywall, arXiv, CORE, Library Genesis, Internet Archive)
- arXiv preprint processing and published version discovery
- Attachment validation and cleanup
- Batch processing with progress tracking

### Changed

- Migrated from Zotero 7 to Zotero 8
- Updated build system to zotero-plugin-scaffold
- TypeScript 5.8 strict mode

### Fixed

- Various bug fixes and performance improvements
