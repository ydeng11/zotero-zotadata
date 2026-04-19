export function calculateTitleSimilarity(
  title1: string,
  title2: string,
): number {
  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normalizedOne = normalize(title1);
  const normalizedTwo = normalize(title2);
  if (normalizedOne === normalizedTwo) {
    return 1;
  }

  const wordsOne = new Set(normalizedOne.split(" ").filter(Boolean));
  const wordsTwo = new Set(normalizedTwo.split(" ").filter(Boolean));
  const intersection = new Set(
    [...wordsOne].filter((word) => wordsTwo.has(word)),
  );
  const union = new Set([...wordsOne, ...wordsTwo]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

export function calculateStringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter((w) => w.length > 2));
  const words2 = new Set(str2.split(/\s+/).filter((w) => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((word) => words2.has(word)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}
