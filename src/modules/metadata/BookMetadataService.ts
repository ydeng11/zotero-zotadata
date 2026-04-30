import { ErrorManager } from "@/shared/core";
import { cleanISBN, buildAlternativeISBNCandidates } from "@/utils/isbn";
import { isExactTitleMatch } from "@/utils/similarity";
import type {
  BookMetadataSource,
  LegacyFetchResult,
  OpenLibraryBookMetadata,
  GoogleBooksVolumeInfo,
  TranslatorItem,
  TranslatorSearch,
} from "./types";
import { BOOK_TRANSLATOR_FIELDS as BOOK_FIELDS } from "./types";

export class BookMetadataService {
  private errorManager: ErrorManager;

  constructor() {
    this.errorManager = new ErrorManager();
  }

  async fetchISBNBasedMetadata(item: Zotero.Item): Promise<LegacyFetchResult> {
    const changes: string[] = [];
    let isbn = this.extractISBN(item);

    if (!isbn) {
      isbn = await this.discoverISBN(item);
      if (isbn) {
        item.setField("ISBN", isbn);
        item.addTag("ISBN Added", 1);
        await item.saveTx();
        changes.push(`Added ISBN: ${isbn}`);
      }
    }

    if (!isbn) {
      item.addTag("No ISBN Found", 1);
      await item.saveTx();
      return {
        success: false,
        updated: false,
        error: "No ISBN found",
        source: "BookMetadataService",
        changes,
      };
    }

    const metadata = await this.fetchBookMetadata(isbn, item);
    if (!metadata) {
      item.addTag("Book API Failed", 1);
      await item.saveTx();
      return {
        success: false,
        updated: changes.length > 0,
        error: "Book API failed",
        source: "Book Metadata",
        changes,
      };
    }

    if (this.isTranslatorBookMetadata(metadata)) {
      item.addTag("Metadata Updated", 1);
      item.addTag("Via Zotero Translator", 1);
      await item.saveTx();
      return {
        success: true,
        updated: true,
        error: null,
        source: "Zotero Translator",
        changes:
          changes.length > 0
            ? changes
            : [`Updated book metadata via Zotero translator for ISBN ${isbn}`],
      };
    }

    changes.push(...(await this.updateItemWithBookMetadata(item, metadata)));
    item.addTag("Metadata Updated", 1);
    await item.saveTx();
    return {
      success: true,
      updated: true,
      error: null,
      source: "Book Metadata",
      changes,
    };
  }

  extractISBN(item: Zotero.Item): string | null {
    const isbnField = String(item.getField("ISBN") ?? "").trim();
    if (isbnField) {
      return cleanISBN(isbnField);
    }

    const extra = String(item.getField("extra") ?? "");
    const match = extra.match(/ISBN[:\-\s]*([0-9\-xX]{10,17})/i);
    return match ? cleanISBN(match[1]) : null;
  }

  async discoverISBN(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    const openLibraryISBN = await this.searchOpenLibraryForISBN(item, title);
    if (openLibraryISBN) {
      return openLibraryISBN;
    }

    return this.searchGoogleBooksForISBN(item, title);
  }

  private async searchOpenLibraryForISBN(
    item: Zotero.Item,
    title: string,
  ): Promise<string | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://openlibrary.org/search.json?q=${encodeURIComponent(title)}&limit=5`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        docs?: Array<{ isbn?: string[]; title?: string }>;
      };
      for (const doc of payload.docs ?? []) {
        if (doc.isbn?.[0] && doc.title && isExactTitleMatch(doc.title, title)) {
          return cleanISBN(doc.isbn[0]);
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private async searchGoogleBooksForISBN(
    item: Zotero.Item,
    title: string,
  ): Promise<string | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`intitle:"${title}"`)}&maxResults=5`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        items?: Array<{
          volumeInfo?: {
            industryIdentifiers?: Array<{ identifier?: string; type?: string }>;
            title?: string;
          };
        }>;
      };
      for (const itemInfo of payload.items ?? []) {
        const volumeInfo = itemInfo.volumeInfo;
        if (volumeInfo?.title && isExactTitleMatch(volumeInfo.title, title)) {
          const identifier = volumeInfo.industryIdentifiers?.find(
            (entry) => entry.type === "ISBN_13" || entry.type === "ISBN_10",
          );
          if (identifier?.identifier) {
            return cleanISBN(identifier.identifier);
          }
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async fetchBookMetadata(
    isbn: string,
    item: Zotero.Item,
  ): Promise<BookMetadataSource | null> {
    const metadata = await this.lookupBookMetadata(isbn, item);
    if (metadata) {
      return metadata;
    }

    for (const candidate of buildAlternativeISBNCandidates(isbn)) {
      const altMetadata = await this.lookupBookMetadata(candidate, item);
      if (altMetadata) {
        return altMetadata;
      }
    }

    return null;
  }

  private async lookupBookMetadata(
    isbn: string,
    item: Zotero.Item,
  ): Promise<BookMetadataSource | null> {
    const translatorSuccess = await this.fetchBookMetadataViaTranslator(
      isbn,
      item,
    );
    if (translatorSuccess) {
      return { source: "Zotero Translator", success: true };
    }

    const openLibrary = await this.fetchOpenLibraryMetadata(isbn);
    if (openLibrary) {
      return openLibrary;
    }

    return this.fetchGoogleBooksMetadata(isbn);
  }

  private async fetchBookMetadataViaTranslator(
    isbn: string,
    item: Zotero.Item,
  ): Promise<boolean> {
    return this.applyTranslatorMetadata(
      item,
      { itemType: "book", ISBN: isbn },
      BOOK_FIELDS,
    );
  }

  private async fetchOpenLibraryMetadata(
    isbn: string,
  ): Promise<OpenLibraryBookMetadata | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=details`,
        {
          headers: { Accept: "application/json" },
          timeout: 15000,
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as Record<
        string,
        { details?: OpenLibraryBookMetadata }
      >;
      return payload[`ISBN:${isbn}`]?.details ?? null;
    } catch {
      return null;
    }
  }

  private async fetchGoogleBooksMetadata(
    isbn: string,
  ): Promise<GoogleBooksVolumeInfo | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`,
        {
          headers: { Accept: "application/json" },
          timeout: 15000,
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        items?: Array<{ volumeInfo?: GoogleBooksVolumeInfo }>;
      };
      return payload.items?.[0]?.volumeInfo ?? null;
    } catch {
      return null;
    }
  }

  async updateItemWithBookMetadata(
    item: Zotero.Item,
    metadata: OpenLibraryBookMetadata | GoogleBooksVolumeInfo,
  ): Promise<string[]> {
    const changes: string[] = [];
    const currentTitle = String(item.getField("title") ?? "");
    if (metadata.title && (!currentTitle || currentTitle.length < 10)) {
      item.setField("title", metadata.title);
      changes.push(`Updated title: ${metadata.title}`);
    }

    const authors = "authors" in metadata ? metadata.authors : undefined;
    const existingAuthors = item
      .getCreators()
      .filter((c) => c.creatorType === "author");
    if (authors?.length && existingAuthors.length === 0) {
      this.applyBookAuthors(item, authors);
      changes.push(`Updated authors: ${authors.length}`);
    }

    if ("publishers" in metadata && metadata.publishers?.[0]) {
      item.setField("publisher", metadata.publishers[0]);
      changes.push(`Updated publisher: ${metadata.publishers[0]}`);
    } else if ("publisher" in metadata && metadata.publisher) {
      item.setField("publisher", metadata.publisher);
      changes.push(`Updated publisher: ${metadata.publisher}`);
    }

    if ("publish_date" in metadata && metadata.publish_date) {
      item.setField("date", metadata.publish_date);
      changes.push(`Updated date: ${metadata.publish_date}`);
    } else if ("publishedDate" in metadata && metadata.publishedDate) {
      item.setField("date", metadata.publishedDate);
      changes.push(`Updated date: ${metadata.publishedDate}`);
    }

    if ("number_of_pages" in metadata && metadata.number_of_pages) {
      item.setField("numPages", String(metadata.number_of_pages));
      changes.push(`Updated pages: ${metadata.number_of_pages}`);
    } else if ("pageCount" in metadata && metadata.pageCount) {
      item.setField("numPages", String(metadata.pageCount));
      changes.push(`Updated pages: ${metadata.pageCount}`);
    }

    await item.saveTx();
    return changes;
  }

  private isTranslatorBookMetadata(
    metadata: BookMetadataSource,
  ): metadata is { source: "Zotero Translator"; success: true } {
    return "source" in metadata && metadata.source === "Zotero Translator";
  }

  private applyBookAuthors(
    item: Zotero.Item,
    authors: Array<{ name?: string } | string>,
  ): void {
    const existingCreators = item.getCreators();
    const nonAuthors = existingCreators.filter(
      (creator) => creator.creatorType !== "author",
    );

    const newAuthors = authors.map((author) => {
      const name = typeof author === "string" ? author : (author.name ?? "");
      const parts = name.split(" ").filter(Boolean);
      const lastName = parts.pop() ?? name;
      const firstName = parts.join(" ");
      return {
        creatorType: "author" as const,
        firstName,
        lastName,
      };
    });

    item.setCreators([...newAuthors, ...nonAuthors]);
  }

  private async applyTranslatorMetadata(
    item: Zotero.Item,
    identifier: Record<string, unknown>,
    fields: readonly string[],
    options: {
      allowMoreCompleteReplacement?: boolean;
      finalizeChange?: () => boolean;
    } = {},
  ): Promise<boolean> {
    const translate = this.createTranslatorSearch();
    if (!translate) {
      return false;
    }

    try {
      translate.setIdentifier(identifier);
      const translators = await translate.getTranslators();
      if (!translators.length) {
        return false;
      }

      translate.setTranslator(translators);
      const [translated] = await translate.translate();
      if (!translated) {
        return false;
      }

      let changed = this.applyTranslatedCreators(
        item,
        translated.getCreators(),
        options.allowMoreCompleteReplacement ?? false,
      );
      changed = this.applyTranslatedFields(item, translated, fields) || changed;
      if (options.finalizeChange?.()) {
        changed = true;
      }

      translated.deleted = true;
      await translated.saveTx();
      if (!changed) {
        return false;
      }

      await item.saveTx();
      return true;
    } catch {
      return false;
    }
  }

  private createTranslatorSearch(): TranslatorSearch | null {
    const zoteroWithTranslate = Zotero as typeof Zotero & {
      Translate?: {
        Search?: new () => TranslatorSearch;
      };
    };
    const SearchCtor = zoteroWithTranslate.Translate?.Search;
    return SearchCtor ? new SearchCtor() : null;
  }

  private applyTranslatedCreators(
    item: Zotero.Item,
    creators: Array<{
      creatorType?: string;
      firstName?: string;
      lastName?: string;
    }>,
    allowMoreCompleteReplacement = false,
  ): boolean {
    const currentCreators = item.getCreators();
    if (
      currentCreators.length === 0 ||
      (allowMoreCompleteReplacement && creators.length > currentCreators.length)
    ) {
      item.setCreators(
        creators.map((creator) => ({
          creatorType: creator.creatorType ?? "author",
          firstName: creator.firstName ?? "",
          lastName: creator.lastName ?? "",
        })),
      );
      return creators.length > 0;
    }
    return false;
  }

  private applyTranslatedFields(
    item: Zotero.Item,
    translated: TranslatorItem,
    fields: readonly string[],
  ): boolean {
    let changed = false;

    for (const field of fields) {
      const newValue = String(translated.getField(field) ?? "").trim();
      if (!newValue) {
        continue;
      }

      const currentValue = String(item.getField(field) ?? "").trim();
      if (
        !currentValue ||
        currentValue.length < 10 ||
        currentValue !== newValue
      ) {
        item.setField(field, newValue);
        changed = true;
      }
    }

    return changed;
  }
}
