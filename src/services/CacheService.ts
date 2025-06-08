import { ErrorManager, ErrorType } from '@/core';
import type { CacheConfig } from '@/core/types';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hitCount: number;
  size: number;
  tags: string[];
}

/**
 * Cache statistics
 */
interface CacheStats {
  memoryCache: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  persistentCache: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  totalSize: number;
  evictions: number;
}

/**
 * Enhanced Cache Service with multi-level caching and persistence
 */
export class CacheService {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private persistentCache = new Map<string, CacheEntry<any>>();
  private config: CacheConfig;
  private errorManager: ErrorManager;
  
  // Statistics
  private stats = {
    memoryHits: 0,
    memoryMisses: 0,
    persistentHits: 0,
    persistentMisses: 0,
    evictions: 0,
  };

  // Cache levels
  private readonly MEMORY_CACHE_SIZE = 500; // Fast memory cache
  private readonly PERSISTENT_CACHE_SIZE = 2000; // Larger persistent cache

  constructor(config: CacheConfig) {
    this.config = config;
    this.errorManager = new ErrorManager();
    this.loadPersistentCache();
  }

  /**
   * Get item from cache (checks memory first, then persistent)
   */
  async get<T>(key: string): Promise<T | null> {
    const normalizedKey = this.normalizeKey(key);

    // Check memory cache first
    const memoryEntry = this.memoryCache.get(normalizedKey);
    if (memoryEntry && this.isValid(memoryEntry)) {
      memoryEntry.hitCount++;
      this.stats.memoryHits++;
      return memoryEntry.data;
    }

    // Check persistent cache
    const persistentEntry = this.persistentCache.get(normalizedKey);
    if (persistentEntry && this.isValid(persistentEntry)) {
      persistentEntry.hitCount++;
      this.stats.persistentHits++;
      
      // Promote to memory cache
      this.setMemoryCache(normalizedKey, persistentEntry.data, persistentEntry.ttl, persistentEntry.tags);
      
      return persistentEntry.data;
    }

    // Cache miss
    this.stats.memoryMisses++;
    this.stats.persistentMisses++;
    return null;
  }

  /**
   * Set item in cache
   */
  async set<T>(key: string, data: T, ttl?: number, tags: string[] = []): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    const cacheTtl = ttl || this.config.ttl;

    // Set in memory cache
    this.setMemoryCache(normalizedKey, data, cacheTtl, tags);

    // Set in persistent cache for larger items or longer TTL
    if (this.shouldPersist(data, cacheTtl)) {
      this.setPersistentCache(normalizedKey, data, cacheTtl, tags);
    }
  }

  /**
   * Delete item from all cache levels
   */
  async delete(key: string): Promise<boolean> {
    const normalizedKey = this.normalizeKey(key);
    
    const memoryDeleted = this.memoryCache.delete(normalizedKey);
    const persistentDeleted = this.persistentCache.delete(normalizedKey);
    
    return memoryDeleted || persistentDeleted;
  }

  /**
   * Clear cache by pattern or tag
   */
  async clear(pattern?: string | RegExp, tags?: string[]): Promise<number> {
    let cleared = 0;

    if (!pattern && !tags) {
      // Clear all
      cleared = this.memoryCache.size + this.persistentCache.size;
      this.memoryCache.clear();
      this.persistentCache.clear();
      return cleared;
    }

    // Clear by pattern or tags
    const keysToDelete: string[] = [];

    for (const [key, entry] of [...this.memoryCache.entries(), ...this.persistentCache.entries()]) {
      let shouldDelete = false;

      if (pattern) {
        if (typeof pattern === 'string') {
          shouldDelete = key.includes(pattern);
        } else {
          shouldDelete = pattern.test(key);
        }
      }

      if (tags && tags.length > 0) {
        shouldDelete = shouldDelete || tags.some(tag => entry.tags.includes(tag));
      }

      if (shouldDelete) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
      cleared++;
    }

    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const memoryHitRate = this.stats.memoryHits + this.stats.memoryMisses > 0 
      ? this.stats.memoryHits / (this.stats.memoryHits + this.stats.memoryMisses)
      : 0;

    const persistentHitRate = this.stats.persistentHits + this.stats.persistentMisses > 0
      ? this.stats.persistentHits / (this.stats.persistentHits + this.stats.persistentMisses)
      : 0;

    return {
      memoryCache: {
        size: this.memoryCache.size,
        maxSize: this.MEMORY_CACHE_SIZE,
        hits: this.stats.memoryHits,
        misses: this.stats.memoryMisses,
        hitRate: memoryHitRate,
      },
      persistentCache: {
        size: this.persistentCache.size,
        maxSize: this.PERSISTENT_CACHE_SIZE,
        hits: this.stats.persistentHits,
        misses: this.stats.persistentMisses,
        hitRate: persistentHitRate,
      },
      totalSize: this.memoryCache.size + this.persistentCache.size,
      evictions: this.stats.evictions,
    };
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isValid(entry, now)) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    // Clean persistent cache
    for (const [key, entry] of this.persistentCache.entries()) {
      if (!this.isValid(entry, now)) {
        this.persistentCache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Optimize cache (remove least used items if needed)
   */
  async optimize(): Promise<void> {
    // Optimize memory cache
    if (this.memoryCache.size > this.MEMORY_CACHE_SIZE) {
      const entries = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].hitCount - b[1].hitCount);
      
      const toRemove = entries.slice(0, this.memoryCache.size - this.MEMORY_CACHE_SIZE);
      for (const [key] of toRemove) {
        this.memoryCache.delete(key);
        this.stats.evictions++;
      }
    }

    // Optimize persistent cache
    if (this.persistentCache.size > this.PERSISTENT_CACHE_SIZE) {
      const entries = Array.from(this.persistentCache.entries())
        .sort((a, b) => a[1].hitCount - b[1].hitCount);
      
      const toRemove = entries.slice(0, this.persistentCache.size - this.PERSISTENT_CACHE_SIZE);
      for (const [key] of toRemove) {
        this.persistentCache.delete(key);
        this.stats.evictions++;
      }
    }
  }

  /**
   * Save persistent cache to storage
   */
  async savePersistentCache(): Promise<void> {
    try {
      if (typeof Zotero !== 'undefined' && Zotero.File) {
        const cacheData = Object.fromEntries(this.persistentCache.entries());
        const jsonData = JSON.stringify(cacheData, null, 2);
        
        // In a real implementation, this would save to a file
        // For now, we'll use localStorage as a fallback
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('attachment-finder-cache', jsonData);
        }
      }
    } catch (error) {
      console.warn('Failed to save persistent cache:', error);
    }
  }

  /**
   * Load persistent cache from storage
   */
  private async loadPersistentCache(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        const jsonData = localStorage.getItem('attachment-finder-cache');
        if (jsonData) {
          const cacheData = JSON.parse(jsonData);
          this.persistentCache = new Map(Object.entries(cacheData));
          
          // Clean up expired entries
          await this.cleanup();
        }
      }
    } catch (error) {
      console.warn('Failed to load persistent cache:', error);
    }
  }

  /**
   * Private helper methods
   */
  private setMemoryCache<T>(key: string, data: T, ttl: number, tags: string[]): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      hitCount: 0,
      size: this.calculateSize(data),
      tags,
    };

    this.memoryCache.set(key, entry);

    // Trigger optimization if needed
    if (this.memoryCache.size > this.MEMORY_CACHE_SIZE * 1.1) {
      setTimeout(() => this.optimize(), 0);
    }
  }

  private setPersistentCache<T>(key: string, data: T, ttl: number, tags: string[]): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      hitCount: 0,
      size: this.calculateSize(data),
      tags,
    };

    this.persistentCache.set(key, entry);

    // Trigger optimization if needed
    if (this.persistentCache.size > this.PERSISTENT_CACHE_SIZE * 1.1) {
      setTimeout(() => this.optimize(), 0);
    }
  }

  private isValid(entry: CacheEntry<any>, now: number = Date.now()): boolean {
    return (now - entry.timestamp) < entry.ttl;
  }

  private shouldPersist<T>(data: T, ttl: number): boolean {
    // Persist if TTL is longer than 10 minutes or data is large
    return ttl > 10 * 60 * 1000 || this.calculateSize(data) > 1000;
  }

  private calculateSize(data: any): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 1000; // Fallback size estimate
    }
  }

  private normalizeKey(key: string): string {
    return key.toLowerCase().trim();
  }

  /**
   * Batch operations
   */
  async getMultiple<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    
    await Promise.allSettled(
      keys.map(async (key) => {
        const value = await this.get<T>(key);
        if (value !== null) {
          results.set(key, value);
        }
      })
    );

    return results;
  }

  async setMultiple<T>(entries: Map<string, T>, ttl?: number, tags: string[] = []): Promise<void> {
    await Promise.allSettled(
      Array.from(entries.entries()).map(([key, value]) =>
        this.set(key, value, ttl, tags)
      )
    );
  }

  /**
   * Cache warming (preload frequently accessed data)
   */
  async warmCache<T>(loader: () => Promise<Map<string, T>>, ttl?: number): Promise<void> {
    try {
      const data = await loader();
      await this.setMultiple(data, ttl, ['warm']);
    } catch (error) {
      console.warn('Failed to warm cache:', error);
    }
  }

  /**
   * Export cache for debugging
   */
  exportCache(): { memory: any; persistent: any } {
    return {
      memory: Object.fromEntries(this.memoryCache.entries()),
      persistent: Object.fromEntries(this.persistentCache.entries()),
    };
  }
} 