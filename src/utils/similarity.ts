export function isExactTitleMatch(title1: string, title2: string): boolean {
  const normalize = (s: unknown): string => {
    if (typeof s !== "string") return "";
    const lowercased = s.toLowerCase();
    const cleaned = lowercased.replace(/[^\w\s]/g, " ");
    return cleaned.replace(/\s+/g, "").trim();
  };

  const normalizedTitle1 = normalize(title1);
  const normalizedTitle2 = normalize(title2);
  return (
    normalizedTitle1.length > 0 &&
    normalizedTitle2.length > 0 &&
    normalizedTitle1 === normalizedTitle2
  );
}
