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
