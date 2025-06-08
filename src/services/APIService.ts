import { ErrorManager, ErrorType } from '@/core';
import type { 
  APIResponse, 
  RateLimitConfig, 
  CacheConfig,
  ContextualError 
} from '@/core/types';

/**
 * Base API service with rate limiting, caching, and error handling
 */
export abstract class APIService {
  protected errorManager: ErrorManager;
  protected baseUrl: string;
  protected rateLimitConfig: RateLimitConfig;
  protected cacheConfig: CacheConfig;
  protected userAgent: string;
  
  // Rate limiting
  private requestTimes: number[] = [];
  
  // Caching
  private cache = new Map<string, {
    data: any;
    timestamp: number;
    ttl: number;
  }>();

  constructor(
    baseUrl: string,
    rateLimitConfig: RateLimitConfig,
    cacheConfig: CacheConfig = { ttl: 300000, maxSize: 1000 }, // 5 min default TTL
    userAgent = 'Zotero Zotadata/1.0'
  ) {
    this.baseUrl = baseUrl;
    this.rateLimitConfig = rateLimitConfig;
    this.cacheConfig = cacheConfig;
    this.userAgent = userAgent;
    this.errorManager = new ErrorManager();
  }

  /**
   * Make a rate-limited, cached HTTP request
   */
  protected async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
      cacheable?: boolean;
      cacheKey?: string;
    } = {}
  ): Promise<APIResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = 30000,
      cacheable = true,
      cacheKey
    } = options;

    const url = this.buildUrl(endpoint);
    const finalCacheKey = cacheKey || this.buildCacheKey(method, url, body);

    // Check cache first
    if (cacheable && method === 'GET') {
      const cached = this.getFromCache<T>(finalCacheKey);
      if (cached) {
        return cached;
      }
    }

    // Apply rate limiting
    await this.enforceRateLimit();

    // Make request with error handling
    return this.errorManager.wrapAsync(
      async () => {
        const response = await this.makeHttpRequest(url, {
          method,
          headers: {
            'User-Agent': this.userAgent,
            ...headers,
          },
          body,
          timeout,
        });

        const apiResponse: APIResponse<T> = {
          data: response.data,
          status: response.status,
          headers: response.headers,
          cached: false,
          timestamp: new Date().toISOString(),
        };

        // Cache successful GET requests
        if (cacheable && method === 'GET' && response.status === 200) {
          this.setCache(finalCacheKey, apiResponse, this.cacheConfig.ttl);
        }

        return apiResponse;
      },
      ErrorType.API_ERROR,
      {
        api: this.constructor.name,
        url,
        method,
        endpoint,
      }
    );
  }

  /**
   * Build full URL from endpoint
   */
  protected buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http')) {
      return endpoint;
    }
    
    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    return `${base}${path}`;
  }

  /**
   * Build cache key for request
   */
  protected buildCacheKey(method: string, url: string, body?: string): string {
    const key = `${method}:${url}`;
    if (body) {
      // Simple hash of body for cache key
      const bodyHash = this.simpleHash(body);
      return `${key}:${bodyHash}`;
    }
    return key;
  }

  /**
   * Make the actual HTTP request
   */
  private async makeHttpRequest(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      timeout: number;
    }
  ): Promise<{
    data: any;
    status: number;
    headers: Record<string, string>;
  }> {
    try {
      const response = await Zotero.HTTP.request(options.method, url, {
        headers: options.headers,
        body: options.body,
        timeout: options.timeout,
        responseType: 'text',
      });

      // Parse response data
      let data: any;
      try {
        data = JSON.parse(response.responseText);
      } catch {
        data = response.responseText;
      }

      // Extract headers
      const headers: Record<string, string> = {};
      // Note: Zotero.HTTP.request doesn't provide easy header access
      // This would need to be implemented based on actual Zotero API

      return {
        data,
        status: response.status,
        headers,
      };
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.NETWORK_ERROR,
        { url, method: options.method }
      );
    }
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.window;

    // Remove old requests outside the window
    this.requestTimes = this.requestTimes.filter(time => time > windowStart);

    // Check if we're at the limit
    if (this.requestTimes.length >= this.rateLimitConfig.requests) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = oldestRequest + this.rateLimitConfig.window - now;
      
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }

    // Record this request
    this.requestTimes.push(now);
  }

  /**
   * Get item from cache
   */
  private getFromCache<T>(key: string): APIResponse<T> | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return {
      ...cached.data,
      cached: true,
    };
  }

  /**
   * Set item in cache
   */
  private setCache(key: string, data: APIResponse<any>, ttl: number): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.cacheConfig.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Clear cache
   */
  protected clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  protected getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    // This would need to track hits/misses for accurate hit rate
    return {
      size: this.cache.size,
      maxSize: this.cacheConfig.maxSize,
      hitRate: 0, // Placeholder
    };
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Abstract method for API-specific search implementations
   */
  abstract search(query: any): Promise<any[]>;

  /**
   * Get API-specific configuration
   */
  abstract getApiInfo(): {
    name: string;
    version: string;
    baseUrl: string;
    rateLimit: RateLimitConfig;
  };
} 