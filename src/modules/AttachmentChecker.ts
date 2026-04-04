import { ErrorManager, ErrorType } from '@/shared/core';
import type { AttachmentStats } from '@/shared/core/types';

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
  ): Promise<'valid' | 'removed' | 'weblinks' | 'errors'> {
    try {
      if (this.isWebLink(attachment)) {
        return 'weblinks';
      }

      const isValid = await this.validateFileAttachment(attachment);

      if (isValid) {
        return 'valid';
      }
      await this.removeInvalidAttachment(attachment);
      return 'removed';
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      if (typeof Zotero !== 'undefined' && Zotero.log) {
        Zotero.log(
          `Zotadata: processAttachment failed (attachment ${attachment.id}): ${detail}`,
          2,
        );
      }
      return 'errors';
    }
  }

  /**
   * Linked URL attachments (not stored files)
   */
  private isWebLink(attachment: Zotero.Item): boolean {
    try {
      return (
        attachment.isAttachment?.() === true &&
        attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL
      );
    } catch {
      return false;
    }
  }

  /**
   * Whether the attachment file exists on disk (uses Zotero APIs, not getField('path')).
   */
  private async validateFileAttachment(attachment: Zotero.Item): Promise<boolean> {
    try {
      if (attachment.isAttachment?.() !== true) {
        return false;
      }
      if (attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
        return true;
      }
      return await attachment.fileExists();
    } catch {
      return false;
    }
  }

  /**
   * Move a broken/unusable file attachment to trash (skipped if not editable).
   */
  private async removeInvalidAttachment(attachment: Zotero.Item): Promise<void> {
    if (typeof attachment.isEditable === 'function' && !attachment.isEditable('edit')) {
      throw new Error('Cannot move attachment to trash: item or library is read-only');
    }
    await Zotero.Items.trash(attachment.id);
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