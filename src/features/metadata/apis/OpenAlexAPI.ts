import { BaseMetadataAPI } from "./BaseMetadataAPI";
import { isExactTitleMatch } from "@/utils/similarity";
import { mapCrossRefTypeToZotero } from "@/utils/typeMapping";
import type {
  OpenAlexWork,
  SearchQuery,
  SearchResult,
  RateLimitConfig,
} from "@/shared/core/types";

/**
 * OpenAlex API implementation for academic paper discovery
 * https://docs.openalex.org/
 */
export class OpenAlexAPI extends BaseMetadataAPI {
  constructor() {
    super(
      "https://api.openalex.org",
      { requests: 100, window: 1000 }, // 100 requests per second (generous limit)
      { ttl: 1800000, maxSize: 1000 }, // 30 minute cache
    );
  }

  /**
   * Search OpenAlex for works matching the query
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const searchParams = this.buildSearchParams(query);
    const endpoint = `/works?${searchParams}&per-page=25&sort=relevance_score:desc`;

    const response = await this.request<{
      results: OpenAlexWork[];
      meta: {
        count: number;
        db_response_time_ms: number;
      };
    }>(endpoint);

    return this.transformResults(response.data.results, query);
  }

  /**
   * Get work by DOI
   */
  async getWorkByDOI(doi: string): Promise<SearchResult | null> {
    const cleanDOI = this.cleanDOI(doi);
    const workUrl = `https://doi.org/${cleanDOI}`;
    const endpoint = `/works/${encodeURIComponent(workUrl)}`;

    try {
      const response = await this.request<OpenAlexWork>(endpoint);
      const results = this.transformResults([response.data], { doi: cleanDOI });
      return results[0] || null;
    } catch (error) {
      // DOI not found is not an error
      return null;
    }
  }

  /**
   * Search by title and authors for better precision
   */
  async searchExact(query: SearchQuery): Promise<SearchResult[]> {
    if (!query.title || !query.authors?.length) {
      return this.search(query);
    }

    const titleQuery = this.cleanTitle(query.title);
    const authorQuery = query.authors[0]; // Use first author
    const filters = [
      `title.search:${titleQuery}`,
      `authorships.author.display_name.search:${authorQuery}`,
    ];

    if (query.year) {
      filters.push(`publication_year:${query.year}`);
    }

    const searchParams = new URLSearchParams({
      filter: filters.join(","),
      select:
        "id,doi,title,display_name,authorships,publication_year,primary_location,open_access",
      "per-page": "10",
      sort: "relevance_score:desc",
    });

    const endpoint = `/works?${searchParams.toString()}`;
    const response = await this.request<{
      results: OpenAlexWork[];
    }>(endpoint);

    return this.transformResults(response.data.results, query);
  }

  /**
   * Search for open access versions
   */
  async searchOpenAccess(query: SearchQuery): Promise<SearchResult[]> {
    const searchParams = this.buildSearchParams(query);
    const endpoint = `/works?${searchParams}&filter=open_access.is_oa:true&per-page=15&sort=relevance_score:desc`;

    const response = await this.request<{
      results: OpenAlexWork[];
    }>(endpoint);

    return this.transformResults(response.data.results, query);
  }

  /**
   * Build search parameters for OpenAlex API
   */
  private buildSearchParams(query: SearchQuery): string {
    const params = new URLSearchParams();
    const filters: string[] = [];

    if (query.title) {
      filters.push(`title.search:${this.cleanTitle(query.title)}`);
    }

    if (query.authors && query.authors.length > 0) {
      const authorFilters = query.authors
        .slice(0, 3)
        .map((author) => `authorships.author.display_name.search:${author}`)
        .join("|");
      filters.push(authorFilters);
    }

    if (query.year) {
      filters.push(`publication_year:${query.year}`);
    }

    if (query.doi) {
      filters.push(`doi:${this.cleanDOI(query.doi)}`);
    }

    if (filters.length > 0) {
      params.append("filter", filters.join(","));
    }

    params.append(
      "select",
      "id,doi,title,display_name,authorships,publication_year,primary_location,open_access",
    );

    return params.toString();
  }

  /**
   * Transform OpenAlex works to standardized search results
   */
  private transformResults(
    works: OpenAlexWork[],
    originalQuery: SearchQuery,
  ): SearchResult[] {
    return (works ?? []).map((work) => {
      const pages = work.biblio?.first_page
        ? work.biblio.last_page
          ? `${work.biblio.first_page}-${work.biblio.last_page}`
          : work.biblio.first_page
        : undefined;

      const result: SearchResult = {
        title: work.display_name || work.title,
        authors:
          work.authorships?.map(
            (authorship) => authorship.author.display_name,
          ) || [],
        year: work.publication_year,
        doi: work.doi?.replace("https://doi.org/", ""),
        url: work.id,
        pdfUrl: work.open_access?.oa_url || undefined,
        confidence: this.calculateConfidence(work, originalQuery),
        source: "OpenAlex",
        containerTitle: work.primary_location?.source?.display_name,
        volume: work.biblio?.volume,
        issue: work.biblio?.issue,
        pages,
        language: work.language,
        itemType: mapCrossRefTypeToZotero(work.type_crossref),
      };

      return result;
    });
  }

  /**
   * Calculate confidence score for search result
   */
  private calculateConfidence(work: OpenAlexWork, query: SearchQuery): number {
    // DOI check - exact match or reject
    if (query.doi) {
      if (work.doi) {
        const workDOI = work.doi.replace("https://doi.org/", "");
        if (this.cleanDOI(query.doi) === this.cleanDOI(workDOI)) {
          return 1.0;
        }
      }
      return 0.1;
    }

    // Title check - must match if title is in query
    if (query.title && work.display_name) {
      if (!isExactTitleMatch(query.title, work.display_name)) {
        return 0.1;
      }
    }

    let confidence = 0.6;

    if (query.title && work.display_name) {
      confidence += 0.3;
    }

    if (query.authors && work.authorships) {
      const workAuthors = work.authorships.map((a) => a.author.display_name);
      const authorMatch = this.calculateAuthorMatch(query.authors, workAuthors);
      confidence += authorMatch * 0.25;
    }

    if (query.year && work.publication_year) {
      const yearDiff = Math.abs(query.year - work.publication_year);
      if (yearDiff === 0) confidence += 0.15;
      else if (yearDiff <= 1) confidence += 0.1;
      else if (yearDiff <= 2) confidence += 0.05;
    }

    if (work.open_access?.is_oa && work.open_access.oa_url) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate author match score
   */
  private calculateAuthorMatch(
    queryAuthors: string[],
    workAuthors: string[],
  ): number {
    if (queryAuthors.length === 0 || workAuthors.length === 0) {
      return 0;
    }

    const normalizeAuthor = (author: string) =>
      author
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const queryNormalized = queryAuthors.map(normalizeAuthor);
    const workNormalized = workAuthors.map(normalizeAuthor);

    let matches = 0;
    for (const queryAuthor of queryNormalized) {
      const queryParts = queryAuthor.split(" ");
      for (const workAuthor of workNormalized) {
        const workParts = workAuthor.split(" ");

        // Check for lastName match
        const lastNameMatch = queryParts.some((qPart) =>
          workParts.some(
            (wPart) =>
              (qPart.length > 2 && wPart.includes(qPart)) ||
              (wPart.length > 2 && qPart.includes(wPart)),
          ),
        );

        if (lastNameMatch) {
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
      .substring(0, 200); // OpenAlex handles long queries well but let's be safe
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
      name: "OpenAlex",
      version: "1.0",
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }
}
