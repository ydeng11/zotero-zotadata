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

  const titleSimilarity = calculateTitleSimilarity(
    item.getField("title") || "",
    candidate.title,
  );

  if (titleSimilarity > 0.4 && yearDiff > 3 && overlap.overlapRatio >= 0.8) {
    return {
      accept: false,
      score: 0,
      reason: `Year differs too much for similar title (${yearDiff} years)`,
      matchedAuthors: overlap.matchCount,
      authorOverlap: overlap.overlapRatio,
    };
  }

  const score =
    0.4 * titleSimilarity +
    0.35 * overlap.overlapRatio +
    0.15 * (authorCountDiff <= 2 ? 1 : authorCountDiff <= 4 ? 0.5 : 0) +
    0.1 * (yearDiff <= 1 ? 1 : yearDiff <= 3 ? 0.5 : 0);

  const accept = score >= 0.7 && overlap.matchCount >= 1;

  return {
    accept,
    score,
    reason: accept ? "Strong match" : `Weak match (score: ${score.toFixed(2)})`,
    matchedAuthors: overlap.matchCount,
    authorOverlap: overlap.overlapRatio,
  };
}

function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const words1 = new Set(
    normalize(title1)
      .split(" ")
      .filter((w) => w.length > 2),
  );
  const words2 = new Set(
    normalize(title2)
      .split(" ")
      .filter((w) => w.length > 2),
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}
