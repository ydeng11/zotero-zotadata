import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("getSelectedCollections", () => {
    let paneSpy: ReturnType<typeof vi.spyOn> | undefined;

    afterEach(() => {
      paneSpy?.mockRestore();
      paneSpy = undefined;
    });

    it("uses Zotero 10 getSelectedCollections when available", () => {
      const collections = [
        { id: 1, name: "Papers" },
        { id: 2, name: "Books" },
      ] as unknown as Zotero.Collection[];
      const getSelectedCollection = vi.fn(() => {
        throw new Error("Use getSelectedCollections()");
      });

      paneSpy = vi.spyOn(Zotero, "getActiveZoteroPane").mockReturnValue({
        getSelectedItems: () => [],
        getSelectedCollections: () => collections,
        getSelectedCollection,
      });

      expect(ZoteroUtils.getSelectedCollections()).toEqual(collections);
      expect(getSelectedCollection).not.toHaveBeenCalled();
    });

    it("falls back to getSelectedCollection on Zotero 8/9", () => {
      const collection = {
        id: 3,
        name: "Drafts",
      } as unknown as Zotero.Collection;

      paneSpy = vi.spyOn(Zotero, "getActiveZoteroPane").mockReturnValue({
        getSelectedItems: () => [],
        getSelectedCollection: () => collection,
      });

      expect(ZoteroUtils.getSelectedCollections()).toEqual([collection]);
    });

    it("returns an empty array when no collection is selected", () => {
      paneSpy = vi.spyOn(Zotero, "getActiveZoteroPane").mockReturnValue({
        getSelectedItems: () => [],
        getSelectedCollections: () => [],
      });

      expect(ZoteroUtils.getSelectedCollections()).toEqual([]);
    });

    it("returns an empty array when no Zotero pane is active", () => {
      paneSpy = vi.spyOn(Zotero, "getActiveZoteroPane").mockReturnValue(null);

      expect(ZoteroUtils.getSelectedCollections()).toEqual([]);
    });
  });
});
