import { ErrorManager } from "@/shared/core";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";
import { SemanticScholarAPI } from "@/features/metadata/apis/SemanticScholarAPI";
import {
  buildAcceptLanguageHeader,
  matchesPreferredLanguage,
} from "@/utils/locale";
import {
  extractArxivIdFromItem,
  getCanonicalArxivDoiForItem,
  isArxivDoi,
  normalizeDoi,
  parseDoiFromExtra,
} from "@/utils/itemSearchQuery";
import type {
  FileFinderResult,
  SearchQuery,
  SearchResult,
} from "@/shared/core/types";

/**
 * Resolved PDF source from an open-access lookup.
 */
interface ResolvedPDF {
  url: string;
  source: string;
  confidence: number;
}

interface LocatedFile {
  url: string | null;
  source: string | null;
}

interface NamedUrlResolver {
  source: string;
  resolve: () => Promise<string | null>;
}

const UNPAYWALL_EMAIL = "zotadata@users.noreply.github.com";
const CONCURRENCY = 3;
const NO_FILE_FOUND: LocatedFile = {
  url: null,
  source: null,
};

/**
 * Finds and downloads missing PDF attachments for Zotero library items.
 *
 * Strategy (per item):
 * 1. Skip items that already have a stored-file attachment.
 * 2. If a DOI is available, try Unpaywall (purpose-built OA lookup).
 * 3. Search OpenAlex and Semantic Scholar for open-access PDF URLs.
 * 4. Download the best candidate via `importFromURL`, falling back to the
 *    original manual stored-file pipeline if Zotero's direct import fails.
 */
export class FileFinder {
  private errorManager: ErrorManager;
  private openAlexAPI: OpenAlexAPI;
  private semanticScholarAPI: SemanticScholarAPI;

  constructor(
    openAlexAPI?: OpenAlexAPI,
    semanticScholarAPI?: SemanticScholarAPI,
  ) {
    this.errorManager = new ErrorManager();
    this.openAlexAPI = openAlexAPI ?? new OpenAlexAPI();
    this.semanticScholarAPI = semanticScholarAPI ?? new SemanticScholarAPI();
  }

  /**
   * Process all selected items, returning per-item results and a human summary.
   */
  async findFilesForSelectedItems(): Promise<string> {
    const pane = Zotero.getActiveZoteroPane();
    if (!pane) {
      return "No active Zotero window.";
    }

    const selected = pane.getSelectedItems();
    if (selected.length === 0) {
      return "No items selected.";
    }

    const results = await this.processItems(selected);
    return FileFinder.formatSummary(results, selected.length);
  }

  /**
   * Process a batch of items with bounded concurrency.
   */
  async processItems(items: Zotero.Item[]): Promise<FileFinderResult[]> {
    const results: FileFinderResult[] = [];

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((item) => this.processItem(item)),
      );

      for (const [idx, settled] of batchResults.entries()) {
        if (settled.status === "fulfilled") {
          results.push(settled.value);
        } else {
          results.push({
            item: batch[idx],
            outcome: "download_failed",
            error:
              settled.reason instanceof Error
                ? settled.reason.message
                : String(settled.reason),
          });
        }
      }
    }

    return results;
  }

  /**
   * Process a single item: skip if not applicable, check attachments, find & download.
   */
  async processItem(item: Zotero.Item): Promise<FileFinderResult> {
    if (!item.isRegularItem()) {
      return { item, outcome: "skipped_not_regular" };
    }

    if (await this.itemHasPDF(item)) {
      return { item, outcome: "already_has_file" };
    }

    const fileInfo = await this.findFileForItem(item);
    if (!fileInfo.url || !fileInfo.source) {
      return { item, outcome: "no_source_found" };
    }

    try {
      await this.downloadAndAttach(item, {
        url: fileInfo.url,
        source: fileInfo.source,
        confidence: 1,
      });
      return {
        item,
        outcome: "downloaded",
        source: fileInfo.source,
        pdfUrl: fileInfo.url,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`Download failed for item ${item.id}: ${msg}`);
      return {
        item,
        outcome: "download_failed",
        source: fileInfo.source,
        pdfUrl: fileInfo.url,
        error: msg,
      };
    }
  }

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
    const extraDoi = parseDoiFromExtra(extra);
    if (extraDoi) {
      return normalizeDoi(extraDoi);
    }

    const canonicalArxivDoi = getCanonicalArxivDoiForItem(item);
    if (canonicalArxivDoi && isArxivDoi(canonicalArxivDoi)) {
      return canonicalArxivDoi;
    }

    return null;
  }

  extractISBN(item: Zotero.Item): string | null {
    const isbnField = String(item.getField("ISBN") ?? "").trim();
    if (isbnField) {
      return this.cleanISBN(isbnField);
    }

    const extra = String(item.getField("extra") ?? "");
    const match = extra.match(/ISBN[:\-\s]*([0-9\-xX]{10,17})/i);
    return match ? this.cleanISBN(match[1]) : null;
  }

  extractArxivId(item: Zotero.Item): string | null {
    return extractArxivIdFromItem(item);
  }

  async itemHasPDF(item: Zotero.Item): Promise<boolean> {
    const attachmentIds = item.getAttachments();
    for (const attachmentID of attachmentIds) {
      const attachment = Zotero.Items.get(attachmentID) as
        | (Zotero.Item & {
            isPDFAttachment?: () => boolean;
          })
        | null;
      if (!attachment) {
        continue;
      }

      const filePath =
        typeof attachment.getFilePath === "function"
          ? attachment.getFilePath()
          : null;
      const isPdf =
        attachment.isPDFAttachment?.() === true ||
        String(attachment.attachmentContentType ?? "").toLowerCase() ===
          "application/pdf" ||
        (typeof filePath === "string" &&
          filePath.toLowerCase().endsWith(".pdf"));
      if (!isPdf) {
        continue;
      }

      try {
        if (typeof attachment.fileExists === "function") {
          const exists = await attachment.fileExists();
          if (exists) {
            return true;
          }
        }

        const file = attachment.getFile();
        if (file?.exists?.()) {
          return true;
        }
      } catch {
        // Ignore missing files and continue scanning attachments.
      }
    }
    return false;
  }

  async findFileForItem(item: Zotero.Item): Promise<LocatedFile> {
    try {
      const itemType = this.getItemTypeName(item);
      const doi = await this.resolvePreferredDOI(item);
      const isbn = this.extractISBN(item);

      if (itemType === "book") {
        return this.findBookFile(item, isbn, doi);
      }

      return this.findArticleFile(item, doi);
    } catch (error) {
      this.log(
        `Error finding file for item ${item.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return NO_FILE_FOUND;
  }

  private async resolvePreferredDOI(item: Zotero.Item): Promise<string | null> {
    const doi = this.extractDOI(item);
    if (!doi || isArxivDoi(doi) || !this.isArxivLikeItem(item)) {
      return doi;
    }

    const matches = await this.doiMatchesItemTitle(item, doi);
    if (matches) {
      return doi;
    }

    return getCanonicalArxivDoiForItem(item) ?? null;
  }

  private async doiMatchesItemTitle(
    item: Zotero.Item,
    doi: string,
  ): Promise<boolean> {
    const title = String(item.getField("title") ?? "").trim();
    if (!title) {
      return true;
    }

    try {
      const work = await this.openAlexAPI.getWorkByDOI(doi);
      if (!work?.title) {
        return false;
      }

      return FileFinder.titleSimilarity(work.title, title) >= 0.9;
    } catch {
      return false;
    }
  }

  private isArxivLikeItem(item: Zotero.Item): boolean {
    return getCanonicalArxivDoiForItem(item) !== null;
  }

  async findPublishedPDF(
    doi: string,
  ): Promise<{ url: string; source: string } | null> {
    const unpaywall = await this.findUnpaywallPDF(doi);
    if (unpaywall) {
      return { url: unpaywall, source: "Unpaywall" };
    }

    const core = await this.findCorePDFByDOI(doi);
    if (core) {
      return { url: core, source: "CORE" };
    }

    return null;
  }

  private async findBookFile(
    item: Zotero.Item,
    isbn: string | null,
    doi: string | null,
  ): Promise<LocatedFile> {
    if (isbn) {
      const bookFile = await this.resolveFirstNamedUrl([
        {
          source: "Internet Archive",
          resolve: () => this.findInternetArchiveBook(item, isbn),
        },
        {
          source: "OpenLibrary",
          resolve: () => this.findOpenLibraryPDF(item, isbn),
        },
        {
          source: "Google Books",
          resolve: () => this.findGoogleBooksFullText(item, isbn),
        },
      ]);
      if (bookFile) {
        return bookFile;
      }
    }

    if (!doi) {
      return NO_FILE_FOUND;
    }

    return (await this.findPublishedPDF(doi)) ?? NO_FILE_FOUND;
  }

  private async findArticleFile(
    item: Zotero.Item,
    doi: string | null,
  ): Promise<LocatedFile> {
    const directResolvers: NamedUrlResolver[] = [];
    if (doi) {
      directResolvers.push({
        source: "Unpaywall",
        resolve: () => this.findUnpaywallPDF(doi),
      });
    }
    directResolvers.push({
      source: "arXiv",
      resolve: () => this.findArxivPDF(item),
    });
    if (doi) {
      directResolvers.push({
        source: "CORE",
        resolve: () => this.findCorePDFByDOI(doi),
      });
    }

    const directFile = await this.resolveFirstNamedUrl(directResolvers);
    if (directFile) {
      return directFile;
    }

    const query = FileFinder.buildSearchQuery(item);
    const searchResult = await this.resolveFirstResolvedPdf([
      () => this.tryOpenAlex(query),
      () => this.trySemanticScholar(query),
    ]);

    return searchResult ?? NO_FILE_FOUND;
  }

  private async resolveFirstNamedUrl(
    candidates: NamedUrlResolver[],
  ): Promise<LocatedFile | null> {
    for (const candidate of candidates) {
      const url = await candidate.resolve();
      if (url) {
        return {
          url,
          source: candidate.source,
        };
      }
    }

    return null;
  }

  private async resolveFirstResolvedPdf(
    candidates: Array<() => Promise<ResolvedPDF | null>>,
  ): Promise<LocatedFile | null> {
    for (const candidate of candidates) {
      const resolved = await candidate();
      if (resolved?.url) {
        return {
          url: resolved.url,
          source: resolved.source,
        };
      }
    }

    return null;
  }

  async findUnpaywallPDF(doi: string): Promise<string | null> {
    const resolved = await this.tryUnpaywall(doi);
    return resolved?.url ?? null;
  }

  async findCorePDFByDOI(doi: string): Promise<string | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(`doi:"${doi}"`)}&limit=5`,
        {
          headers: this.buildRequestHeaders({
            Accept: "application/json",
          }),
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        results?: Array<{ downloadUrl?: string | null }>;
      };
      for (const result of payload.results ?? []) {
        if (result.downloadUrl?.toLowerCase().endsWith(".pdf")) {
          return result.downloadUrl;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async findArxivPDF(item: Zotero.Item): Promise<string | null> {
    try {
      const arxivId = this.extractArxivId(item);
      if (arxivId) {
        return `http://arxiv.org/pdf/${arxivId}.pdf`;
      }

      const title = String(item.getField("title") ?? "").trim();
      if (!title) {
        return null;
      }

      const searchedId = await this.searchArxiv(title);
      return searchedId ? `http://arxiv.org/pdf/${searchedId}.pdf` : null;
    } catch {
      return null;
    }
  }

  async searchArxiv(title: string): Promise<string | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(`ti:"${title}"`)}&max_results=3`,
        {
          headers: this.buildRequestHeaders({
            "User-Agent": "Zotero Zotadata/1.0",
          }),
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const matches = [
        ...response.responseText.matchAll(
          /<entry>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/gi,
        ),
      ];
      for (const match of matches) {
        const entryTitle = match[1].replace(/\s+/g, " ").trim();
        if (FileFinder.titleSimilarity(entryTitle, title) > 0.8) {
          return match[2];
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async downloadFileForItem(
    item: Zotero.Item,
    fileUrl: string,
    source: string,
  ): Promise<boolean> {
    try {
      await this.downloadAndAttach(item, {
        url: fileUrl,
        source,
        confidence: 1,
      });
      item.addTag(`PDF from ${source}`, 1);
      await item.saveTx();
      return true;
    } catch {
      item.addTag("Download Failed", 1);
      await item.saveTx();
      return false;
    }
  }

  async findInternetArchiveBook(
    _item: Zotero.Item,
    isbn: string,
  ): Promise<string | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`isbn:${isbn}`)}&fl=identifier,title,creator&rows=5&page=1&output=json`,
        {
          headers: this.buildRequestHeaders({
            Accept: "application/json",
          }),
          timeout: 15000,
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        response?: {
          docs?: Array<{ identifier?: string }>;
        };
      };
      for (const doc of payload.response?.docs ?? []) {
        if (!doc.identifier) {
          continue;
        }

        const pdfUrl = await this.checkInternetArchivePDF(doc.identifier);
        if (pdfUrl) {
          return pdfUrl;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async checkInternetArchivePDF(identifier: string): Promise<string | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://archive.org/metadata/${identifier}`,
        {
          headers: this.buildRequestHeaders({
            Accept: "application/json",
          }),
          timeout: 10000,
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        files?: Array<{ name?: string; source?: string }>;
      };
      for (const file of payload.files ?? []) {
        if (file.name?.endsWith(".pdf") && file.source === "original") {
          return `https://archive.org/download/${identifier}/${file.name}`;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async findOpenLibraryPDF(
    _item: Zotero.Item,
    isbn: string,
  ): Promise<string | null> {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=details`,
        {
          headers: this.buildRequestHeaders({
            Accept: "application/json",
          }),
          timeout: 15000,
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as Record<
        string,
        {
          details?: {
            links?: Array<{ url?: string }>;
            ocaid?: string;
          };
        }
      >;
      const details = payload[`ISBN:${isbn}`]?.details;
      if (!details) {
        return null;
      }

      if (details.ocaid) {
        const internetArchive = await this.checkInternetArchivePDF(
          details.ocaid,
        );
        if (internetArchive) {
          return internetArchive;
        }
      }

      for (const link of details.links ?? []) {
        if (link.url?.toLowerCase().includes(".pdf")) {
          return link.url;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async findGoogleBooksFullText(
    item: Zotero.Item,
    isbn?: string | null,
  ): Promise<string | null> {
    try {
      const query = isbn
        ? `isbn:${isbn}`
        : `intitle:"${item.getField("title")}"`;
      const response = await Zotero.HTTP.request(
        "GET",
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`,
        {
          headers: this.buildRequestHeaders({
            Accept: "application/json",
          }),
          timeout: 15000,
        },
      );
      if (response.status !== 200) {
        return null;
      }

      const payload = JSON.parse(response.responseText) as {
        items?: Array<{
          accessInfo?: {
            accessViewStatus?: string;
            pdf?: {
              downloadLink?: string;
              isAvailable?: boolean;
            };
            webReaderLink?: string;
          };
          id?: string;
        }>;
      };
      for (const book of payload.items ?? []) {
        if (
          book.accessInfo?.pdf?.isAvailable &&
          book.accessInfo.pdf.downloadLink
        ) {
          return book.accessInfo.pdf.downloadLink;
        }
        if (
          book.id &&
          book.accessInfo?.accessViewStatus === "FULL_PUBLIC_DOMAIN" &&
          book.accessInfo.webReaderLink
        ) {
          return `https://books.google.com/books/download?id=${book.id}&output=pdf`;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private getUnpaywallEmail(): string {
    try {
      const configuredEmail = Zotero.Prefs.get(
        "extensions.zotero.zotadata.email",
      ) as string;
      if (configuredEmail && configuredEmail.trim() !== "") {
        return configuredEmail.trim();
      }
    } catch {
      // Ignore - will use fallback
    }
    return UNPAYWALL_EMAIL;
  }

private async tryUnpaywall(doi: string): Promise<ResolvedPDF | null> {
    try {
      const email = this.getUnpaywallEmail();
      const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`;
      const response = await Zotero.HTTP_request("GET", url, {
        headers: this.buildRequestHeaders(),
        timeout: 15000,
        responseType: "text",
      });

      if (response.status !== 200) return null;

      const data = JSON.parse(response.responseText) as {
        best_oa_location?: { url_for_pdf?: string; url?: string };
        is_oa?: boolean;
        oa_status?: string;
      };

      const pdfUrl =
        data.best_oa_location?.url_for_pdf ?? data.best_oa_location?.url;
      if (!pdfUrl || !data.is_oa) return null;

      if (data.oa_status === "bronze") {
        return null;
      }

      return { url: pdfUrl, source: "Unpaywall", confidence: 0.95 };
    } catch {
      return null;
    }
  }
  }

  private async tryOpenAlex(query: SearchQuery): Promise<ResolvedPDF | null> {
    try {
      const results = await this.openAlexAPI.searchOpenAccess(query);
      return FileFinder.pickBestPDF(results, "OpenAlex");
    } catch {
      return null;
    }
  }

  private async trySemanticScholar(
    query: SearchQuery,
  ): Promise<ResolvedPDF | null> {
    try {
      const results = await this.semanticScholarAPI.searchOpenAccess(query);
      return FileFinder.pickBestPDF(results, "Semantic Scholar");
    } catch {
      return null;
    }
  }

  /**
   * Pick the highest-confidence result that has a PDF URL.
   */
  private static pickBestPDF(
    results: SearchResult[],
    source: string,
  ): ResolvedPDF | null {
    const withPdf = results
      .filter((r) => r.pdfUrl)
      .sort((a, b) => b.confidence - a.confidence);

    const [bestResult] = withPdf;
    if (!bestResult?.pdfUrl) {
      return null;
    }

    return {
      url: bestResult.pdfUrl,
      source,
      confidence: bestResult.confidence,
    };
  }

  /**
   * Download PDF and attach it as a stored file, matching the original
   * zotadata.js behavior as closely as possible.
   */
  private async downloadAndAttach(
    item: Zotero.Item,
    resolved: ResolvedPDF,
  ): Promise<void> {
    if (!resolved.url || typeof resolved.url !== "string") {
      throw new Error("Invalid URL provided for download");
    }

    const cleanUrl = this.cleanDownloadUrl(resolved.url);
    const title = this.buildAttachmentTitle(item, resolved.source);
    let primaryError: string | null = null;

    try {
      const attachment = await Zotero.Attachments.importFromURL({
        url: cleanUrl,
        libraryID: item.libraryID,
        parentItemID: item.id,
        title,
        fileBaseName: this.sanitizeFileName(title),
        contentType: "application/pdf",
      });
      if (this.verifyStoredAttachment(attachment)) {
        return;
      }
      if (attachment) {
        this.log("importFromURL created an attachment, but not a stored file");
      }
    } catch (error) {
      primaryError = error instanceof Error ? error.message : String(error);
      this.log(`importFromURL failed for item ${item.id}: ${primaryError}`);
    }

    let attachment: Zotero.Item | null = null;
    try {
      attachment = await this.manualDownloadAndImport(item, cleanUrl, title);
    } catch (error) {
      const fallbackError =
        error instanceof Error ? error.message : String(error);
      if (primaryError) {
        throw new Error(`${primaryError}; fallback failed: ${fallbackError}`);
      }
      throw error;
    }
    if (!this.verifyStoredAttachment(attachment)) {
      throw new Error("Manual download did not create a stored PDF attachment");
    }
  }

  private async manualDownloadAndImport(
    item: Zotero.Item,
    fileUrl: string,
    title: string,
  ): Promise<Zotero.Item | null> {
    const response = await Zotero.HTTP.request("GET", fileUrl, {
      responseType: "arraybuffer",
      headers: this.buildRequestHeaders({
        "User-Agent": "Zotero Zotadata/1.0",
        Accept: "application/pdf,*/*",
        Referer: new URL(fileUrl).origin,
      }),
      timeout: 30000,
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: download failed`);
    }

    if (!this.responseLanguageMatchesLocale(response)) {
      throw new Error("Downloaded file language conflicts with Zotero locale");
    }

    const data = this.toUint8Array(response.response);
    if (data.length === 0) {
      throw new Error("Empty response received from server");
    }
    if (!this.validatePDFData(data)) {
      throw new Error("Downloaded data is not a valid PDF file");
    }

    return this.createAttachmentFromData(item, data, title);
  }

  private buildRequestHeaders(
    headers: Record<string, string> = {},
  ): Record<string, string> {
    return {
      "Accept-Language": buildAcceptLanguageHeader(),
      ...headers,
    };
  }

  private responseLanguageMatchesLocale(response: {
    getResponseHeader?: (name: string) => string | null;
  }): boolean {
    if (typeof response.getResponseHeader !== "function") {
      return true;
    }

    const language = response.getResponseHeader("Content-Language");
    if (!language) {
      return true;
    }

    const [primaryLanguage] = language.split(",");
    return matchesPreferredLanguage(primaryLanguage);
  }

  private async createAttachmentFromData(
    item: Zotero.Item,
    data: Uint8Array,
    title: string,
  ): Promise<Zotero.Item | null> {
    const buffer = Uint8Array.from(data).buffer;

    if (typeof Zotero.Attachments.importFromBuffer === "function") {
      const attachment = await Zotero.Attachments.importFromBuffer({
        buffer,
        fileName: `${this.sanitizeFileName(title)}.pdf`,
        contentType: "application/pdf",
        parentItemID: item.id,
      });
      if (attachment) {
        return attachment;
      }
    }

    return this.createAttachmentFromDataLegacy(item, data, title);
  }

  private async createAttachmentFromDataLegacy(
    item: Zotero.Item,
    data: Uint8Array,
    title: string,
  ): Promise<Zotero.Item | null> {
    const zoteroWithTemp = Zotero as typeof Zotero & {
      getTempDirectory?: () => {
        append: (name: string) => void;
        clone: () => {
          append: (name: string) => void;
          exists: () => boolean;
          fileSize?: number;
          path: string;
          remove: (recursive: boolean) => void;
        };
      };
    };
    const tempDir = zoteroWithTemp.getTempDirectory?.();
    if (!tempDir || typeof Zotero.Attachments.importFromFile !== "function") {
      throw new Error(
        "No stored-file fallback is available in this Zotero runtime",
      );
    }

    const tempFile = tempDir.clone();
    tempFile.append(
      `${this.sanitizeFileName(title)}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.pdf`,
    );

    try {
      await this.writeTempPdfFile(tempFile, data);
      const attachment = await Zotero.Attachments.importFromFile({
        file: tempFile,
        parentItemID: item.id,
        title,
      });
      return attachment ?? null;
    } finally {
      if (tempFile.exists()) {
        try {
          tempFile.remove(false);
        } catch {
          // Ignore temp cleanup failures.
        }
      }
    }
  }

  private async writeTempPdfFile(
    tempFile: { path: string },
    data: Uint8Array,
  ): Promise<void> {
    type FileOutputStream = {
      close(): void;
      init(
        file: unknown,
        ioFlags: number,
        perm: number,
        behaviorFlags: number,
      ): void;
    };
    type BinaryOutputStream = {
      close(): void;
      setOutputStream(stream: FileOutputStream): void;
      writeBytes(data: string, length: number): void;
    };

    const globalScope = globalThis as typeof globalThis & {
      OS?: {
        File?: {
          writeAtomic?: (
            targetPath: string,
            bytes: Uint8Array,
          ) => Promise<void>;
        };
      };
      Components?: {
        classes: Record<
          string,
          { createInstance: (iface: unknown) => unknown }
        >;
        interfaces: Record<string, unknown>;
      };
    };

    if (globalScope.OS?.File?.writeAtomic) {
      await globalScope.OS.File.writeAtomic(tempFile.path, data);
      return;
    }

    const components = globalScope.Components;
    if (!components) {
      throw new Error("Unable to write temporary PDF file");
    }

    const fileOutputStream = components.classes[
      "@mozilla.org/network/file-output-stream;1"
    ].createInstance(
      components.interfaces.nsIFileOutputStream,
    ) as FileOutputStream;
    fileOutputStream.init(tempFile, 0x02 | 0x08 | 0x20, 0o644, 0);

    const binaryStream = components.classes[
      "@mozilla.org/binaryoutputstream;1"
    ].createInstance(
      components.interfaces.nsIBinaryOutputStream,
    ) as BinaryOutputStream;
    binaryStream.setOutputStream(fileOutputStream);

    let offset = 0;
    const chunkSize = 65536;
    while (offset < data.length) {
      const chunk = data.slice(offset, offset + chunkSize);
      const binaryString = String.fromCharCode(...chunk);
      binaryStream.writeBytes(binaryString, binaryString.length);
      offset += chunk.length;
    }

    binaryStream.close();
    fileOutputStream.close();
  }

  private verifyStoredAttachment(
    attachment: Zotero.Item | null | undefined,
  ): boolean {
    if (!attachment) {
      return false;
    }

    const attachmentLike = attachment as Zotero.Item & {
      attachmentLinkMode?: number;
      fileExists?: () => Promise<boolean>;
      getFile?: () => { exists?: () => boolean } | null;
    };
    const importedUrlMode = (
      Zotero.Attachments as typeof Zotero.Attachments & {
        LINK_MODE_IMPORTED_URL?: number;
      }
    ).LINK_MODE_IMPORTED_URL;
    const linkMode = attachmentLike.attachmentLinkMode;

    if (typeof linkMode !== "number") {
      return true;
    }

    const isStored =
      linkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
      (typeof importedUrlMode === "number" && linkMode === importedUrlMode);
    if (!isStored) {
      return false;
    }

    try {
      const file = attachmentLike.getFile?.();
      if (file?.exists?.()) {
        return true;
      }
    } catch {
      return true;
    }

    return true;
  }

  private validatePDFData(data: Uint8Array): boolean {
    if (data.length < 1024) {
      return false;
    }

    const header = new TextDecoder("ascii", { fatal: false }).decode(
      data.slice(0, 8),
    );
    return header.startsWith("%PDF-");
  }

  private toUint8Array(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(
        value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ),
      );
    }
    return new Uint8Array();
  }

  private cleanDownloadUrl(url: string): string {
    try {
      const cleaned = url.split("#")[0].replace(/([^:]\/)\/+/g, "$1");
      const parsed = new URL(cleaned);
      parsed.searchParams.delete("navpanes");
      parsed.searchParams.delete("view");
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private sanitizeFileName(filename: string): string {
    return (filename || "attachment")
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_")
      .substring(0, 100)
      .trim();
  }

  private buildAttachmentTitle(item: Zotero.Item, source: string): string {
    const baseTitle = String(item.getField("title") ?? "").trim() || "Untitled";
    return source ? `${baseTitle} (${source})` : baseTitle;
  }

  static buildSearchQuery(item: Zotero.Item): SearchQuery {
    const query: SearchQuery = {};

    const title = (item.getField("title") as string)?.trim();
    if (title) query.title = title;

    const extraField = (item.getField("extra") as string) ?? "";
    const doiField = (item.getField("DOI") as string)?.trim();
    if (doiField) {
      query.doi = normalizeDoi(doiField);
    } else {
      const fromExtra = parseDoiFromExtra(extraField);
      if (fromExtra) query.doi = fromExtra;
    }

    const date = item.getField("date") as string | undefined;
    if (date) {
      const y = parseInt(date, 10);
      if (!Number.isNaN(y)) query.year = y;
    }

    const creators = item.getCreators();
    const authors = creators
      .filter((c) => c.creatorType === "author")
      .map((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim())
      .filter((n) => n.length > 0);
    if (authors.length > 0) query.authors = authors;

    const arxivMatch = extraField.match(/arXiv:\s*([^\s]+)/i);
    if (arxivMatch) query.arxivId = arxivMatch[1];

    return query;
  }

  static formatSummary(
    results: FileFinderResult[],
    totalSelected: number,
  ): string {
    const downloaded = results.filter((r) => r.outcome === "downloaded");
    const alreadyHas = results.filter((r) => r.outcome === "already_has_file");
    const notFound = results.filter((r) => r.outcome === "no_source_found");
    const failed = results.filter((r) => r.outcome === "download_failed");
    const skipped = results.filter((r) => r.outcome === "skipped_not_regular");

    const total = results.length;
    const successCount = downloaded.length + alreadyHas.length;
    const successRate =
      total > 0 ? Math.round((successCount / total) * 100) : 0;

    const parts: string[] = [];

    if (downloaded.length > 0) {
      const sources = [...new Set(downloaded.map((r) => r.source))].join(", ");
      parts.push(
        `• ${downloaded.length} PDF${downloaded.length !== 1 ? "s" : ""} downloaded (${sources})`,
      );
    }

    if (alreadyHas.length > 0) {
      parts.push(`• ${alreadyHas.length} already had files`);
    }

    if (notFound.length > 0) {
      parts.push(`• ${notFound.length} — no open-access PDF found`);
    }

    if (failed.length > 0) {
      parts.push(
        `• ${failed.length} download${failed.length !== 1 ? "s" : ""} failed`,
      );
    }

    if (skipped.length > 0) {
      parts.push(`• ${skipped.length} skipped (notes/attachments)`);
    }

    if (parts.length === 0) {
      return `📊 Checked ${totalSelected} item(s). Nothing to do.`;
    }

    return [
      `📊 Find Files — ${totalSelected} item(s) checked. • Success rate: ${successRate}%`,
      ...parts,
    ].join("\n");
  }

  private log(message: string): void {
    if (typeof Zotero !== "undefined" && Zotero.log) {
      Zotero.log(`Zotadata FileFinder: ${message}`);
    }
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

  private static titleSimilarity(title1: string, title2: string): number {
    const normalize = (value: string): string =>
      value
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const one = new Set(normalize(title1).split(" ").filter(Boolean));
    const two = new Set(normalize(title2).split(" ").filter(Boolean));
    const intersection = new Set([...one].filter((word) => two.has(word)));
    const union = new Set([...one, ...two]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private getItemTypeName(item: Zotero.Item): string {
    try {
      if (typeof Zotero !== "undefined" && Zotero.ItemTypes?.getName) {
        return Zotero.ItemTypes.getName(item.itemTypeID);
      }
    } catch {
      // Fall through to heuristic below.
    }

    return this.extractISBN(item) ? "book" : "journalArticle";
  }
}
