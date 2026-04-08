export type AttachmentType = "valid" | "invalid" | "weblink" | "error";

export interface AttachmentValidationResult {
  type: AttachmentType;
  reason?: string;
  attachmentId: number;
}
