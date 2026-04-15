import type { AttachmentType, AttachmentValidationResult } from "./types";

export class AttachmentValidator {
  private readonly LINK_MODE_LINKED_URL = 2;
  private readonly LINK_MODE_IMPORTED_FILE = 0;
  private readonly LINK_MODE_LINKED_FILE = 1;

  validate(attachment: Zotero.Item): AttachmentValidationResult {
    const linkMode = (attachment as any).attachmentLinkMode;
    const attachmentId = attachment.id;

    if (linkMode === this.LINK_MODE_LINKED_URL) {
      return { type: "weblink", attachmentId };
    }

    if (
      linkMode === this.LINK_MODE_IMPORTED_FILE ||
      linkMode === this.LINK_MODE_LINKED_FILE
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
      const filePath = (attachment as any).getFilePath?.();
      if (!filePath) {
        return {
          type: "invalid",
          reason: "No file path",
          attachmentId,
        };
      }

      const file = (attachment as any).getFile?.();
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
