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
