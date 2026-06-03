import { describe, expect, it, vi } from "vitest";
import { ZoteroUtils } from "@/shared/utils/ZoteroUtils";

function createEditableItem(): Zotero.Item {
  return {
    id: 1,
    getField: vi.fn(() => ""),
    setField: vi.fn(),
    getCreators: vi.fn(() => []),
    setCreators: vi.fn(),
    saveTx: vi.fn(async () => {}),
    addAttachment: vi.fn(),
  } as unknown as Zotero.Item;
}

describe("ZoteroUtils", () => {
  it("reports non-Error validation failures without throwing", () => {
    const item = {
      id: 1,
      getField: vi.fn(() => {
        throw null;
      }),
      getCreators: vi.fn(() => []),
      isAttachment: vi.fn(() => false),
      isNote: vi.fn(() => false),
      itemTypeID: 1,
    } as unknown as Zotero.Item;

    const result = ZoteroUtils.validateItem(item);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Error validating item: null");
  });

  it("coerces metadata field values to strings before saving to Zotero", async () => {
    const item = createEditableItem();

    const result = await ZoteroUtils.updateItemMetadata(item, {
      volume: 42,
    });

    expect(result.updated).toBe(true);
    expect(item.setField).toHaveBeenCalledWith("volume", "42");
  });

  it("reports non-Error metadata save failures without throwing", async () => {
    const item = {
      ...createEditableItem(),
      saveTx: vi.fn(async () => {
        throw null;
      }),
    } as unknown as Zotero.Item;

    const result = await ZoteroUtils.updateItemMetadata(item, {
      volume: 42,
    });

    expect(result.errors).toContain("Failed to update metadata: null");
  });

  it("normalizes arXiv identifiers from Extra URLs before returning them", () => {
    const item = {
      getField: vi.fn((field: string) => {
        if (field === "extra") {
          return "Available at https://arxiv.org/pdf/1706.03762v2.pdf.";
        }
        return "";
      }),
    } as unknown as Zotero.Item;

    const identifiers = ZoteroUtils.extractIdentifiers(item);

    expect(identifiers.arxivId).toBe("1706.03762");
  });
});
