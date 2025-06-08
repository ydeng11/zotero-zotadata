import { APIService } from '@/services/APIService';
import type { 
  OpenAlexWork, 
  SearchQuery, 
  SearchResult, 
  RateLimitConfig 
} from '@/core/types';

/**
 * OpenAlex API implementation for academic paper discovery
 * https://docs.openalex.org/
 */
export class OpenAlexAPI extends APIService {
  constructor() {
    super(
      'https://api.openalex.org',
      { requests: 100, window: 1000 }, // 100 requests per second (generous limit)
      { ttl: 1800000, maxSize: 1000 }   // 30 minute cache
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
    const endpoint = `/works/https://doi.org/${cleanDOI}`;

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
    
    const searchParams = new URLSearchParams({
      filter: `title.search:${titleQuery},authorships.author.display_name.search:${authorQuery}`,
      select: 'id,doi,title,display_name,authorships,publication_year,primary_location,open_access',
      'per-page': '10',
      sort: 'relevance_score:desc'
    });

    if (query.year) {
      searchParams.append('filter', `publication_year:${query.year}`);
    }

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
      const authorFilter = query.authors
        .slice(0, 2) // Limit to first 2 authors for better results
        .map(author => `authorships.author.display_name.search:${author}`)
        .join(',');
      filters.push(authorFilter);
    }

    if (query.year) {
      filters.push(`publication_year:${query.year}`);
    }

    if (query.doi) {
      filters.push(`doi:${this.cleanDOI(query.doi)}`);
    }

    if (filters.length > 0) {
      params.append('filter', filters.join(','));
    }

    // Standard parameters for better results
    params.append('select', 'id,doi,title,display_name,authorships,publication_year,primary_location,open_access');
    
    return params.toString();
  }

  /**
   * Transform OpenAlex works to standardized search results
   */
  private transformResults(works: OpenAlexWork[], originalQuery: SearchQuery): SearchResult[] {
    return works.map(work => {
      const result: SearchResult = {
        title: work.display_name || work.title,
        authors: work.authorships?.map(authorship => 
          authorship.author.display_name
        ) || [],
        year: work.publication_year,
        doi: work.doi?.replace('https://doi.org/', ''),
        url: work.id,
        pdfUrl: work.open_access?.oa_url || undefined,
        confidence: this.calculateConfidence(work, originalQuery),
        source: 'OpenAlex',
      };

      return result;
    });
  }

  /**
   * Calculate confidence score for search result
   */
  private calculateConfidence(work: OpenAlexWork, query: SearchQuery): number {
    let confidence = 0.6; // Base confidence for OpenAlex

    // Title similarity
    if (query.title && work.display_name) {
      const similarity = this.calculateTitleSimilarity(query.title, work.display_name);
      confidence += similarity * 0.3;
    }

    // Author match
    if (query.authors && work.authorships) {
      const workAuthors = work.authorships.map(a => a.author.display_name);
      const authorMatch = this.calculateAuthorMatch(query.authors, workAuthors);
      confidence += authorMatch * 0.25;
    }

    // Year match
    if (query.year && work.publication_year) {
      const yearDiff = Math.abs(query.year - work.publication_year);
      if (yearDiff === 0) confidence += 0.15;
      else if (yearDiff <= 1) confidence += 0.1;
      else if (yearDiff <= 2) confidence += 0.05;
    }

    // DOI exact match
    if (query.doi && work.doi) {
      const workDOI = work.doi.replace('https://doi.org/', '');
      if (this.cleanDOI(query.doi) === this.cleanDOI(workDOI)) {
        confidence = 1.0;
      }
    }

    // Open access bonus
    if (work.open_access?.is_oa && work.open_access.oa_url) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate title similarity using word overlap
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const normalize = (str: string) => 
      str.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words1 = new Set(normalize(title1).split(' ').filter(w => w.length > 2));
    const words2 = new Set(normalize(title2).split(' ').filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate author match score
   */
  private calculateAuthorMatch(queryAuthors: string[], workAuthors: string[]): number {
    if (queryAuthors.length === 0 || workAuthors.length === 0) {
      return 0;
    }

    const normalizeAuthor = (author: string) => 
      author.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const queryNormalized = queryAuthors.map(normalizeAuthor);
    const workNormalized = workAuthors.map(normalizeAuthor);

    let matches = 0;
    for (const queryAuthor of queryNormalized) {
      const queryParts = queryAuthor.split(' ');
      for (const workAuthor of workNormalized) {
        const workParts = workAuthor.split(' ');
        
        // Check for lastName match
        const lastNameMatch = queryParts.some(qPart => 
          workParts.some(wPart => 
            (qPart.length > 2 && wPart.includes(qPart)) ||
            (wPart.length > 2 && qPart.includes(wPart))
          )
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
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200); // OpenAlex handles long queries well but let's be safe
  }

  /**
   * Clean DOI for consistent formatting
   */
  private cleanDOI(doi: string): string {
    return doi
      .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '')
      .replace(/^doi:/, '')
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
      name: 'OpenAlex',
      version: '1.0',
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }
} 