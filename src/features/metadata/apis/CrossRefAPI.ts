import { BaseMetadataAPI } from "./BaseMetadataAPI";
import { isExactTitleMatch } from "@/utils/similarity";
import { mapCrossRefTypeToZotero } from "@/utils/typeMapping";
import type {
  CrossRefWork,
  SearchQuery,
  SearchResult,
  RateLimitConfig,
} from "@/shared/core/types";

/**
 * CrossRef API implementation for DOI discovery and metadata fetching
 */
export class CrossRefAPI extends BaseMetadataAPI {
  constructor() {
    super(
      "https://api.crossref.org",
      { requests: 50, window: 1000 }, // 50 requests per second
      { ttl: 3600000, maxSize: 500 }, // 1 hour cache
    );
  }

  /**
   * Search CrossRef for works matching the query
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const searchParams = this.buildSearchParams(query);
    const endpoint = `/works?${searchParams}`;

    const response = await this.request<{
      status: string;
      "message-type": string;
      "message-version": string;
      message: {
        "total-results": number;
        items: CrossRefWork[];
      };
    }>(endpoint);

    return this.transformResults(response.data.message.items, query);
  }

  /**
   * Get work by DOI
   */
  async getWorkByDOI(doi: string): Promise<SearchResult | null> {
    const cleanDOI = this.cleanDOI(doi);
    const endpoint = `/works/${encodeURIComponent(cleanDOI)}`;

    try {
      const response = await this.request<{
        status: string;
        "message-type": string;
        "message-version": string;
        message: CrossRefWork;
      }>(endpoint);

      const results = this.transformResults([response.data.message], {
        doi: cleanDOI,
      });
      return results[0] || null;
    } catch (error) {
      // DOI not found is not an error
      return null;
    }
  }

  /**
   * Fetch raw CrossRef work metadata by DOI (for arXiv → published migration).
   */
  async getCrossRefWorkMessage(doi: string): Promise<CrossRefWork | null> {
    const cleanDOI = this.cleanDOI(doi);
    const endpoint = `/works/${encodeURIComponent(cleanDOI)}`;

    try {
      const response = await this.request<{
        status: string;
        "message-type": string;
        "message-version": string;
        message: CrossRefWork;
      }>(endpoint);

      return response.data.message ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Raw work list for arXiv-ID query (caller filters preprints).
   */
  async fetchWorksByArxivId(arxivId: string): Promise<CrossRefWork[]> {
    const cleanArxivId = arxivId.replace(/^arxiv:/i, "");
    const endpoint = `/works?query=${encodeURIComponent(cleanArxivId)}&rows=10&sort=relevance`;

    try {
      const response = await this.request<{
        message: {
          items: CrossRefWork[];
        };
      }>(endpoint);

      return response.data.message.items ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Raw work list for structured query (title / author / year).
   */
  async fetchWorksByQuery(query: SearchQuery): Promise<CrossRefWork[]> {
    const searchParams = this.buildSearchParams(query);
    const endpoint = `/works?${searchParams}`;

    try {
      const response = await this.request<{
        message: {
          items: CrossRefWork[];
        };
      }>(endpoint);

      return response.data.message.items ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Search by arXiv ID to find published version
   */
  async searchByArxivId(arxivId: string): Promise<SearchResult[]> {
    const cleanArxivId = arxivId.replace(/^arxiv:/i, "");
    const searchQuery = `${cleanArxivId}`;
    const endpoint = `/works?query=${encodeURIComponent(searchQuery)}&rows=10&sort=relevance`;

    const response = await this.request<{
      status: string;
      "message-type": string;
      "message-version": string;
      message: {
        "total-results": number;
        items: CrossRefWork[];
      };
    }>(endpoint);

    return this.transformResults(response.data.message.items, {
      arxivId: cleanArxivId,
    });
  }

  /**
   * Build optimized search query for CrossRef
   */
  private buildSearchParams(query: SearchQuery): string {
    const params = new URLSearchParams();

    if (query.title) {
      params.append("query.title", this.cleanTitle(query.title));
    }

    if (query.authors && query.authors.length > 0) {
      params.append("query.author", query.authors[0]);
    }

    if (query.containerTitle) {
      params.append("query.container-title", query.containerTitle);
    }

    if (query.issn) {
      params.append("query.issn", query.issn);
    }

    if (query.year) {
      const bibParts: string[] = [String(query.year)];
      if (query.volume) bibParts.push(`vol:${query.volume}`);
      if (query.issue) bibParts.push(`issue:${query.issue}`);
      params.append("query.bibliographic", bibParts.join(" "));
    }

    if (query.doi) {
      params.append("query.doi", this.cleanDOI(query.doi));
    }

    params.append("rows", "10");
    params.append("sort", "relevance");
    params.append(
      "select",
      "DOI,title,original-title,author,published,container-title,URL,type,is-referenced-by-count,language",
    );

    return params.toString();
  }

  /**
   * Transform CrossRef works to standardized search results
   */
  private transformResults(
    works: CrossRefWork[],
    originalQuery: SearchQuery,
  ): SearchResult[] {
    return works.map((work) => {
      const result: SearchResult = {
        title: Array.isArray(work.title) ? work.title[0] : work.title,
        authors:
          work.author?.map((author) =>
            `${author.given || ""} ${author.family}`.trim(),
          ) || [],
        year: work.published?.["date-parts"]?.[0]?.[0],
        doi: work.DOI,
        url: work.URL,
        confidence: this.calculateConfidence(work, originalQuery),
        source: "CrossRef",
        containerTitle: work["container-title"]?.[0],
        volume: work.volume,
        issue: work.issue,
        pages: work.page,
        language: work.language,
        itemType: mapCrossRefTypeToZotero(work.type),
      };

      return result;
    });
  }

  /**
   * Calculate confidence score for search result
   */
  private calculateConfidence(work: CrossRefWork, query: SearchQuery): number {
    // DOI check - exact match or reject
    if (query.doi) {
      if (work.DOI && this.cleanDOI(query.doi) === this.cleanDOI(work.DOI)) {
        return 1.0;
      }
      return 0.1;
    }

    // Title check - must match if title is in query
    if (query.title && work.title) {
      const workTitle = Array.isArray(work.title) ? work.title[0] : work.title;
      if (!isExactTitleMatch(query.title, workTitle)) {
        return 0.1;
      }
    }

    let confidence = 0.5;

    if (query.title && work.title) {
      confidence += 0.4;
    }

    if (query.authors && work.author) {
      const authorMatch = this.calculateAuthorMatch(query.authors, work.author);
      confidence += authorMatch * 0.3;
    }

    if (query.year && work.published?.["date-parts"]?.[0]?.[0]) {
      const yearDiff = Math.abs(
        query.year - work.published["date-parts"][0][0],
      );
      if (yearDiff === 0) confidence += 0.2;
      else if (yearDiff <= 1) confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate author match score
   */
  private calculateAuthorMatch(
    queryAuthors: string[],
    workAuthors: Array<{ given?: string; family: string }>,
  ): number {
    if (queryAuthors.length === 0 || workAuthors.length === 0) {
      return 0;
    }

    const normalizeAuthor = (author: string) =>
      author
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim();

    const queryNormalized = queryAuthors.map(normalizeAuthor);
    const workNormalized = workAuthors.map((author) =>
      normalizeAuthor(`${author.given || ""} ${author.family}`),
    );

    let matches = 0;
    for (const queryAuthor of queryNormalized) {
      for (const workAuthor of workNormalized) {
        if (
          workAuthor.includes(queryAuthor) ||
          queryAuthor.includes(workAuthor)
        ) {
          matches++;
          break;
        }
      }
    }

    return matches / Math.max(queryAuthors.length, workAuthors.length);
  }

  /**
   * Clean title for better search results
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 200); // Limit length for API
  }

  /**
   * Clean DOI for consistent formatting
   */
  private cleanDOI(doi: string): string {
    return doi
      .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, "")
      .replace(/^doi:/, "")
      .trim()
      .toLowerCase();
  }

  /**
   * Get API information
   */
  getApiInfo(): {
    name: string;
    version: string;
    baseUrl: string;
    rateLimit: RateLimitConfig;
  } {
    return {
      name: "CrossRef",
      version: "1.0",
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }
}
