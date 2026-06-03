import { describe, it, expect, vi } from "vitest";
import { AttachmentValidator } from "@/features/attachment/AttachmentValidator";

function createAttachment(overrides: Partial<Zotero.Item>): Zotero.Item {
  return {
    id: 1,
    attachmentLinkMode: 0,
    getFilePath: vi.fn(() => false),
    getFile: vi.fn(() => null),
    ...overrides,
  } as Zotero.Item;
}

describe("AttachmentValidator", () => {
  it("uses Zotero attachment link-mode constants when classifying web links", () => {
    const validator = new AttachmentValidator();

    const mockAttachment = createAttachment({
      id: 4,
      attachmentLinkMode: Zotero.Attachments.LINK_MODE_LINKED_URL,
    });

    const result = validator.validate(mockAttachment);
    expect(result.type).toBe("weblink");
  });

  it("should identify web links", () => {
    const validator = new AttachmentValidator();

    const mockAttachment = createAttachment({
      id: 1,
      attachmentLinkMode: Zotero.Attachments.LINK_MODE_LINKED_URL,
    });

    const result = validator.validate(mockAttachment);
    expect(result.type).toBe("weblink");
  });

  it("should identify valid file attachments", () => {
    const validator = new AttachmentValidator();

    const mockAttachment = createAttachment({
      id: 2,
      attachmentLinkMode: Zotero.Attachments.LINK_MODE_IMPORTED_FILE,
      getFilePath: vi.fn(() => "/path/to/file.pdf"),
      getFile: vi.fn(() => ({ exists: () => true })),
    });

    const result = validator.validate(mockAttachment);
    expect(result.type).toBe("valid");
  });

  it("should identify invalid file attachments", () => {
    const validator = new AttachmentValidator();

    const mockAttachment = createAttachment({
      id: 3,
      attachmentLinkMode: Zotero.Attachments.LINK_MODE_IMPORTED_FILE,
      getFilePath: vi.fn(() => "/path/to/missing.pdf"),
      getFile: vi.fn(() => ({ exists: () => false })),
    });

    const result = validator.validate(mockAttachment);
    expect(result.type).toBe("invalid");
  });
});
