import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArxivProcessor } from "@/modules/ArxivProcessor";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

describe("ArxivProcessor legacy compatibility", () => {
  let processor: ArxivProcessor;
  let mockCrossRefAPI: {
    fetchWorksByArxivId: ReturnType<typeof vi.fn>;
    fetchWorksByQuery: ReturnType<typeof vi.fn>;
    getCrossRefWorkMessage: ReturnType<typeof vi.fn>;
  };
  let mockSemanticScholarAPI: {
    searchPapersWithExternalIds: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCrossRefAPI = {
      fetchWorksByArxivId: vi.fn().mockResolvedValue([]),
      fetchWorksByQuery: vi.fn().mockResolvedValue([]),
      getCrossRefWorkMessage: vi.fn().mockResolvedValue(null),
    };
    mockSemanticScholarAPI = {
      searchPapersWithExternalIds: vi.fn().mockResolvedValue([]),
    };

    processor = new ArxivProcessor(
      mockCrossRefAPI as never,
      mockSemanticScholarAPI as never,
    );

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      locale: "en-US",
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

  it("rejects a false-positive CrossRef arXiv match when the locale conflicts", async () => {
    mockCrossRefAPI.fetchWorksByArxivId.mockResolvedValue([
      {
        DOI: "10.4414/saez.2003.09782",
        title: [
          "Stiftung fur die berufliche Vorsorge der Leitenden Spitalarzte der Schweiz",
        ],
        type: "journal-article",
        language: "de",
        "container-title": ["Schweizerische Arztezeitung"],
      },
    ]);

    const item = createMockItem({
      title: "Coresets for Neural Topic Models",
      publicationTitle: "arXiv",
      url: "https://arxiv.org/abs/1605.09782",
      itemTypeID: 1,
    });

    await expect(processor.findPublishedVersion(item)).resolves.toBeNull();
  });

  it("accepts a CrossRef title match when the locale and title both align", async () => {
    mockCrossRefAPI.fetchWorksByQuery.mockResolvedValue([
      {
        DOI: "10.1000/published.doi",
        title: ["Attention Is All You Need"],
        type: "journal-article",
        language: "en",
        "container-title": ["NeurIPS"],
      },
    ]);

    const item = createMockItem({
      title: "Attention Is All You Need",
      publicationTitle: "arXiv",
      itemTypeID: 1,
      creators: [
        {
          firstName: "Ashish",
          lastName: "Vaswani",
          creatorType: "author",
        },
      ],
    });

    await expect(processor.findPublishedVersion(item)).resolves.toBe(
      "10.1000/published.doi",
    );
  });

  it("rejects locale-conflicting CrossRef metadata during update", async () => {
    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue({
      DOI: "10.4414/saez.2003.09782",
      title: [
        "Stiftung fur die berufliche Vorsorge der Leitenden Spitalarzte der Schweiz",
      ],
      type: "journal-article",
      language: "de",
      "container-title": ["Schweizerische Arztezeitung"],
    });

    const item = createMockItem({
      title: "Coresets for Neural Topic Models",
      publicationTitle: "arXiv",
      itemTypeID: 1,
    });

    await expect(
      processor.updateItemAsPublishedVersion(item, "10.4414/saez.2003.09782"),
    ).resolves.toBe(false);

    expect(item.setField).not.toHaveBeenCalledWith("DOI", expect.anything());
    expect(item.setField).not.toHaveBeenCalledWith("title", expect.anything());
  });

  it("prefers CrossRef original-title over translated title after acceptance", async () => {
    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue({
      DOI: "10.1000/published.doi",
      title: ["Aufmerksamkeit ist alles, was man braucht"],
      "original-title": ["Attention Is All You Need"],
      type: "journal-article",
      language: "en",
      "container-title": ["NeurIPS"],
      published: {
        "date-parts": [[2017]],
      },
      author: [
        {
          given: "Ashish",
          family: "Vaswani",
        },
      ],
    });

    const item = createMockItem({
      title: "Attention is all you need (preprint)",
      publicationTitle: "arXiv",
      itemTypeID: 1,
    });

    await expect(
      processor.updateItemAsPublishedVersion(item, "10.1000/published.doi"),
    ).resolves.toBe(true);

    expect(item.setField).toHaveBeenCalledWith(
      "title",
      "Attention Is All You Need",
    );
  });
});
