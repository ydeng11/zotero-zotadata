import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttachmentChecker } from "@/features/attachment/AttachmentChecker";

describe("AttachmentChecker", () => {
  let checker: AttachmentChecker;

  beforeEach(() => {
    checker = new AttachmentChecker();
  });

  it("should check single item attachments", async () => {
    const mockAttachments = new Map<number, any>();
    mockAttachments.set(10, {
      id: 10,
      attachmentLinkMode: 0,
      getFilePath: () => "/path/to/file.pdf",
      getFile: () => ({ exists: () => true }),
    });

    mockAttachments.set(11, {
      id: 11,
      attachmentLinkMode: 2, // weblink
      getFilePath: () => null,
      getFile: () => null,
    });

    const mockItem = {
      id: 1,
      getAttachments: () => [10, 11],
    };

    // Mock Zotero.Items.get globally for AttachmentManager
    vi.stubGlobal("Zotero", {
      Items: {
        get: vi.fn((id: number) => mockAttachments.get(id)),
        trash: vi.fn().mockResolvedValue(undefined),
      },
    });

    const stats = await checker.checkItemAttachments(mockItem as any);

    expect(stats.valid).toBe(1);
    expect(stats.weblinks).toBe(1);
    expect(stats.removed).toBe(0);
    expect(stats.errors).toBe(0);

    vi.unstubAllGlobals();
  });

  it("should handle invalid attachments by moving to trash", async () => {
    const mockAttachments = new Map<number, any>();
    mockAttachments.set(20, {
      id: 20,
      attachmentLinkMode: 0,
      getFilePath: () => "/path/to/missing.pdf",
      getFile: () => ({ exists: () => false }),
    });

    const mockItem = {
      id: 2,
      getAttachments: () => [20],
    };

    const trash = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Zotero", {
      Items: {
        get: vi.fn((id: number) => mockAttachments.get(id)),
        trash,
      },
    });

    const stats = await checker.checkItemAttachments(mockItem as any);

    expect(stats.valid).toBe(0);
    expect(stats.removed).toBe(1);
    expect(trash).toHaveBeenCalledWith(20);

    vi.unstubAllGlobals();
  });

  it("should generate results message", () => {
    const message = checker.generateResultsMessage({
      valid: 5,
      removed: 2,
      weblinks: 1,
      errors: 0,
    });

    expect(message).toContain("5 valid");
    expect(message).toContain("2 invalid");
    expect(message).toContain("1 web link");
  });

  it("should generate message for multiple items", () => {
    const message = checker.generateResultsMessage(
      {
        valid: 10,
        removed: 3,
        weblinks: 2,
        errors: 0,
      },
      5,
    );

    expect(message).toContain("Checked 5 items");
    expect(message).toContain("10 valid");
    expect(message).toContain("3 invalid");
  });

  it("should handle item with no attachments", async () => {
    const mockItem = {
      id: 3,
      getAttachments: () => [],
    };

    vi.stubGlobal("Zotero", {
      Items: {
        get: vi.fn(),
      },
    });

    const stats = await checker.checkItemAttachments(mockItem as any);

    expect(stats.valid).toBe(0);
    expect(stats.removed).toBe(0);
    expect(stats.weblinks).toBe(0);
    expect(stats.errors).toBe(0);

    vi.unstubAllGlobals();
  });
});
