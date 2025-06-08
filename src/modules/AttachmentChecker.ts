import { ErrorManager, ErrorType } from '@/core';
import type { AttachmentStats } from '@/core/types';

/**
 * Modular attachment checker with proper error handling and type safety
 */
export class AttachmentChecker {
  private errorManager: ErrorManager;

  constructor() {
    this.errorManager = new ErrorManager();
  }

  /**
   * Check attachments for a single item
   */
  async checkItemAttachments(item: Zotero.Item): Promise<AttachmentStats> {
    return this.errorManager.wrapAsync(
      async () => {
        const attachments = await this.getItemAttachments(item);
        return this.processAttachments(attachments);
      },
      ErrorType.ZOTERO_ERROR,
      {
        operation: 'checkItemAttachments',
        itemId: item.id,
        itemTitle: item.getField('title'),
      }
    );
  }

  /**
   * Check attachments for multiple items
   */
  async checkMultipleItems(items: Zotero.Item[]): Promise<{
    totalStats: AttachmentStats;
    itemResults: Array<{
      item: Zotero.Item;
      stats: AttachmentStats;
      error?: string;
    }>;
  }> {
    const itemResults: Array<{
      item: Zotero.Item;
      stats: AttachmentStats;
      error?: string;
    }> = [];

    const totalStats: AttachmentStats = {
      valid: 0,
      removed: 0,
      weblinks: 0,
      errors: 0,
    };

    // Process items in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchPromises = batch.map(async (item) => {
        try {
          const stats = await this.checkItemAttachments(item);
          return { item, stats };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            item,
            stats: { valid: 0, removed: 0, weblinks: 0, errors: 1 },
            error: errorMessage,
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const itemResult = result.value;
          itemResults.push(itemResult);
          
          // Aggregate stats
          totalStats.valid += itemResult.stats.valid;
          totalStats.removed += itemResult.stats.removed;
          totalStats.weblinks += itemResult.stats.weblinks;
          totalStats.errors += itemResult.stats.errors;
        } else {
          // Handle rejected promises
          totalStats.errors++;
        }
      });
    }

    return { totalStats, itemResults };
  }

  /**
   * Get attachments for an item with validation
   */
  private async getItemAttachments(item: Zotero.Item): Promise<Zotero.Item[]> {
    if (!item || typeof item.getAttachments !== 'function') {
      throw this.errorManager.createError(
        ErrorType.VALIDATION_ERROR,
        'Invalid item provided',
        { itemId: item?.id }
      );
    }

    const attachmentIds = item.getAttachments();
    const attachments: Zotero.Item[] = [];

    for (const attachmentId of attachmentIds) {
      const attachment = Zotero.Items.get(attachmentId);
      if (attachment) {
        attachments.push(attachment);
      }
    }

    return attachments;
  }

  /**
   * Process attachments and return statistics
   */
  private async processAttachments(attachments: Zotero.Item[]): Promise<AttachmentStats> {
    const stats: AttachmentStats = {
      valid: 0,
      removed: 0,
      weblinks: 0,
      errors: 0,
    };

    const results = await Promise.allSettled(
      attachments.map(attachment => this.processAttachment(attachment))
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const status = result.value;
        stats[status]++;
      } else {
        stats.errors++;
      }
    });

    return stats;
  }

  /**
   * Process a single attachment
   */
  private async processAttachment(
    attachment: Zotero.Item
  ): Promise<'valid' | 'removed' | 'weblinks' | 'error'> {
    try {
      // Check if it's a web link
      if (this.isWebLink(attachment)) {
        return 'weblinks';
      }

      // Validate file attachment
      const isValid = await this.validateFileAttachment(attachment);
      
      if (isValid) {
        return 'valid';
      } else {
        // Remove invalid attachment
        await this.removeInvalidAttachment(attachment);
        return 'removed';
      }
    } catch (error) {
      this.errorManager.handleError(
        this.errorManager.createFromUnknown(
          error,
          ErrorType.FILE_ERROR,
          {
            operation: 'processAttachment',
            attachmentId: attachment.id,
          }
        )
      );
      return 'error';
    }
  }

  /**
   * Check if attachment is a web link
   */
  private isWebLink(attachment: Zotero.Item): boolean {
    try {
      const linkMode = attachment.getField('linkMode');
      return linkMode === 'linked_url';
    } catch {
      return false;
    }
  }

  /**
   * Validate file attachment exists and is accessible
   */
  private async validateFileAttachment(attachment: Zotero.Item): Promise<boolean> {
    try {
      const path = attachment.getField('path');
      if (!path) {
        return false;
      }

      // Check if file exists
      // Note: This would need to be implemented with proper Zotero file API
      // For now, we'll use a simplified check
      return this.fileExists(path);
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists (simplified implementation)
   */
  private fileExists(path: string): boolean {
    try {
      // This would need proper implementation using Zotero's file system API
      // For now, return true if path is not empty
      return path.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Remove invalid attachment
   */
  private async removeInvalidAttachment(attachment: Zotero.Item): Promise<void> {
    try {
      // Move to trash instead of permanent deletion
      attachment.setField('deleted', true);
      await attachment.save();
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        {
          operation: 'removeInvalidAttachment',
          attachmentId: attachment.id,
        }
      );
    }
  }

  /**
   * Generate user-friendly results message
   */
  generateResultsMessage(stats: AttachmentStats, itemCount: number = 1): string {
    const messages: string[] = [];

    if (itemCount > 1) {
      messages.push(`Checked ${itemCount} items:`);
    }

    if (stats.valid > 0) {
      messages.push(`✓ ${stats.valid} valid attachment${stats.valid !== 1 ? 's' : ''}`);
    }

    if (stats.removed > 0) {
      messages.push(`🗑️ ${stats.removed} invalid attachment${stats.removed !== 1 ? 's' : ''} removed`);
    }

    if (stats.weblinks > 0) {
      messages.push(`🔗 ${stats.weblinks} web link${stats.weblinks !== 1 ? 's' : ''} found`);
    }

    if (stats.errors > 0) {
      messages.push(`⚠️ ${stats.errors} error${stats.errors !== 1 ? 's' : ''} occurred`);
    }

    if (messages.length === 0 || (itemCount > 1 && messages.length === 1)) {
      messages.push('No attachments found');
    }

    return messages.join('\n');
  }

  /**
   * Get detailed statistics for reporting
   */
  getDetailedStats(stats: AttachmentStats): {
    total: number;
    validPercentage: number;
    issuesFound: number;
    summary: string;
  } {
    const total = stats.valid + stats.removed + stats.weblinks + stats.errors;
    const validPercentage = total > 0 ? (stats.valid / total) * 100 : 0;
    const issuesFound = stats.removed + stats.errors;

    let summary = 'Good';
    if (validPercentage < 50) {
      summary = 'Poor';
    } else if (validPercentage < 80) {
      summary = 'Fair';
    }

    return {
      total,
      validPercentage: Math.round(validPercentage),
      issuesFound,
      summary,
    };
  }
} 