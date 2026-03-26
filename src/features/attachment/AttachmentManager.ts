import { AppError, ErrorType } from '@/shared/core';

export class AttachmentManager {
  /**
   * Remove invalid attachment permanently
   */
  async removeInvalid(attachment: Zotero.Item): Promise<void> {
    try {
      await (attachment as any).eraseTx();
    } catch (error) {
      throw AppError.fromUnknown(error, ErrorType.FILE_ERROR, {
        operation: 'removeInvalid',
        attachmentId: attachment.id,
      });
    }
  }

  /**
   * Move attachment to trash (safer than permanent delete)
   */
  async moveToTrash(attachment: Zotero.Item): Promise<void> {
    try {
      attachment.setField('deleted', true);
      await attachment.save();
    } catch (error) {
      throw AppError.fromUnknown(error, ErrorType.ZOTERO_ERROR, {
        operation: 'moveToTrash',
        attachmentId: attachment.id,
      });
    }
  }

  /**
   * Get attachments for an item
   */
  async getAttachments(item: Zotero.Item): Promise<Zotero.Item[]> {
    const attachmentIds = item.getAttachments();
    const attachments: Zotero.Item[] = [];

    for (const id of attachmentIds) {
      const attachment = Zotero.Items.get(id);
      if (attachment) {
        attachments.push(attachment);
      }
    }

    return attachments;
  }
}