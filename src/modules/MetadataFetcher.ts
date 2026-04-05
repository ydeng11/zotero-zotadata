import { ErrorManager, ErrorType } from "@/shared/core";
import {
  CrossRefAPI,
  OpenAlexAPI,
  SemanticScholarAPI,
} from "@/features/metadata/apis";
import { DownloadManager } from "@/services/DownloadManager";
import {
  isSearchQueryActionable,
  normalizeDoi,
  parseDoiFromExtra,
} from "@/utils/itemSearchQuery";
import type {
  CrossRefWork,
  ContextualError,
  MetadataResult,
  SearchQuery,
  SearchResult,
  SemanticScholarPaper,
  AttachmentFinderConfig,
} from "@/shared/core/types";

/**
 * Metadata search result with confidence scoring
 */
interface MetadataSearchResult {
  results: SearchResult[];
  source: string;
  query: SearchQuery;
  confidence: number;
  searchTime: number;
}

/**
 * Strategy for combining results from multiple APIs
 */
type SearchStrategy = "parallel" | "fallback" | "best_result";

/**
 * Options for metadata fetching
 */
interface FetchOptions {
  strategy?: SearchStrategy;
  minConfidence?: number;
  maxResults?: number;
  includeOpenAccess?: boolean;
  downloadPDFs?: boolean;
  apis?: string[];
}

interface LegacyFetchResult {
  success: boolean;
  updated: boolean;
  error: string | null;
  source: string;
  changes: string[];
}

interface TranslatorItem {
  deleted?: boolean;
  getCreators(): Array<{
    creatorType?: string;
    firstName?: string;
    lastName?: string;
  }>;
  getField(field: string): string;
  saveTx(): Promise<void>;
}

interface TranslatorSearch {
  getTranslators(): Promise<unknown[]>;
  setIdentifier(identifier: Record<string, unknown>): void;
  setTranslator(translators: unknown[]): void;
  translate(): Promise<TranslatorItem[]>;
}

interface OpenLibraryBookMetadata {
  authors?: Array<{ name?: string } | string>;
  number_of_pages?: number;
  publish_date?: string;
  publishers?: string[];
  title?: string;
}

interface GoogleBooksVolumeInfo {
  authors?: string[];
  pageCount?: number;
  publishedDate?: string;
  publisher?: string;
  title?: string;
}

type BookMetadataSource =
  | { source: "Zotero Translator"; success: true }
  | OpenLibraryBookMetadata
  | GoogleBooksVolumeInfo;

const BOOK_TRANSLATOR_FIELDS = [
  "title",
  "publisher",
  "place",
  "edition",
  "date",
  "numPages",
  "url",
  "abstractNote",
] as const;

const DOI_TRANSLATOR_FIELDS = [
  "title",
  "publicationTitle",
  "volume",
  "issue",
  "pages",
  "date",
  "url",
  "abstractNote",
] as const;

/** Batch fetch: pass `items` to use the caller’s selection (recommended from the plugin). */
export type FetchMetadataForItemsOptions = FetchOptions & {
  items?: Zotero.Item[];
};

/**
 * Metadata fetcher that orchestrates searches across multiple academic APIs
 */
export class MetadataFetcher {
  private errorManager: ErrorManager;
  private crossRefAPI: CrossRefAPI;
  private openAlexAPI: OpenAlexAPI;
  private semanticScholarAPI: SemanticScholarAPI;
  private downloadManager: DownloadManager;
  private config: Partial<AttachmentFinderConfig>;

  constructor(
    addonData: {
      config?: AttachmentFinderConfig;
    } = {},
  ) {
    this.config = addonData.config ?? {};
    this.errorManager = new ErrorManager();

    // Initialize API services
    this.crossRefAPI = new CrossRefAPI();
    this.openAlexAPI = new OpenAlexAPI();
    this.semanticScholarAPI = new SemanticScholarAPI();
    this.downloadManager = new DownloadManager({
      concurrency: this.config.downloads?.maxConcurrent || 3,
      maxRetries: 3,
    });
  }

  /**
   * Fetch metadata for selected Zotero items
   */
  async fetchMetadataForSelectedItems(
    options: FetchMetadataForItemsOptions = {},
  ): Promise<MetadataResult[]> {
    const selectedItems =
      options.items !== undefined
        ? options.items.filter((item) => item.isRegularItem())
        : this.getSelectedItems();

    if (selectedItems.length === 0) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        "No items selected for metadata fetching",
      );
    }

    const { items: _items, ...perItemOptions } = options;
    const results = await Promise.allSettled(
      selectedItems.map((item) =>
        this.fetchMetadataForItem(item, perItemOptions),
      ),
    );

    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          success: false,
          item: selectedItems[index],
          source: "MetadataFetcher",
          changes: [],
          errors: [this.formatSettledReason(result.reason)],
        };
      }
    });
  }

  /**
   * Fetch metadata for a single Zotero item
   */
  async fetchMetadataForItem(
    item: Zotero.Item,
    options: FetchOptions = {},
  ): Promise<MetadataResult> {
    return this.errorManager.wrapAsync(
      async () => {
        const itemType = Zotero.ItemTypes.getName(item.itemTypeID);
        let legacyResult: LegacyFetchResult | null = null;

        if (
          itemType === "journalArticle" ||
          itemType === "conferencePaper" ||
          itemType === "preprint"
        ) {
          legacyResult = await this.fetchDOIBasedMetadata(item);
        } else if (itemType === "book") {
          legacyResult = await this.fetchISBNBasedMetadata(item);
        }

        if (legacyResult) {
          return {
            success: legacyResult.success,
            item,
            source: legacyResult.source,
            changes: legacyResult.changes,
            errors: legacyResult.error ? [legacyResult.error] : [],
          };
        }

        const query = this.buildSearchQuery(item);
        if (!isSearchQueryActionable(query)) {
          return {
            success: false,
            item,
            source: "MetadataFetcher",
            changes: [],
            errors: [
              "Add a title, DOI, authors, or arXiv ID (in Extra) before fetching metadata.",
            ],
          };
        }

        const searchResults = await this.searchMultipleAPIs(query, options);

        if (searchResults.length === 0) {
          return {
            success: false,
            item,
            source: "MetadataFetcher",
            changes: [],
            errors: ["No metadata found from any source"],
          };
        }

        const bestResult = this.selectBestResult(searchResults, options);
        const changes = await this.applyMetadataToItem(
          item,
          bestResult,
          query,
          options,
        );

        return {
          success: true,
          item,
          source: bestResult.source,
          changes,
          errors: [],
        };
      },
      ErrorType.API_ERROR,
      { operation: "fetchMetadataForItem", itemId: item.id },
    );
  }

  /**
   * Search for metadata by DOI
   */
  async searchByDOI(
    doi: string,
    options: FetchOptions = {},
  ): Promise<SearchResult[]> {
    const query: SearchQuery = { doi };
    const searchResults = await this.searchMultipleAPIs(query, options);

    return searchResults
      .flatMap((result) => result.results)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Search for metadata by title and authors
   */
  async searchByTitleAndAuthors(
    title: string,
    authors: string[],
    year?: number,
    options: FetchOptions = {},
  ): Promise<SearchResult[]> {
    const query: SearchQuery = { title, authors, year };
    const searchResults = await this.searchMultipleAPIs(query, options);

    return searchResults
      .flatMap((result) => result.results)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Search for open access versions
   */
  async findOpenAccessVersions(
    query: SearchQuery,
    options: FetchOptions = {},
  ): Promise<SearchResult[]> {
    const openAccessOptions = { ...options, includeOpenAccess: true };
    const searchResults = await this.searchMultipleAPIs(
      query,
      openAccessOptions,
    );

    return searchResults
      .flatMap((result) => result.results)
      .filter((result) => result.pdfUrl)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Legacy DOI extraction behavior from the monolithic plugin.
   */
  extractDOI(item: Zotero.Item): string | null {
    const doiField = String(item.getField("DOI") ?? "").trim();
    if (doiField) {
      return normalizeDoi(doiField);
    }

    const url = String(item.getField("url") ?? "");
    const urlMatch = url.match(/10\.\d{4,}\/[^\s]+/i);
    if (urlMatch) {
      return normalizeDoi(urlMatch[0]);
    }

    const extra = String(item.getField("extra") ?? "");
    return parseDoiFromExtra(extra) ?? null;
  }

  /**
   * Legacy ISBN extraction behavior from the monolithic plugin.
   */
  extractISBN(item: Zotero.Item): string | null {
    const isbnField = String(item.getField("ISBN") ?? "").trim();
    if (isbnField) {
      return this.cleanISBN(isbnField);
    }

    const extra = String(item.getField("extra") ?? "");
    const match = extra.match(/ISBN[:\-\s]*([0-9\-xX]{10,17})/i);
    return match ? this.cleanISBN(match[1]) : null;
  }

  async fetchDOIBasedMetadata(item: Zotero.Item): Promise<LegacyFetchResult> {
    const changes: string[] = [];
    let doi = this.extractDOI(item);

    if (!doi) {
      doi = await this.discoverDOI(item);
      if (doi) {
        item.setField("DOI", doi);
        item.addTag("DOI Added", 1);
        await item.saveTx();
        changes.push(`Added DOI: ${doi}`);
      }
    }

    if (!doi) {
      item.addTag("No DOI Found", 1);
      await item.saveTx();
      return {
        success: false,
        updated: false,
        error: "No DOI found",
        source: "MetadataFetcher",
        changes,
      };
    }

    const translatorSuccess = await this.fetchDOIMetadataViaTranslator(
      doi,
      item,
    );
    if (translatorSuccess) {
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
            : [`Updated metadata via Zotero translator for DOI ${doi}`],
      };
    }

    const metadata = await this.fetchCrossRefMetadata(doi);
    if (!metadata) {
      const supplementalChanges = await this.supplementDOIMetadata(item, doi);
      if (supplementalChanges.length > 0 || changes.length > 0) {
        changes.push(...supplementalChanges);
        item.addTag("Metadata Updated", 1);
        item.addTag("Via DOI APIs", 1);
        await item.saveTx();
        return {
          success: true,
          updated: true,
          error: null,
          source: "DOI APIs",
          changes,
        };
      }

      item.addTag("CrossRef Failed", 1);
      await item.saveTx();
      return {
        success: false,
        updated: changes.length > 0,
        error: "CrossRef API failed",
        source: "CrossRef",
        changes,
      };
    }

    changes.push(...(await this.updateItemWithMetadata(item, metadata)));
    changes.push(...(await this.supplementDOIMetadata(item, doi)));

    if (changes.length === 0) {
      return {
        success: false,
        updated: false,
        error: "No metadata changes were applied",
        source: "CrossRef",
        changes,
      };
    }

    item.addTag("Metadata Updated", 1);
    item.addTag("Via CrossRef API", 1);
    await item.saveTx();

    return {
      success: true,
      updated: true,
      error: null,
      source: "CrossRef",
      changes,
    };
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
        source: "MetadataFetcher",
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

  async discoverDOI(item: Zotero.Item): Promise<string | null> {
    const strategies = [
      () => this.searchCrossRefForDOI(item),
      () => this.searchOpenAlexForDOI(item),
      () => this.searchSemanticScholarForDOI(item),
      () => this.searchDBLPForDOI(item),
      () => this.searchGoogleScholarForDOI(item),
    ];

    for (const strategy of strategies) {
      const doi = await strategy();
      if (doi) {
        return doi;
      }
    }

    return null;
  }

  async discoverISBN(item: Zotero.Item): Promise<string | null> {
    const strategies = [
      () => this.searchOpenLibraryForISBN(item),
      () => this.searchGoogleBooksForISBN(item),
    ];

    for (const strategy of strategies) {
      const isbn = await strategy();
      if (isbn) {
        return isbn;
      }
    }

    return null;
  }

  async searchCrossRefForDOI(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    const works = await this.crossRefAPI.fetchWorksByQuery(
      this.buildSearchQuery(item),
    );
    for (const work of works) {
      const workTitle = Array.isArray(work.title) ? work.title[0] : work.title;
      if (
        work.DOI &&
        workTitle &&
        this.titleSimilarity(workTitle, title) > 0.8
      ) {
        return normalizeDoi(work.DOI);
      }
    }
    return null;
  }

  async searchOpenAlexForDOI(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    const exact = await this.searchOpenAlexExact(item, title);
    if (exact) {
      return exact;
    }

    return this.searchOpenAlexTitleOnly(item, title);
  }

  async searchOpenAlexExact(
    item: Zotero.Item,
    title: string,
  ): Promise<string | null> {
    const query = this.buildSearchQuery(item);
    const results = await this.openAlexAPI.searchExact(query);
    return this.pickDoiBySimilarity(results, title, 0.95);
  }

  async searchOpenAlexTitleOnly(
    item: Zotero.Item,
    title: string,
  ): Promise<string | null> {
    const results = await this.openAlexAPI.search({
      title,
      year: this.extractYear(item),
    });
    return this.pickDoiBySimilarity(results, title, 0.9);
  }

  async searchSemanticScholarForDOI(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    const exact = await this.searchSemanticScholarExact(item, title);
    if (exact) {
      return exact;
    }

    return this.searchSemanticScholarRelaxed(item, title);
  }

  async searchSemanticScholarExact(
    item: Zotero.Item,
    title: string,
  ): Promise<string | null> {
    const papers = await this.semanticScholarAPI.searchPapersWithExternalIds(
      this.buildSemanticScholarExactQuery(item, title),
      3,
    );
    return this.pickSemanticScholarDoi(papers, title, 0.95);
  }

  async searchSemanticScholarRelaxed(
    _item: Zotero.Item,
    title: string,
  ): Promise<string | null> {
    const cleaned = title
      .replace(/[^\w\s]/g, " ")
      .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const papers = await this.semanticScholarAPI.searchPapersWithExternalIds(
      cleaned,
      10,
    );
    return this.pickSemanticScholarDoi(papers, title, 0.9);
  }

  async searchDBLPForDOI(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    try {
      const cleanTitle = encodeURIComponent(
        title.replace(/[^\w\s]/g, " ").trim(),
      );
      const response = await Zotero.HTTP.request(
        "GET",
        `https://dblp.org/search/publ/api?q=${cleanTitle}&format=json&h=10`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        result?: {
          hits?: {
            hit?:
              | Array<{ info?: { doi?: string; title?: string } }>
              | { info?: { doi?: string; title?: string } };
          };
        };
      };
      const hitValue = payload.result?.hits?.hit;
      const hits = Array.isArray(hitValue)
        ? hitValue
        : hitValue
          ? [hitValue]
          : [];
      for (const hit of hits) {
        const doi = hit.info?.doi;
        const hitTitle = hit.info?.title;
        if (doi && hitTitle && this.titleSimilarity(hitTitle, title) > 0.9) {
          return normalizeDoi(doi);
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async searchGoogleScholarForDOI(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    let query = `"${title}"`;
    const firstAuthor = item.getCreators()[0];
    if (firstAuthor?.lastName) {
      query += ` author:"${firstAuthor.lastName}"`;
    }

    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}&hl=en&num=5`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const html = String(response.responseText ?? "");
      const directMatch = html.match(/10\.\d{4,}\/[^\s\],"';<)]+/i);
      if (directMatch?.[0]) {
        return normalizeDoi(directMatch[0].replace(/[.,;'")\]]+$/, ""));
      }

      const linkMatch = html.match(
        /https?:\/\/(?:dx\.)?doi\.org\/([^"'&<>\s]+)/i,
      );
      if (linkMatch?.[1]) {
        return normalizeDoi(linkMatch[1].replace(/[.,;'")\]]+$/, ""));
      }
    } catch {
      return null;
    }

    return null;
  }

  async supplementDOIMetadata(
    item: Zotero.Item,
    doi: string,
  ): Promise<string[]> {
    const changes: string[] = [];
    const openAlexResult = await this.openAlexAPI.getWorkByDOI(doi);
    if (!openAlexResult) {
      return changes;
    }

    if (
      openAlexResult.authors?.length &&
      (await this.shouldUpdateAuthors(item, openAlexResult.authors))
    ) {
      await this.updateItemAuthors(item, openAlexResult.authors);
      changes.push(`Updated authors: ${openAlexResult.authors.join(", ")}`);
    }

    const currentTitle = String(item.getField("title") ?? "").trim();
    if (
      openAlexResult.title &&
      (!currentTitle ||
        this.shouldUpdateTitle(currentTitle, openAlexResult.title))
    ) {
      item.setField("title", openAlexResult.title);
      changes.push(`Updated title: ${openAlexResult.title}`);
    }

    const currentDate = String(item.getField("date") ?? "").trim();
    if (!currentDate && openAlexResult.year) {
      item.setField("date", String(openAlexResult.year));
      changes.push(`Updated date: ${openAlexResult.year}`);
    }

    if (changes.length > 0) {
      await item.saveTx();
    }

    return changes;
  }

  async searchOpenLibraryForISBN(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://openlibrary.org/search.json?q=${encodeURIComponent(title)}&limit=5`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        docs?: Array<{ isbn?: string[]; title?: string }>;
      };
      for (const doc of payload.docs ?? []) {
        if (
          doc.isbn?.[0] &&
          doc.title &&
          this.titleSimilarity(doc.title, title) > 0.8
        ) {
          return this.cleanISBN(doc.isbn[0]);
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async searchGoogleBooksForISBN(item: Zotero.Item): Promise<string | null> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return null;
    }

    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`intitle:"${title}"`)}&maxResults=5`,
        {
          headers: {
            Accept: "application/json",
          },
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
        if (
          volumeInfo?.title &&
          this.titleSimilarity(volumeInfo.title, title) > 0.8
        ) {
          const identifier = volumeInfo.industryIdentifiers?.find(
            (entry) => entry.type === "ISBN_13" || entry.type === "ISBN_10",
          );
          if (identifier?.identifier) {
            return this.cleanISBN(identifier.identifier);
          }
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async fetchCrossRefMetadata(doi: string): Promise<CrossRefWork | null> {
    return this.crossRefAPI.getCrossRefWorkMessage(doi);
  }

  async fetchBookMetadata(
    isbn: string,
    item: Zotero.Item,
  ): Promise<BookMetadataSource | null> {
    const metadata = await this.lookupBookMetadata(isbn, item);
    if (metadata) {
      return metadata;
    }

    return this.tryAlternativeISBNFormats(isbn, item);
  }

  async fetchBookMetadataViaTranslator(
    isbn: string,
    item: Zotero.Item,
  ): Promise<boolean> {
    return this.applyTranslatorMetadata(
      item,
      { itemType: "book", ISBN: isbn },
      BOOK_TRANSLATOR_FIELDS,
    );
  }

  async fetchDOIMetadataViaTranslator(
    doi: string,
    item: Zotero.Item,
  ): Promise<boolean> {
    return this.applyTranslatorMetadata(
      item,
      {
        itemType: Zotero.ItemTypes.getName(item.itemTypeID),
        DOI: doi,
      },
      DOI_TRANSLATOR_FIELDS,
      {
        allowMoreCompleteReplacement: true,
        finalizeChange: () => {
          if (String(item.getField("DOI") ?? "").trim()) {
            return false;
          }

          item.setField("DOI", doi);
          return true;
        },
      },
    );
  }

  async tryAlternativeISBNFormats(
    originalISBN: string,
    item: Zotero.Item,
  ): Promise<BookMetadataSource | null> {
    for (const candidate of this.buildAlternativeISBNCandidates(originalISBN)) {
      const metadata = await this.lookupBookMetadata(candidate, item);
      if (metadata) {
        return metadata;
      }
    }

    return null;
  }

  convertISBN10to13(isbn10: string): string | null {
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

  convertISBN13to10(isbn13: string): string | null {
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

  formatISBNWithHyphens(isbn: string): string {
    if (isbn.length === 10) {
      return `${isbn.slice(0, 1)}-${isbn.slice(1, 6)}-${isbn.slice(6, 9)}-${isbn.slice(9)}`;
    }

    if (isbn.length === 13) {
      return `${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 9)}-${isbn.slice(9, 12)}-${isbn.slice(12)}`;
    }

    return isbn;
  }

  async fetchOpenLibraryMetadata(
    isbn: string,
  ): Promise<OpenLibraryBookMetadata | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=details`,
        {
          headers: {
            Accept: "application/json",
          },
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

  async fetchGoogleBooksMetadata(
    isbn: string,
  ): Promise<GoogleBooksVolumeInfo | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`,
        {
          headers: {
            Accept: "application/json",
          },
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

  async updateItemWithMetadata(
    item: Zotero.Item,
    metadata: CrossRefWork,
  ): Promise<string[]> {
    const changes: string[] = [];
    const currentTitle = String(item.getField("title") ?? "");
    const metadataTitle = Array.isArray(metadata.title)
      ? metadata.title[0]
      : metadata.title;
    if (metadataTitle && (!currentTitle || currentTitle.length < 10)) {
      item.setField("title", metadataTitle);
      changes.push(`Updated title: ${metadataTitle}`);
    }

    if (metadata.author?.length && item.getCreators().length === 0) {
      this.applyCrossRefAuthors(item, metadata.author);
      changes.push(`Updated authors: ${metadata.author.length}`);
    }

    const containerTitle = metadata["container-title"]?.[0];
    if (containerTitle) {
      item.setField("publicationTitle", containerTitle);
      changes.push(`Updated publication title: ${containerTitle}`);
    }

    const year = metadata.published?.["date-parts"]?.[0]?.[0];
    if (year) {
      item.setField("date", String(year));
      changes.push(`Updated date: ${year}`);
    }

    if (metadata.volume) {
      item.setField("volume", metadata.volume);
      changes.push(`Updated volume: ${metadata.volume}`);
    }
    if (metadata.issue) {
      item.setField("issue", metadata.issue);
      changes.push(`Updated issue: ${metadata.issue}`);
    }
    if (metadata.page) {
      item.setField("pages", metadata.page);
      changes.push(`Updated pages: ${metadata.page}`);
    }
    if (metadata.URL && !String(item.getField("url") ?? "").trim()) {
      item.setField("url", metadata.URL);
      changes.push(`Updated URL: ${metadata.URL}`);
    }

    await item.saveTx();
    return changes;
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
    if (authors?.length && item.getCreators().length === 0) {
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

  titleSimilarity(title1: string, title2: string): number {
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

  /**
   * Search multiple APIs according to strategy
   */
  private async searchMultipleAPIs(
    query: SearchQuery,
    options: FetchOptions = {},
  ): Promise<MetadataSearchResult[]> {
    const strategy = options.strategy || "parallel";
    const enabledAPIs = options.apis || [
      "crossref",
      "openalex",
      "semanticscholar",
    ];

    switch (strategy) {
      case "parallel":
        return this.searchParallel(query, enabledAPIs, options);

      case "fallback":
        return this.searchFallback(query, enabledAPIs, options);

      case "best_result":
        return this.searchBestResult(query, enabledAPIs, options);

      default:
        return this.searchParallel(query, enabledAPIs, options);
    }
  }

  /**
   * Search all APIs in parallel
   */
  private async searchParallel(
    query: SearchQuery,
    apis: string[],
    options: FetchOptions,
  ): Promise<MetadataSearchResult[]> {
    const searchPromises = apis.map(async (api) => {
      return this.searchSingleAPI(api, query, options);
    });

    const results = await Promise.allSettled(searchPromises);

    return results
      .filter(
        (result): result is PromiseFulfilledResult<MetadataSearchResult> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value)
      .filter((result) => result.results.length > 0);
  }

  /**
   * Search APIs in fallback order (stop on first success)
   */
  private async searchFallback(
    query: SearchQuery,
    apis: string[],
    options: FetchOptions,
  ): Promise<MetadataSearchResult[]> {
    for (const api of apis) {
      try {
        const result = await this.searchSingleAPI(api, query, options);
        if (result.results.length > 0) {
          return [result];
        }
      } catch {
        // Continue to next API
        continue;
      }
    }

    return [];
  }

  /**
   * Search all APIs and return only the best overall result
   */
  private async searchBestResult(
    query: SearchQuery,
    apis: string[],
    options: FetchOptions,
  ): Promise<MetadataSearchResult[]> {
    const allResults = await this.searchParallel(query, apis, options);

    if (allResults.length === 0) {
      return [];
    }

    // Find result with highest confidence
    const bestResult = allResults.reduce((best, current) => {
      const bestConfidence = Math.max(...best.results.map((r) => r.confidence));
      const currentConfidence = Math.max(
        ...current.results.map((r) => r.confidence),
      );
      return currentConfidence > bestConfidence ? current : best;
    });

    return [bestResult];
  }

  /**
   * Search a single API
   */
  private async searchSingleAPI(
    apiName: string,
    query: SearchQuery,
    options: FetchOptions,
  ): Promise<MetadataSearchResult> {
    const startTime = Date.now();

    let results: SearchResult[] = [];
    const source = apiName;

    try {
      switch (apiName.toLowerCase()) {
        case "crossref":
          if (query.doi) {
            const doiResult = await this.crossRefAPI.getWorkByDOI(query.doi);
            results = doiResult ? [doiResult] : [];
          } else {
            results = await this.crossRefAPI.search(query);
          }
          break;

        case "openalex":
          if (options.includeOpenAccess) {
            results = await this.openAlexAPI.searchOpenAccess(query);
          } else if (query.doi) {
            const doiResult = await this.openAlexAPI.getWorkByDOI(query.doi);
            results = doiResult ? [doiResult] : [];
          } else {
            results = await this.openAlexAPI.search(query);
          }
          break;

        case "semanticscholar":
          if (options.includeOpenAccess) {
            results = await this.semanticScholarAPI.searchOpenAccess(query);
          } else if (query.doi) {
            const doiResult = await this.semanticScholarAPI.getPaperByDOI(
              query.doi,
            );
            results = doiResult ? [doiResult] : [];
          } else if (query.arxivId) {
            results = await this.semanticScholarAPI.searchByArxivId(
              query.arxivId,
            );
          } else {
            results = await this.semanticScholarAPI.search(query);
          }
          break;

        default:
          throw new Error(`Unknown API: ${apiName}`);
      }

      // Filter by minimum confidence
      if (options.minConfidence) {
        const minConfidence = options.minConfidence;
        results = results.filter(
          (result) => result.confidence >= minConfidence,
        );
      }

      // Limit results
      if (options.maxResults) {
        results = results.slice(0, options.maxResults);
      }

      const searchTime = Date.now() - startTime;
      const confidence =
        results.length > 0 ? Math.max(...results.map((r) => r.confidence)) : 0;

      return {
        results,
        source,
        query,
        confidence,
        searchTime,
      };
    } catch (error) {
      // BaseMetadataAPI.wrapAsync already logged API failures; avoid duplicate alerts.
      const alreadyHandled =
        error instanceof Error &&
        "type" in error &&
        Object.values(ErrorType).includes((error as ContextualError).type);

      if (!alreadyHandled) {
        const contextualError = this.errorManager.createFromUnknown(
          error,
          ErrorType.API_ERROR,
          { api: apiName, query },
        );
        await this.errorManager.handleError(contextualError);
      }

      return {
        results: [],
        source,
        query,
        confidence: 0,
        searchTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Select the best result from multiple search results
   */
  private selectBestResult(
    searchResults: MetadataSearchResult[],
    options: FetchOptions,
  ): SearchResult {
    // Flatten all results
    const allResults = searchResults.flatMap((search) => search.results);

    if (allResults.length === 0) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        "No search results to select from",
      );
    }

    // Sort by confidence score
    allResults.sort((a, b) => b.confidence - a.confidence);

    // If looking for open access, prioritize results with PDFs
    if (options.includeOpenAccess) {
      const openAccessResults = allResults.filter((result) => result.pdfUrl);
      if (openAccessResults.length > 0) {
        return openAccessResults[0];
      }
    }

    return allResults[0];
  }

  /**
   * Apply metadata to Zotero item
   */
  private async applyMetadataToItem(
    item: Zotero.Item,
    searchResult: SearchResult,
    query: SearchQuery,
    options: FetchOptions,
  ): Promise<string[]> {
    const changes: string[] = [];

    try {
      const strongMatch = this.isStrongMetadataMatch(query, searchResult);

      // Update title when we trust the API match or the heuristic says so
      const currentTitle = (item.getField("title") as string) || "";
      if (
        searchResult.title &&
        (strongMatch ||
          !currentTitle.trim() ||
          this.shouldUpdateTitle(currentTitle, searchResult.title))
      ) {
        item.setField("title", searchResult.title);
        changes.push(`Updated title: ${searchResult.title}`);
      }

      // Update DOI if available and missing
      if (searchResult.doi && !item.getField("DOI")) {
        item.setField("DOI", searchResult.doi);
        changes.push(`Added DOI: ${searchResult.doi}`);
      }

      // Update year if available and missing
      if (searchResult.year && !item.getField("date")) {
        item.setField("date", searchResult.year.toString());
        changes.push(`Added year: ${searchResult.year}`);
      }

      // Update authors when the match is strong or the heuristic says so
      if (searchResult.authors && searchResult.authors.length > 0) {
        const shouldUpdateAuthors =
          strongMatch ||
          (await this.shouldUpdateAuthors(item, searchResult.authors));
        if (shouldUpdateAuthors) {
          await this.updateItemAuthors(item, searchResult.authors);
          changes.push(`Updated authors: ${searchResult.authors.join(", ")}`);
        }
      }

      // Download PDF if requested and available
      if (options.downloadPDFs && searchResult.pdfUrl) {
        try {
          const downloadResult = await this.downloadManager.downloadFile(
            searchResult.pdfUrl,
            {
              timeout: 60000,
              maxFileSize: 100 * 1024 * 1024, // 100MB limit
            },
          );

          if (downloadResult.success && downloadResult.data) {
            const attachment = await this.createAttachmentFromData(
              item,
              downloadResult.data,
              searchResult.title,
              searchResult.source,
            );

            if (attachment) {
              changes.push(`Downloaded PDF from ${searchResult.source}`);
            }
          }
        } catch (error) {
          // PDF download failure shouldn't fail the entire operation
          const msg = error instanceof Error ? error.message : String(error);
          changes.push(`Failed to download PDF: ${msg}`);
        }
      }

      // Save item if changes were made
      if (changes.length > 0) {
        await item.saveTx();
      }

      return changes;
    } catch (error) {
      const contextualError = this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { itemId: item.id, searchResult },
      );

      await this.errorManager.handleError(contextualError);
      throw contextualError;
    }
  }

  /**
   * True when the retrieved record clearly corresponds to the item (safe to overwrite fields).
   */
  private isStrongMetadataMatch(
    query: SearchQuery,
    searchResult: SearchResult,
  ): boolean {
    if (searchResult.confidence >= 0.92) {
      return true;
    }
    const q = query.doi ? normalizeDoi(query.doi) : "";
    const r = searchResult.doi ? normalizeDoi(searchResult.doi) : "";
    if (q && r && q === r) {
      return true;
    }
    return false;
  }

  /**
   * Build search query from Zotero item
   */
  private buildSearchQuery(item: Zotero.Item): SearchQuery {
    const query: SearchQuery = {};

    // Extract title
    const title = item.getField("title");
    if (title) {
      query.title = title;
    }

    // Extract DOI (standard field, then Extra — many items only store DOI in Extra)
    const extraField = (item.getField("extra") as string) ?? "";
    const doiField = (item.getField("DOI") as string)?.trim();
    if (doiField) {
      query.doi = normalizeDoi(doiField);
    } else {
      const fromExtra = parseDoiFromExtra(extraField);
      if (fromExtra) {
        query.doi = fromExtra;
      }
    }

    // Extract year
    const date = item.getField("date");
    if (date) {
      const year = parseInt(date);
      if (!isNaN(year)) {
        query.year = year;
      }
    }

    // Extract authors
    const creators = item.getCreators();
    if (creators && creators.length > 0) {
      query.authors = creators
        .filter((creator) => creator.creatorType === "author")
        .map((creator) =>
          `${creator.firstName || ""} ${creator.lastName || ""}`.trim(),
        )
        .filter((name) => name.length > 0);
    }

    const arxivMatch = extraField.match(/arXiv:\s*([^\s]+)/i);
    if (arxivMatch) {
      query.arxivId = arxivMatch[1];
    }

    return query;
  }

  /** Safe message for Promise.allSettled rejection reasons (may not be an Error). */
  private formatSettledReason(reason: unknown): string {
    if (reason instanceof Error) {
      return reason.message || "Unknown error";
    }
    if (typeof reason === "string") {
      return reason;
    }
    if (reason !== null && typeof reason === "object" && "message" in reason) {
      const m = (reason as { message: unknown }).message;
      if (typeof m === "string") {
        return m;
      }
    }
    return "Unknown error";
  }

  /**
   * Get selected Zotero items
   */
  private getSelectedItems(): Zotero.Item[] {
    const zoteroPane = Zotero.getActiveZoteroPane();
    if (!zoteroPane) {
      throw this.errorManager.createError(
        ErrorType.ZOTERO_ERROR,
        "No active Zotero pane found",
      );
    }

    const selectedItems = zoteroPane.getSelectedItems();
    return selectedItems.filter((item) => item.isRegularItem());
  }

  /**
   * Check if title should be updated
   */
  private shouldUpdateTitle(currentTitle: string, newTitle: string): boolean {
    if (!currentTitle) return true;
    if (!newTitle) return false;

    // Calculate similarity
    const similarity = this.calculateStringSimilarity(
      currentTitle.toLowerCase(),
      newTitle.toLowerCase(),
    );

    // Update if new title is significantly better (less similarity suggests improvement)
    return similarity < 0.8 && newTitle.length > currentTitle.length;
  }

  /**
   * Check if authors should be updated
   */
  private async shouldUpdateAuthors(
    item: Zotero.Item,
    newAuthors: string[],
  ): Promise<boolean> {
    const currentCreators = item.getCreators();
    const currentAuthors = currentCreators
      .filter((creator) => creator.creatorType === "author")
      .map((creator) =>
        `${creator.firstName || ""} ${creator.lastName || ""}`.trim(),
      );

    if (currentAuthors.length === 0) return true;
    if (newAuthors.length === 0) return false;

    // Don't update if we have significantly more authors already
    if (currentAuthors.length > newAuthors.length * 1.5) return false;

    return newAuthors.length > currentAuthors.length;
  }

  /**
   * Update item authors
   */
  private async updateItemAuthors(
    item: Zotero.Item,
    authors: string[],
  ): Promise<void> {
    // Remove existing authors
    const creators = item.getCreators();
    const nonAuthors = creators.filter(
      (creator) => creator.creatorType !== "author",
    );

    // Add new authors
    const newCreators = authors.map((authorName) => {
      const parts = authorName.split(" ");
      const lastName = parts.pop() || "";
      const firstName = parts.join(" ");

      return {
        creatorType: "author",
        firstName,
        lastName,
      };
    });

    // Combine with existing non-author creators
    item.setCreators([...newCreators, ...nonAuthors]);
  }

  /**
   * Create attachment from downloaded data
   */
  private async createAttachmentFromData(
    item: Zotero.Item,
    data: ArrayBuffer,
    title: string,
    source: string,
  ): Promise<Zotero.Item | null> {
    try {
      const fileName = `${title.replace(/[^\w\s]/g, "").substring(0, 50)}.pdf`;

      // Create attachment using Zotero's API
      const attachment = await Zotero.Attachments.importFromBuffer({
        buffer: data,
        fileName,
        contentType: "application/pdf",
        parentItemID: item.id,
      });

      if (attachment) {
        // Add note about source
        attachment.setNote(`Downloaded from ${source} by Zotadata`);
        await attachment.saveTx();
      }

      return attachment;
    } catch (error) {
      throw this.errorManager.createFromUnknown(error, ErrorType.FILE_ERROR, {
        operation: "createAttachment",
        title,
        source,
      });
    }
  }

  /**
   * Calculate string similarity (0-1, where 1 is identical)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/).filter((w) => w.length > 2));
    const words2 = new Set(str2.split(/\s+/).filter((w) => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word)),
    );
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private cleanISBN(isbn: string): string {
    try {
      if (typeof Zotero !== "undefined" && Zotero.Utilities?.cleanISBN) {
        return Zotero.Utilities.cleanISBN(isbn);
      }
    } catch {
      return isbn.replace(/[-\s]/g, "");
    }

    return isbn.replace(/[-\s]/g, "");
  }

  private extractYear(item: Zotero.Item): number | undefined {
    const rawDate = String(item.getField("date") ?? "").trim();
    if (!rawDate) {
      return undefined;
    }

    const parsed = Number.parseInt(rawDate, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    const zoteroWithDate = Zotero as typeof Zotero & {
      Date?: {
        strToDate?: (value: string) => { year?: number | string };
      };
    };
    const year = zoteroWithDate.Date?.strToDate?.(rawDate)?.year;
    if (typeof year === "number") {
      return year;
    }
    if (typeof year === "string") {
      const parsedYear = Number.parseInt(year, 10);
      return Number.isNaN(parsedYear) ? undefined : parsedYear;
    }
    return undefined;
  }

  private pickDoiBySimilarity(
    results: SearchResult[],
    title: string,
    minSimilarity: number,
  ): string | null {
    for (const result of results) {
      if (
        result.doi &&
        result.title &&
        this.titleSimilarity(result.title, title) > minSimilarity
      ) {
        return normalizeDoi(result.doi);
      }
    }
    return null;
  }

  private pickSemanticScholarDoi(
    papers: SemanticScholarPaper[],
    title: string,
    minSimilarity: number,
  ): string | null {
    for (const paper of papers) {
      const candidate = String(paper.title ?? "").trim();
      if (
        !candidate ||
        this.titleSimilarity(candidate, title) <= minSimilarity
      ) {
        continue;
      }

      const doi = paper.doi ?? paper.externalIds?.DOI;
      if (doi) {
        return normalizeDoi(doi);
      }
    }
    return null;
  }

  private buildSemanticScholarExactQuery(
    item: Zotero.Item,
    title: string,
  ): string {
    let query = `title:"${title}"`;
    const firstAuthor = item.getCreators()[0];
    if (firstAuthor?.lastName) {
      query += ` author:"${firstAuthor.lastName}"`;
      if (firstAuthor.firstName) {
        query += ` author:"${firstAuthor.firstName}"`;
      }
    }
    return query;
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

  private isTranslatorBookMetadata(
    metadata: BookMetadataSource,
  ): metadata is { source: "Zotero Translator"; success: true } {
    return "source" in metadata && metadata.source === "Zotero Translator";
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

  private buildAlternativeISBNCandidates(originalISBN: string): string[] {
    const cleanISBN = originalISBN.replace(/[-\s]/g, "");
    const candidates = new Set<string>([
      cleanISBN,
      this.formatISBNWithHyphens(cleanISBN),
    ]);

    if (cleanISBN.length === 10) {
      const isbn13 = this.convertISBN10to13(cleanISBN);
      if (isbn13) {
        candidates.add(isbn13);
      }
    }

    if (cleanISBN.length === 13) {
      const isbn10 = this.convertISBN13to10(cleanISBN);
      if (isbn10) {
        candidates.add(isbn10);
      }
    }

    return [...candidates].filter(
      (candidate) => Boolean(candidate) && candidate !== originalISBN,
    );
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
      const translated = await this.translateFirstItem(translate);
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

  private async translateFirstItem(
    translate: TranslatorSearch,
  ): Promise<TranslatorItem | null> {
    const translators = await translate.getTranslators();
    if (!translators.length) {
      return null;
    }

    translate.setTranslator(translators);
    const [translated] = await translate.translate();
    return translated ?? null;
  }

  private applyTranslatedFields(
    item: Zotero.Item,
    translated: TranslatorItem,
    fields: readonly string[],
  ): boolean {
    let changed = false;

    for (const field of fields) {
      changed =
        this.updateFieldFromTranslatedItem(item, translated, field) || changed;
    }

    return changed;
  }

  private updateFieldFromTranslatedItem(
    item: Zotero.Item,
    translated: TranslatorItem,
    field: string,
  ): boolean {
    const newValue = String(translated.getField(field) ?? "").trim();
    if (!newValue) {
      return false;
    }

    const currentValue = String(item.getField(field) ?? "").trim();
    if (
      !currentValue ||
      currentValue.length < 10 ||
      currentValue !== newValue
    ) {
      item.setField(field, newValue);
      return true;
    }
    return false;
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

  private applyCrossRefAuthors(
    item: Zotero.Item,
    authors: Array<{ given?: string; family: string }>,
  ): void {
    const editableItem = item as Zotero.Item & {
      numCreators?: () => number;
      setCreator?: (
        index: number,
        creator: {
          creatorTypeID: number;
          firstName: string;
          lastName: string;
        },
      ) => void;
    };

    if (typeof editableItem.setCreator === "function") {
      const creatorTypeID = (
        Zotero as typeof Zotero & {
          CreatorTypes?: { getPrimaryIDForType: (typeID: number) => number };
        }
      ).CreatorTypes?.getPrimaryIDForType(item.itemTypeID);

      authors.forEach((author) => {
        editableItem.setCreator?.(editableItem.numCreators?.() ?? 0, {
          creatorTypeID: creatorTypeID ?? 1,
          firstName: author.given ?? "",
          lastName: author.family ?? "",
        });
      });
      return;
    }

    item.setCreators(
      authors.map((author) => ({
        creatorType: "author",
        firstName: author.given ?? "",
        lastName: author.family ?? "",
      })),
    );
  }

  private applyBookAuthors(
    item: Zotero.Item,
    authors: Array<{ name?: string } | string>,
  ): void {
    const editableItem = item as Zotero.Item & {
      numCreators?: () => number;
      setCreator?: (
        index: number,
        creator: {
          creatorTypeID: number;
          firstName: string;
          lastName: string;
        },
      ) => void;
    };
    const creatorTypeID =
      (
        Zotero as typeof Zotero & {
          CreatorTypes?: { getPrimaryIDForType: (typeID: number) => number };
        }
      ).CreatorTypes?.getPrimaryIDForType(item.itemTypeID) ?? 1;

    authors.forEach((author) => {
      const name = typeof author === "string" ? author : (author.name ?? "");
      const parts = name.split(" ").filter(Boolean);
      const lastName = parts.pop() ?? name;
      const firstName = parts.join(" ");

      if (typeof editableItem.setCreator === "function") {
        editableItem.setCreator(editableItem.numCreators?.() ?? 0, {
          creatorTypeID,
          firstName,
          lastName,
        });
      }
    });

    if (typeof editableItem.setCreator !== "function") {
      item.setCreators(
        authors.map((author) => {
          const name =
            typeof author === "string" ? author : (author.name ?? "");
          const parts = name.split(" ").filter(Boolean);
          const lastName = parts.pop() ?? name;
          const firstName = parts.join(" ");
          return {
            creatorType: "author",
            firstName,
            lastName,
          };
        }),
      );
    }
  }
}
