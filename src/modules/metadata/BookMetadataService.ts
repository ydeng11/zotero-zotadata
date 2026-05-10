import { ErrorManager, ErrorType } from "@/shared/core";
import { cleanISBN, buildAlternativeISBNCandidates } from "@/utils/isbn";
import { isExactTitleMatch } from "@/utils/similarity";
import { calculateAuthorOverlap } from "@/utils/authorValidation";
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

const FALLBACK_EDITION_EXTRA_PREFIX = "Zotadata fallback edition:";

interface BookMetadataLookupResult {
  metadata: BookMetadataSource;
  fallbackISBN?: string;
}

interface FallbackISBNCandidate {
  isbn: string;
  source: "OpenLibrary" | "Google Books";
}

interface FallbackBookQuery {
  title: string;
  authors: string[];
}

type ZoteroCreator = ReturnType<Zotero.Item["getCreators"]>[number] & {
  creatorTypeID?: number;
};

type CreatorTypesWithName = {
  getName?: (creatorTypeID: number) => string;
  getPrimaryIDForType?: (creatorType: string) => number;
};

export class BookMetadataService {
  private errorManager: ErrorManager;
  private lastBookMetadataLookup: BookMetadataLookupResult | null = null;

  constructor() {
    this.errorManager = new ErrorManager();
  }

  async fetchISBNBasedMetadata(item: Zotero.Item): Promise<LegacyFetchResult> {
    const changes: string[] = [];
    let isbn = this.extractISBN(item);
    this.logDebug("ISBN metadata fetch started", {
      itemId: item.id,
      title: String(item.getField("title") ?? ""),
      extractedISBN: isbn,
    });

    if (!isbn) {
      isbn = await this.discoverISBN(item);
      if (isbn) {
        this.logDebug("Discovered ISBN for item without ISBN", { isbn });
        item.setField("ISBN", isbn);
        item.addTag("ISBN Added", 1);
        await item.saveTx();
        changes.push(`Added ISBN: ${isbn}`);
      }
    }

    if (!isbn) {
      this.logDebug("No ISBN available after discovery");
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

    this.lastBookMetadataLookup = null;
    const metadata = await this.fetchBookMetadata(isbn, item);
    if (!metadata) {
      this.logDebug("Book metadata lookup failed after all ISBN paths", {
        isbn,
      });
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

    const fallbackISBN = this.lastBookMetadataLookup?.fallbackISBN;
    if (fallbackISBN) {
      this.logDebug("Using fallback edition ISBN for metadata", {
        originalISBN: isbn,
        fallbackISBN,
      });
      changes.push(`Used fallback edition ISBN: ${fallbackISBN}`);
    }

    if (this.isTranslatorBookMetadata(metadata)) {
      if (fallbackISBN && this.storeFallbackEditionISBN(item, fallbackISBN)) {
        changes.push("Stored fallback edition ISBN in Extra");
      }

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

    const updateResult = await this.updateItemWithBookMetadata(item, metadata);

    if (updateResult.rejectionReason) {
      this.logDebug("Book metadata update rejected", {
        reason: updateResult.rejectionReason,
      });
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
    if (fallbackISBN && this.storeFallbackEditionISBN(item, fallbackISBN)) {
      changes.push("Stored fallback edition ISBN in Extra");
    }
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
        `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&fields=title,isbn,author_name&limit=5`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (response.status !== 200) {
        const errorType =
          response.status === 429 ? ErrorType.RATE_LIMIT : ErrorType.API_ERROR;
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

        const isbn13 = doc.isbn.find((isbn) => cleanISBN(isbn).length === 13);
        const isbn10 = doc.isbn.find((isbn) => cleanISBN(isbn).length === 10);
        return cleanISBN(isbn13 || isbn10 || doc.isbn[0]);
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
        const errorType =
          response.status === 429 ? ErrorType.RATE_LIMIT : ErrorType.API_ERROR;
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
            return cleanISBN(identifier.identifier);
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
    const lookupResult = await this.fetchBookMetadataWithFallback(isbn, item);
    this.lastBookMetadataLookup = lookupResult;
    return lookupResult?.metadata ?? null;
  }

  private async fetchBookMetadataWithFallback(
    isbn: string,
    item: Zotero.Item,
  ): Promise<BookMetadataLookupResult | null> {
    const attemptedISBNs = new Set<string>();
    const lookupCandidates = [isbn, ...buildAlternativeISBNCandidates(isbn)];
    this.logDebug("Trying exact ISBN metadata candidates", {
      isbn,
      lookupCandidates,
    });

    for (const candidate of lookupCandidates) {
      attemptedISBNs.add(cleanISBN(candidate));
      this.logDebug("Trying exact ISBN metadata candidate", { candidate });
      const metadata = await this.lookupBookMetadata(candidate, item);
      if (metadata) {
        this.logDebug("Exact ISBN metadata candidate succeeded", {
          candidate,
        });
        return { metadata };
      }
      this.logDebug("Exact ISBN metadata candidate failed", { candidate });
    }

    const fallbackCandidates = await this.discoverFallbackISBNCandidates(item);
    this.logDebug("Fallback ISBN discovery completed", {
      fallbackCandidates,
    });

    for (const candidate of fallbackCandidates) {
      const cleanCandidate = cleanISBN(candidate.isbn);
      if (attemptedISBNs.has(cleanCandidate)) {
        this.logDebug("Skipping already attempted fallback ISBN", {
          isbn: cleanCandidate,
          source: candidate.source,
        });
        continue;
      }

      attemptedISBNs.add(cleanCandidate);
      this.logDebug("Trying fallback ISBN metadata candidate", {
        isbn: cleanCandidate,
        source: candidate.source,
      });
      const metadata = await this.lookupBookMetadata(cleanCandidate, item);
      if (metadata) {
        this.logDebug("Fallback ISBN metadata candidate succeeded", {
          isbn: cleanCandidate,
          source: candidate.source,
        });
        return {
          metadata,
          fallbackISBN: cleanCandidate,
        };
      }
      this.logDebug("Fallback ISBN metadata candidate failed", {
        isbn: cleanCandidate,
        source: candidate.source,
      });
    }

    this.logDebug("No book metadata found from exact or fallback ISBN paths", {
      isbn,
      attemptedISBNs: [...attemptedISBNs],
    });
    return null;
  }

  private async discoverFallbackISBNCandidates(
    item: Zotero.Item,
  ): Promise<FallbackISBNCandidate[]> {
    const queries = this.getFallbackBookQueries(item);
    this.logDebug("Prepared fallback book search queries", { queries });
    if (queries.length === 0) {
      return [];
    }

    for (const query of queries) {
      const openLibraryCandidates =
        await this.searchOpenLibraryForFallbackISBNs(item, query);
      this.logDebug("OpenLibrary fallback search result", {
        query,
        candidateCount: openLibraryCandidates.length,
        candidates: openLibraryCandidates,
      });
      if (openLibraryCandidates.length > 0) {
        return openLibraryCandidates;
      }
    }

    for (const query of queries) {
      const googleBooksCandidates =
        await this.searchGoogleBooksForFallbackISBNs(item, query);
      this.logDebug("Google Books fallback search result", {
        query,
        candidateCount: googleBooksCandidates.length,
        candidates: googleBooksCandidates,
      });
      if (googleBooksCandidates.length > 0) {
        return googleBooksCandidates;
      }
    }

    return [];
  }

  private getFallbackBookQueries(item: Zotero.Item): FallbackBookQuery[] {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return [];
    }

    const authors = this.getItemAuthorNames(item);
    this.logDebug("Built fallback query from Zotero item fields", {
      title,
      authors,
      creators: this.getCreatorDebugInfo(item),
    });
    return [{ title, authors }];
  }

  private async searchOpenLibraryForFallbackISBNs(
    item: Zotero.Item,
    query: FallbackBookQuery,
  ): Promise<FallbackISBNCandidate[]> {
    const authorQuery = query.authors[0]
      ? `&author=${encodeURIComponent(query.authors[0])}`
      : "";

    try {
      this.logDebug("Searching OpenLibrary for fallback ISBNs", { query });
      const response = await Zotero.HTTP.request(
        "GET",
        `https://openlibrary.org/search.json?title=${encodeURIComponent(query.title)}${authorQuery}&fields=title,isbn,author_name&limit=5`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (response.status !== 200) {
        this.logDebug("OpenLibrary fallback search returned non-200", {
          query,
          status: response.status,
        });
        return [];
      }

      const payload = JSON.parse(response.responseText) as {
        docs?: Array<{
          isbn?: string[];
          title?: string;
          author_name?: string[];
        }>;
      };
      this.logDebug("OpenLibrary fallback search returned docs", {
        query,
        docCount: payload.docs?.length ?? 0,
      });

      const candidates: FallbackISBNCandidate[] = [];
      for (const doc of payload.docs ?? []) {
        if (
          !this.isValidFallbackMatch(item, query, doc.title, doc.author_name)
        ) {
          this.logDebug("Rejected OpenLibrary fallback doc", {
            query,
            docTitle: doc.title,
            docAuthors: doc.author_name,
            docISBNs: doc.isbn,
          });
          continue;
        }

        this.logDebug("Accepted OpenLibrary fallback doc", {
          query,
          docTitle: doc.title,
          docAuthors: doc.author_name,
          docISBNs: doc.isbn,
        });
        candidates.push(
          ...this.buildFallbackCandidates(doc.isbn ?? [], "OpenLibrary"),
        );
      }

      return candidates;
    } catch (error) {
      await this.errorManager.handleError(
        this.errorManager.createError(
          ErrorType.API_ERROR,
          `OpenLibrary fallback ISBN search failed for "${query.title}"`,
          {
            title: query.title,
            error: error instanceof Error ? error.message : String(error),
          },
        ),
        { notifyUser: false },
      );
      this.logDebug("OpenLibrary fallback search threw", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async searchGoogleBooksForFallbackISBNs(
    item: Zotero.Item,
    query: FallbackBookQuery,
  ): Promise<FallbackISBNCandidate[]> {
    const authorQuery = query.authors[0]
      ? ` inauthor:"${query.authors[0]}"`
      : "";

    try {
      this.logDebug("Searching Google Books for fallback ISBNs", { query });
      const response = await Zotero.HTTP.request(
        "GET",
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`intitle:"${query.title}"${authorQuery}`)}&maxResults=5`,
        {
          headers: { Accept: "application/json" },
        },
      );
      if (response.status !== 200) {
        this.logDebug("Google Books fallback search returned non-200", {
          query,
          status: response.status,
        });
        return [];
      }

      const payload = JSON.parse(response.responseText) as {
        items?: Array<{
          volumeInfo?: GoogleBooksVolumeInfo & {
            industryIdentifiers?: Array<{
              identifier?: string;
              type?: string;
            }>;
          };
        }>;
      };
      this.logDebug("Google Books fallback search returned items", {
        query,
        itemCount: payload.items?.length ?? 0,
      });

      const candidates: FallbackISBNCandidate[] = [];
      for (const itemInfo of payload.items ?? []) {
        const volumeInfo = itemInfo.volumeInfo;
        if (
          !this.isValidFallbackMatch(
            item,
            query,
            volumeInfo?.title,
            volumeInfo?.authors,
          )
        ) {
          this.logDebug("Rejected Google Books fallback item", {
            query,
            itemTitle: volumeInfo?.title,
            itemAuthors: volumeInfo?.authors,
            itemIdentifiers: volumeInfo?.industryIdentifiers,
          });
          continue;
        }

        this.logDebug("Accepted Google Books fallback item", {
          query,
          itemTitle: volumeInfo?.title,
          itemAuthors: volumeInfo?.authors,
          itemIdentifiers: volumeInfo?.industryIdentifiers,
        });
        candidates.push(
          ...this.buildFallbackCandidates(
            volumeInfo?.industryIdentifiers?.map(
              (identifier) => identifier.identifier ?? "",
            ) ?? [],
            "Google Books",
          ),
        );
      }

      return candidates;
    } catch (error) {
      await this.errorManager.handleError(
        this.errorManager.createError(
          ErrorType.API_ERROR,
          `Google Books fallback ISBN search failed for "${query.title}"`,
          {
            title: query.title,
            error: error instanceof Error ? error.message : String(error),
          },
        ),
        { notifyUser: false },
      );
      this.logDebug("Google Books fallback search threw", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private isValidFallbackMatch(
    item: Zotero.Item,
    query: FallbackBookQuery,
    candidateTitle?: string,
    candidateAuthors: string[] = [],
  ): boolean {
    if (!candidateTitle || !isExactTitleMatch(candidateTitle, query.title)) {
      return false;
    }

    const itemAuthors = this.getItemAuthorNames(item);
    const expectedAuthors =
      itemAuthors.length > 0 ? itemAuthors : query.authors;
    const usableCandidateAuthors = candidateAuthors.filter(
      (author) => author.trim().length > 0,
    );
    if (expectedAuthors.length === 0 || usableCandidateAuthors.length === 0) {
      return true;
    }

    return (
      calculateAuthorOverlap(expectedAuthors, usableCandidateAuthors)
        .overlapRatio >= 0.4
    );
  }

  private getItemAuthorNames(item: Zotero.Item): string[] {
    return item
      .getCreators()
      .filter((creator) => this.isAuthorCreator(creator))
      .map((creator) => this.getCreatorName(creator))
      .filter((author) => author.trim().length > 0);
  }

  private isAuthorCreator(creator: ZoteroCreator): boolean {
    if (creator.creatorType) {
      return creator.creatorType === "author";
    }

    if (typeof creator.creatorTypeID === "number") {
      const creatorTypes = (Zotero as unknown as {
        CreatorTypes?: CreatorTypesWithName;
      }).CreatorTypes;
      const creatorTypeName = creatorTypes?.getName?.(creator.creatorTypeID);
      if (creatorTypeName) {
        return creatorTypeName === "author";
      }

      const authorCreatorTypeID =
        creatorTypes?.getPrimaryIDForType?.("author");
      if (typeof authorCreatorTypeID === "number") {
        return creator.creatorTypeID === authorCreatorTypeID;
      }
    }

    return true;
  }

  private getCreatorName(creator: ZoteroCreator): string {
    const singleFieldName = creator.name ?? "";
    if (singleFieldName.trim()) {
      return singleFieldName.trim();
    }

    return [creator.firstName, creator.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  private getCreatorDebugInfo(item: Zotero.Item): Array<Record<string, unknown>> {
    return item.getCreators().map((creator) => {
      const runtimeCreator = creator as ZoteroCreator & {
        fieldMode?: number;
      };
      return {
        creatorType: runtimeCreator.creatorType,
        creatorTypeID: runtimeCreator.creatorTypeID,
        fieldMode: runtimeCreator.fieldMode,
        firstName: runtimeCreator.firstName,
        lastName: runtimeCreator.lastName,
        name: runtimeCreator.name,
        treatedAsAuthor: this.isAuthorCreator(runtimeCreator),
        extractedName: this.getCreatorName(runtimeCreator),
      };
    });
  }

  private logDebug(message: string, context?: Record<string, unknown>): void {
    try {
      const details = context ? ` ${JSON.stringify(context)}` : "";
      if (typeof Zotero !== "undefined" && Zotero.log) {
        Zotero.log(`Zotadata BookMetadataService: ${message}${details}`);
      }
    } catch {
      // Logging must never affect metadata fetching.
    }
  }

  private buildFallbackCandidates(
    isbns: string[],
    source: FallbackISBNCandidate["source"],
  ): FallbackISBNCandidate[] {
    const candidates = new Map<string, FallbackISBNCandidate>();
    for (const isbn of isbns) {
      const cleanCandidate = cleanISBN(isbn);
      if (!cleanCandidate) {
        continue;
      }

      candidates.set(cleanCandidate, {
        isbn: cleanCandidate,
        source,
      });
    }

    return [...candidates.values()].sort((left, right) => {
      if (left.isbn.length === right.isbn.length) {
        return 0;
      }

      return right.isbn.length - left.isbn.length;
    });
  }

  private storeFallbackEditionISBN(
    item: Zotero.Item,
    fallbackISBN: string,
  ): boolean {
    const line = `${FALLBACK_EDITION_EXTRA_PREFIX} ${fallbackISBN}`;
    const currentExtra = String(item.getField("extra") ?? "").trim();
    if (
      currentExtra.split(/\r?\n/).some((existing) => existing.trim() === line)
    ) {
      this.logDebug("Fallback edition ISBN already present in Extra", {
        fallbackISBN,
        extra: currentExtra,
      });
      return false;
    }

    const nextExtra = currentExtra ? `${currentExtra}\n${line}` : line;
    item.setField("extra", nextExtra);
    this.logDebug("Stored fallback edition ISBN in Extra field", {
      fallbackISBN,
      previousExtra: currentExtra,
      nextExtra,
      readBackExtra: String(item.getField("extra") ?? ""),
    });
    return true;
  }

  private async lookupBookMetadata(
    isbn: string,
    item: Zotero.Item,
  ): Promise<BookMetadataSource | null> {
    this.logDebug("Lookup metadata for ISBN", { isbn });
    const translatorSuccess = await this.fetchBookMetadataViaTranslator(
      isbn,
      item,
    );
    if (translatorSuccess) {
      this.logDebug("Zotero translator metadata lookup succeeded", { isbn });
      return { source: "Zotero Translator", success: true };
    }
    this.logDebug("Zotero translator metadata lookup did not update item", {
      isbn,
    });

    const openLibrary = await this.fetchOpenLibraryMetadata(isbn);
    if (openLibrary) {
      this.logDebug("OpenLibrary metadata lookup succeeded", {
        isbn,
        title: openLibrary.title,
      });
      return openLibrary;
    }
    this.logDebug("OpenLibrary metadata lookup did not return metadata", {
      isbn,
    });

    const googleBooks = await this.fetchGoogleBooksMetadata(isbn);
    if (googleBooks) {
      this.logDebug("Google Books metadata lookup succeeded", {
        isbn,
        title: googleBooks.title,
      });
    } else {
      this.logDebug("Google Books metadata lookup did not return metadata", {
        isbn,
      });
    }
    return googleBooks;
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
        const errorType =
          response.status === 429 ? ErrorType.RATE_LIMIT : ErrorType.API_ERROR;
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
      const metadata = payload[`ISBN:${isbn}`]?.details ?? null;
      this.logDebug("OpenLibrary metadata response parsed", {
        isbn,
        status: response.status,
        found: Boolean(metadata),
      });
      return metadata;
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
        const errorType =
          response.status === 429 ? ErrorType.RATE_LIMIT : ErrorType.API_ERROR;
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
      const metadata = payload.items?.[0]?.volumeInfo ?? null;
      this.logDebug("Google Books metadata response parsed", {
        isbn,
        status: response.status,
        itemCount: payload.items?.length ?? 0,
        found: Boolean(metadata),
      });
      return metadata;
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

  async updateItemWithBookMetadata(
    item: Zotero.Item,
    metadata: OpenLibraryBookMetadata | GoogleBooksVolumeInfo,
  ): Promise<MetadataUpdateResult> {
    const changes: string[] = [];

    const itemAuthors = item
      .getCreators()
      .filter((c) => c.creatorType === "author")
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

    const currentTitle = String(item.getField("title") ?? "");
    if (metadata.title && (!currentTitle || currentTitle.length < 10)) {
      item.setField("title", metadata.title);
      changes.push(`Updated title: ${metadata.title}`);
    }

    const authors = "authors" in metadata ? metadata.authors : undefined;
    if (authors?.length) {
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
    return { changes };
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
      (c) => c.creatorType !== "author",
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
