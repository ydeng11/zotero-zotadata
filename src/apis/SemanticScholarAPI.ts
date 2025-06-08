import { APIService } from '@/services/APIService';
import type { 
  SemanticScholarPaper, 
  SearchQuery, 
  SearchResult, 
  RateLimitConfig 
} from '@/core/types';

/**
 * Semantic Scholar API implementation for academic paper discovery
 * https://api.semanticscholar.org/
 */
export class SemanticScholarAPI extends APIService {
  constructor() {
    super(
      'https://api.semanticscholar.org/graph/v1',
      { requests: 100, window: 60000 }, // 100 requests per minute
      { ttl: 3600000, maxSize: 500 }     // 1 hour cache
    );
  }

  /**
   * Search Semantic Scholar for papers matching the query
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    const searchQuery = this.buildSearchQuery(query);
    const endpoint = `/paper/search?query=${encodeURIComponent(searchQuery)}&limit=25&fields=paperId,title,authors,year,venue,doi,url,openAccessPdf`;

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
    const endpoint = `/paper/DOI:${cleanDOI}?fields=paperId,title,authors,year,venue,doi,url,openAccessPdf`;

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
    const endpoint = `/paper/${paperId}?fields=paperId,title,authors,year,venue,doi,url,openAccessPdf`;

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

    const endpoint = `/paper/search?query=${encodeURIComponent(searchQuery)}&limit=10&fields=paperId,title,authors,year,venue,doi,url,openAccessPdf`;

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
    const endpoint = `/paper/search?query=${encodeURIComponent(searchQuery)}&limit=50&fields=paperId,title,authors,year,venue,doi,url,openAccessPdf`;

    const response = await this.request<{
      total: number;
      data: SemanticScholarPaper[];
    }>(endpoint);

    // Filter for papers with open access PDFs
    const openAccessPapers = response.data.data.filter(paper => 
      paper.openAccessPdf && paper.openAccessPdf.url
    );

    return this.transformResults(openAccessPapers, query);
  }

  /**
   * Search for papers by arXiv ID
   */
  async searchByArxivId(arxivId: string): Promise<SearchResult[]> {
    const cleanArxivId = arxivId.replace(/^arxiv:/i, '');
    const searchQuery = `arxiv:${cleanArxivId}`;
    
    const endpoint = `/paper/search?query=${encodeURIComponent(searchQuery)}&limit=10&fields=paperId,title,authors,year,venue,doi,url,openAccessPdf`;

    const response = await this.request<{
      total: number;
      data: SemanticScholarPaper[];
    }>(endpoint);

    return this.transformResults(response.data.data, { arxivId: cleanArxivId });
  }

  /**
   * Build search query for Semantic Scholar API
   */
  private buildSearchQuery(query: SearchQuery): string {
    const parts: string[] = [];

    if (query.title) {
      // Use title search with moderate specificity
      const cleanTitle = this.cleanTitle(query.title);
      parts.push(cleanTitle);
    }

    if (query.authors && query.authors.length > 0) {
      // Add author information
      const firstAuthor = query.authors[0];
      parts.push(`author:"${firstAuthor}"`);
    }

    if (query.year) {
      parts.push(`year:${query.year}`);
    }

    if (query.doi) {
      parts.push(`doi:${this.cleanDOI(query.doi)}`);
    }

    return parts.join(' ');
  }

  /**
   * Transform Semantic Scholar papers to standardized search results
   */
  private transformResults(papers: SemanticScholarPaper[], originalQuery: SearchQuery): SearchResult[] {
    return papers.map(paper => {
      const result: SearchResult = {
        title: paper.title,
        authors: paper.authors?.map(author => author.name) || [],
        year: paper.year,
        doi: paper.doi,
        url: paper.url,
        pdfUrl: paper.openAccessPdf?.url,
        confidence: this.calculateConfidence(paper, originalQuery),
        source: 'Semantic Scholar',
      };

      return result;
    });
  }

  /**
   * Calculate confidence score for search result
   */
  private calculateConfidence(paper: SemanticScholarPaper, query: SearchQuery): number {
    let confidence = 0.7; // Base confidence for Semantic Scholar

    // Title similarity
    if (query.title && paper.title) {
      const similarity = this.calculateTitleSimilarity(query.title, paper.title);
      confidence += similarity * 0.25;
    }

    // Author match
    if (query.authors && paper.authors) {
      const paperAuthors = paper.authors.map(a => a.name);
      const authorMatch = this.calculateAuthorMatch(query.authors, paperAuthors);
      confidence += authorMatch * 0.2;
    }

    // Year match
    if (query.year && paper.year) {
      const yearDiff = Math.abs(query.year - paper.year);
      if (yearDiff === 0) confidence += 0.15;
      else if (yearDiff <= 1) confidence += 0.1;
      else if (yearDiff <= 2) confidence += 0.05;
    }

    // DOI exact match
    if (query.doi && paper.doi) {
      if (this.cleanDOI(query.doi) === this.cleanDOI(paper.doi)) {
        confidence = 1.0;
      }
    }

    // Open access PDF bonus
    if (paper.openAccessPdf && paper.openAccessPdf.url) {
      confidence += 0.1;
    }

    // ArXiv ID match
    if (query.arxivId) {
      // Check if title or other fields contain arXiv reference
      const titleContainsArxiv = paper.title.toLowerCase().includes(query.arxivId.toLowerCase());
      if (titleContainsArxiv) {
        confidence += 0.2;
      }
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
  private calculateAuthorMatch(queryAuthors: string[], paperAuthors: string[]): number {
    if (queryAuthors.length === 0 || paperAuthors.length === 0) {
      return 0;
    }

    const normalizeAuthor = (author: string) => 
      author.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const queryNormalized = queryAuthors.map(normalizeAuthor);
    const paperNormalized = paperAuthors.map(normalizeAuthor);

    let matches = 0;
    for (const queryAuthor of queryNormalized) {
      const queryParts = queryAuthor.split(' ');
      for (const paperAuthor of paperNormalized) {
        const paperParts = paperAuthor.split(' ');
        
        // Check for last name match (more reliable for academic papers)
        const lastNameMatch = queryParts.some(qPart => 
          paperParts.some(pPart => 
            (qPart.length > 2 && pPart.includes(qPart)) ||
            (pPart.length > 2 && qPart.includes(pPart))
          )
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
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 250); // Semantic Scholar handles longer queries well
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
      name: 'Semantic Scholar',
      version: '1.0',
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }
} 