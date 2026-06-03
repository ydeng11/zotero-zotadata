import type { AttachmentValidationResult } from "./types";

export class AttachmentValidator {
  validate(attachment: Zotero.Item): AttachmentValidationResult {
    const linkMode = attachment.attachmentLinkMode;
    const attachmentId = attachment.id;

    if (linkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
      return { type: "weblink", attachmentId };
    }

    if (
      linkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
      linkMode === Zotero.Attachments.LINK_MODE_LINKED_FILE
    ) {
      return this.validateFileAttachment(attachment);
    }

    return { type: "valid", attachmentId };
  }

  private validateFileAttachment(
    attachment: Zotero.Item,
  ): AttachmentValidationResult {
    const attachmentId = attachment.id;

    try {
      const filePath = attachment.getFilePath();
      if (!filePath) {
        return {
          type: "invalid",
          reason: "No file path",
          attachmentId,
        };
      }

      const file = attachment.getFile();
      if (file && file.exists()) {
        return { type: "valid", attachmentId };
      }

      return {
        type: "invalid",
        reason: "File does not exist",
        attachmentId,
      };
    } catch (error) {
      return {
        type: "error",
        reason: error instanceof Error ? error.message : "Unknown error",
        attachmentId,
      };
    }
  }
}
