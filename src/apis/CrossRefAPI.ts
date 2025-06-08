import { APIService } from '@/services/APIService';
import type { 
  CrossRefWork, 
  SearchQuery, 
  SearchResult, 
  RateLimitConfig 
} from '@/core/types';

/**
 * CrossRef API implementation for DOI discovery and metadata fetching
 */
export class CrossRefAPI extends APIService {
  constructor() {
    super(
      'https://api.crossref.org',
      { requests: 50, window: 1000 }, // 50 requests per second
      { ttl: 3600000, maxSize: 500 }   // 1 hour cache
    );
  }

  /**
   * Search CrossRef for works matching the query
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const searchQuery = this.buildSearchQuery(query);
    const endpoint = `/works?query=${encodeURIComponent(searchQuery)}&rows=10&sort=relevance`;

    const response = await this.request<{
      status: string;
      'message-type': string;
      'message-version': string;
      message: {
        'total-results': number;
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
    const endpoint = `/works/${cleanDOI}`;

    try {
      const response = await this.request<{
        status: string;
        'message-type': string;
        'message-version': string;
        message: CrossRefWork;
      }>(endpoint);

      const results = this.transformResults([response.data.message], { doi: cleanDOI });
      return results[0] || null;
    } catch (error) {
      // DOI not found is not an error
      return null;
    }
  }

  /**
   * Search by arXiv ID to find published version
   */
  async searchByArxivId(arxivId: string): Promise<SearchResult[]> {
    const cleanArxivId = arxivId.replace(/^arxiv:/i, '');
    const searchQuery = `${cleanArxivId}`;
    const endpoint = `/works?query=${encodeURIComponent(searchQuery)}&rows=10&sort=relevance`;

    const response = await this.request<{
      status: string;
      'message-type': string;
      'message-version': string;
      message: {
        'total-results': number;
        items: CrossRefWork[];
      };
    }>(endpoint);

    return this.transformResults(response.data.message.items, { arxivId: cleanArxivId });
  }

  /**
   * Build optimized search query for CrossRef
   */
  private buildSearchQuery(query: SearchQuery): string {
    const parts: string[] = [];

    if (query.title) {
      // Clean and optimize title for search
      const cleanTitle = this.cleanTitle(query.title);
      parts.push(`title:"${cleanTitle}"`);
    }

    if (query.authors && query.authors.length > 0) {
      // Use first author for better results
      const firstAuthor = query.authors[0];
      parts.push(`author:"${firstAuthor}"`);
    }

    if (query.year) {
      parts.push(`published:${query.year}`);
    }

    if (query.doi) {
      parts.push(`doi:"${this.cleanDOI(query.doi)}"`);
    }

    return parts.join(' AND ');
  }

  /**
   * Transform CrossRef works to standardized search results
   */
  private transformResults(works: CrossRefWork[], originalQuery: SearchQuery): SearchResult[] {
    return works.map(work => {
      const result: SearchResult = {
        title: Array.isArray(work.title) ? work.title[0] : work.title,
        authors: work.author?.map(author => 
          `${author.given || ''} ${author.family}`.trim()
        ) || [],
        year: work.published?.['date-parts']?.[0]?.[0],
        doi: work.DOI,
        url: work.URL,
        confidence: this.calculateConfidence(work, originalQuery),
        source: 'CrossRef',
      };

      return result;
    });
  }

  /**
   * Calculate confidence score for search result
   */
  private calculateConfidence(work: CrossRefWork, query: SearchQuery): number {
    let confidence = 0.5; // Base confidence

    // Title similarity
    if (query.title && work.title) {
      const workTitle = Array.isArray(work.title) ? work.title[0] : work.title;
      const similarity = this.calculateTitleSimilarity(query.title, workTitle);
      confidence += similarity * 0.4;
    }

    // Author match
    if (query.authors && work.author) {
      const authorMatch = this.calculateAuthorMatch(query.authors, work.author);
      confidence += authorMatch * 0.3;
    }

    // Year match
    if (query.year && work.published?.['date-parts']?.[0]?.[0]) {
      const yearDiff = Math.abs(query.year - work.published['date-parts'][0][0]);
      if (yearDiff === 0) confidence += 0.2;
      else if (yearDiff <= 1) confidence += 0.1;
    }

    // DOI exact match
    if (query.doi && work.DOI) {
      if (this.cleanDOI(query.doi) === this.cleanDOI(work.DOI)) {
        confidence = 1.0;
      }
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate title similarity using simple word overlap
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const normalize = (str: string) => 
      str.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const words1 = new Set(normalize(title1).split(' '));
    const words2 = new Set(normalize(title2).split(' '));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate author match score
   */
  private calculateAuthorMatch(
    queryAuthors: string[], 
    workAuthors: Array<{ given?: string; family: string }>
  ): number {
    if (queryAuthors.length === 0 || workAuthors.length === 0) {
      return 0;
    }

    const normalizeAuthor = (author: string) => 
      author.toLowerCase().replace(/[^\w\s]/g, '').trim();

    const queryNormalized = queryAuthors.map(normalizeAuthor);
    const workNormalized = workAuthors.map(author => 
      normalizeAuthor(`${author.given || ''} ${author.family}`)
    );

    let matches = 0;
    for (const queryAuthor of queryNormalized) {
      for (const workAuthor of workNormalized) {
        if (workAuthor.includes(queryAuthor) || queryAuthor.includes(workAuthor)) {
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
      .substring(0, 200); // Limit length for API
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
      name: 'CrossRef',
      version: '1.0',
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }
} 