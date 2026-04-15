---
# zotero-zotadata-sosq
title: Locale-guard arXiv metadata and PDF retrieval
status: completed
type: bug
priority: normal
created_at: 2026-04-05T21:10:08Z
updated_at: 2026-04-05T21:14:11Z
---

Implement locale-aware Crossref validation and PDF detection regressions for arXiv processing.

- [x] Add failing tests for locale-guarded arXiv metadata and PDF detection
- [x] Implement locale helper and metadata/file retrieval guardrails
- [x] Run targeted tests and type-check
- [x] Run Code Simplifier if the change is large
- [x] Update bean summary and complete the bean if all tasks are done

## Summary of Changes

Implemented locale-aware guardrails for arXiv published-version matching and metadata application, added locale-based Accept-Language headers for metadata/file requests, narrowed PDF detection so snapshots no longer block downloads, and added active regression coverage for the false-positive CrossRef DOI case plus locale-aware file retrieval behavior.
