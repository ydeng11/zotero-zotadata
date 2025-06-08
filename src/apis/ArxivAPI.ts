import { APIService } from '@/services';
import { ErrorManager, ErrorType } from '@/core';
import type { APIResponse, SearchResult, ArxivEntry } from '@/core/types';
import { URLUtils, StringUtils } from '@/utils';

/**
 * arXiv search options
 */
interface ArxivSearchOptions {
  maxResults?: number;
  startIndex?: number;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
  categories?: string[];
  includeObsolete?: boolean;
}

/**
 * arXiv API search response
 */
interface ArxivAPIResponse {
  entries: ArxivEntry[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
}

/**
 * Direct arXiv API for accessing preprints and papers
 */
export class ArxivAPI extends APIService {
  protected errorManager: ErrorManager;

  // arXiv subject categories
  private static readonly CATEGORIES = {
    // Physics
    'astro-ph': 'Astrophysics',
    'cond-mat': 'Condensed Matter',
    'gr-qc': 'General Relativity and Quantum Cosmology',
    'hep-ex': 'High Energy Physics - Experiment',
    'hep-lat': 'High Energy Physics - Lattice',
    'hep-ph': 'High Energy Physics - Phenomenology',
    'hep-th': 'High Energy Physics - Theory',
    'math-ph': 'Mathematical Physics',
    'nucl-ex': 'Nuclear Experiment',
    'nucl-th': 'Nuclear Theory',
    'physics': 'Physics',
    'quant-ph': 'Quantum Physics',
    
    // Mathematics
    'math': 'Mathematics',
    
    // Computer Science
    'cs': 'Computer Science',
    
    // Quantitative Biology
    'q-bio': 'Quantitative Biology',
    
    // Quantitative Finance
    'q-fin': 'Quantitative Finance',
    
    // Statistics
    'stat': 'Statistics',
    
    // Electrical Engineering and Systems Science
    'eess': 'Electrical Engineering and Systems Science',
    
    // Economics
    'econ': 'Economics',
  };

  constructor(addonData: any) {
    // arXiv has no strict rate limits, but we should be respectful
    super('https://export.arxiv.org/api', { requests: 100, window: 60000 }, addonData.cache, addonData.logger);
    this.errorManager = new ErrorManager();
  }

  /**
   * Search arXiv by identifier (arXiv ID, DOI)
   */
  async searchByIdentifier(identifier: string): Promise<APIResponse<ArxivEntry[]>> {
    try {
      const cleanId = this.cleanIdentifier(identifier);
      
      // Check if it's an arXiv ID
      const arxivId = this.extractArxivId(cleanId);
      if (arxivId) {
        return await this.getByArxivId(arxivId);
      }

      // Otherwise search by general identifier
      return await this.searchByQuery(`all:${cleanId}`);
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'arXiv', operation: 'searchByIdentifier', identifier }
      );
    }
  }

  /**
   * Search arXiv by query
   */
  async searchByQuery(query: string, options: ArxivSearchOptions = {}): Promise<APIResponse<ArxivEntry[]>> {
    try {
      const searchUrl = this.buildSearchURL(query, options);
      
      const response = await this.request<string>(searchUrl, {
        headers: {
          'Accept': 'application/atom+xml',
          'User-Agent': 'Zotero Zotadata/1.0',
        },
      });

      const parsedData = this.parseAtomResponse(response.data);
      
      return {
        ...response,
        data: parsedData.entries,
      };
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'arXiv', operation: 'searchByQuery', query }
      );
    }
  }

  /**
   * Get paper by arXiv ID
   */
  async getByArxivId(arxivId: string): Promise<APIResponse<ArxivEntry[]>> {
    try {
      const cleanId = this.extractArxivId(arxivId);
      if (!cleanId) {
        throw this.errorManager.createError(
          ErrorType.VALIDATION_ERROR,
          'Invalid arXiv ID format',
          { arxivId }
        );
      }

      const searchUrl = this.buildSearchURL(`id:${cleanId}`, { maxResults: 1 });
      
      const response = await this.request<string>(searchUrl, {
        headers: {
          'Accept': 'application/atom+xml',
        },
      });

      const parsedData = this.parseAtomResponse(response.data);
      
      return {
        ...response,
        data: parsedData.entries,
      };
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'arXiv', operation: 'getByArxivId', arxivId }
      );
    }
  }

  /**
   * Search by title and authors
   */
  async searchPaper(title: string, authors?: string[], options: ArxivSearchOptions = {}): Promise<APIResponse<ArxivEntry[]>> {
    try {
      let searchQuery = `ti:"${title}"`;
      
      if (authors && authors.length > 0) {
        const authorQueries = authors.map(author => `au:"${author}"`);
        searchQuery += ` AND (${authorQueries.join(' OR ')})`;
      }

      return await this.searchByQuery(searchQuery, {
        maxResults: 10,
        sortBy: 'relevance',
        ...options,
      });
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'arXiv', operation: 'searchPaper', title, authors }
      );
    }
  }

  /**
   * Get PDF URL for arXiv paper
   */
  getPDFUrl(arxivId: string): string {
    const cleanId = this.extractArxivId(arxivId);
    if (!cleanId) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        'Invalid arXiv ID for PDF URL',
        { arxivId }
      );
    }

    return `https://arxiv.org/pdf/${cleanId}.pdf`;
  }

  /**
   * Get abstract page URL
   */
  getAbstractUrl(arxivId: string): string {
    const cleanId = this.extractArxivId(arxivId);
    if (!cleanId) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        'Invalid arXiv ID for abstract URL',
        { arxivId }
      );
    }

    return `https://arxiv.org/abs/${cleanId}`;
  }

  /**
   * Convert arXiv entry to standard search result
   */
  convertToSearchResult(entry: ArxivEntry): SearchResult {
    return {
      title: entry.title,
      authors: entry.authors.map(author => author.name),
      year: entry.published ? new Date(entry.published).getFullYear() : undefined,
      doi: entry.doi,
      url: this.getAbstractUrl(entry.id),
      pdfUrl: this.getPDFUrl(entry.id),
      confidence: this.calculateConfidence(entry),
      source: 'arXiv',
    };
  }

  /**
   * Get available categories
   */
  getCategories(): Record<string, string> {
    return { ...ArxivAPI.CATEGORIES };
  }

  /**
   * Abstract method implementations
   */
  async search(query: any): Promise<ArxivEntry[]> {
    if (typeof query === 'string') {
      const response = await this.searchByQuery(query);
      return response.data;
    }
    
    if (query && typeof query === 'object') {
      if (query.arxivId) {
        const response = await this.getByArxivId(query.arxivId);
        return response.data;
      }
      
      if (query.title) {
        const response = await this.searchPaper(query.title, query.authors);
        return response.data;
      }
    }
    
    throw this.errorManager.createError(
      ErrorType.VALIDATION_ERROR,
      'Invalid search query format',
      { query }
    );
  }

  getApiInfo(): {
    name: string;
    version: string;
    baseUrl: string;
    rateLimit: any;
  } {
    return {
      name: 'arXiv',
      version: '1.0',
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }

  /**
   * Private helper methods
   */
  private buildSearchURL(query: string, options: ArxivSearchOptions): string {
    const {
      maxResults = 25,
      startIndex = 0,
      sortBy = 'relevance',
      sortOrder = 'descending',
    } = options;

    const params = new URLSearchParams();
    params.append('search_query', query);
    params.append('start', startIndex.toString());
    params.append('max_results', Math.min(maxResults, 1000).toString()); // arXiv limit is 1000

    // Sort parameters
    const sortMapping = {
      relevance: 'relevance',
      lastUpdatedDate: 'lastUpdatedDate',
      submittedDate: 'submittedDate',
    };
    
    const orderMapping = {
      ascending: 'ascending',
      descending: 'descending',
    };

    params.append('sortBy', sortMapping[sortBy] || 'relevance');
    params.append('sortOrder', orderMapping[sortOrder] || 'descending');

    return `/query?${params.toString()}`;
  }

  private parseAtomResponse(atomXml: string): ArxivAPIResponse {
    const entries: ArxivEntry[] = [];
    
    try {
      // Simple XML parsing for arXiv Atom feed
      // In a real implementation, you'd use a proper XML parser
      
      // Extract total results
      const totalMatch = atomXml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/);
      const totalResults = totalMatch ? parseInt(totalMatch[1], 10) : 0;

      const startMatch = atomXml.match(/<opensearch:startIndex[^>]*>(\d+)<\/opensearch:startIndex>/);
      const startIndex = startMatch ? parseInt(startMatch[1], 10) : 0;

      const itemsMatch = atomXml.match(/<opensearch:itemsPerPage[^>]*>(\d+)<\/opensearch:itemsPerPage>/);
      const itemsPerPage = itemsMatch ? parseInt(itemsMatch[1], 10) : 0;

      // Extract entries
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let entryMatch;

      while ((entryMatch = entryRegex.exec(atomXml)) !== null) {
        const entryXml = entryMatch[1];
        const entry = this.parseAtomEntry(entryXml);
        if (entry) {
          entries.push(entry);
        }
      }

      return {
        entries,
        totalResults,
        startIndex,
        itemsPerPage,
      };
    } catch (error) {
      console.warn('Failed to parse arXiv response:', error);
      return {
        entries: [],
        totalResults: 0,
        startIndex: 0,
        itemsPerPage: 0,
      };
    }
  }

  private parseAtomEntry(entryXml: string): ArxivEntry | null {
    try {
      // Extract ID
      const idMatch = entryXml.match(/<id[^>]*>(.*?)<\/id>/);
      const fullId = idMatch ? idMatch[1].trim() : '';
      const arxivId = this.extractArxivId(fullId) || fullId;

      if (!arxivId) {
        return null;
      }

      // Extract title
      const titleMatch = entryXml.match(/<title[^>]*>(.*?)<\/title>/s);
      const title = titleMatch ? this.cleanText(titleMatch[1]) : 'Unknown Title';

      // Extract summary
      const summaryMatch = entryXml.match(/<summary[^>]*>(.*?)<\/summary>/s);
      const summary = summaryMatch ? this.cleanText(summaryMatch[1]) : '';

      // Extract published date
      const publishedMatch = entryXml.match(/<published[^>]*>(.*?)<\/published>/);
      const published = publishedMatch ? publishedMatch[1].trim() : '';

      // Extract authors
      const authors: Array<{ name: string }> = [];
      const authorRegex = /<author[^>]*>[\s\S]*?<name[^>]*>(.*?)<\/name>[\s\S]*?<\/author>/g;
      let authorMatch;

      while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
        const name = this.cleanText(authorMatch[1]);
        if (name) {
          authors.push({ name });
        }
      }

      // Extract categories
      const categories: string[] = [];
      const categoryRegex = /<category[^>]*term="([^"]*)"[^>]*\/>/g;
      let categoryMatch;

      while ((categoryMatch = categoryRegex.exec(entryXml)) !== null) {
        categories.push(categoryMatch[1]);
      }

      // Extract DOI if present
      const doiMatch = entryXml.match(/doi:([0-9]+\.[0-9]+\/[^\s<>"]+)/i);
      const doi = doiMatch ? doiMatch[1] : undefined;

      const entry: ArxivEntry = {
        id: arxivId,
        title,
        authors,
        published,
        summary,
        categories,
        pdf_url: this.getPDFUrl(arxivId),
        doi,
      };

      return entry;
    } catch (error) {
      return null;
    }
  }

  private extractArxivId(input: string): string | null {
    // arXiv ID patterns
    const patterns = [
      /(?:arxiv:|arXiv:)?([a-z-]+\/\d{7}|\d{4}\.\d{4,5}(?:v\d+)?)/i,
      /arxiv\.org\/abs\/([a-z-]+\/\d{7}|\d{4}\.\d{4,5}(?:v\d+)?)/i,
      /arxiv\.org\/pdf\/([a-z-]+\/\d{7}|\d{4}\.\d{4,5}(?:v\d+)?)\.pdf/i,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        // Remove version suffix for consistency
        return match[1].replace(/v\d+$/, '');
      }
    }

    return null;
  }

  private cleanIdentifier(identifier: string): string {
    return identifier.trim().replace(/\s+/g, ' ');
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .trim();
  }

  private calculateConfidence(entry: ArxivEntry): number {
    let confidence = 0.8; // High base confidence for arXiv

    // Boost for having DOI (indicates published version)
    if (entry.doi) {
      confidence += 0.1;
    }

    // Boost for recent papers
    if (entry.published) {
      const publishedDate = new Date(entry.published);
      const now = new Date();
      const ageInYears = (now.getTime() - publishedDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      
      if (ageInYears < 2) {
        confidence += 0.05;
      }
    }

    // Boost for having multiple categories (indicates interdisciplinary work)
    if (entry.categories.length > 1) {
      confidence += 0.05;
    }

    return Math.min(confidence, 0.95); // Cap at 0.95
  }
} 