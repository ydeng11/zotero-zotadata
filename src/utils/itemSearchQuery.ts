import type { SearchQuery } from "@/shared/core/types";

/**
 * Normalize a DOI string (strip URL prefix, trim). Uses Zotero when available.
 */
export function normalizeDoi(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  try {
    if (typeof Zotero !== "undefined" && Zotero.Utilities?.cleanDOI) {
      return Zotero.Utilities.cleanDOI(s);
    }
  } catch {
    /* ignore */
  }
  return s
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

/**
 * Extract a DOI from the Extra field when it is not in the standard DOI field.
 */
export function parseDoiFromExtra(extra: string): string | undefined {
  if (!extra?.trim()) return undefined;
  const m = extra.match(/\b(10\.\d{4,}\/[^\s\]}]+)\b/i);
  return m ? normalizeDoi(m[1]) : undefined;
}

/**
 * True when the query has enough signal to call external search APIs safely.
 */
export function isSearchQueryActionable(query: SearchQuery): boolean {
  if (query.doi?.trim()) return true;
  if (query.arxivId?.trim()) return true;
  if (query.title?.trim()) return true;
  if (query.authors && query.authors.length > 0) return true;
  return false;
}
