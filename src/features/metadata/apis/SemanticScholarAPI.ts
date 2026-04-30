import { BaseMetadataAPI } from "./BaseMetadataAPI";
import { isExactTitleMatch } from "@/utils/similarity";
import { mapSemanticScholarTypeToZotero } from "@/utils/typeMapping";
import type {
  SemanticScholarPaper,
  SearchQuery,
  SearchResult,
  RateLimitConfig,
} from "@/shared/core/types";

/**
 * Semantic Scholar API implementation for academic paper discovery
 * https://api.semanticscholar.org/
 */
export class SemanticScholarAPI extends BaseMetadataAPI {
  private static readonly SEARCH_FIELDS =
    "paperId,title,authors,year,venue,externalIds,url,openAccessPdf,journal,publicationTypes,publicationDate";

  private static readonly PAPER_FIELDS =
    "paperId,title,authors,year,venue,externalIds,url,openAccessPdf,journal,publicationTypes,publicationDate";

  constructor() {
    super(
      "https://api.semanticscholar.org/graph/v1",
      { requests: 100, window: 60000 }, // 100 requests per minute
      { ttl: 3600000, maxSize: 500 }, // 1 hour cache
    );
  }

  /**
   * Search Semantic Scholar for papers matching the query
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const searchParams = this.buildSearchQuery(query);
    const endpoint = `/paper/search?${searchParams}&limit=25&fields=${SemanticScholarAPI.SEARCH_FIELDS}`;

    const response = await this.request<{
      total: number;
      offset: number;
      next: number;
      data: SemanticScholarPaper[];
    }>(endpoint);

    return this.transformResults(response.data.data, query);
  }

  /**
   * Get paper by DOI
   */
  async getPaperByDOI(doi: string): Promise<SearchResult | null> {
    const cleanDOI = this.cleanDOI(doi);
    // Slashes in DOIs (e.g. 10.48550/arxiv.xxx) must be one path segment — encode the full S2 paper id
    const paperId = `DOI:${cleanDOI}`;
    const endpoint = `/paper/${encodeURIComponent(paperId)}?fields=${SemanticScholarAPI.PAPER_FIELDS}`;

    try {
      const response = await this.request<SemanticScholarPaper>(endpoint);
      const results = this.transformResults([response.data], { doi: cleanDOI });
      return results[0] || null;
    } catch (error) {
      // DOI not found is not an error
      return null;
    }
  }

  /**
   * Search by paper ID
   */
  async getPaperById(paperId: string): Promise<SearchResult | null> {
    const endpoint = `/paper/${encodeURIComponent(paperId)}?fields=${SemanticScholarAPI.PAPER_FIELDS}`;

    try {
      const response = await this.request<SemanticScholarPaper>(endpoint);
      const results = this.transformResults([response.data], {});
      return results[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Search for papers with exact title match
   */
  async searchExact(query: SearchQuery): Promise<SearchResult[]> {
    if (!query.title) {
      return this.search(query);
    }

    // Use quoted search for exact title matching
    const exactTitle = `"${this.cleanTitle(query.title)}"`;
    let searchQuery = exactTitle;

    if (query.authors && query.authors.length > 0) {
      const authorQuery = query.authors[0];
      searchQuery += ` author:"${authorQuery}"`;
    }

    if (query.year) {
      searchQuery += ` year:${query.year}`;
    }

    const endpoint = `/paper/search?query=${encodeURIComponent(searchQuery)}&limit=10&fields=${SemanticScholarAPI.SEARCH_FIELDS}`;

    const response = await this.request<{
      total: number;
      data: SemanticScholarPaper[];
    }>(endpoint);

    return this.transformResults(response.data.data, query);
  }

  /**
   * Search for open access papers only
   */
  async searchOpenAccess(query: SearchQuery): Promise<SearchResult[]> {
    const searchQuery = this.buildSearchQuery(query);
    // Semantic Scholar doesn't have a direct open access filter,
    // so we'll search normally and filter results
    const endpoint = `/paper/search?query=${encodeURIComponent(searchQuery)}&limit=50&fields=${SemanticScholarAPI.SEARCH_FIELDS}`;

    const response = await this.request<{
      total: number;
      data: SemanticScholarPaper[];
    }>(endpoint);

    // Filter for papers with open access PDFs
    const openAccessPapers = response.data.data.filter(
      (paper) => paper.openAccessPdf && paper.openAccessPdf.url,
    );

    return this.transformResults(openAccessPapers, query);
  }

  /**
   * Search for papers by arXiv ID
   */
  async searchByArxivId(arxivId: string): Promise<SearchResult[]> {
    const cleanArxivId = arxivId.replace(/^arxiv:/i, "");
    const searchQuery = `arxiv:${cleanArxivId}`;

    const endpoint = `/paper/search?query=${encodeURIComponent(searchQuery)}&limit=10&fields=${SemanticScholarAPI.SEARCH_FIELDS}`;

    const response = await this.request<{
      total: number;
      data: SemanticScholarPaper[];
    }>(endpoint);

    return this.transformResults(response.data.data, { arxivId: cleanArxivId });
  }

  /**
   * Paper search including externalIds (DOI) for published-version discovery.
   */
  async searchPapersWithExternalIds(
    query: string,
    limit = 10,
  ): Promise<SemanticScholarPaper[]> {
    const endpoint = `/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${SemanticScholarAPI.SEARCH_FIELDS}`;

    try {
      const response = await this.request<{
        data: SemanticScholarPaper[];
      }>(endpoint);

      return response.data.data ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Build search query for Semantic Scholar API using URLSearchParams
   * Uses only first author (like CrossRef/OpenAlex) for better precision
   */
  private buildSearchQuery(query: SearchQuery): string {
    const params = new URLSearchParams();
    const queryParts: string[] = [];

    // Title: Semantic Scholar searches title and abstract by default
    if (query.title) {
      const cleanTitle = this.cleanTitle(query.title);
      queryParts.push(cleanTitle);
    }

    // Author: Use only first author for precision (matches CrossRef/OpenAlex pattern)
    if (query.authors && query.authors.length > 0) {
      const author = query.authors[0];
      // Extract last name if possible (more reliable for academic papers)
      const lastName = author.split(" ").pop() || author;
      queryParts.push(`author:"${lastName}"`);
    }

    // Year filter
    if (query.year) {
      queryParts.push(`year:${query.year}`);
    }

    // Venue/container title search
    if (query.containerTitle) {
      queryParts.push(`venue:"${query.containerTitle}"`);
    }

    // DOI: handled by getPaperByDOI() method, not in general search
    
    const searchQuery = queryParts.join(" ");
    params.append("query", searchQuery);

    return params.toString();
  }

  /**
   * Transform Semantic Scholar papers to standardized search results
   */
  private transformResults(
    papers: SemanticScholarPaper[],
    originalQuery: SearchQuery,
  ): SearchResult[] {
    if (!papers || !Array.isArray(papers)) {
      return [];
    }
    return papers.map((paper) => {
      const result: SearchResult = {
        title: paper.title,
        authors: paper.authors?.map((author) => author.name) || [],
        year: paper.year,
        doi: paper.doi,
        url: paper.url,
        pdfUrl: paper.openAccessPdf?.url,
        confidence: this.calculateConfidence(paper, originalQuery),
        source: "Semantic Scholar",
        containerTitle: paper.venue || paper.journal?.name,
        volume: paper.journal?.volume,
        pages: paper.journal?.pages,
      };

      return result;
    });
  }

  /**
   * Calculate confidence score for search result
   */
  private calculateConfidence(
    paper: SemanticScholarPaper,
    query: SearchQuery,
  ): number {
    // DOI check - exact match or reject
    if (query.doi) {
      if (paper.doi && this.cleanDOI(query.doi) === this.cleanDOI(paper.doi)) {
        return 1.0;
      }
      return 0.1;
    }

    // Title check - must match if title is in query
    if (query.title && paper.title) {
      if (!isExactTitleMatch(query.title, paper.title)) {
        return 0.1;
      }
    }

    let confidence = 0.7;

    if (query.title && paper.title) {
      confidence += 0.25;
    }

    if (query.authors && paper.authors) {
      const paperAuthors = paper.authors.map((a) => a.name);
      const authorMatch = this.calculateAuthorMatch(
        query.authors,
        paperAuthors,
      );
      confidence += authorMatch * 0.2;
    }

    if (query.year && paper.year) {
      const yearDiff = Math.abs(query.year - paper.year);
      if (yearDiff === 0) confidence += 0.15;
      else if (yearDiff <= 1) confidence += 0.1;
      else if (yearDiff <= 2) confidence += 0.05;
    }

    if (paper.openAccessPdf && paper.openAccessPdf.url) {
      confidence += 0.1;
    }

    if (query.arxivId) {
      const titleContainsArxiv = paper.title
        .toLowerCase()
        .includes(query.arxivId.toLowerCase());
      if (titleContainsArxiv) {
        confidence += 0.2;
      }
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate author match score
   */
  private calculateAuthorMatch(
    queryAuthors: string[],
    paperAuthors: string[],
  ): number {
    if (queryAuthors.length === 0 || paperAuthors.length === 0) {
      return 0;
    }

    const normalizeAuthor = (author: string) =>
      author
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const queryNormalized = queryAuthors.map(normalizeAuthor);
    const paperNormalized = paperAuthors.map(normalizeAuthor);

    let matches = 0;
    for (const queryAuthor of queryNormalized) {
      const queryParts = queryAuthor.split(" ");
      for (const paperAuthor of paperNormalized) {
        const paperParts = paperAuthor.split(" ");

        // Check for last name match (more reliable for academic papers)
        const lastNameMatch = queryParts.some((qPart) =>
          paperParts.some(
            (pPart) =>
              (qPart.length > 2 && pPart.includes(qPart)) ||
              (pPart.length > 2 && qPart.includes(pPart)),
          ),
        );

        if (lastNameMatch) {
          matches++;
          break;
        }
      }
    }

    return matches / Math.max(queryAuthors.length, paperAuthors.length);
  }

  /**
   * Clean title for better search results
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 250); // Semantic Scholar handles longer queries well
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
      name: "Semantic Scholar",
      version: "1.0",
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }
}
