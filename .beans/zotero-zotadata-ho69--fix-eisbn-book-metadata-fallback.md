---
# zotero-zotadata-ho69
title: Fix eISBN book metadata fallback
status: completed
type: bug
priority: normal
created_at: 2026-05-09T04:15:11Z
updated_at: 2026-05-09T04:22:33Z
---

Implement guarded book metadata fallback when exact ISBN lookup fails.\n\n- [x] Add failing regression tests for eISBN fallback and rejection cases\n- [x] Implement guarded title/author fallback ISBN discovery\n- [x] Store accepted fallback ISBN in Extra and expose it in changes/dialog text\n- [x] Run targeted tests and type check\n- [x] Run Code Simplifier review if patch exceeds 50 changed lines\n- [x] Complete bean with summary

## Summary of Changes\n\nImplemented guarded book metadata fallback for ISBN lookup misses. Exact ISBN and mechanical variants still run first; if they fail, Zotadata searches OpenLibrary then Google Books by title/author, validates title and author overlap, uses the accepted sibling ISBN for metadata lookup, records it in Extra as a Zotadata fallback edition, and surfaces the fallback ISBN in changes and batch progress details. Added regression coverage for fallback success, mismatch rejection, exact lookup short-circuiting, and progress detail display.\n\nValidated with targeted Vitest tests, type-check, build, and full Vitest suite.
