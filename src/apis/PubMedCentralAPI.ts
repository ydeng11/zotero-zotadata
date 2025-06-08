import { APIService } from '@/services';
import { ErrorManager, ErrorType } from '@/core';
import type { APIResponse, SearchResult, PMCEntry } from '@/core/types';
import { URLUtils, StringUtils } from '@/utils';

/**
 * PMC search options
 */
interface PMCSearchOptions {
  retmax?: number;
  retstart?: number;
  sort?: 'relevance' | 'pub date' | 'first author' | 'last author' | 'journal' | 'title';
  datetype?: 'pdat' | 'mdat' | 'edat';
  mindate?: string;
  maxdate?: string;
  field?: string;
  openAccess?: boolean;
}

/**
 * PMC eSearch response
 */
interface PMCSearchResponse {
  esearchresult: {
    count: string;
    retmax: string;
    retstart: string;
    idlist: string[];
    translationset?: any[];
    querytranslation?: string;
  };
}

/**
 * PMC eSummary response
 */
interface PMCSummaryResponse {
  result: {
    uids: string[];
    [pmid: string]: any;
  };
}

/**
 * PubMed Central API for accessing open access biomedical literature
 */
export class PubMedCentralAPI extends APIService {
  protected errorManager: ErrorManager;

  // PMC subject areas
  private static readonly SUBJECT_AREAS = {
    'medicine': 'Medicine',
    'biology': 'Biology',
    'biochemistry': 'Biochemistry',
    'genetics': 'Genetics',
    'immunology': 'Immunology',
    'neuroscience': 'Neuroscience',
    'pharmacology': 'Pharmacology',
    'physiology': 'Physiology',
    'public-health': 'Public Health',
    'veterinary': 'Veterinary Medicine',
  };

  constructor(addonData: any) {
    // NCBI rate limit: 3 requests per second without API key, 10 with API key
    super('https://eutils.ncbi.nlm.nih.gov/entrez/eutils', { requests: 3, window: 1000 }, addonData.cache, addonData.logger);
    this.errorManager = new ErrorManager();
  }

  /**
   * Search PMC by identifier (PMID, PMCID, DOI)
   */
  async searchByIdentifier(identifier: string): Promise<APIResponse<PMCEntry[]>> {
    try {
      const cleanId = this.cleanIdentifier(identifier);
      
      // Determine identifier type and build query
      let searchTerm: string;
      if (this.isPMID(cleanId)) {
        searchTerm = cleanId + '[pmid]';
      } else if (this.isPMCID(cleanId)) {
        searchTerm = cleanId + '[pmcid]';
      } else if (this.isDOI(cleanId)) {
        searchTerm = cleanId + '[doi]';
      } else {
        // Fallback to general search
        searchTerm = cleanId;
      }

      return await this.searchByQuery(searchTerm, { retmax: 5 });
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'PMC', operation: 'searchByIdentifier', identifier }
      );
    }
  }

  /**
   * Search PMC by query
   */
  async searchByQuery(query: string, options: PMCSearchOptions = {}): Promise<APIResponse<PMCEntry[]>> {
    try {
      // First, search for PMCIDs
      const searchResponse = await this.esearch(query, options);
      
      if (!searchResponse.data.esearchresult.idlist.length) {
        return {
          ...searchResponse,
          data: [],
        };
      }

      // Then get detailed information for found articles
      const summaryResponse = await this.esummary(searchResponse.data.esearchresult.idlist);
      
      const entries = this.processSummaryResults(summaryResponse.data);
      
      return {
        data: entries,
        status: summaryResponse.status,
        headers: summaryResponse.headers,
        cached: summaryResponse.cached,
        timestamp: summaryResponse.timestamp,
      };
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'PMC', operation: 'searchByQuery', query }
      );
    }
  }

  /**
   * Search for papers by title and authors
   */
  async searchPaper(title: string, authors?: string[], options: PMCSearchOptions = {}): Promise<APIResponse<PMCEntry[]>> {
    try {
      let searchQuery = `"${title}"[title]`;
      
      if (authors && authors.length > 0) {
        const authorQueries = authors.map(author => `"${author}"[author]`);
        searchQuery += ` AND (${authorQueries.join(' OR ')})`;
      }

      // Limit to open access if requested
      if (options.openAccess !== false) {
        searchQuery += ' AND "open access"[filter]';
      }

      return await this.searchByQuery(searchQuery, {
        retmax: 10,
        sort: 'relevance',
        ...options,
      });
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'PMC', operation: 'searchPaper', title, authors }
      );
    }
  }

  /**
   * Get full text URL for PMC article
   */
  getFullTextUrl(pmcid: string): string | null {
    const cleanId = this.extractPMCID(pmcid);
    if (!cleanId) {
      return null;
    }

    return `https://www.ncbi.nlm.nih.gov/pmc/articles/${cleanId}/`;
  }

  /**
   * Get PDF URL for PMC article (if available)
   */
  getPDFUrl(pmcid: string): string | null {
    const cleanId = this.extractPMCID(pmcid);
    if (!cleanId) {
      return null;
    }

    return `https://www.ncbi.nlm.nih.gov/pmc/articles/${cleanId}/pdf/`;
  }

  /**
   * Get PubMed URL
   */
  getPubMedUrl(pmid: string): string | null {
    if (!this.isPMID(pmid)) {
      return null;
    }

    return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  }

  /**
   * Convert PMC entry to standard search result
   */
  convertToSearchResult(entry: PMCEntry): SearchResult {
    return {
      title: entry.title || 'Unknown Title',
      authors: entry.authors || [],
      year: entry.pubdate ? this.extractYear(entry.pubdate) : undefined,
      doi: entry.doi,
      url: entry.pmcid ? (this.getFullTextUrl(entry.pmcid) || undefined) : (this.getPubMedUrl(entry.pmid || '') || undefined),
      pdfUrl: entry.pmcid ? (this.getPDFUrl(entry.pmcid) || undefined) : undefined,
      confidence: this.calculateConfidence(entry),
      source: 'PMC',
    };
  }

  /**
   * Get available subject areas
   */
  getSubjectAreas(): Record<string, string> {
    return { ...PubMedCentralAPI.SUBJECT_AREAS };
  }

  /**
   * Abstract method implementations
   */
  async search(query: any): Promise<PMCEntry[]> {
    if (typeof query === 'string') {
      const response = await this.searchByQuery(query);
      return response.data;
    }
    
    if (query && typeof query === 'object') {
      if (query.pmid || query.pmcid || query.doi) {
        const identifier = query.pmid || query.pmcid || query.doi;
        const response = await this.searchByIdentifier(identifier);
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
      name: 'PubMed Central',
      version: '1.0',
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }

  /**
   * Private helper methods
   */
  private async esearch(query: string, options: PMCSearchOptions): Promise<APIResponse<PMCSearchResponse>> {
    const {
      retmax = 20,
      retstart = 0,
      sort = 'relevance',
      datetype = 'pdat',
      mindate,
      maxdate,
    } = options;

    const params = new URLSearchParams();
    params.append('db', 'pmc');
    params.append('term', query);
    params.append('retmode', 'json');
    params.append('retmax', Math.min(retmax, 100).toString()); // PMC limit
    params.append('retstart', retstart.toString());
    params.append('sort', sort);
    
    if (datetype) {
      params.append('datetype', datetype);
    }
    
    if (mindate) {
      params.append('mindate', mindate);
    }
    
    if (maxdate) {
      params.append('maxdate', maxdate);
    }

    // Add email parameter for better rate limits (optional)
    params.append('email', 'zotero@example.com');

    const endpoint = `/esearch.fcgi?${params.toString()}`;
    return this.request<PMCSearchResponse>(endpoint);
  }

  private async esummary(pmcids: string[]): Promise<APIResponse<PMCSummaryResponse>> {
    if (pmcids.length === 0) {
      return {
        data: { result: { uids: [] } },
        status: 200,
        headers: {},
        cached: false,
        timestamp: new Date().toISOString(),
      };
    }

    const params = new URLSearchParams();
    params.append('db', 'pmc');
    params.append('id', pmcids.join(','));
    params.append('retmode', 'json');
    params.append('email', 'zotero@example.com');

    const endpoint = `/esummary.fcgi?${params.toString()}`;
    return this.request<PMCSummaryResponse>(endpoint);
  }

  private processSummaryResults(summaryData: PMCSummaryResponse): PMCEntry[] {
    const entries: PMCEntry[] = [];
    
    if (!summaryData.result || !summaryData.result.uids) {
      return entries;
    }

    for (const uid of summaryData.result.uids) {
      const articleData = summaryData.result[uid];
      if (articleData && typeof articleData === 'object') {
        const entry = this.createPMCEntry(articleData);
        if (entry) {
          entries.push(entry);
        }
      }
    }

    return entries;
  }

  private createPMCEntry(articleData: any): PMCEntry | null {
    try {
      const entry: PMCEntry = {
        pmid: articleData.pmid?.toString(),
        pmcid: this.extractPMCID(articleData.pmcid),
        title: this.cleanText(articleData.title || ''),
        authors: this.parseAuthors(articleData.authors),
        journal: this.cleanText(articleData.fulljournalname || articleData.source || ''),
        pubdate: articleData.pubdate || articleData.epubdate || '',
        doi: this.extractDOI(articleData.doi),
        abstract: this.cleanText(articleData.abstract || ''),
        keywords: this.parseKeywords(articleData.keywords),
      };

      // Only return if we have essential information
      if (entry.title || entry.pmid || entry.pmcid) {
        return entry;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private parseAuthors(authorsData: any): string[] {
    if (!authorsData) return [];
    
    if (typeof authorsData === 'string') {
      return authorsData
        .split(/[,;]/)
        .map(author => this.cleanText(author))
        .filter(author => author.length > 0);
    }
    
    if (Array.isArray(authorsData)) {
      return authorsData
        .map(author => this.cleanText(author.name || author.toString()))
        .filter(author => author.length > 0);
    }
    
    return [];
  }

  private parseKeywords(keywordsData: any): string[] {
    if (!keywordsData) return [];
    
    if (typeof keywordsData === 'string') {
      return keywordsData
        .split(/[,;]/)
        .map(keyword => this.cleanText(keyword))
        .filter(keyword => keyword.length > 0);
    }
    
    if (Array.isArray(keywordsData)) {
      return keywordsData
        .map(keyword => this.cleanText(keyword.toString()))
        .filter(keyword => keyword.length > 0);
    }
    
    return [];
  }

  private isPMID(str: string): boolean {
    return /^\d{8,}$/.test(str.replace(/\D/g, ''));
  }

  private isPMCID(str: string): boolean {
    return /^PMC\d+$/i.test(str) || /^\d+$/.test(str);
  }

  private isDOI(str: string): boolean {
    return /^10\.\d+\//.test(str);
  }

  private extractPMCID(input: string): string | null {
    if (!input) return null;
    
    const match = input.match(/PMC(\d+)/i);
    if (match) {
      return `PMC${match[1]}`;
    }
    
    // If it's just a number, assume it's a PMCID
    if (/^\d+$/.test(input)) {
      return `PMC${input}`;
    }
    
    return null;
  }

  private extractDOI(input: string): string | undefined {
    if (!input) return undefined;
    
    const match = input.match(/(10\.\d+\/[^\s]+)/);
    return match ? match[1] : undefined;
  }

  private extractYear(dateStr: string): number | undefined {
    if (!dateStr) return undefined;
    
    const match = dateStr.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : undefined;
  }

  private cleanIdentifier(identifier: string): string {
    return identifier.trim().replace(/\s+/g, '');
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .trim();
  }

  private calculateConfidence(entry: PMCEntry): number {
    let confidence = 0.7; // Good base confidence for PMC

    // Boost for having PMCID (open access)
    if (entry.pmcid) {
      confidence += 0.15;
    }

    // Boost for having DOI
    if (entry.doi) {
      confidence += 0.1;
    }

    // Boost for recent publications
    if (entry.pubdate) {
      const year = this.extractYear(entry.pubdate);
      if (year && year > 2015) {
        confidence += 0.05;
      }
    }

    // Boost for having abstract
    if (entry.abstract && entry.abstract.length > 100) {
      confidence += 0.05;
    }

    return Math.min(confidence, 0.9); // Cap at 0.9
  }
} 