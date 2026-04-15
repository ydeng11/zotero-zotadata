# Changelog

All notable changes to this project will be documented in this file.

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
