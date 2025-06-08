import { APIService } from '@/services';
import { ErrorManager, ErrorType } from '@/core';
import type { APIResponse, SearchResult, BookMetadata } from '@/core/types';
import { URLUtils, StringUtils } from '@/utils';

/**
 * LibGen search result
 */
interface LibGenResult {
  title: string;
  authors: string[];
  year?: number;
  pages?: number;
  size?: string;
  extension?: string;
  md5: string;
  downloadLinks: string[];
  mirrors: string[];
  language?: string;
  publisher?: string;
  isbn?: string;
}

/**
 * LibGen search options
 */
interface LibGenSearchOptions {
  searchType?: 'title' | 'author' | 'isbn' | 'md5';
  sortBy?: 'title' | 'author' | 'year' | 'pages' | 'size';
  sortOrder?: 'asc' | 'desc';
  resultCount?: number;
  minYear?: number;
  maxYear?: number;
  language?: string;
  extension?: string;
}

/**
 * Library Genesis API for accessing academic books and papers
 */
export class LibGenAPI extends APIService {
  protected errorManager: ErrorManager;

  // LibGen mirror domains (in order of preference)
  private static readonly MIRRORS = [
    'libgen.is',
    'libgen.rs', 
    'libgen.li',
    'libgen.st',
  ];

  // File extensions supported by LibGen
  private static readonly SUPPORTED_EXTENSIONS = new Set([
    'pdf', 'epub', 'mobi', 'azw', 'azw3', 'fb2', 'txt', 'rtf', 'doc', 'docx'
  ]);

  constructor(addonData: any) {
    // LibGen doesn't have strict rate limits, but we'll be respectful
    super('https://libgen.is', { requests: 30, window: 60000 }, addonData.cache, addonData.logger);
    this.errorManager = new ErrorManager();
  }

  /**
   * Search LibGen by identifier (ISBN, DOI, etc.)
   */
  async searchByIdentifier(identifier: string): Promise<APIResponse<LibGenResult[]>> {
    try {
      const cleanId = this.cleanIdentifier(identifier);
      
      // Determine search type
      let searchType: string;
      if (this.isISBN(cleanId)) {
        searchType = 'isbn';
      } else if (this.isMD5(cleanId)) {
        searchType = 'md5';
      } else {
        searchType = 'title'; // Fallback to title search
      }

      return await this.searchLibGen(cleanId, { searchType: searchType as any });
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'LibGen', operation: 'searchByIdentifier', identifier }
      );
    }
  }

  /**
   * Search LibGen by query string
   */
  async searchByQuery(query: string, options: LibGenSearchOptions = {}): Promise<APIResponse<LibGenResult[]>> {
    try {
      return await this.searchLibGen(query, options);
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'LibGen', operation: 'searchByQuery', query }
      );
    }
  }

  /**
   * Search for a book by title and author
   */
  async searchBook(title: string, author?: string, options: LibGenSearchOptions = {}): Promise<APIResponse<LibGenResult[]>> {
    try {
      let searchQuery = title.trim();
      
      if (author) {
        searchQuery += ` ${author.trim()}`;
      }

      const searchOptions: LibGenSearchOptions = {
        searchType: 'title',
        resultCount: 10,
        ...options,
      };

      return await this.searchLibGen(searchQuery, searchOptions);
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'LibGen', operation: 'searchBook', title, author }
      );
    }
  }

  /**
   * Get direct download links for a book
   */
  async getDownloadLinks(md5: string): Promise<string[]> {
    try {
      const downloadLinks: string[] = [];

      // Try different mirror patterns
      for (const mirror of LibGenAPI.MIRRORS) {
        try {
          const links = await this.getDownloadLinksFromMirror(mirror, md5);
          downloadLinks.push(...links);
        } catch (error) {
          // Continue with next mirror if one fails
          continue;
        }
      }

      if (downloadLinks.length === 0) {
        throw this.errorManager.createError(
          ErrorType.API_ERROR,
          'No download links found for the specified book',
          { md5 }
        );
      }

      // Remove duplicates and validate URLs
      const uniqueLinks = Array.from(new Set(downloadLinks))
        .filter(url => URLUtils.validateAndCleanURL(url).valid)
        .map(url => URLUtils.validateAndCleanURL(url).cleaned);

      return uniqueLinks;
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: 'LibGen', operation: 'getDownloadLinks', md5 }
      );
    }
  }

  /**
   * Convert LibGen result to standard search result
   */
  convertToSearchResult(libgenResult: LibGenResult): SearchResult {
    const confidence = this.calculateConfidence(libgenResult);
    
    return {
      title: libgenResult.title,
      authors: libgenResult.authors,
      year: libgenResult.year,
      doi: undefined, // LibGen usually doesn't have DOIs
      url: libgenResult.downloadLinks[0], // Primary download link
      pdfUrl: this.getPDFUrl(libgenResult),
      confidence,
      source: 'LibGen',
    };
  }

  /**
   * Convert to book metadata format
   */
  convertToBookMetadata(libgenResult: LibGenResult): BookMetadata {
    return {
      title: libgenResult.title,
      authors: libgenResult.authors,
      isbn: libgenResult.isbn,
      publisher: libgenResult.publisher,
      year: libgenResult.year,
      pages: libgenResult.pages,
      language: libgenResult.language,
      subjects: [], // LibGen doesn't provide subject classification
    };
  }

  /**
   * Main search implementation
   */
  private async searchLibGen(query: string, options: LibGenSearchOptions): Promise<APIResponse<LibGenResult[]>> {
    const {
      searchType = 'title',
      sortBy = 'year',
      sortOrder = 'desc',
      resultCount = 25,
      minYear,
      maxYear,
      language,
      extension,
    } = options;

    // Try multiple mirrors until one works
    let lastError: Error | null = null;
    
    for (const mirror of LibGenAPI.MIRRORS) {
      try {
        const searchUrl = this.buildSearchURL(mirror, query, {
          searchType,
          sortBy,
          sortOrder,
          resultCount,
          minYear,
          maxYear,
          language,
          extension,
        });

        const response = await this.request<string>(searchUrl, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
          },
        });

        const results = this.parseSearchResults(response.data);
        
        return {
          ...response,
          data: results,
        };
      } catch (error) {
        lastError = error as Error;
        continue; // Try next mirror
      }
    }

    // If all mirrors failed, throw the last error
    throw lastError || this.errorManager.createError(
      ErrorType.API_ERROR,
      'All LibGen mirrors are unavailable',
      { query, mirrors: LibGenAPI.MIRRORS }
    );
  }

  /**
   * Build search URL for LibGen
   */
  private buildSearchURL(mirror: string, query: string, options: LibGenSearchOptions): string {
    const baseUrl = `https://${mirror}/search.php`;
    const params = new URLSearchParams();

    params.append('req', encodeURIComponent(query));
    params.append('lg_topic', 'libgen');
    params.append('open', '0');
    params.append('view', 'simple');
    params.append('res', Math.min(options.resultCount || 25, 100).toString());

    // Search column
    const columnMap = {
      title: 'title',
      author: 'author',
      isbn: 'identifier',
      md5: 'md5',
    };
    params.append('column', columnMap[options.searchType!] || 'def');

    // Sorting
    if (options.sortBy) {
      const sortMap = {
        title: 'title',
        author: 'author',
        year: 'year',
        pages: 'pages',
        size: 'filesize',
      };
      params.append('sort', sortMap[options.sortBy] || 'year');
      params.append('sortmode', options.sortOrder || 'DESC');
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Parse HTML search results from LibGen
   */
  private parseSearchResults(html: string): LibGenResult[] {
    const results: LibGenResult[] = [];

    try {
      // This is a simplified HTML parsing approach
      // In a real implementation, you'd use a proper HTML parser
      const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
      const tableMatches = html.match(tableRegex);

      if (!tableMatches) {
        return results;
      }

      // Look for the results table (usually the largest one)
      const resultsTable = tableMatches.find(table => 
        table.includes('Title') && table.includes('Author') && table.includes('Year')
      );

      if (!resultsTable) {
        return results;
      }

      // Extract rows
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows = resultsTable.match(rowRegex) || [];

      for (const row of rows.slice(1)) { // Skip header row
        try {
          const result = this.parseTableRow(row);
          if (result) {
            results.push(result);
          }
        } catch (error) {
          // Skip invalid rows
          continue;
        }
      }

    } catch (error) {
      // If parsing fails, return empty results rather than throwing
      console.warn('Failed to parse LibGen results:', error);
    }

    return results;
  }

  /**
   * Parse individual table row
   */
  private parseTableRow(rowHtml: string): LibGenResult | null {
    try {
      // Extract cell contents (simplified approach)
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let match;

      while ((match = cellRegex.exec(rowHtml)) !== null) {
        cells.push(this.cleanHtml(match[1]));
      }

      if (cells.length < 9) { // LibGen typically has 9+ columns
        return null;
      }

      // Extract MD5 hash from download links
      const md5Match = rowHtml.match(/[a-f0-9]{32}/i);
      const md5 = md5Match ? md5Match[0].toLowerCase() : '';

      if (!md5) {
        return null; // MD5 is required for downloads
      }

      const result: LibGenResult = {
        title: cells[2] || 'Unknown Title',
        authors: this.parseAuthors(cells[1] || ''),
        year: this.parseYear(cells[4]),
        pages: this.parsePages(cells[5]),
        size: cells[7] || '',
        extension: cells[8] || '',
        md5,
        downloadLinks: [], // Will be populated later when needed
        mirrors: LibGenAPI.MIRRORS.map(mirror => `https://${mirror}`),
        language: cells[6] || '',
        publisher: cells[3] || '',
        isbn: this.extractISBN(rowHtml),
      };

      return result;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get download links from specific mirror
   */
  private async getDownloadLinksFromMirror(mirror: string, md5: string): Promise<string[]> {
    const links: string[] = [];

    // Common LibGen download URL patterns
    const patterns = [
      `https://${mirror}/get.php?md5=${md5}`,
      `https://${mirror}/book/index.php?md5=${md5}`,
      `https://${mirror}/ads.php?md5=${md5}`,
    ];

    for (const pattern of patterns) {
      if (URLUtils.validateAndCleanURL(pattern).valid) {
        links.push(pattern);
      }
    }

    return links;
  }

  /**
   * Calculate confidence score for LibGen result
   */
  private calculateConfidence(result: LibGenResult): number {
    let confidence = 0.5; // Base confidence for LibGen results

    // Boost for PDF files
    if (result.extension?.toLowerCase() === 'pdf') {
      confidence += 0.2;
    }

    // Boost for recent publications
    if (result.year && result.year > 2010) {
      confidence += 0.1;
    }

    // Boost for reasonable file size
    if (result.size && this.isReasonableFileSize(result.size)) {
      confidence += 0.1;
    }

    // Boost for having ISBN
    if (result.isbn) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.9); // Cap at 0.9
  }

  /**
   * Get PDF URL from LibGen result
   */
  private getPDFUrl(result: LibGenResult): string | undefined {
    if (result.extension?.toLowerCase() === 'pdf' && result.downloadLinks.length > 0) {
      return result.downloadLinks[0];
    }
    return undefined;
  }

  /**
   * Utility methods
   */
  private cleanIdentifier(identifier: string): string {
    return identifier.trim().replace(/[-\s]/g, '');
  }

  private isISBN(str: string): boolean {
    const cleanStr = str.replace(/[-\s]/g, '');
    return /^(978|979)?\d{9}[\dX]$/i.test(cleanStr);
  }

  private isMD5(str: string): boolean {
    return /^[a-f0-9]{32}$/i.test(str);
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  private parseAuthors(authorString: string): string[] {
    if (!authorString) return [];
    
    return authorString
      .split(/[,;]/)
      .map(author => author.trim())
      .filter(author => author.length > 0);
  }

  private parseYear(yearString: string): number | undefined {
    const match = yearString?.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : undefined;
  }

  private parsePages(pagesString: string): number | undefined {
    const match = pagesString?.match(/\b\d+\b/);
    return match ? parseInt(match[0], 10) : undefined;
  }

  private extractISBN(html: string): string | undefined {
    const isbnMatch = html.match(/ISBN[:\s]*([0-9-]{10,17})/i);
    return isbnMatch ? isbnMatch[1].replace(/[-\s]/g, '') : undefined;
  }

  private isReasonableFileSize(sizeStr: string): boolean {
    // Check if file size is reasonable (between 100KB and 500MB)
    const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i);
    if (!match) return false;

    const size = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    if (unit === 'KB') return size >= 100;
    if (unit === 'MB') return size >= 0.1 && size <= 500;
    if (unit === 'GB') return size <= 0.5;

    return false;
  }

  /**
   * Abstract method implementation: Search with any query type
   */
  async search(query: any): Promise<LibGenResult[]> {
    if (typeof query === 'string') {
      const response = await this.searchByQuery(query);
      return response.data;
    }
    
    if (query && typeof query === 'object') {
      if (query.isbn) {
        const response = await this.searchByIdentifier(query.isbn);
        return response.data;
      }
      
      if (query.title) {
        const response = await this.searchBook(query.title, query.author);
        return response.data;
      }
    }
    
    throw this.errorManager.createError(
      ErrorType.VALIDATION_ERROR,
      'Invalid search query format',
      { query }
    );
  }

  /**
   * Abstract method implementation: Get API information
   */
  getApiInfo(): {
    name: string;
    version: string;
    baseUrl: string;
    rateLimit: any;
  } {
    return {
      name: 'LibGen',
      version: '1.0',
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimitConfig,
    };
  }
} 