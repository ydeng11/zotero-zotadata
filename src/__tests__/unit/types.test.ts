import { describe, it, expect } from 'vitest';
import type { AttachmentStats, PluginConfig, BatchResult } from '@/shared/core/types';

describe('Shared Types', () => {
  it('should accept valid AttachmentStats', () => {
    const stats: AttachmentStats = {
      valid: 1,
      removed: 0,
      weblinks: 0,
      errors: 0,
    };
    expect(stats.valid).toBe(1);
  });

  it('should accept valid PluginConfig', () => {
    const config: PluginConfig = {
      maxConcurrentDownloads: 3,
      maxFileSize: 100 * 1024 * 1024,
      downloadTimeout: 30000,
      enabledAPIs: ['CrossRef'],
      rateLimits: {},
      cacheSettings: { ttl: 3600000, maxSize: 1000 },
      userAgent: 'Test',
    };
    expect(config.maxConcurrentDownloads).toBe(3);
  });

  it('should accept valid BatchResult', () => {
    const result: BatchResult<string> = {
      success: true,
      results: [{ success: true, result: 'test' }],
      errors: [],
      totalProcessed: 1,
      successCount: 1,
      errorCount: 0,
      successRate: 1,
    };
    expect(result.success).toBe(true);
    expect(result.successCount).toBe(1);
  });
});