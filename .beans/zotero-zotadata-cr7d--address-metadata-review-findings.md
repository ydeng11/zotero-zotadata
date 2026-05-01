---
# zotero-zotadata-cr7d
title: Address metadata review findings
status: completed
type: bug
priority: normal
created_at: 2026-05-01T04:00:05Z
updated_at: 2026-05-01T04:07:54Z
---

Address review findings from fix/issue-12-metadata-overwrite-weak-matches.\n\n- [x] Add failing coverage for Semantic Scholar OA query and weak author guards\n- [x] Patch test imports and metadata author guards\n- [x] Run targeted tests and type-check\n- [x] Summarize changes

## Summary of Changes\n\nAddressed the four review findings: imported Vitest globals in typeMapping.test.ts, fixed Semantic Scholar open-access search URL construction, restored weak-match author update guard in MetadataFetcher, and gated CrossRef author replacement on exact title match when authors already exist. Added regression coverage for the behavior fixes. Verified with targeted Vitest suites, npm run type-check, and npm run build.
