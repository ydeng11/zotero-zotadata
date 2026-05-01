export function isExactTitleMatch(title1: string, title2: string): boolean {
  const normalize = (s: string): string => {
    const lowercased = s.toLowerCase();
    const cleaned = lowercased.replace(/[^\w\s]/g, " ");
    return cleaned.replace(/\s+/g, "").trim();
  };
  return normalize(title1) === normalize(title2);
}

export function calculateStringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter((w) => w.length > 2));
  const words2 = new Set(str2.split(/\s+/).filter((w) => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((word) => words2.has(word)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}
