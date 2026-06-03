import type { SearchQuery } from "@/shared/core/types";
import { extractYearFromDate } from "@/utils/itemFields";

export abstract class IdentifierResolver {
  abstract extract(item: Zotero.Item): string | null;
  abstract discover(item: Zotero.Item): Promise<string | null>;

  protected cleanDOI(doi: string): string {
    return doi
      .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "")
      .replace(/[.,;'")\]]+$/, "")
      .trim()
      .toLowerCase();
  }

  protected cleanISBN(isbn: string): string {
    return isbn.replace(/[-\s]/g, "").toUpperCase();
  }

  protected buildSearchQuery(item: Zotero.Item): SearchQuery {
    const title = item.getField("title") || undefined;
    const date = item.getField("date");
    const year = date ? extractYearFromDate(date) : undefined;
    const creators = item.getCreators();
    const authors = creators
      .filter((c) => c.creatorType === "author")
      .map((c) => c.lastName || c.name || "")
      .filter(Boolean);

    return { title, year, authors: authors.length > 0 ? authors : undefined };
  }
}
