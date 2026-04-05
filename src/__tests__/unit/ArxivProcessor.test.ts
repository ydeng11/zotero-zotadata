import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArxivProcessor } from "@/modules/ArxivProcessor";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

describe("ArxivProcessor legacy compatibility", () => {
  let processor: ArxivProcessor;

  beforeEach(() => {
    processor = new ArxivProcessor({} as never, {} as never);

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      ItemTypes: {
        getName: vi.fn((typeID: number) => {
          if (typeID === 1) return "journalArticle";
          if (typeID === 3) return "conferencePaper";
          if (typeID === 4) return "preprint";
          return "journalArticle";
        }),
        getID: vi.fn((name: string) => {
          if (name === "journalArticle") return 1;
          if (name === "conferencePaper") return 3;
          if (name === "preprint") return 4;
          return 1;
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads the published version when a published DOI is found and no PDF exists", async () => {
    const item = createMockItem({
      title: "Test arXiv Paper",
      publicationTitle: "arXiv",
      itemTypeID: 1,
    });

    vi.spyOn(ArxivProcessor, "isArxivItem").mockReturnValue(true);
    vi.spyOn(processor, "findPublishedVersion").mockResolvedValue(
      "10.1000/published.doi",
    );
    vi.spyOn(processor, "updateItemAsPublishedVersion").mockResolvedValue(true);
    vi.spyOn(processor as any, "itemHasPDF").mockResolvedValue(false);
    const downloadSpy = vi
      .spyOn(processor as any, "downloadPublishedVersion")
      .mockResolvedValue(undefined);

    const result = await processor.processArxivItem(item);

    expect(result).toEqual(
      expect.objectContaining({
        processed: true,
        foundPublished: true,
        converted: false,
      }),
    );
    expect(downloadSpy).toHaveBeenCalledWith(item, "10.1000/published.doi");
    expect(item.addTag).toHaveBeenCalledWith("Updated to Published Version", 1);
  });
});
