import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

describe("Title-only Semi-Supervised Learning Paper - Existing Test Pattern", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher({
      config: {
        downloads: { maxConcurrent: 3 },
      },
    } as never);

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      log: vi.fn(),
      Utilities: {
        ...globalThis.Zotero.Utilities,
        cleanDOI: (doi: string) =>
          doi
            .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
            .replace(/^doi:\s*/i, "")
            .trim(),
        cleanISBN: (isbn: string) => isbn.replace(/[-\s]/g, ""),
      },
      ItemTypes: {
        getName: vi.fn((typeID: number) => {
          if (typeID === 1) return "journalArticle";
          if (typeID === 2) return "book";
          if (typeID === 3) return "conferencePaper";
          if (typeID === 4) return "preprint";
          return "journalArticle";
        }),
        getID: vi.fn((name: string) => {
          if (name === "journalArticle") return 1;
          if (name === "book") return 2;
          if (name === "conferencePaper") return 3;
          if (name === "preprint") return 4;
          return 1;
        }),
      },
      CreatorTypes: {
        getPrimaryIDForType: vi.fn(() => 1),
      },
      Date: {
        strToDate: (value: string) => ({
          year: value.match(/\d{4}/)?.[0],
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // This test mimics the existing successful test pattern
  it("fetches correct metadata when starting with title only and discovers arXiv DOI", async () => {
    const item = createMockItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      // No DOI field initially
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma" },
        { firstName: "Shakir", lastName: "Mohamed" },
      ],
    });

    vi.spyOn(fetcher as any, "extractDOI").mockReturnValue(null);
    vi.spyOn(fetcher as any, "fetchDOIMetadataViaTranslator").mockResolvedValue(
      false,
    );
    vi.spyOn(fetcher as any, "discoverDOI").mockResolvedValue(
      "10.48550/arxiv.1406.5298",
    );
    vi.spyOn(fetcher as any, "fetchCrossRefMetadata").mockResolvedValue({
      DOI: "10.48550/arxiv.1406.5298",
      title: ["Semi-Supervised Learning with Deep Generative Models"],
      author: [
        { given: "Diederik P.", family: "Kingma" },
        { given: "Danilo J.", family: "Rezende" },
        { given: "Shakir", family: "Mohamed" },
        { given: "Max", family: "Welling" },
      ],
      URL: "https://arxiv.org/abs/1406.5298",
      "container-title": ["arXiv"],
      published: { "date-parts": [[2014, 6]] },
    });
    const updateSpy = vi
      .spyOn(fetcher as any, "updateItemWithMetadata")
      .mockResolvedValue([
        "Updated title: Semi-Supervised Learning with Deep Generative Models",
        "Updated publication title: arXiv",
        "Updated URL: https://arxiv.org/abs/1406.5298",
        "Updated DOI: 10.48550/arxiv.1406.5298",
      ]);

    const result = await (fetcher as any).fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(item, {
      DOI: "10.48550/arxiv.1406.5298",
      title: ["Semi-Supervised Learning with Deep Generative Models"],
      author: [
        { given: "Diederik P.", family: "Kingma" },
        { given: "Danilo J.", family: "Rezende" },
        { given: "Shakir", family: "Mohamed" },
        { given: "Max", family: "Welling" },
      ],
      URL: "https://arxiv.org/abs/1406.5298",
      "container-title": ["arXiv"],
      published: { "date-parts": [[2014, 6]] },
    });
  });
});
