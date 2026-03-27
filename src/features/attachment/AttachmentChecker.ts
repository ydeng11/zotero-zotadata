import { AttachmentValidator } from './AttachmentValidator';
import { AttachmentManager } from './AttachmentManager';
import type { AttachmentStats } from '@/shared/core/types';

export class AttachmentChecker {
  private validator: AttachmentValidator;
  private manager: AttachmentManager;

  constructor() {
    this.validator = new AttachmentValidator();
    this.manager = new AttachmentManager();
  }

  async checkItemAttachments(item: Zotero.Item): Promise<AttachmentStats> {
    const stats: AttachmentStats = {
      valid: 0,
      removed: 0,
      weblinks: 0,
      errors: 0,
    };

    const attachments = await this.manager.getAttachments(item);
    const results = await Promise.allSettled(
      attachments.map(att => this.processAttachment(att))
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        stats[result.value]++;
      } else {
        stats.errors++;
      }
    });

    return stats;
  }

  private async processAttachment(
    attachment: Zotero.Item
  ): Promise<'valid' | 'removed' | 'weblinks' | 'errors'> {
    const result = this.validator.validate(attachment);

    switch (result.type) {
      case 'valid':
        return 'valid';
      case 'weblink':
        return 'weblinks';
      case 'invalid':
        await this.manager.moveToTrash(attachment);
        return 'removed';
      case 'error':
        return 'errors';
    }
  }

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
}