// tests/unit/zotadata/batch-processing.test.ts
// Tests for batch processing functions in zotadata.js

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createZotadataMethod,
  clearCache,
} from "../../helpers/extract-function";
import {
  createMockItem,
  createMockAttachment,
  resetMockCounters,
} from "../../__mocks__/zotero-items";

describe("processBatch", () => {
  let processBatch: any;

  beforeEach(() => {
    clearCache();
    resetMockCounters();

    // Mock Zotero global for progress window
    (globalThis as any).Zotero = {
      getMainWindow: vi.fn().mockReturnValue({
        Zotero: {
          ProgressWindow: vi.fn().mockImplementation(() => ({
            changeHeadline: vi.fn(),
            show: vi.fn(),
            close: vi.fn(),
            _progressIndicators: [
              {
                setProgress: vi.fn(),
                setText: vi.fn(),
              },
            ],
          })),
        },
      }),
    };

    processBatch = createZotadataMethod("processBatch", {
      log: vi.fn(),
      createProgressWindow: vi.fn().mockReturnValue(null),
      updateProgressWindow: vi.fn(),
      closeProgressWindow: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should process items in batches", async () => {
    const items = Array(10)
      .fill(null)
      .map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi.fn().mockResolvedValue({ success: true });

    const result = await processBatch(items, processFn, { batchSize: 3 });

    expect(result.totalProcessed).toBe(10);
    expect(result.success).toBe(true);
  });

  it("should handle errors in processing", async () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];
    const processFn = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("Failed"));

    const result = await processBatch(items, processFn, { batchSize: 1 });

    expect(result.errorCount).toBe(1);
  });

  it("should call progress callback", async () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];
    const onProgress = vi.fn();
    const processFn = vi.fn().mockResolvedValue({ success: true });

    await processBatch(items, processFn, {
      batchSize: 1,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalled();
  });

  it("should respect batch size setting", async () => {
    const items = Array(6)
      .fill(null)
      .map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi.fn().mockResolvedValue({ success: true });

    await processBatch(items, processFn, { batchSize: 2 });

    // Verify processFn was called for all items
    expect(processFn).toHaveBeenCalledTimes(6);
  });

  it("should add delay between batches", async () => {
    const items = Array(4)
      .fill(null)
      .map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi.fn().mockResolvedValue({ success: true });
    const delayBetweenBatches = 50;

    const start = Date.now();
    await processBatch(items, processFn, { batchSize: 2, delayBetweenBatches });
    const duration = Date.now() - start;

    // Should have at least one delay between batches
    expect(duration).toBeGreaterThanOrEqual(delayBetweenBatches - 10); // Allow small margin
  });

  it("should return correct result structure", async () => {
    const items = [createMockItem({ id: 1 })];
    const processFn = vi.fn().mockResolvedValue({ data: "test" });

    const result = await processBatch(items, processFn, { batchSize: 1 });

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("totalProcessed");
    expect(result).toHaveProperty("errorCount");
    expect(result).toHaveProperty("results");
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("should collect errors without stopping batch", async () => {
    const items = Array(3)
      .fill(null)
      .map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("Failed"))
      .mockResolvedValueOnce({ success: true });

    const result = await processBatch(items, processFn, { batchSize: 1 });

    expect(result.success).toBe(true);
    expect(result.errorCount).toBe(1);
    expect(result.totalProcessed).toBe(3);
  });

  it("should call onBatchComplete callback after each batch", async () => {
    const items = Array(4)
      .fill(null)
      .map((_, i) => createMockItem({ id: i + 1 }));
    const onBatchComplete = vi.fn();
    const processFn = vi.fn().mockResolvedValue({ success: true });

    await processBatch(items, processFn, { batchSize: 2, onBatchComplete });

    // Should be called twice (2 batches)
    expect(onBatchComplete).toHaveBeenCalledTimes(2);
  });

  it("should indicate last batch in onBatchComplete callback", async () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];
    const onBatchComplete = vi.fn();
    const processFn = vi.fn().mockResolvedValue({ success: true });

    await processBatch(items, processFn, { batchSize: 2, onBatchComplete });

    // Last argument should be true (isLastBatch)
    expect(onBatchComplete).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      true,
    );
  });

  it("should process items concurrently within a batch", async () => {
    const items = Array(3)
      .fill(null)
      .map((_, i) => createMockItem({ id: i + 1 }));
    const processingOrder: number[] = [];
    const processFn = vi.fn().mockImplementation(async (item: any) => {
      processingOrder.push(item.id);
      // Small delay to simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { success: true };
    });

    await processBatch(items, processFn, { batchSize: 3 });

    // All items should have been processed
    expect(processFn).toHaveBeenCalledTimes(3);
    expect(processingOrder.length).toBe(3);
  });

  it("should calculate success rate correctly", async () => {
    const items = Array(4)
      .fill(null)
      .map((_, i) => createMockItem({ id: i + 1 }));
    const processFn = vi
      .fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("Failed"))
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });

    const result = await processBatch(items, processFn, { batchSize: 2 });

    expect(result.successCount).toBe(3);
    expect(result.errorCount).toBe(1);
    expect(result.successRate).toBe(75); // 3 out of 4
  });

  it("should pass item index to processFn", async () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];
    const processFn = vi.fn().mockResolvedValue({ success: true });

    await processBatch(items, processFn, { batchSize: 2 });

    // processFn should be called with (item, index)
    expect(processFn).toHaveBeenCalledWith(items[0], 0);
    expect(processFn).toHaveBeenCalledWith(items[1], 1);
  });
});

describe("simpleAttachmentCheckBatch", () => {
  let simpleAttachmentCheckBatch: any;

  beforeEach(() => {
    clearCache();
    resetMockCounters();

    // Mock Zotero global with attachment link modes
    (globalThis as any).Zotero = {
      Attachments: {
        LINK_MODE_LINKED_URL: 1,
        LINK_MODE_IMPORTED_FILE: 2,
        LINK_MODE_LINKED_FILE: 3,
      },
      Items: {
        get: vi.fn(),
      },
    };

    simpleAttachmentCheckBatch = createZotadataMethod(
      "simpleAttachmentCheckBatch",
      {
        log: vi.fn(),
      },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return stats for item with no attachments", async () => {
    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([]);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.valid).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.weblinks).toBe(0);
    expect(result.processed).toBe(1);
  });

  it("should remove broken file attachments", async () => {
    const brokenAttachment = createMockAttachment({
      id: 1,
      linkMode: 2, // IMPORTED_FILE
      fileExists: false,
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockReturnValue(brokenAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.removed).toBe(1);
    expect(brokenAttachment.eraseTx).toHaveBeenCalled();
  });

  it("should keep weblink attachments", async () => {
    const weblinkAttachment = createMockAttachment({
      id: 1,
      linkMode: 1, // LINKED_URL
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockReturnValue(weblinkAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.weblinks).toBe(1);
    expect(result.valid).toBe(1);
    expect(weblinkAttachment.eraseTx).not.toHaveBeenCalled();
  });

  it("should count valid file attachments", async () => {
    const validAttachment = createMockAttachment({
      id: 1,
      linkMode: 2, // IMPORTED_FILE
      fileExists: true,
      filePath: "/path/to/file.pdf",
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockReturnValue(validAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.valid).toBe(1);
    expect(result.removed).toBe(0);
  });

  it("should handle errors gracefully", async () => {
    const item = createMockItem();
    item.getAttachments = vi.fn().mockImplementation(() => {
      throw new Error("Test error");
    });

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.errors).toBe(1);
    expect(result.processed).toBe(1);
  });

  it("should handle missing attachment object", async () => {
    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([999]);
    (globalThis as any).Zotero.Items.get = vi.fn().mockReturnValue(null);

    const result = await simpleAttachmentCheckBatch(item);

    // Should skip the missing attachment without error
    expect(result.valid).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("should handle attachment with no file path", async () => {
    const noPathAttachment = createMockAttachment({
      id: 1,
      linkMode: 2, // IMPORTED_FILE
      filePath: null,
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockReturnValue(noPathAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.removed).toBe(1);
    expect(noPathAttachment.eraseTx).toHaveBeenCalled();
  });

  it("should handle linked file attachments", async () => {
    const linkedAttachment = createMockAttachment({
      id: 1,
      linkMode: 3, // LINKED_FILE
      fileExists: true,
      filePath: "/path/to/linked/file.pdf",
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockReturnValue(linkedAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.valid).toBe(1);
    expect(result.removed).toBe(0);
  });

  it("should process multiple attachments", async () => {
    const validAttachment = createMockAttachment({
      id: 1,
      linkMode: 2,
      fileExists: true,
      filePath: "/path/to/file.pdf",
    });
    const brokenAttachment = createMockAttachment({
      id: 2,
      linkMode: 2,
      fileExists: false,
    });
    const weblinkAttachment = createMockAttachment({
      id: 3,
      linkMode: 1, // LINKED_URL
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1, 2, 3]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockImplementation((id: number) => {
        if (id === 1) return validAttachment;
        if (id === 2) return brokenAttachment;
        if (id === 3) return weblinkAttachment;
        return null;
      });

    const result = await simpleAttachmentCheckBatch(item);

    expect(result.valid).toBe(2); // valid file + weblink
    expect(result.removed).toBe(1); // broken file
    expect(result.weblinks).toBe(1);
  });

  it("should handle unknown attachment link mode", async () => {
    const unknownAttachment = createMockAttachment({
      id: 1,
      linkMode: 99, // Unknown mode
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockReturnValue(unknownAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    // Unknown attachment types are kept
    expect(result.valid).toBe(1);
    expect(result.removed).toBe(0);
  });

  it("should handle file check errors", async () => {
    const errorAttachment = createMockAttachment({
      id: 1,
      linkMode: 2,
      filePath: "/path/to/file.pdf",
      fileExists: true,
    });
    // Override getFilePath to throw
    errorAttachment.getFilePath = vi.fn().mockImplementation(() => {
      throw new Error("File access error");
    });

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockReturnValue(errorAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    // Error accessing file should result in removal
    expect(result.removed).toBe(1);
  });

  it("should handle erase errors gracefully", async () => {
    const brokenAttachment = createMockAttachment({
      id: 1,
      linkMode: 2,
      fileExists: false,
    });
    // Make eraseTx throw
    brokenAttachment.eraseTx = vi
      .fn()
      .mockRejectedValue(new Error("Erase failed"));

    const item = createMockItem();
    item.getAttachments = vi.fn().mockReturnValue([1]);
    (globalThis as any).Zotero.Items.get = vi
      .fn()
      .mockReturnValue(brokenAttachment);

    const result = await simpleAttachmentCheckBatch(item);

    // When erase fails, removed is not incremented (error is caught and logged)
    expect(result.removed).toBe(0);
    // But eraseTx should have been attempted
    expect(brokenAttachment.eraseTx).toHaveBeenCalled();
  });
});
