---
# zotero-zotadata-mtru
title: Prefer existing non-arXiv DOI over canonical arXiv DOI
status: completed
type: bug
priority: normal
created_at: 2026-04-05T22:57:52Z
updated_at: 2026-04-05T23:08:01Z
---

## Goal
Adjust arXiv DOI precedence so an item keeps an existing non-arXiv DOI as the more official version, and only falls back to the canonical arXiv DOI when no non-arXiv DOI is present.

## Tasks
- [x] Add regression coverage for non-arXiv DOI precedence in metadata fetch and file retrieval
- [x] Update DOI precedence logic to keep existing non-arXiv DOIs ahead of canonical arXiv DOI fallback
- [x] Run targeted verification and summarize the changes

## Summary of Changes

- `fetchDOIBasedMetadata()` now treats an existing non-arXiv DOI as the preferred official candidate, verifies it against Crossref title metadata, and only searches for a stronger DOI when that candidate is preprint-like or does not match the item.
- Published-DOI discovery now ignores the current DOI constraint and filters out canonical arXiv DOIs, so metadata fetch can promote from an arXiv DOI to a stronger published DOI when one is discoverable.
- `FileFinder.extractDOI()` now keeps an existing non-arXiv DOI and only falls back to the canonical arXiv DOI when no DOI is present, while still falling through to the arXiv PDF source if DOI-based lookups fail.
- Added regression tests covering official-DOI retention, arXiv-to-published DOI promotion, and file-retrieval precedence.
