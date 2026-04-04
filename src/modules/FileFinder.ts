import { ErrorManager, ErrorType } from '@/shared/core';
import { OpenAlexAPI } from '@/features/metadata/apis/OpenAlexAPI';
import { SemanticScholarAPI } from '@/features/metadata/apis/SemanticScholarAPI';
import type {
  FileFinderResult,
  FileFinderOutcome,
  SearchQuery,
  SearchResult,
} from '@/shared/core/types';

/**
 * Resolved PDF source from an open-access lookup.
 */
interface ResolvedPDF {
  url: string;
  source: string;
  confidence: number;
}

const UNPAYWALL_EMAIL = 'zotadata@users.noreply.github.com';
const CONCURRENCY = 3;

/**
 * Finds and downloads missing PDF attachments for Zotero library items.
 *
 * Strategy (per item):
 * 1. Skip items that already have a stored-file attachment.
 * 2. If a DOI is available, try Unpaywall (purpose-built OA lookup).
 * 3. Search OpenAlex and Semantic Scholar for open-access PDF URLs.
 * 4. Download the best candidate via `Zotero.Attachments.importFromURL`.
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
      return 'No active Zotero window.';
    }

    const selected = pane.getSelectedItems();
    if (selected.length === 0) {
      return 'No items selected.';
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
        if (settled.status === 'fulfilled') {
          results.push(settled.value);
        } else {
          results.push({
            item: batch[idx],
            outcome: 'download_failed',
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
      return { item, outcome: 'skipped_not_regular' };
    }

    if (await this.hasStoredFileAttachment(item)) {
      return { item, outcome: 'already_has_file' };
    }

    const query = FileFinder.buildSearchQuery(item);
    const resolved = await this.findPDFUrl(query);

    if (!resolved) {
      return { item, outcome: 'no_source_found' };
    }

    try {
      await this.downloadAndAttach(item, resolved);
      return {
        item,
        outcome: 'downloaded',
        source: resolved.source,
        pdfUrl: resolved.url,
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error);
      this.log(`Download failed for item ${item.id}: ${msg}`);
      return {
        item,
        outcome: 'download_failed',
        source: resolved.source,
        pdfUrl: resolved.url,
        error: msg,
      };
    }
  }

  /**
   * Returns true when the item already owns at least one stored-file attachment.
   */
  private async hasStoredFileAttachment(item: Zotero.Item): Promise<boolean> {
    const attachmentIds = item.getAttachments();
    for (const id of attachmentIds) {
      const att = Zotero.Items.get(id);
      if (!att) continue;
      if (
        att.isAttachment?.() &&
        att.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL
      ) {
        const exists = await att.fileExists();
        if (exists) return true;
      }
    }
    return false;
  }

  /**
   * Try multiple sources to locate an open-access PDF URL.
   */
  private async findPDFUrl(query: SearchQuery): Promise<ResolvedPDF | null> {
    // 1. Unpaywall (DOI-based, most reliable)
    if (query.doi) {
      const unpaywall = await this.tryUnpaywall(query.doi);
      if (unpaywall) return unpaywall;
    }

    // 2. OpenAlex open-access search
    const openAlex = await this.tryOpenAlex(query);
    if (openAlex) return openAlex;

    // 3. Semantic Scholar open-access search
    const s2 = await this.trySemanticScholar(query);
    if (s2) return s2;

    return null;
  }

  private async tryUnpaywall(doi: string): Promise<ResolvedPDF | null> {
    try {
      const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${UNPAYWALL_EMAIL}`;
      const response = await Zotero.HTTP.request('GET', url, {
        timeout: 15000,
        responseType: 'text',
      });

      if (response.status !== 200) return null;

      const data = JSON.parse(response.responseText) as {
        best_oa_location?: { url_for_pdf?: string; url?: string };
        is_oa?: boolean;
      };

      const pdfUrl =
        data.best_oa_location?.url_for_pdf ?? data.best_oa_location?.url;
      if (!pdfUrl || !data.is_oa) return null;

      return { url: pdfUrl, source: 'Unpaywall', confidence: 0.95 };
    } catch {
      return null;
    }
  }

  private async tryOpenAlex(query: SearchQuery): Promise<ResolvedPDF | null> {
    try {
      const results = await this.openAlexAPI.searchOpenAccess(query);
      return FileFinder.pickBestPDF(results, 'OpenAlex');
    } catch {
      return null;
    }
  }

  private async trySemanticScholar(
    query: SearchQuery,
  ): Promise<ResolvedPDF | null> {
    try {
      const results = await this.semanticScholarAPI.searchOpenAccess(query);
      return FileFinder.pickBestPDF(results, 'Semantic Scholar');
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

    if (withPdf.length === 0) return null;
    return {
      url: withPdf[0].pdfUrl!,
      source,
      confidence: withPdf[0].confidence,
    };
  }

  /**
   * Download PDF and attach it to the parent item via Zotero's built-in API.
   */
  private async downloadAndAttach(
    item: Zotero.Item,
    resolved: ResolvedPDF,
  ): Promise<void> {
    await Zotero.Attachments.importFromURL({
      url: resolved.url,
      parentItemID: item.id,
      title: `${(item.getField('title') as string) || 'Untitled'}.pdf`,
      contentType: 'application/pdf',
    });
  }

  static buildSearchQuery(item: Zotero.Item): SearchQuery {
    const query: SearchQuery = {};

    const title = (item.getField('title') as string)?.trim();
    if (title) query.title = title;

    const doi = (item.getField('DOI') as string)?.trim();
    if (doi) query.doi = doi;

    const date = item.getField('date') as string | undefined;
    if (date) {
      const y = parseInt(date, 10);
      if (!Number.isNaN(y)) query.year = y;
    }

    const creators = item.getCreators();
    const authors = creators
      .filter((c) => c.creatorType === 'author')
      .map((c) => `${c.firstName || ''} ${c.lastName || ''}`.trim())
      .filter((n) => n.length > 0);
    if (authors.length > 0) query.authors = authors;

    const extra = (item.getField('extra') as string) ?? '';
    const arxivMatch = extra.match(/arXiv:\s*([^\s]+)/i);
    if (arxivMatch) query.arxivId = arxivMatch[1];

    return query;
  }

  static formatSummary(
    results: FileFinderResult[],
    totalSelected: number,
  ): string {
    const downloaded = results.filter((r) => r.outcome === 'downloaded');
    const alreadyHas = results.filter((r) => r.outcome === 'already_has_file');
    const notFound = results.filter((r) => r.outcome === 'no_source_found');
    const failed = results.filter((r) => r.outcome === 'download_failed');
    const skipped = results.filter((r) => r.outcome === 'skipped_not_regular');

    const parts: string[] = [];

    if (downloaded.length > 0) {
      const sources = [...new Set(downloaded.map((r) => r.source))].join(', ');
      parts.push(
        `${downloaded.length} PDF${downloaded.length !== 1 ? 's' : ''} downloaded (${sources})`,
      );
    }

    if (alreadyHas.length > 0) {
      parts.push(`${alreadyHas.length} already had files`);
    }

    if (notFound.length > 0) {
      parts.push(`${notFound.length} — no open-access PDF found`);
    }

    if (failed.length > 0) {
      parts.push(`${failed.length} download${failed.length !== 1 ? 's' : ''} failed`);
    }

    if (skipped.length > 0) {
      parts.push(`${skipped.length} skipped (notes/attachments)`);
    }

    if (parts.length === 0) {
      return `Checked ${totalSelected} item(s). Nothing to do.`;
    }

    return [
      `Find Files — ${totalSelected} item(s) checked.`,
      parts.join(' · ') + '.',
    ].join('\n');
  }

  private log(message: string): void {
    if (typeof Zotero !== 'undefined' && Zotero.log) {
      Zotero.log(`Zotadata FileFinder: ${message}`);
    }
  }
}
