import { ErrorManager, ErrorType } from '@/core';
import { CrossRefAPI } from '@/apis/CrossRefAPI';
import { OpenAlexAPI } from '@/apis/OpenAlexAPI';
import { SemanticScholarAPI } from '@/apis/SemanticScholarAPI';
import { DownloadManager } from '@/services/DownloadManager';
import type { 
  MetadataResult, 
  SearchQuery, 
  SearchResult, 
  AttachmentFinderConfig 
} from '@/core/types';

/**
 * Metadata search result with confidence scoring
 */
interface MetadataSearchResult {
  results: SearchResult[];
  source: string;
  query: SearchQuery;
  confidence: number;
  searchTime: number;
}

/**
 * Strategy for combining results from multiple APIs
 */
type SearchStrategy = 'parallel' | 'fallback' | 'best_result';

/**
 * Options for metadata fetching
 */
interface FetchOptions {
  strategy?: SearchStrategy;
  minConfidence?: number;
  maxResults?: number;
  includeOpenAccess?: boolean;
  downloadPDFs?: boolean;
  apis?: string[];
}

/**
 * Metadata fetcher that orchestrates searches across multiple academic APIs
 */
export class MetadataFetcher {
  private errorManager: ErrorManager;
  private crossRefAPI: CrossRefAPI;
  private openAlexAPI: OpenAlexAPI;
  private semanticScholarAPI: SemanticScholarAPI;
  private downloadManager: DownloadManager;
  private config: AttachmentFinderConfig;

  constructor(addonData: any) {
    this.config = addonData.config;
    this.errorManager = new ErrorManager();
    
    // Initialize API services
    this.crossRefAPI = new CrossRefAPI();
    this.openAlexAPI = new OpenAlexAPI();
    this.semanticScholarAPI = new SemanticScholarAPI();
    this.downloadManager = new DownloadManager({
      concurrency: this.config.downloads?.maxConcurrent || 3,
      maxRetries: 3,
    });
  }

  /**
   * Fetch metadata for selected Zotero items
   */
  async fetchMetadataForSelectedItems(options: FetchOptions = {}): Promise<MetadataResult[]> {
    const selectedItems = this.getSelectedItems();
    
    if (selectedItems.length === 0) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        'No items selected for metadata fetching'
      );
    }

    const results = await Promise.allSettled(
      selectedItems.map(item => this.fetchMetadataForItem(item, options))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          item: selectedItems[index],
          source: 'MetadataFetcher',
          changes: [],
          errors: [result.reason.message || 'Unknown error'],
        };
      }
    });
  }

  /**
   * Fetch metadata for a single Zotero item
   */
  async fetchMetadataForItem(
    item: Zotero.Item, 
    options: FetchOptions = {}
  ): Promise<MetadataResult> {
    return this.errorManager.wrapAsync(
      async () => {
        const query = this.buildSearchQuery(item);
        const searchResults = await this.searchMultipleAPIs(query, options);
        
        if (searchResults.length === 0) {
          return {
            success: false,
            item,
            source: 'MetadataFetcher',
            changes: [],
            errors: ['No metadata found from any source'],
          };
        }

        const bestResult = this.selectBestResult(searchResults, options);
        const changes = await this.applyMetadataToItem(item, bestResult, options);

        return {
          success: true,
          item,
          source: bestResult.source,
          changes,
          errors: [],
        };
      },
      ErrorType.API_ERROR,
      { operation: 'fetchMetadataForItem', itemId: item.id }
    );
  }

  /**
   * Search for metadata by DOI
   */
  async searchByDOI(
    doi: string, 
    options: FetchOptions = {}
  ): Promise<SearchResult[]> {
    const query: SearchQuery = { doi };
    const searchResults = await this.searchMultipleAPIs(query, options);
    
    return searchResults
      .flatMap(result => result.results)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Search for metadata by title and authors
   */
  async searchByTitleAndAuthors(
    title: string,
    authors: string[],
    year?: number,
    options: FetchOptions = {}
  ): Promise<SearchResult[]> {
    const query: SearchQuery = { title, authors, year };
    const searchResults = await this.searchMultipleAPIs(query, options);
    
    return searchResults
      .flatMap(result => result.results)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Search for open access versions
   */
  async findOpenAccessVersions(
    query: SearchQuery, 
    options: FetchOptions = {}
  ): Promise<SearchResult[]> {
    const openAccessOptions = { ...options, includeOpenAccess: true };
    const searchResults = await this.searchMultipleAPIs(query, openAccessOptions);
    
    return searchResults
      .flatMap(result => result.results)
      .filter(result => result.pdfUrl)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Search multiple APIs according to strategy
   */
  private async searchMultipleAPIs(
    query: SearchQuery, 
    options: FetchOptions = {}
  ): Promise<MetadataSearchResult[]> {
    const strategy = options.strategy || 'parallel';
    const enabledAPIs = options.apis || ['crossref', 'openalex', 'semanticscholar'];

    switch (strategy) {
      case 'parallel':
        return this.searchParallel(query, enabledAPIs, options);
      
      case 'fallback':
        return this.searchFallback(query, enabledAPIs, options);
      
      case 'best_result':
        return this.searchBestResult(query, enabledAPIs, options);
      
      default:
        return this.searchParallel(query, enabledAPIs, options);
    }
  }

  /**
   * Search all APIs in parallel
   */
  private async searchParallel(
    query: SearchQuery, 
    apis: string[], 
    options: FetchOptions
  ): Promise<MetadataSearchResult[]> {
    const searchPromises = apis.map(async (api) => {
      return this.searchSingleAPI(api, query, options);
    });

    const results = await Promise.allSettled(searchPromises);
    
    return results
      .filter((result): result is PromiseFulfilledResult<MetadataSearchResult> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value)
      .filter(result => result.results.length > 0);
  }

  /**
   * Search APIs in fallback order (stop on first success)
   */
  private async searchFallback(
    query: SearchQuery, 
    apis: string[], 
    options: FetchOptions
  ): Promise<MetadataSearchResult[]> {
    for (const api of apis) {
      try {
        const result = await this.searchSingleAPI(api, query, options);
        if (result.results.length > 0) {
          return [result];
        }
      } catch (error) {
        // Continue to next API
        continue;
      }
    }
    
    return [];
  }

  /**
   * Search all APIs and return only the best overall result
   */
  private async searchBestResult(
    query: SearchQuery, 
    apis: string[], 
    options: FetchOptions
  ): Promise<MetadataSearchResult[]> {
    const allResults = await this.searchParallel(query, apis, options);
    
    if (allResults.length === 0) {
      return [];
    }

    // Find result with highest confidence
    const bestResult = allResults.reduce((best, current) => {
      const bestConfidence = Math.max(...best.results.map(r => r.confidence));
      const currentConfidence = Math.max(...current.results.map(r => r.confidence));
      return currentConfidence > bestConfidence ? current : best;
    });

    return [bestResult];
  }

  /**
   * Search a single API
   */
  private async searchSingleAPI(
    apiName: string, 
    query: SearchQuery, 
    options: FetchOptions
  ): Promise<MetadataSearchResult> {
    const startTime = Date.now();
    
    let results: SearchResult[] = [];
    let source = apiName;

    try {
      switch (apiName.toLowerCase()) {
        case 'crossref':
          if (query.doi) {
            const doiResult = await this.crossRefAPI.getWorkByDOI(query.doi);
            results = doiResult ? [doiResult] : [];
          } else {
            results = await this.crossRefAPI.search(query);
          }
          break;
          
        case 'openalex':
          if (options.includeOpenAccess) {
            results = await this.openAlexAPI.searchOpenAccess(query);
          } else if (query.doi) {
            const doiResult = await this.openAlexAPI.getWorkByDOI(query.doi);
            results = doiResult ? [doiResult] : [];
          } else {
            results = await this.openAlexAPI.search(query);
          }
          break;
          
        case 'semanticscholar':
          if (options.includeOpenAccess) {
            results = await this.semanticScholarAPI.searchOpenAccess(query);
          } else if (query.doi) {
            const doiResult = await this.semanticScholarAPI.getPaperByDOI(query.doi);
            results = doiResult ? [doiResult] : [];
          } else if (query.arxivId) {
            results = await this.semanticScholarAPI.searchByArxivId(query.arxivId);
          } else {
            results = await this.semanticScholarAPI.search(query);
          }
          break;
          
        default:
          throw new Error(`Unknown API: ${apiName}`);
      }

      // Filter by minimum confidence
      if (options.minConfidence) {
        results = results.filter(result => result.confidence >= options.minConfidence!);
      }

      // Limit results
      if (options.maxResults) {
        results = results.slice(0, options.maxResults);
      }

      const searchTime = Date.now() - startTime;
      const confidence = results.length > 0 ? Math.max(...results.map(r => r.confidence)) : 0;

      return {
        results,
        source,
        query,
        confidence,
        searchTime,
      };
    } catch (error) {
      const contextualError = this.errorManager.createFromUnknown(
        error,
        ErrorType.API_ERROR,
        { api: apiName, query }
      );

      await this.errorManager.handleError(contextualError);
      
      return {
        results: [],
        source,
        query,
        confidence: 0,
        searchTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Select the best result from multiple search results
   */
  private selectBestResult(
    searchResults: MetadataSearchResult[], 
    options: FetchOptions
  ): SearchResult {
    // Flatten all results
    const allResults = searchResults.flatMap(search => search.results);
    
    if (allResults.length === 0) {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        'No search results to select from'
      );
    }

    // Sort by confidence score
    allResults.sort((a, b) => b.confidence - a.confidence);

    // If looking for open access, prioritize results with PDFs
    if (options.includeOpenAccess) {
      const openAccessResults = allResults.filter(result => result.pdfUrl);
      if (openAccessResults.length > 0) {
        return openAccessResults[0];
      }
    }

    return allResults[0];
  }

  /**
   * Apply metadata to Zotero item
   */
  private async applyMetadataToItem(
    item: Zotero.Item, 
    searchResult: SearchResult,
    options: FetchOptions
  ): Promise<string[]> {
    const changes: string[] = [];

    try {
      // Update title if missing or different
      if (!item.getField('title') || this.shouldUpdateTitle(item.getField('title'), searchResult.title)) {
        item.setField('title', searchResult.title);
        changes.push(`Updated title: ${searchResult.title}`);
      }

      // Update DOI if available and missing
      if (searchResult.doi && !item.getField('DOI')) {
        item.setField('DOI', searchResult.doi);
        changes.push(`Added DOI: ${searchResult.doi}`);
      }

      // Update year if available and missing
      if (searchResult.year && !item.getField('date')) {
        item.setField('date', searchResult.year.toString());
        changes.push(`Added year: ${searchResult.year}`);
      }

      // Update authors if significantly different
      if (searchResult.authors && searchResult.authors.length > 0) {
        const shouldUpdateAuthors = await this.shouldUpdateAuthors(item, searchResult.authors);
        if (shouldUpdateAuthors) {
          await this.updateItemAuthors(item, searchResult.authors);
          changes.push(`Updated authors: ${searchResult.authors.join(', ')}`);
        }
      }

      // Download PDF if requested and available
      if (options.downloadPDFs && searchResult.pdfUrl) {
        try {
          const downloadResult = await this.downloadManager.downloadFile(searchResult.pdfUrl, {
            timeout: 60000,
            maxFileSize: 100 * 1024 * 1024, // 100MB limit
          });

          if (downloadResult.success && downloadResult.data) {
            const attachment = await this.createAttachmentFromData(
              item, 
              downloadResult.data, 
              searchResult.title,
              searchResult.source
            );
            
            if (attachment) {
              changes.push(`Downloaded PDF from ${searchResult.source}`);
            }
          }
        } catch (error) {
          // PDF download failure shouldn't fail the entire operation
          changes.push(`Failed to download PDF: ${error.message}`);
        }
      }

      // Save item if changes were made
      if (changes.length > 0) {
        await item.saveTx();
      }

      return changes;
    } catch (error) {
      const contextualError = this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { itemId: item.id, searchResult }
      );

      await this.errorManager.handleError(contextualError);
      throw contextualError;
    }
  }

  /**
   * Build search query from Zotero item
   */
  private buildSearchQuery(item: Zotero.Item): SearchQuery {
    const query: SearchQuery = {};

    // Extract title
    const title = item.getField('title');
    if (title) {
      query.title = title;
    }

    // Extract DOI
    const doi = item.getField('DOI');
    if (doi) {
      query.doi = doi;
    }

    // Extract year
    const date = item.getField('date');
    if (date) {
      const year = parseInt(date);
      if (!isNaN(year)) {
        query.year = year;
      }
    }

    // Extract authors
    const creators = item.getCreators();
    if (creators && creators.length > 0) {
      query.authors = creators
        .filter(creator => creator.creatorType === 'author')
        .map(creator => `${creator.firstName || ''} ${creator.lastName || ''}`.trim())
        .filter(name => name.length > 0);
    }

    // Check for arXiv ID in extra field
    const extra = item.getField('extra');
    if (extra) {
      const arxivMatch = extra.match(/arXiv:\s*([^\s]+)/i);
      if (arxivMatch) {
        query.arxivId = arxivMatch[1];
      }
    }

    return query;
  }

  /**
   * Get selected Zotero items
   */
  private getSelectedItems(): Zotero.Item[] {
    const zoteroPane = Zotero.getActiveZoteroPane();
    if (!zoteroPane) {
      throw this.errorManager.createError(
        ErrorType.ZOTERO_ERROR,
        'No active Zotero pane found'
      );
    }

    const selectedItems = zoteroPane.getSelectedItems();
    return selectedItems.filter(item => item.isRegularItem());
  }

  /**
   * Check if title should be updated
   */
  private shouldUpdateTitle(currentTitle: string, newTitle: string): boolean {
    if (!currentTitle) return true;
    if (!newTitle) return false;
    
    // Calculate similarity
    const similarity = this.calculateStringSimilarity(
      currentTitle.toLowerCase(),
      newTitle.toLowerCase()
    );
    
    // Update if new title is significantly better (less similarity suggests improvement)
    return similarity < 0.8 && newTitle.length > currentTitle.length;
  }

  /**
   * Check if authors should be updated
   */
  private async shouldUpdateAuthors(item: Zotero.Item, newAuthors: string[]): Promise<boolean> {
    const currentCreators = item.getCreators();
    const currentAuthors = currentCreators
      .filter(creator => creator.creatorType === 'author')
      .map(creator => `${creator.firstName || ''} ${creator.lastName || ''}`.trim());

    if (currentAuthors.length === 0) return true;
    if (newAuthors.length === 0) return false;

    // Don't update if we have significantly more authors already
    if (currentAuthors.length > newAuthors.length * 1.5) return false;

    return newAuthors.length > currentAuthors.length;
  }

  /**
   * Update item authors
   */
  private async updateItemAuthors(item: Zotero.Item, authors: string[]): Promise<void> {
    // Remove existing authors
    const creators = item.getCreators();
    const nonAuthors = creators.filter(creator => creator.creatorType !== 'author');
    
    // Add new authors
    const newCreators = authors.map(authorName => {
      const parts = authorName.split(' ');
      const lastName = parts.pop() || '';
      const firstName = parts.join(' ');
      
      return {
        creatorType: 'author',
        firstName,
        lastName,
      };
    });

    // Combine with existing non-author creators
    item.setCreators([...newCreators, ...nonAuthors]);
  }

  /**
   * Create attachment from downloaded data
   */
  private async createAttachmentFromData(
    item: Zotero.Item,
    data: ArrayBuffer,
    title: string,
    source: string
  ): Promise<Zotero.Item | null> {
    try {
      const fileName = `${title.replace(/[^\w\s]/g, '').substring(0, 50)}.pdf`;
      
      // Create attachment using Zotero's API
      const attachment = await Zotero.Attachments.importFromBuffer({
        buffer: data,
        fileName,
        contentType: 'application/pdf',
        parentItemID: item.id,
      });

      if (attachment) {
        // Add note about source
        attachment.setNote(`Downloaded from ${source} by Zotadata`);
        await attachment.saveTx();
      }

      return attachment;
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.FILE_ERROR,
        { operation: 'createAttachment', title, source }
      );
    }
  }

  /**
   * Calculate string similarity (0-1, where 1 is identical)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
} 