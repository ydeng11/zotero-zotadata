---
# zotero-zotadata-k23j
title: Fix DOI and English download for Semi-supervised learning with deep generative models
status: completed
type: bug
priority: normal
created_at: 2026-04-05T21:22:04Z
updated_at: 2026-04-05T21:30:17Z
---

## Goal

Use "Semi-supervised learning with deep generative models" as a regression case so metadata fetch resolves the correct DOI and file retrieval prefers the English metadata/PDF path.

## Tasks

- [x] Add failing tests for DOI discovery and English file retrieval using the semi-supervised learning paper
- [x] Update metadata discovery to avoid Crossref false positives and resolve the correct DOI for arXiv-backed items
- [x] Ensure file retrieval uses the correct DOI and does not block English PDF download
- [x] Run targeted verification and summarize the changes

## Summary of Changes

- Fixed `OpenAlexAPI.searchExact()` so year joins the same `filter` parameter as title and author, which restores exact-match DOI lookup for the Semi-supervised learning arXiv paper.
- Added shared arXiv helpers to derive the canonical `10.48550/arxiv.*` DOI from arXiv-backed items and used them in both `MetadataFetcher` and `FileFinder`.
- `fetchDOIBasedMetadata()` now replaces stale mismatched DOIs on arXiv-style items with the canonical arXiv DOI before translator/Crossref/OpenAlex enrichment.
- `FileFinder` now uses the same canonical arXiv DOI recovery so a bad stored DOI no longer outranks the arXiv PDF path.
- Added unit and live regression coverage for the Semi-supervised learning paper, including mismatched DOI correction and PDF retrieval.
