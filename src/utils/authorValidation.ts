import { isExactTitleMatch } from "@/utils/similarity";
import type { SearchResult } from "@/shared/core/types";

interface ZoteroCreator {
  firstName?: string;
  lastName: string;
  name?: string;
  creatorType: string;
}

export function normalizeLastName(name: string): string {
  if (!name || typeof name !== "string") return "";

  const trimmed = name.trim();
  if (!trimmed) return "";

  // Handle "LastName, FirstName" format
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",");
    return parts[0].trim().toLowerCase();
  }

  // Handle "FirstName LastName" or "F. LastName" format
  const parts = trimmed.split(/\s+/);

  // Check for compound surnames (e.g., "van der Maaten")
  // Lowercase words before the last word are typically surname prefixes
  const lastNameParts: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    // First iteration always adds the last word
    // Subsequent iterations add words that are entirely lowercase (surname prefixes)
    if (
      lastNameParts.length === 0 ||
      (part === part.toLowerCase() && !part.includes("."))
    ) {
      lastNameParts.unshift(part.toLowerCase());
    } else {
      break;
    }
  }

  return lastNameParts.join(" ");
}

export interface AuthorOverlapResult {
  matchedAuthors: string[];
  overlapRatio: number;
  matchCount: number;
}

export interface MatchValidationResult {
  accept: boolean;
  score: number;
  reason: string;
  matchedAuthors: number;
  authorOverlap: number;
}

export function calculateAuthorOverlap(
  authors1: string[],
  authors2: string[],
): AuthorOverlapResult {
  const normalized1 = authors1.map((a) => normalizeLastName(a)).filter(Boolean);
  const normalized2 = authors2.map((a) => normalizeLastName(a)).filter(Boolean);

  if (normalized1.length === 0 || normalized2.length === 0) {
    return {
      matchedAuthors: [],
      overlapRatio: 0,
      matchCount: 0,
    };
  }

  const set1 = new Set(normalized1);
  const set2 = new Set(normalized2);

  const matchedAuthors = [...set1].filter((name) => set2.has(name));
  const overlapRatio = matchedAuthors.length / Math.max(set1.size, set2.size);

  return {
    matchedAuthors,
    overlapRatio,
    matchCount: matchedAuthors.length,
  };
}

export function validateMetadataMatch(
  item: {
    getCreators: () => ZoteroCreator[];
    getField: (field: string) => string;
  },
  candidate: SearchResult,
): MatchValidationResult {
  const itemAuthors = item
    .getCreators()
    .filter((c) => c.creatorType === "author")
    .map((c) => c.lastName)
    .filter(Boolean);

  const candidateAuthors = candidate.authors || [];

  const overlap = calculateAuthorOverlap(itemAuthors, candidateAuthors);

  if (overlap.matchCount === 0 && itemAuthors.length > 0) {
    return {
      accept: false,
      score: 0,
      reason: "No authors match",
      matchedAuthors: 0,
      authorOverlap: 0,
    };
  }

  const authorCountDiff = Math.abs(
    itemAuthors.length - candidateAuthors.length,
  );

  if (authorCountDiff > 5) {
    return {
      accept: false,
      score: 0,
      reason: `Author count differs too much (${authorCountDiff})`,
      matchedAuthors: overlap.matchCount,
      authorOverlap: overlap.overlapRatio,
    };
  }

  const itemYear = parseInt(item.getField("date") || "0");
  const candidateYear = candidate.year || 0;
  const yearDiff = Math.abs(itemYear - candidateYear);

  const itemTitle = item.getField("title") || "";
  const titleMatchesExactly = isExactTitleMatch(itemTitle, candidate.title);

  let score: number;

  if (itemAuthors.length === 0) {
    if (titleMatchesExactly) {
      if (
        candidateAuthors.length === 0 ||
        candidate.year === undefined ||
        candidate.year === 0
      ) {
        return {
          accept: false,
          score: 0,
          reason:
            "Exact title match missing required metadata (authors or year)",
          matchedAuthors: 0,
          authorOverlap: 0,
        };
      }
      score = 0.9;
    } else {
      score =
        0.4 * (titleMatchesExactly ? 1 : 0) +
        0.35 * (candidateAuthors.length > 0 ? 1 : 0) +
        0.15 * 1 +
        0.1 * (yearDiff <= 1 ? 1 : yearDiff <= 3 ? 0.5 : 0);
    }
  } else {
    score =
      0.4 * (titleMatchesExactly ? 1 : 0) +
      0.35 * overlap.overlapRatio +
      0.15 * (authorCountDiff <= 2 ? 1 : authorCountDiff <= 4 ? 0.5 : 0) +
      0.1 * (yearDiff <= 1 ? 1 : yearDiff <= 3 ? 0.5 : 0);
  }

  // Accept if score is high enough, and either:
  // - item has no authors (so we can add them), OR
  // - we have at least one matching author
  const accept =
    score >= 0.7 && (itemAuthors.length === 0 || overlap.matchCount >= 1);

  return {
    accept,
    score,
    reason: accept ? "Strong match" : `Weak match (score: ${score.toFixed(2)})`,
    matchedAuthors: overlap.matchCount,
    authorOverlap: overlap.overlapRatio,
  };
}
