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
 * Extract an arXiv identifier from free text or an arXiv URL.
 */
export function parseArxivId(value: string): string | undefined {
  if (!value?.trim()) return undefined;

  const directMatch = value.match(/\barXiv:\s*([^\s\]}]+)/i);
  if (directMatch?.[1]) {
    return cleanArxivId(directMatch[1]);
  }

  const urlMatch = value.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+)/i);
  if (urlMatch?.[1]) {
    return cleanArxivId(urlMatch[1]);
  }

  return undefined;
}

/**
 * Build the canonical DOI for an arXiv preprint.
 */
export function buildCanonicalArxivDoi(arxivId: string): string {
  return `10.48550/arxiv.${cleanArxivId(arxivId)}`;
}

/**
 * True when the DOI is the canonical arXiv preprint DOI form.
 */
export function isArxivDoi(doi: string): boolean {
  return normalizeDoi(doi).toLowerCase().startsWith("10.48550/arxiv.");
}

/**
 * Extract an arXiv identifier from a Zotero item's Extra field or URL.
 */
export function extractArxivIdFromItem(
  item: Pick<Zotero.Item, "getField">,
): string | null {
  const extra = String(item.getField("extra") ?? "");
  const url = String(item.getField("url") ?? "");
  return parseArxivId(extra) ?? parseArxivId(url) ?? null;
}

/**
 * True when the current item still looks like an arXiv preprint record.
 */
export function isArxivPreprintLikeItem(item: Zotero.Item): boolean {
  const itemType = Zotero.ItemTypes.getName(item.itemTypeID);
  if (itemType === "preprint") {
    return true;
  }

  const publicationTitle = String(item.getField("publicationTitle") ?? "");
  const repository = String(item.getField("repository") ?? "");
  const url = String(item.getField("url") ?? "");
  const signals = [publicationTitle, repository, url].join(" ").toLowerCase();

  return signals.includes("arxiv");
}

/**
 * Resolve the canonical arXiv DOI when the item still represents the preprint.
 */
export function getCanonicalArxivDoiForItem(
  item: Zotero.Item,
): string | null {
  if (!isArxivPreprintLikeItem(item)) {
    return null;
  }

  const arxivId = extractArxivIdFromItem(item);
  return arxivId ? buildCanonicalArxivDoi(arxivId) : null;
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

function cleanArxivId(value: string): string {
  return value
    .replace(/^arxiv:/i, "")
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/i, "")
    .trim();
}
