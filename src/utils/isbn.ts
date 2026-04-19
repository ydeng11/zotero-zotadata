export function convertISBN10to13(isbn10: string): string | null {
  if (isbn10.length !== 10) {
    return null;
  }

  const base = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number.parseInt(base[index], 10) * (index % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${base}${checkDigit}`;
}

export function convertISBN13to10(isbn13: string): string | null {
  if (isbn13.length !== 13 || !isbn13.startsWith("978")) {
    return null;
  }

  const base = isbn13.slice(3, 12);
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number.parseInt(base[index], 10) * (10 - index);
  }
  const checkDigit = (11 - (sum % 11)) % 11;
  return `${base}${checkDigit === 10 ? "X" : String(checkDigit)}`;
}

export function formatISBNWithHyphens(isbn: string): string {
  if (isbn.length === 10) {
    return `${isbn.slice(0, 1)}-${isbn.slice(1, 6)}-${isbn.slice(6, 9)}-${isbn.slice(9)}`;
  }

  if (isbn.length === 13) {
    return `${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 9)}-${isbn.slice(9, 12)}-${isbn.slice(12)}`;
  }

  return isbn;
}

export function cleanISBN(isbn: string): string {
  try {
    if (typeof Zotero !== "undefined" && Zotero.Utilities?.cleanISBN) {
      const cleaned = Zotero.Utilities.cleanISBN(isbn);
      return typeof cleaned === "string" ? cleaned : isbn.replace(/[-\s]/g, "");
    }
  } catch {
    return isbn.replace(/[-\s]/g, "");
  }

  return isbn.replace(/[-\s]/g, "");
}

export function buildAlternativeISBNCandidates(originalISBN: string): string[] {
  const cleanISBN = originalISBN.replace(/[-\s]/g, "");
  const candidates = new Set<string>([
    cleanISBN,
    formatISBNWithHyphens(cleanISBN),
  ]);

  if (cleanISBN.length === 10) {
    const isbn13 = convertISBN10to13(cleanISBN);
    if (isbn13) {
      candidates.add(isbn13);
    }
  }

  if (cleanISBN.length === 13) {
    const isbn10 = convertISBN13to10(cleanISBN);
    if (isbn10) {
      candidates.add(isbn10);
    }
  }

  return [...candidates].filter(
    (candidate) => Boolean(candidate) && candidate !== originalISBN,
  );
}
