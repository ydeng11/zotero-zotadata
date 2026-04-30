const CROSSREF_TO_ZOTERO: Record<string, string> = {
  "journal-article": "journalArticle",
  "book-chapter": "bookSection",
  book: "book",
  "conference-paper": "conferencePaper",
  "proceedings-article": "conferencePaper",
  dissertation: "thesis",
  report: "report",
  preprint: "preprint",
  dataset: "dataset",
  "peer-review": "journalArticle",
  "posted-content": "blogPost",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  standard: "report",
};

export function mapCrossRefTypeToZotero(
  crossrefType?: string,
): string | undefined {
  if (!crossrefType) return undefined;
  return CROSSREF_TO_ZOTERO[crossrefType.toLowerCase()] || undefined;
}

const SEMANTIC_SCHOLAR_TO_ZOTERO: Record<string, string> = {
  JournalArticle: "journalArticle",
  Conference: "conferencePaper",
  Review: "journalArticle",
  Editorial: "journalArticle",
  Letter: "journalArticle",
  CaseReport: "journalArticle",
  ClinicalStudy: "journalArticle",
  Dataset: "dataset",
  Dissertation: "thesis",
  Patent: "patent",
  Preprint: "preprint",
  Book: "book",
  BookSection: "bookSection",
};

export function mapSemanticScholarTypeToZotero(
  semanticScholarType?: string | string[] | null,
): string | undefined {
  if (!semanticScholarType) return undefined;

  const types = Array.isArray(semanticScholarType)
    ? semanticScholarType
    : [semanticScholarType];

  for (const type of types) {
    if (!type) continue;
    
    // Try exact match first (preserves camelCase like "JournalArticle")
    const exactMatch = SEMANTIC_SCHOLAR_TO_ZOTERO[type];
    if (exactMatch) return exactMatch;
    
    // Then try case-insensitive match by comparing lowercase
    const typeLower = type.toLowerCase();
    for (const [key, value] of Object.entries(SEMANTIC_SCHOLAR_TO_ZOTERO)) {
      if (key.toLowerCase() === typeLower) {
        return value;
      }
    }
  }

  return undefined;
}

const CONTAINER_TITLE_FIELDS: Record<string, string> = {
  journalArticle: "publicationTitle",
  bookSection: "bookTitle",
  conferencePaper: "proceedingsTitle",
};

export function getContainerTitleFieldForItemType(
  itemType: string,
): string | undefined {
  return CONTAINER_TITLE_FIELDS[itemType];
}
