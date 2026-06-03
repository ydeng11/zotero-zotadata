import { ErrorManager, ErrorType } from "@/shared/core";
import {
  cleanISBN,
  buildAlternativeISBNCandidates,
  isValidCleanISBN,
} from "@/utils/isbn";
import { isExactTitleMatch } from "@/utils/similarity";
import { calculateAuthorOverlap } from "@/utils/authorValidation";
import { isAuthorCreator } from "@/utils/itemFields";
import type {
  BookMetadataSource,
  LegacyFetchResult,
  MetadataUpdateResult,
  OpenLibraryBookMetadata,
  GoogleBooksVolumeInfo,
  TranslatorItem,
  TranslatorSearch,
} from "./types";
import { BOOK_TRANSLATOR_FIELDS as BOOK_FIELDS } from "./types";

const GOOGLE_BOOKS_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0",
} as const;

export class BookMetadataService {
  private errorManager: ErrorManager;
  private readonly googleBooksApiKey: string;
  private readonly googleBooksEnabled: boolean;

  private debug(message: string): void {
    if (typeof Zotero !== "undefined" && Zotero.log) {
      Zotero.log(`Zotadata BookMetadataService: ${message}`);
    }
  }

  constructor(
    options: { googleBooksApiKey?: string; googleBooksEnabled?: boolean } = {},
  ) {
    this.errorManager = new ErrorManager();
    this.googleBooksApiKey = options.googleBooksApiKey ?? "";
    this.googleBooksEnabled = options.googleBooksEnabled ?? true;
  }

  async fetchISBNBasedMetadata(item: Zotero.Item): Promise<LegacyFetchResult> {
    const changes: string[] = [];
    this.debug(`fetchISBNBasedMetadata: item ${item.id}`);
    let isbn = this.extractISBN(item);

    if (!isbn) {
      this.debug(`No ISBN found in item fields — trying discovery`);
      isbn = await this.discoverISBN(item);
      if (isbn) {
        this.debug(`Discovered ISBN: ${isbn} — writing to item`);
        item.setField("ISBN", isbn);
        item.addTag("ISBN Added", 1);
        await item.saveTx();
        changes.push(`Added ISBN: ${isbn}`);
      }
    } else {
      this.debug(`Found ISBN in item: ${isbn}`);
    }

    if (!isbn) {
      this.debug(`No ISBN found for item ${item.id}`);
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

    this.debug(`Fetching book metadata for ISBN ${isbn}`);
    const metadata = await this.fetchBookMetadata(isbn, item);
    if (!metadata) {
      this.debug(`All book APIs failed for ISBN ${isbn}`);
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
      this.debug(`Zotero Translator succeeded for ISBN ${isbn}`);
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

    this.debug(`Source: Book APIs — applying metadata from ISBN ${isbn}`);
    const updateResult = await this.updateItemWithBookMetadata(item, metadata);

    if (updateResult.rejectionReason) {
      this.debug(`Book metadata rejected: ${updateResult.rejectionReason}`);
      await item.saveTx();
      return {
        success: false,
        updated: false,
        error: updateResult.rejectionReason,
        source: "Book Metadata",
        changes: [...changes, ...updateResult.changes],
      };
    }

    changes.push(...updateResult.changes);
    this.debug(
      `Book metadata update done — ${changes.length} change(s) for item ${item.id}`,
    );
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
      const cleaned = cleanISBN(isbnField);
      return isValidCleanISBN(cleaned) ? cleaned : null;
    }

    const extra = String(item.getField("extra") ?? "");
    const match = extra.match(/ISBN[:\-\s]*([0-9xX][0-9xX\-\s]{8,30})/i);
    if (!match) {
      return null;
    }

    const cleaned = cleanISBN(match[1]);
    return isValidCleanISBN(cleaned) ? cleaned : null;
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
        `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&fields=title,isbn,author_name&limit=5`,
        {
          headers: { Accept: "application/json" },
          successCodes: false,
        },
      );
      if (response.status !== 200) {
        const errorType = this.getHTTPStatusErrorType(response.status);
        await this.errorManager.handleError(
          this.errorManager.createError(
            errorType,
            `OpenLibrary API returned status ${response.status}`,
            { title, status: response.status },
          ),
          { notifyUser: false },
        );
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        docs?: Array<{
          isbn?: string[];
          title?: string;
          author_name?: string[];
        }>;
      };
      for (const doc of payload.docs ?? []) {
        if (!doc.isbn || doc.isbn.length === 0) continue;
        if (!doc.title || !isExactTitleMatch(doc.title, title)) continue;

        const validISBN = doc.isbn
          .map((isbn) => cleanISBN(isbn))
          .find((isbn) => isValidCleanISBN(isbn));
        if (validISBN) {
          return validISBN;
        }
      }
    } catch (error) {
      await this.errorManager.handleError(
        this.errorManager.createError(
          ErrorType.API_ERROR,
          `OpenLibrary title search failed for "${title}"`,
          {
            title,
            error: error instanceof Error ? error.message : String(error),
          },
        ),
        { notifyUser: false },
      );
      return null;
    }

    return null;
  }

  private buildGoogleBooksUrl(path: string, queryParams: string): string {
    const base = `https://www.googleapis.com/books/v1/${path}?${queryParams}`;
    return this.googleBooksApiKey
      ? `${base}&key=${encodeURIComponent(this.googleBooksApiKey)}`
      : base;
  }

  private async searchGoogleBooksForISBN(
    item: Zotero.Item,
    title: string,
  ): Promise<string | null> {
    if (!this.googleBooksEnabled) {
      return null;
    }

    try {
      const url = this.buildGoogleBooksUrl(
        "volumes",
        `q=${encodeURIComponent(`intitle:"${title}"`)}&maxResults=5`,
      );

      const response = await Zotero.HTTP.request("GET", url, {
        headers: GOOGLE_BOOKS_HEADERS,
        successCodes: false,
      });
      if (response.status !== 200) {
        const errorType = this.getHTTPStatusErrorType(response.status);
        await this.errorManager.handleError(
          this.errorManager.createError(
            errorType,
            `Google Books API returned status ${response.status}`,
            { title, status: response.status },
          ),
          { notifyUser: false },
        );
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
            const cleaned = cleanISBN(identifier.identifier);
            if (isValidCleanISBN(cleaned)) {
              return cleaned;
            }
          }
        }
      }
    } catch (error) {
      await this.errorManager.handleError(
        this.errorManager.createError(
          ErrorType.API_ERROR,
          `Google Books title search failed for "${title}"`,
          {
            title,
            error: error instanceof Error ? error.message : String(error),
          },
        ),
        { notifyUser: false },
      );
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
          successCodes: false,
        },
      );
      if (response.status !== 200) {
        const errorType = this.getHTTPStatusErrorType(response.status);
        await this.errorManager.handleError(
          this.errorManager.createError(
            errorType,
            `OpenLibrary Books API returned status ${response.status}`,
            { isbn, status: response.status },
          ),
          { notifyUser: false },
        );
        return null;
      }

      const payload = JSON.parse(response.responseText) as Record<
        string,
        { details?: OpenLibraryBookMetadata }
      >;
      return payload[`ISBN:${isbn}`]?.details ?? null;
    } catch (error) {
      await this.errorManager.handleError(
        this.errorManager.createError(
          ErrorType.API_ERROR,
          `OpenLibrary metadata fetch failed for ISBN ${isbn}`,
          {
            isbn,
            error: error instanceof Error ? error.message : String(error),
          },
        ),
        { notifyUser: false },
      );
      return null;
    }
  }

  private async fetchGoogleBooksMetadata(
    isbn: string,
  ): Promise<GoogleBooksVolumeInfo | null> {
    if (!this.googleBooksEnabled) {
      return null;
    }

    try {
      const url = this.buildGoogleBooksUrl(
        "volumes",
        `q=isbn:${encodeURIComponent(isbn)}`,
      );

      const response = await Zotero.HTTP.request("GET", url, {
        headers: GOOGLE_BOOKS_HEADERS,
        timeout: 15000,
        successCodes: false,
      });
      if (response.status !== 200) {
        const errorType = this.getHTTPStatusErrorType(response.status);
        await this.errorManager.handleError(
          this.errorManager.createError(
            errorType,
            `Google Books API returned status ${response.status}`,
            { isbn, status: response.status },
          ),
          { notifyUser: false },
        );
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        items?: Array<{ volumeInfo?: GoogleBooksVolumeInfo }>;
      };
      return payload.items?.[0]?.volumeInfo ?? null;
    } catch (error) {
      await this.errorManager.handleError(
        this.errorManager.createError(
          ErrorType.API_ERROR,
          `Google Books metadata fetch failed for ISBN ${isbn}`,
          {
            isbn,
            error: error instanceof Error ? error.message : String(error),
          },
        ),
        { notifyUser: false },
      );
      return null;
    }
  }

  private getHTTPStatusErrorType(status: number): ErrorType {
    if (status === 429) {
      return ErrorType.RATE_LIMIT;
    }

    if (status === 408 || status >= 500) {
      return ErrorType.NETWORK_ERROR;
    }

    return ErrorType.API_ERROR;
  }

  async updateItemWithBookMetadata(
    item: Zotero.Item,
    metadata: OpenLibraryBookMetadata | GoogleBooksVolumeInfo,
  ): Promise<MetadataUpdateResult> {
    const changes: string[] = [];

    const sourceName =
      "publishers" in metadata ? "OpenLibrary" : "Google Books";
    this.debug(`Source: ${sourceName} — updating item ${item.id}`);

    const itemAuthors = item
      .getCreators()
      .filter(isAuthorCreator)
      .map((c) => c.lastName || c.name || "")
      .filter(Boolean);

    const metadataAuthors =
      "authors" in metadata
        ? metadata.authors
            .map((a) => (typeof a === "string" ? a : a.name || ""))
            .filter((author) => author.trim().length > 0)
        : [];

    if (itemAuthors.length > 0 && metadataAuthors.length > 0) {
      const overlap = calculateAuthorOverlap(itemAuthors, metadataAuthors);

      if (overlap.overlapRatio < 0.4) {
        this.debug(
          `Author mismatch — overlap ${overlap.overlapRatio.toFixed(2)} < 0.4, rejecting metadata from ${sourceName}`,
        );
        await this.errorManager.handleError(
          this.errorManager.createError(
            ErrorType.VALIDATION_ERROR,
            `Author mismatch - rejecting metadata`,
            {
              itemId: item.id,
              localAuthors: itemAuthors,
              fetchedAuthors: metadataAuthors,
              overlapRatio: overlap.overlapRatio,
            },
          ),
          { notifyUser: false },
        );

        return {
          changes: [],
          rejectionReason: `Author mismatch (${overlap.overlapRatio.toFixed(2)} overlap)`,
        };
      }
    }

    const currentTitle = String(item.getField("title") ?? "").trim();
    const metadataTitle = this.getNonEmptyMetadataString(metadata.title);
    if (metadataTitle && (!currentTitle || currentTitle.length < 10)) {
      this.debug(`Writing title "${metadataTitle}" (was: "${currentTitle}")`);
      item.setField("title", metadataTitle);
      changes.push(`Updated title: ${metadataTitle}`);
    }

    const authors = "authors" in metadata ? metadata.authors : undefined;
    const usableAuthors = authors?.filter((author) =>
      this.getBookAuthorName(author),
    );
    if (usableAuthors?.length) {
      this.debug(`Writing ${usableAuthors.length} authors from ${sourceName}`);
      this.applyBookAuthors(item, usableAuthors);
      changes.push(`Updated authors: ${usableAuthors.length}`);
    }

    const publisher = this.getBookPublisher(metadata);
    if (publisher) {
      this.debug(`Writing publisher "${publisher}"`);
      item.setField("publisher", publisher);
      changes.push(`Updated publisher: ${publisher}`);
    }

    const publishedDate = this.getBookPublishedDate(metadata);
    if (publishedDate) {
      this.debug(`Writing date "${publishedDate}"`);
      item.setField("date", publishedDate);
      changes.push(`Updated date: ${publishedDate}`);
    }

    const pageCount = this.getValidPageCount(metadata);
    if (pageCount !== null) {
      this.debug(`Writing pages ${pageCount}`);
      item.setField("numPages", String(pageCount));
      changes.push(`Updated pages: ${pageCount}`);
    }

    this.debug(`${sourceName} update done — ${changes.length} change(s)`);
    await item.saveTx();
    return { changes };
  }

  private isTranslatorBookMetadata(
    metadata: BookMetadataSource,
  ): metadata is { source: "Zotero Translator"; success: true } {
    return "source" in metadata && metadata.source === "Zotero Translator";
  }

  private getValidPageCount(
    metadata: OpenLibraryBookMetadata | GoogleBooksVolumeInfo,
  ): number | null {
    const pageCount =
      "number_of_pages" in metadata
        ? metadata.number_of_pages
        : "pageCount" in metadata
          ? metadata.pageCount
          : undefined;

    return Number.isInteger(pageCount) && pageCount > 0 ? pageCount : null;
  }

  private getBookPublisher(
    metadata: OpenLibraryBookMetadata | GoogleBooksVolumeInfo,
  ): string | null {
    if ("publishers" in metadata) {
      return this.getNonEmptyMetadataString(metadata.publishers?.[0]);
    }

    if ("publisher" in metadata) {
      return this.getNonEmptyMetadataString(metadata.publisher);
    }

    return null;
  }

  private getBookPublishedDate(
    metadata: OpenLibraryBookMetadata | GoogleBooksVolumeInfo,
  ): string | null {
    if ("publish_date" in metadata) {
      return this.getNonEmptyMetadataString(metadata.publish_date);
    }

    if ("publishedDate" in metadata) {
      return this.getNonEmptyMetadataString(metadata.publishedDate);
    }

    return null;
  }

  private getNonEmptyMetadataString(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private applyBookAuthors(
    item: Zotero.Item,
    authors: Array<{ name?: string } | string>,
  ): void {
    const existingCreators = item.getCreators();
    const nonAuthors = existingCreators.filter(
      (creator) => !isAuthorCreator(creator),
    );

    const newAuthors = authors.map((author) => {
      const name = this.getBookAuthorName(author);
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

  private getBookAuthorName(author: { name?: string } | string): string {
    return (typeof author === "string" ? author : (author.name ?? "")).trim();
  }

  private async applyTranslatorMetadata(
    item: Zotero.Item,
    identifier: Record<string, unknown>,
    fields: readonly string[],
    options: { finalizeChange?: () => boolean } = {},
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
    } catch (error) {
      await this.errorManager.handleError(
        this.errorManager.createError(
          ErrorType.API_ERROR,
          `Zotero Translator failed`,
          {
            identifier,
            error: error instanceof Error ? error.message : String(error),
          },
        ),
        { notifyUser: false },
      );
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
  ): boolean {
    const currentCreators = item.getCreators();

    const authorsFromTranslation = creators.filter(
      (c) => c.creatorType === "author" || !c.creatorType,
    );

    if (authorsFromTranslation.length === 0) {
      return false;
    }

    const nonAuthorsFromTranslation = creators.filter(
      (c) => c.creatorType && c.creatorType !== "author",
    );
    const existingNonAuthors = currentCreators.filter(
      (c) => !isAuthorCreator(c),
    );

    const newAuthors = authorsFromTranslation.map((creator) => ({
      creatorType: "author" as const,
      firstName: creator.firstName ?? "",
      lastName: creator.lastName ?? "",
    }));

    const newNonAuthors = nonAuthorsFromTranslation.map((creator) => ({
      creatorType: creator.creatorType ?? "author",
      firstName: creator.firstName ?? "",
      lastName: creator.lastName ?? "",
    }));

    const finalNonAuthors =
      nonAuthorsFromTranslation.length > 0 ? newNonAuthors : existingNonAuthors;

    item.setCreators([...newAuthors, ...finalNonAuthors]);
    return true;
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
