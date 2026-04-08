---
# zotero-zotadata-flwl
title: Fix Semi-Supervised live file retrieval and arXiv live test
status: completed
type: bug
priority: normal
created_at: 2026-04-06T05:16:15Z
updated_at: 2026-04-06T05:19:47Z
---

## Goal

Fix the live Semi-Supervised PDF regression so a mismatched non-arXiv DOI does not outrank the arXiv PDF, and adjust the live arXiv processor test to reflect the current absence of a discoverable non-preprint published version.

## Tasks

- [x] Add failing regression coverage for mismatched DOI validation in file retrieval and for the Semi-Supervised live arXiv workflow expectation
- [x] Update file retrieval to validate non-arXiv DOI matches before using DOI-based OA sources
- [x] Update the live arXiv workflow test to assert the correct fallback behavior when no published version is discoverable
- [x] Run targeted verification and summarize the changes

## Summary of Changes

- `FileFinder` now validates a non-arXiv DOI against OpenAlex title metadata when the item still looks like an arXiv preprint; if the DOI points to a different work, file lookup falls back to the canonical arXiv DOI and then the direct arXiv PDF path.
- The Semi-Supervised live workflow test no longer skips when no published version is discoverable; it now asserts the real fallback behavior, which is conversion to `preprint` for journal-article-shaped arXiv items.
- Added regression coverage for the mismatched DOI file-retrieval case and re-ran the targeted live checks for the Semi-Supervised example.
