import { CrossRefAPI } from '@/features/metadata/apis/CrossRefAPI';
import { SemanticScholarAPI } from '@/features/metadata/apis/SemanticScholarAPI';
import { StringUtils } from '@/shared/utils/StringUtils';
import type {
  ArxivProcessResult,
  CrossRefWork,
  SearchQuery,
  SemanticScholarPaper,
} from '@/shared/core/types';

/**
 * Discover published versions of arXiv preprints and normalize item metadata.
 */
export class ArxivProcessor {
  private crossRefAPI: CrossRefAPI;
  private semanticScholarAPI: SemanticScholarAPI;

  constructor(
    crossRefAPI?: CrossRefAPI,
    semanticScholarAPI?: SemanticScholarAPI,
  ) {
    this.crossRefAPI = crossRefAPI ?? new CrossRefAPI();
    this.semanticScholarAPI = semanticScholarAPI ?? new SemanticScholarAPI();
  }

  /**
   * Process all selected library items (arXiv pipeline).
   */
  async processSelectedItems(): Promise<string> {
    const pane = Zotero.getActiveZoteroPane();
    if (!pane) {
      return 'No active Zotero window.';
    }

    const selected = pane.getSelectedItems().filter((i) => i.isRegularItem());
    if (selected.length === 0) {
      return 'No items selected.';
    }

    const outcomes = await Promise.all(
      selected.map((item) => this.processArxivItem(item)),
    );

    return this.formatBatchSummary(outcomes, selected.length);
  }

  /**
   * Run arXiv pipeline for one item.
   */
  async processArxivItem(item: Zotero.Item): Promise<ArxivProcessResult> {
    try {
      if (!ArxivProcessor.isArxivItem(item)) {
        return {
          processed: false,
          converted: false,
          foundPublished: false,
          outcome: 'skipped_not_arxiv',
        };
      }

      const publishedRef = await this.findPublishedVersion(item);
      if (publishedRef) {
        const updated = await this.updateItemAsPublishedVersion(
          item,
          publishedRef,
        );
        if (updated) {
          item.addTag('Updated to Published Version', 1);
          await item.saveTx();
          return {
            processed: true,
            converted: false,
            foundPublished: true,
            outcome: 'updated_published',
          };
        }
        return {
          processed: false,
          converted: false,
          foundPublished: false,
          outcome: 'failed_metadata',
        };
      }

      const typeName = Zotero.ItemTypes.getName(item.itemTypeID);
      if (typeName === 'journalArticle') {
        await this.convertToPreprint(item);
        return {
          processed: true,
          converted: true,
          foundPublished: false,
          outcome: 'converted_preprint',
        };
      }

      return {
        processed: true,
        converted: false,
        foundPublished: false,
        outcome: 'unchanged',
      };
    } catch {
      item.addTag('arXiv Process Error', 1);
      return {
        processed: false,
        converted: false,
        foundPublished: false,
        outcome: 'failed_exception',
      };
    }
  }

  /**
   * Resolve a published DOI or Semantic-Scholar-style venue string.
   */
  async findPublishedVersion(item: Zotero.Item): Promise<string | null> {
    const title = (item.getField('title') as string)?.trim();
    if (!title) {
      return null;
    }

    const arxivId = ArxivProcessor.extractArxivId(item);
    if (arxivId) {
      const byArxiv = await this.searchCrossRefByArxivId(arxivId);
      if (byArxiv) {
        return byArxiv;
      }
    }

    const byCrossRef = await this.searchCrossRefForPublishedVersion(item);
    if (byCrossRef) {
      return byCrossRef;
    }

    return this.searchSemanticScholarForPublishedVersion(item);
  }

  static isArxivItem(item: Zotero.Item): boolean {
    try {
      const pub = String(item.getField('publicationTitle') ?? '').toLowerCase();
      if (pub.includes('arxiv')) {
        return true;
      }

      const url = String(item.getField('url') ?? '').toLowerCase();
      if (url.includes('arxiv.org')) {
        return true;
      }

      const extra = String(item.getField('extra') ?? '');
      if (/arXiv:\s*\S+/i.test(extra)) {
        return true;
      }

      const title = String(item.getField('title') ?? '').toLowerCase();
      if (/\barxiv\b/.test(title)) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  static extractArxivId(item: Zotero.Item): string | null {
    const extra = String(item.getField('extra') ?? '');
    const url = String(item.getField('url') ?? '');

    const fromExtra = extra.match(/arXiv:\s*([^\s]+)/i);
    if (fromExtra) {
      return fromExtra[1].replace(/v\d+$/i, '');
    }

    const fromString = StringUtils.extractArxivId(extra);
    if (fromString) {
      return fromString.replace(/v\d+$/i, '');
    }

    const fromUrl = url.match(
      /arxiv\.org\/(?:abs|pdf)\/([a-z-]+\/\d+(?:v\d+)?|\d+\.\d+(?:v\d+)?)/i,
    );
    if (fromUrl) {
      return fromUrl[1].replace(/v\d+$/i, '');
    }

    return null;
  }

  static titleSimilarity(title1: string, title2: string): number {
    const normalize = (s: string): string =>
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words1 = new Set(
      normalize(title1)
        .split(' ')
        .filter((w) => w.length > 2),
    );
    const words2 = new Set(
      normalize(title2)
        .split(' ')
        .filter((w) => w.length > 2),
    );

    if (words1.size === 0 || words2.size === 0) {
      return 0;
    }

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  private async searchCrossRefByArxivId(arxivId: string): Promise<string | null> {
    const works = await this.crossRefAPI.fetchWorksByArxivId(arxivId);
    for (const work of works) {
      if (!ArxivProcessor.isArxivPreprintCrossRefWork(work) && work.DOI) {
        return work.DOI;
      }
    }
    return null;
  }

  private async searchCrossRefForPublishedVersion(
    item: Zotero.Item,
  ): Promise<string | null> {
    const query = ArxivProcessor.buildItemSearchQuery(item);
    if (!query.title) {
      return null;
    }

    const works = await this.crossRefAPI.fetchWorksByQuery(query);
    for (const work of works) {
      if (!ArxivProcessor.isArxivPreprintCrossRefWork(work) && work.DOI) {
        return work.DOI;
      }
    }
    return null;
  }

  private async searchSemanticScholarForPublishedVersion(
    item: Zotero.Item,
  ): Promise<string | null> {
    const title = (item.getField('title') as string)?.trim();
    if (!title) {
      return null;
    }

    const exact = await this.searchSemanticScholarExactPublished(title);
    if (exact) {
      return exact;
    }

    return this.searchSemanticScholarRelaxedPublished(title);
  }

  private async searchSemanticScholarExactPublished(
    title: string,
  ): Promise<string | null> {
    const quoted = `"${title.replace(/"/g, '')}"`;
    const papers = await this.semanticScholarAPI.searchPapersWithExternalIds(
      quoted,
      10,
    );
    return this.pickPublishedFromPapers(papers, title, 0.7);
  }

  private async searchSemanticScholarRelaxedPublished(
    title: string,
  ): Promise<string | null> {
    const cleaned = ArxivProcessor.cleanTitleForRelaxedSearch(title);
    const papers = await this.semanticScholarAPI.searchPapersWithExternalIds(
      cleaned,
      15,
    );
    return this.pickPublishedFromPapers(papers, title, 0.9);
  }

  private pickPublishedFromPapers(
    papers: SemanticScholarPaper[],
    itemTitle: string,
    minSimilarity: number,
  ): string | null {
    for (const paper of papers) {
      if (ArxivProcessor.isArxivVenue(paper.venue)) {
        continue;
      }

      const sim = ArxivProcessor.titleSimilarity(itemTitle, paper.title);
      if (sim < minSimilarity) {
        continue;
      }

      const doi =
        paper.doi ||
        (paper.externalIds?.DOI ? String(paper.externalIds.DOI) : null);
      if (doi) {
        return doi;
      }

      if (paper.venue) {
        return `VENUE:${paper.venue}|TITLE:${paper.title}`;
      }
    }
    return null;
  }

  private static cleanTitleForRelaxedSearch(title: string): string {
    return title
      .replace(/[^\w\s:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);
  }

  private static isArxivVenue(venue?: string): boolean {
    if (!venue) {
      return false;
    }
    const v = venue.toLowerCase();
    return v === 'arxiv' || v.includes('arxiv');
  }

  private static isArxivPreprintCrossRefWork(work: CrossRefWork): boolean {
    const doi = work.DOI?.toLowerCase() ?? '';
    if (doi.includes('arxiv') || doi.includes('48550')) {
      return true;
    }

    const container = (work['container-title']?.[0] ?? '').toLowerCase();
    if (container.includes('arxiv')) {
      return true;
    }

    const t = (work.type ?? '').toLowerCase();
    if (t === 'posted-content') {
      return true;
    }

    return false;
  }

  private static buildItemSearchQuery(item: Zotero.Item): SearchQuery {
    const query: SearchQuery = {};
    const title = (item.getField('title') as string)?.trim();
    if (title) {
      query.title = title;
    }

    const creators = item.getCreators();
    const authors = creators
      .filter((c) => c.creatorType === 'author')
      .map((c) => `${c.firstName || ''} ${c.lastName || ''}`.trim())
      .filter((n) => n.length > 0);
    if (authors.length > 0) {
      query.authors = authors;
    }

    const date = item.getField('date') as string | undefined;
    if (date) {
      const y = parseInt(date, 10);
      if (!Number.isNaN(y)) {
        query.year = y;
      }
    }

    return query;
  }

  private static isConferenceVenueName(venue: string): boolean {
    const v = venue.toUpperCase();
    if (/\bPROCEEDINGS\b/.test(v)) {
      return true;
    }
    const markers = [
      'ICML',
      'ICLR',
      'NEURIPS',
      'CVPR',
      'ICCV',
      'ECCV',
      'ACL',
      'EMNLP',
      'AAAI',
      'IJCAI',
    ];
    return markers.some((m) => v.includes(m));
  }

  /**
   * Apply published metadata: DOI string or VENUE:…|TITLE:… from Semantic Scholar.
   * @returns whether the item was updated
   */
  async updateItemAsPublishedVersion(
    item: Zotero.Item,
    publishedInfo: string,
  ): Promise<boolean> {
    const venueFormat = publishedInfo.match(/^VENUE:([^|]+)\|TITLE:(.+)$/);
    if (venueFormat) {
      const venue = venueFormat[1].trim();
      if (ArxivProcessor.isConferenceVenueName(venue)) {
        item.setType(Zotero.ItemTypes.getID('conferencePaper'));
        item.setField('proceedingsTitle', venue);
        item.setField('publicationTitle', '');
      } else {
        item.setType(Zotero.ItemTypes.getID('journalArticle'));
        item.setField('publicationTitle', venue);
      }
      item.setField('repository', '');
      await item.saveTx();
      await this.updateAttachmentsForPublishedVersion(item);
      return true;
    }

    const doi = publishedInfo.trim();
    const work = await this.crossRefAPI.getCrossRefWorkMessage(doi);
    if (!work) {
      return false;
    }

    item.setField('DOI', work.DOI);
    item.setField('repository', '');

    const title = Array.isArray(work.title) ? work.title[0] : work.title;
    if (title) {
      item.setField('title', title);
    }

    const year = work.published?.['date-parts']?.[0]?.[0];
    if (year) {
      item.setField('date', String(year));
    }

    const workType = (work.type ?? '').toLowerCase();
    if (workType === 'proceedings-article') {
      item.setType(Zotero.ItemTypes.getID('conferencePaper'));
      const proc = work['container-title']?.[0];
      if (proc) {
        item.setField('proceedingsTitle', proc);
      }
      item.setField('publicationTitle', '');
    } else {
      item.setType(Zotero.ItemTypes.getID('journalArticle'));
      const journal = work['container-title']?.[0];
      if (journal) {
        item.setField('publicationTitle', journal);
      }
    }

    if (work.volume) {
      item.setField('volume', work.volume);
    }
    if (work.issue) {
      item.setField('issue', work.issue);
    }
    if (work.page) {
      item.setField('pages', work.page);
    }

    ArxivProcessor.applyAuthorsFromCrossRef(item, work);
    await item.saveTx();
    await this.updateAttachmentsForPublishedVersion(item);
    return true;
  }

  private static applyAuthorsFromCrossRef(
    item: Zotero.Item,
    work: CrossRefWork,
  ): void {
    if (!work.author || work.author.length === 0) {
      return;
    }

    const newAuthors = work.author.map((a) => ({
      creatorType: 'author' as const,
      firstName: (a.given ?? '').trim(),
      lastName: (a.family ?? '').trim(),
    }));

    const existing = item.getCreators();
    const nonAuthors = existing.filter((c) => c.creatorType !== 'author');
    item.setCreators([...newAuthors, ...nonAuthors]);
  }

  private async updateAttachmentsForPublishedVersion(
    _item: Zotero.Item,
  ): Promise<void> {
    // Future: replace arXiv PDF with publisher OA PDF when available.
  }

  async convertToPreprint(item: Zotero.Item): Promise<void> {
    const preprintId = Zotero.ItemTypes.getID('preprint');
    item.setType(preprintId);

    const repo = String(item.getField('repository') ?? '').trim();
    if (!repo) {
      item.setField('repository', 'arXiv');
    }

    item.setField('publicationTitle', '');
    item.addTag('Converted to Preprint', 1);
    await item.saveTx();
  }

  private formatBatchSummary(
    outcomes: ArxivProcessResult[],
    total: number,
  ): string {
    const published = outcomes.filter(
      (o) => o.outcome === 'updated_published',
    ).length;
    const preprint = outcomes.filter(
      (o) => o.outcome === 'converted_preprint',
    ).length;
    const skipped = outcomes.filter(
      (o) => o.outcome === 'skipped_not_arxiv',
    ).length;
    const failed = outcomes.filter(
      (o) => o.outcome === 'failed_metadata' || o.outcome === 'failed_exception',
    ).length;

    const parts: string[] = [];
    if (published > 0) {
      parts.push(
        `${published} ${published === 1 ? 'item' : 'items'} updated to published metadata`,
      );
    }
    if (preprint > 0) {
      parts.push(
        `${preprint} ${preprint === 1 ? 'item' : 'items'} converted to preprint`,
      );
    }
    if (skipped > 0) {
      parts.push(
        `${skipped} not arXiv (left unchanged)`,
      );
    }
    if (failed > 0) {
      parts.push(
        `${failed} could not be completed (see arXiv Process Error tag if applicable)`,
      );
    }

    const unchanged = outcomes.filter((o) => o.outcome === 'unchanged').length;
    if (unchanged > 0 && published === 0 && preprint === 0 && failed === 0) {
      parts.push(
        `${unchanged} arXiv ${unchanged === 1 ? 'item' : 'items'} left as-is (already non-journal or no published match)`,
      );
    }

    if (parts.length === 0) {
      return `Finished — ${total} item(s) checked. No changes applied.`;
    }

    return [`Finished — ${total} item(s) checked.`, parts.join(' · ') + '.'].join(
      '\n',
    );
  }
}
