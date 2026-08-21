import { ErrorManager, ErrorType } from "@/shared/core";
import {
  CrossRefAPI,
  OpenAlexAPI,
  SemanticScholarAPI,
} from "@/features/metadata/apis";
import { DownloadManager } from "@/services/DownloadManager";
import { DialogManager } from "@/ui";
import { PreferencesManager } from "@/ui/PreferencesManager";
import {
  isSearchQueryActionable,
  normalizeDoi,
  parseDoiFromExtra,
} from "@/utils/itemSearchQuery";
import { isExactTitleMatch } from "@/utils/similarity";
import {
  extractYearFromDate,
  extractAuthorsFromItem,
  isAuthorCreator,
} from "@/utils/itemFields";
import { shouldRewriteAuthorsForMetadata } from "@/utils/authorValidation";
import {
  copyZoteroCreator,
  getCreatorDisplayName,
} from "@/utils/creatorMapping";
import { getContainerTitleFieldForItemType } from "@/utils/typeMapping";
import {
  BookMetadataService,
  DOIDiscoveryService,
  MetadataUpdateService,
  type FetchOptions,
  type DOIDiscoveryOptions,
  type LegacyFetchResult,
  type MetadataSearchResult,
  type TranslatorSearch,
  type TranslatorItem,
  type BookMetadataSource,
  DOI_TRANSLATOR_FIELDS,
} from "./metadata";
import type {
  ContextualError,
  MetadataResult,
  SearchQuery,
  SearchResult,
  AttachmentFinderConfig,
  CrossRefWork,
  ZoteroCreatorData,
} from "@/shared/core/types";

export type FetchMetadataForItemsOptions = FetchOptions & {
  items?: Zotero.Item[];
};

export interface MetadataFetcherServices {
  crossRefAPI?: CrossRefAPI;
  openAlexAPI?: OpenAlexAPI;
  semanticScholarAPI?: SemanticScholarAPI;
  doiDiscovery?: DOIDiscoveryService;
  bookMetadata?: BookMetadataService;
  metadataUpdate?: MetadataUpdateService;
  preferencesManager?: PreferencesManager;
}

export class MetadataFetcher {
  private errorManager: ErrorManager;
  private crossRefAPI: CrossRefAPI;
  private openAlexAPI: OpenAlexAPI;
  private semanticScholarAPI: SemanticScholarAPI;
  private downloadManager: DownloadManager;
  private doiDiscovery: DOIDiscoveryService;
  private bookMetadata: BookMetadataService;
  private metadataUpdate: MetadataUpdateService;
  private config: Partial<AttachmentFinderConfig>;
  private dialogManager: DialogManager;

  private debug(message: string): void {
    const zoteroDebug = (
      Zotero as typeof Zotero & { debug?: (msg: string, level: number) => void }
    ).debug;
    if (zoteroDebug) {
      zoteroDebug(`Zotadata MetadataFetcher: ${message}`, 1);
    } else if (typeof Zotero !== "undefined" && Zotero.log) {
      Zotero.log(`Zotadata MetadataFetcher: ${message}`);
    }
    try {
      // console.log may not be available in Zotero 7 plugin sandbox
      // eslint-disable-next-line no-console
      console.log(`[Zotadata MetadataFetcher] ${message}`);
    } catch {
      // Silently ignore — Zotero.debug output is sufficient
    }
  }

  constructor(
    addonData: {
      config?: AttachmentFinderConfig;
      services?: MetadataFetcherServices;
    } = {},
  ) {
    this.config = addonData.config ?? {};
    this.errorManager = new ErrorManager();
    this.crossRefAPI = addonData.services?.crossRefAPI ?? new CrossRefAPI();
    this.openAlexAPI = addonData.services?.openAlexAPI ?? new OpenAlexAPI();
    this.semanticScholarAPI =
      addonData.services?.semanticScholarAPI ?? new SemanticScholarAPI();
    this.downloadManager = new DownloadManager({
      concurrency: this.config.downloads?.maxConcurrent || 3,
      maxRetries: 3,
    });

    if (addonData.services?.doiDiscovery) {
      this.doiDiscovery = addonData.services.doiDiscovery;
    } else {
      this.doiDiscovery = new DOIDiscoveryService({
        crossRefAPI: this.crossRefAPI,
        openAlexAPI: this.openAlexAPI,
        semanticScholarAPI: this.semanticScholarAPI,
      });
    }

    this.bookMetadata =
      addonData.services?.bookMetadata ??
      new BookMetadataService({
        googleBooksApiKey:
          addonData.services?.preferencesManager?.getGoogleBooksApiKey() ?? "",
        googleBooksEnabled:
          addonData.services?.preferencesManager?.isGoogleBooksEnabled() ??
          true,
      });
    this.metadataUpdate =
      addonData.services?.metadataUpdate ?? new MetadataUpdateService();
    this.dialogManager = new DialogManager({ config: this.config });
  }

  get doiDiscoveryService(): DOIDiscoveryService {
    return this.doiDiscovery;
  }

  get bookMetadataService(): BookMetadataService {
    return this.bookMetadata;
  }

  get metadataUpdateService(): MetadataUpdateService {
    return this.metadataUpdate;
  }

  get crossRefAPIInstance(): CrossRefAPI {
    return this.crossRefAPI;
  }

  get openAlexAPIInstance(): OpenAlexAPI {
    return this.openAlexAPI;
  }

  get semanticScholarAPIInstance(): SemanticScholarAPI {
    return this.semanticScholarAPI;
  }

  // Wrapper methods for backward compatibility with tests
  async discoverDOI(
    item: Zotero.Item,
    options?: DOIDiscoveryOptions,
  ): Promise<string | null> {
    return this.doiDiscovery.discoverDOI(item, options);
  }

  async fetchCrossRefMetadata(doi: string): Promise<CrossRefWork | null> {
    return this.crossRefAPI.getCrossRefWorkMessage(doi);
  }

  async updateItemWithMetadata(
    item: Zotero.Item,
    metadata: CrossRefWork,
  ): Promise<string[]> {
    return this.metadataUpdate.updateItemWithMetadata(item, metadata);
  }

  async fetchBookMetadata(
    isbn: string,
    item: Zotero.Item,
  ): Promise<BookMetadataSource | null> {
    return this.bookMetadata.fetchBookMetadata(isbn, item);
  }

  async fetchISBNBasedMetadata(item: Zotero.Item): Promise<LegacyFetchResult> {
    return this.bookMetadata.fetchISBNBasedMetadata(item);
  }

  extractISBN(item: Zotero.Item): string | null {
    return this.bookMetadata.extractISBN(item);
  }

  async supplementDOIMetadata(
    item: Zotero.Item,
    doi: string,
  ): Promise<string[]> {
    return this.metadataUpdate.supplementDOIMetadata(item, doi);
  }

  async fetchDOIMetadataViaTranslator(
    doi: string,
    item: Zotero.Item,
  ): Promise<boolean> {
    const normalizedDoi = normalizeDoi(doi).toLowerCase();
    return this.applyTranslatorMetadata(
      item,
      {
        itemType: Zotero.ItemTypes.getName(item.itemTypeID),
        DOI: normalizedDoi,
      },
      DOI_TRANSLATOR_FIELDS,
      {
        finalizeChange: () => {
          if (String(item.getField("DOI") ?? "").trim()) {
            return false;
          }
          item.setField("DOI", normalizedDoi);
          return true;
        },
      },
    );
  }

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

    const progressDialog =
      selectedItems.length >= 2
        ? this.dialogManager.showBatchProgress(
            "Fetching Metadata",
            selectedItems.length,
          )
        : null;

    const { items: _items, ...perItemOptions } = options;
    const results: MetadataResult[] = [];

    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      const itemTitle = item.getField("title") || `Item ${i + 1}`;

      try {
        const result = await this.fetchMetadataForItem(item, perItemOptions);
        results.push(result);

        if (progressDialog) {
          if (result.success) {
            const isbnChange = result.changes.find((c) =>
              c.startsWith("Added ISBN:"),
            );
            const isbn = isbnChange
              ? isbnChange.replace("Added ISBN: ", "")
              : null;

            const displayText = isbn
              ? `${itemTitle} (ISBN: ${isbn})`
              : itemTitle;

            progressDialog.itemCompleted(displayText);
          } else {
            const failureReason = result.errors.join("; ");
            progressDialog.itemFailed(itemTitle, failureReason);
          }
        }
      } catch (error) {
        const errorResult: MetadataResult = {
          success: false,
          item,
          source: "MetadataFetcher",
          changes: [],
          errors: [this.formatSettledReason(error)],
        };
        results.push(errorResult);

        if (progressDialog) {
          progressDialog.itemFailed(itemTitle, errorResult.errors.join("; "));
        }
      }
    }

    if (progressDialog) {
      progressDialog.complete();
    }

    return results;
  }

  async fetchMetadataForItem(
    item: Zotero.Item,
    options: FetchOptions = {},
  ): Promise<MetadataResult> {
    return this.errorManager.wrapAsync(
      async () => {
        const itemType = Zotero.ItemTypes.getName(item.itemTypeID);
        this.debug(`fetchMetadataForItem: item ${item.id} type="${itemType}"`);
        let legacyResult: LegacyFetchResult | null = null;

        if (
          itemType === "journalArticle" ||
          itemType === "conferencePaper" ||
          itemType === "preprint"
        ) {
          this.debug(`Trying DOI-based metadata path for item ${item.id}`);
          legacyResult = await this.fetchDOIBasedMetadata(item);
          if (legacyResult.success || legacyResult.changes.length > 0) {
            this.debug(
              `DOI-based path returned source="${legacyResult.source}" with ${legacyResult.changes.length} change(s)`,
            );
            return {
              success: legacyResult.success,
              item,
              source: legacyResult.source,
              changes: legacyResult.changes,
              errors: legacyResult.error ? [legacyResult.error] : [],
            };
          }
          this.debug(
            `No DOI found or DOI sources exhausted — trying search fallback`,
          );
        } else if (itemType === "book") {
          this.debug(`Trying ISBN-based metadata path for item ${item.id}`);
          legacyResult = await this.bookMetadata.fetchISBNBasedMetadata(item);
          if (legacyResult) {
            this.debug(
              `ISBN-based path returned source="${legacyResult.source}" with ${legacyResult.changes.length} change(s)`,
            );
            return {
              success: legacyResult.success,
              item,
              source: legacyResult.source,
              changes: legacyResult.changes,
              errors: legacyResult.error ? [legacyResult.error] : [],
            };
          }
        }

        const query = this.buildSearchQuery(item);
        if (!isSearchQueryActionable(query)) {
          this.debug(`Query not actionable for item ${item.id}`);
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

        this.debug(
          `Searching multiple APIs for item ${item.id} — query: ${JSON.stringify(query)}`,
        );
        const searchResults = await this.searchMultipleAPIs(query, options);
        if (searchResults.length === 0) {
          this.debug(`No search results from any API for item ${item.id}`);
          return {
            success: false,
            item,
            source: "MetadataFetcher",
            changes: [],
            errors: ["No metadata found from any source"],
          };
        }

        const bestResult = this.selectBestResult(searchResults, options);
        this.debug(
          `Best result from "${bestResult.source}" with confidence ${bestResult.confidence}`,
        );
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

  extractDOI(item: Zotero.Item): string | null {
    const doiField = String(item.getField("DOI") ?? "").trim();
    if (doiField) {
      return normalizeDoi(doiField);
    }

    const url = String(item.getField("url") ?? "");
    const urlMatch = url.match(/10\.\d{4,}\/[^\s?#]+/i);
    if (urlMatch) {
      return normalizeDoi(urlMatch[0]);
    }

    const extra = String(item.getField("extra") ?? "");
    return parseDoiFromExtra(extra) ?? null;
  }

  async fetchDOIBasedMetadata(item: Zotero.Item): Promise<LegacyFetchResult> {
    const changes: string[] = [];
    const existingDoi = this.extractDOI(item);

    this.debug(`Source: DOIDiscovery — resolving DOI for item ${item.id}`);
    const resolvedDoi = await this.doiDiscovery.resolvePreferredDoiForMetadata(
      item,
      existingDoi,
    );
    let doi = existingDoi;

    if (
      resolvedDoi &&
      normalizeDoi(resolvedDoi) !== normalizeDoi(existingDoi ?? "")
    ) {
      doi = normalizeDoi(resolvedDoi).toLowerCase();
      this.debug(`Writing DOI "${doi}" (resolved from "${existingDoi}")`);
      item.setField("DOI", doi);
      await item.saveTx();
      changes.push(`${existingDoi ? "Updated DOI" : "Added DOI"}: ${doi}`);
    }

    if (!doi) {
      doi = resolvedDoi;
    }

    if (!doi) {
      this.debug(`No DOI found for item ${item.id}`);
      await item.saveTx();
      return {
        success: false,
        updated: false,
        error: "No DOI found",
        source: "MetadataFetcher",
        changes,
      };
    }

    this.debug(
      `Source: Zotero Translator — trying DOI ${doi} for item ${item.id}`,
    );
    const translatorSuccess = await this.fetchDOIMetadataViaTranslator(
      doi,
      item,
    );
    if (translatorSuccess) {
      this.debug(`Zotero Translator succeeded for DOI ${doi}`);
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

    this.debug(`Zotero Translator failed — trying CrossRef for DOI ${doi}`);
    const metadata = await this.crossRefAPI.getCrossRefWorkMessage(doi);
    if (!metadata) {
      this.debug(
        `CrossRef returned no data for DOI ${doi} — trying OpenAlex supplement`,
      );
      const supplementalChanges =
        await this.metadataUpdate.supplementDOIMetadata(item, doi);
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

      this.debug(`CrossRef and OpenAlex both failed for DOI ${doi}`);
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

    this.debug(`Source: CrossRef — applying metadata from DOI ${doi}`);
    changes.push(
      ...(await this.metadataUpdate.updateItemWithMetadata(item, metadata)),
    );
    changes.push(
      ...(await this.metadataUpdate.supplementDOIMetadata(item, doi)),
    );

    if (changes.length === 0) {
      this.debug(
        `CrossRef returned data but no changes were needed for item ${item.id}`,
      );
      return {
        success: false,
        updated: false,
        error: "No metadata changes were applied",
        source: "CrossRef",
        changes,
      };
    }

    this.debug(
      `CrossRef update complete — ${changes.length} change(s) for item ${item.id}`,
    );
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

  private async applyTranslatorMetadata(
    item: Zotero.Item,
    identifier: Record<string, unknown>,
    fields: readonly string[],
    options: { finalizeChange?: () => boolean } = {},
  ): Promise<boolean> {
    const translate = this.createTranslatorSearch();
    if (!translate) {
      this.debug(`Translator search not available — skipping`);
      return false;
    }

    try {
      translate.setIdentifier(identifier);
      const translators = await translate.getTranslators();
      if (!translators.length) {
        this.debug(
          `No translator found for identifier: ${JSON.stringify(identifier)}`,
        );
        return false;
      }

      // Zotero's translator system auto-appends creators to the original item
      // as a side effect of translate().  Capture the pre-translator state so
      // we can detect this and restore before our own apply.
      const preCreators = item.getCreators().map((c) => ({ ...c }));

      this.debug(`Found ${translators.length} translator(s), applying...`);
      translate.setTranslator(translators);
      const [translated] = await translate.translate();
      if (!translated) {
        this.debug(`Translator returned no result`);
        return false;
      }

      // Restore pre-translator creators so our own apply uses setCreators
      // (replaces) instead of appending to Zotero's auto-added duplicates.
      const postCreatorCount = item.getCreators().length;
      if (postCreatorCount > preCreators.length) {
        this.debug(
          `Zotero auto-appended ${postCreatorCount - preCreators.length} creator(s) — restoring pre-translator state`,
        );
        item.setCreators(preCreators);
      }

      this.debug(
        `Translator returned data — applying creators from translator`,
      );

      const creatorResult = this.applyTranslatedCreators(
        item,
        translated.getCreators(),
        translated,
        identifier,
      );
      let changed = creatorResult.changed;
      if (creatorResult.changed) {
        this.debug(
          `Wrote creators from translator (${translated.getCreators().length} total)`,
        );
      }
      if (!creatorResult.rejected) {
        const fieldsChanged = this.applyTranslatedFields(
          item,
          translated,
          fields,
        );
        if (fieldsChanged) {
          this.debug(`Wrote fields ${fields.join(", ")} from translator`);
        }
        changed = fieldsChanged || changed;
      } else {
        this.debug(
          `Creator validation rejected — not applying translator fields`,
        );
      }
      if (options.finalizeChange?.()) {
        this.debug(`Finalize change callback triggered`);
        changed = true;
      }

      translated.deleted = true;
      await translated.saveTx();
      if (!changed) {
        this.debug(`Translator applied but no changes detected`);
        return false;
      }

      this.debug(`Translator metadata written to item ${item.id}`);
      await item.saveTx();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : "";
      this.debug(`Translator threw: ${msg}`);
      if (stack) this.debug(`Stack (level 3): ${stack.slice(0, 500)} ...`);
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
    creators: ZoteroCreatorData[],
    translated: TranslatorItem,
    identifier: Record<string, unknown>,
  ): { changed: boolean; rejected: boolean } {
    const currentCreators = item.getCreators();

    const translatedCreators = creators
      .map(copyZoteroCreator)
      .filter((creator): creator is ZoteroCreatorData => creator !== null);
    const authorsFromTranslation = translatedCreators.filter(isAuthorCreator);

    if (authorsFromTranslation.length === 0) {
      return { changed: false, rejected: false };
    }

    const nonAuthorsFromTranslation = translatedCreators.filter(
      (creator) => !isAuthorCreator(creator),
    );
    const existingNonAuthors = currentCreators.filter(
      (c) => !isAuthorCreator(c),
    );

    const authorNames = authorsFromTranslation
      .map(getCreatorDisplayName)
      .filter(Boolean);

    if (authorNames.length === 0) {
      return { changed: false, rejected: false };
    }

    const identifierDoi =
      typeof identifier.DOI === "string" ? identifier.DOI : undefined;
    const translatedDate = translated.getField("date");
    const canRewriteAuthors = shouldRewriteAuthorsForMetadata(item, {
      title: translated.getField("title"),
      authors: authorNames,
      year: extractYearFromDate(translatedDate),
      doi: identifierDoi,
      source: "Zotero Translator",
      confidence: 1,
    });

    if (!canRewriteAuthors) {
      return { changed: false, rejected: true };
    }

    const finalNonAuthors =
      nonAuthorsFromTranslation.length > 0
        ? nonAuthorsFromTranslation
        : existingNonAuthors;

    this.debug(
      `setCreators with ${authorsFromTranslation.length} authors + ${finalNonAuthors.length} non-authors ` +
        `(item currently has ${item.getCreators().length} creators total)`,
    );

    item.setCreators([...authorsFromTranslation, ...finalNonAuthors]);

    this.debug(
      `After setCreators: item has ${item.getCreators().length} creators`,
    );

    return { changed: true, rejected: false };
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

  private async searchMultipleAPIs(
    query: SearchQuery,
    options: FetchOptions = {},
  ): Promise<MetadataSearchResult[]> {
    const strategy = options.strategy || "fallback";
    const enabledAPIs = options.apis || [
      "crossref",
      "openalex",
      "semanticscholar",
    ];

    this.debug(
      `searchMultipleAPIs: strategy="${strategy}" apis=[${enabledAPIs.join(",")}]`,
    );

    switch (strategy) {
      case "parallel":
        return this.searchParallel(query, enabledAPIs, options);
      case "fallback":
        return this.searchFallback(query, enabledAPIs, options);
      case "best_result":
        return this.searchBestResult(query, enabledAPIs, options);
      default:
        return this.searchFallback(query, enabledAPIs, options);
    }
  }

  private async searchParallel(
    query: SearchQuery,
    apis: string[],
    options: FetchOptions,
  ): Promise<MetadataSearchResult[]> {
    this.debug(`Searching APIs in parallel: ${apis.join(", ")}`);
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

  private async searchFallback(
    query: SearchQuery,
    apis: string[],
    options: FetchOptions,
  ): Promise<MetadataSearchResult[]> {
    for (const api of apis) {
      try {
        this.debug(`Searching API: ${api}`);
        const result = await this.searchSingleAPI(api, query, options);
        if (result.results.length > 0) {
          this.debug(
            `API ${api} returned ${result.results.length} result(s) — stopping fallback chain`,
          );
          return [result];
        }
        this.debug(`API ${api} returned no results — trying next`);
        await this.delay(100);
      } catch {
        this.debug(`API ${api} threw — trying next`);
        continue;
      }
    }

    this.debug(`All APIs exhausted — no results found`);
    return [];
  }

  private async searchBestResult(
    query: SearchQuery,
    apis: string[],
    options: FetchOptions,
  ): Promise<MetadataSearchResult[]> {
    const allResults = await this.searchParallel(query, apis, options);

    if (allResults.length === 0) {
      return [];
    }

    const bestResult = allResults.reduce((best, current) => {
      const bestConfidence = Math.max(...best.results.map((r) => r.confidence));
      const currentConfidence = Math.max(
        ...current.results.map((r) => r.confidence),
      );
      return currentConfidence > bestConfidence ? current : best;
    });

    return [bestResult];
  }

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

      const minConfidence = options.minConfidence;
      if (minConfidence) {
        results = results.filter(
          (result) => result.confidence >= minConfidence,
        );
      }

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

  private selectBestResult(
    searchResults: MetadataSearchResult[],
    options: FetchOptions,
  ): SearchResult {
    const allResults = searchResults.flatMap((search) => search.results);

    if (allResults.length === 0) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        "No search results to select from",
      );
    }

    allResults.sort((a, b) => b.confidence - a.confidence);

    if (options.includeOpenAccess) {
      const openAccessResults = allResults.filter((result) => result.pdfUrl);
      if (openAccessResults.length > 0) {
        return openAccessResults[0];
      }
    }

    return allResults[0];
  }

  private async applyMetadataToItem(
    item: Zotero.Item,
    searchResult: SearchResult,
    query: SearchQuery,
    options: FetchOptions,
  ): Promise<string[]> {
    const changes: string[] = [];

    try {
      const strongMatch = this.isStrongMetadataMatch(query, searchResult);

      const currentTitle = (item.getField("title") as string) || "";
      const exactTitleMatch =
        Boolean(currentTitle.trim()) &&
        Boolean(searchResult.title) &&
        isExactTitleMatch(currentTitle, searchResult.title);
      const canApplyBibliographicMetadata =
        strongMatch || !currentTitle.trim() || exactTitleMatch;

      this.debug(
        `Source: ${searchResult.source} (confidence ${searchResult.confidence}) — applying to item ${item.id}`,
      );
      this.debug(
        `  strongMatch=${strongMatch}, exactTitleMatch=${exactTitleMatch}, canApplyBib=${canApplyBibliographicMetadata}`,
      );

      if (
        searchResult.title &&
        (strongMatch ||
          !currentTitle.trim() ||
          this.metadataUpdate.shouldUpdateTitle(
            currentTitle,
            searchResult.title,
          ))
      ) {
        this.debug(
          `Writing title "${searchResult.title}" (was: "${currentTitle}")`,
        );
        item.setField("title", searchResult.title);
        changes.push(`Updated title: ${searchResult.title}`);
      }

      if (
        canApplyBibliographicMetadata &&
        searchResult.doi &&
        !item.getField("DOI")
      ) {
        const doi = normalizeDoi(searchResult.doi).toLowerCase();
        this.debug(`Writing DOI "${doi}"`);
        item.setField("DOI", doi);
        changes.push(`Added DOI: ${doi}`);
      }

      if (
        canApplyBibliographicMetadata &&
        searchResult.year &&
        !item.getField("date")
      ) {
        this.debug(`Writing date ${searchResult.year}`);
        item.setField("date", searchResult.year.toString());
        changes.push(`Added year: ${searchResult.year}`);
      }

      if (searchResult.authors && searchResult.authors.length > 0) {
        if (shouldRewriteAuthorsForMetadata(item, searchResult)) {
          this.debug(
            `Writing ${searchResult.authors.length} authors from ${searchResult.source}`,
          );
          const creators = item.getCreators();
          const nonAuthors = creators.filter(
            (creator) => !isAuthorCreator(creator),
          );

          const newCreators = searchResult.creators
            ? searchResult.creators
                .map(copyZoteroCreator)
                .filter(
                  (creator): creator is ZoteroCreatorData => creator !== null,
                )
            : searchResult.authors.map((authorName) => {
                const parts = authorName.split(" ");
                const lastName = parts.pop() || "";
                const firstName = parts.join(" ");

                return {
                  creatorType: "author",
                  firstName,
                  lastName,
                };
              });

          item.setCreators([...newCreators, ...nonAuthors]);
          changes.push(`Updated authors: ${searchResult.authors.join(", ")}`);
        } else {
          this.debug(
            `Authors from ${searchResult.source} rejected by validation`,
          );
        }
      }

      if (canApplyBibliographicMetadata) {
        const itemType = Zotero.ItemTypes.getName(item.itemTypeID);
        const containerField = getContainerTitleFieldForItemType(itemType);
        if (
          searchResult.containerTitle &&
          containerField &&
          !item.getField(containerField)
        ) {
          this.debug(
            `Writing ${containerField} "${searchResult.containerTitle}"`,
          );
          item.setField(containerField, searchResult.containerTitle);
          changes.push(
            `Added ${containerField}: ${searchResult.containerTitle}`,
          );
        }

        if (searchResult.volume && !item.getField("volume")) {
          this.debug(`Writing volume ${searchResult.volume}`);
          item.setField("volume", searchResult.volume);
          changes.push(`Added volume: ${searchResult.volume}`);
        }

        if (searchResult.issue && !item.getField("issue")) {
          this.debug(`Writing issue ${searchResult.issue}`);
          item.setField("issue", searchResult.issue);
          changes.push(`Added issue: ${searchResult.issue}`);
        }

        if (searchResult.pages && !item.getField("pages")) {
          this.debug(`Writing pages ${searchResult.pages}`);
          item.setField("pages", searchResult.pages);
          changes.push(`Added pages: ${searchResult.pages}`);
        }

        if (searchResult.language && !item.getField("language")) {
          this.debug(`Writing language "${searchResult.language}"`);
          item.setField("language", searchResult.language);
          changes.push(`Added language: ${searchResult.language}`);
        }
      } else {
        this.debug(
          `Bibliographic fields skipped — no strong match and title is populated`,
        );
      }

      if (options.downloadPDFs && searchResult.pdfUrl) {
        this.debug(`Downloading PDF from ${searchResult.pdfUrl}`);
        try {
          const downloadResult = await this.downloadManager.downloadFile(
            searchResult.pdfUrl,
            {
              timeout: 60000,
              maxFileSize: 100 * 1024 * 1024,
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
              this.debug(`PDF downloaded successfully`);
            }
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          changes.push(`Failed to download PDF: ${msg}`);
          this.debug(`PDF download failed: ${msg}`);
        }
      }

      if (changes.length > 0) {
        this.debug(
          `${changes.length} change(s) written to item ${item.id} from ${searchResult.source}`,
        );
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

  private isStrongMetadataMatch(
    query: SearchQuery,
    searchResult: SearchResult,
  ): boolean {
    const q = query.doi ? normalizeDoi(query.doi) : "";
    const r = searchResult.doi ? normalizeDoi(searchResult.doi) : "";
    if (q && r && q === r) {
      return true;
    }

    if (searchResult.confidence < 0.92) {
      return false;
    }

    if (!query.title || !searchResult.title) {
      return true;
    }

    return isExactTitleMatch(query.title, searchResult.title);
  }

  private buildSearchQuery(
    item: Zotero.Item,
    options: { includeDoi?: boolean } = {},
  ): SearchQuery {
    const query: SearchQuery = {};
    const includeDoi = options.includeDoi ?? true;

    const title = item.getField("title");
    if (title) {
      query.title = title;
    }

    const extraField = (item.getField("extra") as string) ?? "";
    const doiField = (item.getField("DOI") as string)?.trim();
    if (includeDoi && doiField) {
      query.doi = normalizeDoi(doiField);
    } else if (includeDoi) {
      const fromExtra = parseDoiFromExtra(extraField);
      if (fromExtra) {
        query.doi = fromExtra;
      }
    }

    const date = item.getField("date");
    if (date) {
      query.year = extractYearFromDate(String(date));
    }

    query.authors = extractAuthorsFromItem(item);

    return query;
  }

  private async createAttachmentFromData(
    item: Zotero.Item,
    data: ArrayBuffer,
    title: string,
    source: string,
  ): Promise<Zotero.Item | null> {
    try {
      const fileName = `${title.replace(/[^\w\s]/g, "").substring(0, 50)}.pdf`;

      const attachment = await Zotero.Attachments.importFromBuffer({
        buffer: data,
        fileName,
        contentType: "application/pdf",
        parentItemID: item.id,
      });

      if (attachment) {
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
