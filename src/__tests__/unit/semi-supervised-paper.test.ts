import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

describe("Semi-Supervised Learning Paper Metadata Update", () => {
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

  it("updates metadata correctly for Semi-Supervised Learning paper in English", async () => {
    const item = createMockItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      DOI: "10.29228/joh.67701",
      url: "https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
      extra: "00753 \narXiv: 1406.5298",
      creators: [
        { firstName: "Abdulselami", lastName: "SARIGÜL" },
        { firstName: "Shakir", lastName: "Mohamed" },
      ],
    });

    vi.spyOn(fetcher as any, "extractDOI").mockReturnValue(
      "10.29228/joh.67701",
    );
    vi.spyOn(fetcher as any, "fetchDOIMetadataViaTranslator").mockResolvedValue(
      false,
    );
    vi.spyOn(fetcher as any, "fetchCrossRefMetadata").mockResolvedValue({
      DOI: "10.29228/joh.67701",
      title: ["Semi-Supervised Learning with Deep Generative Models"],
      author: [
        { given: "Abdulselami", family: "Sarigül" },
        { given: "Shakir", family: "Mohamed" },
      ],
      URL: "https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
      "container-title": ["Journal of Hygiene"],
      published: { "date-parts": [[2023]] },
    });
    const updateSpy = vi
      .spyOn(fetcher as any, "updateItemWithMetadata")
      .mockResolvedValue([
        "Updated title: Semi-Supervised Learning with Deep Generative Models",
        "Updated publication title: Journal of Hygiene",
        "Updated URL: https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
      ]);

    const result = await (fetcher as any).fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(item, {
      DOI: "10.29228/joh.67701",
      title: ["Semi-Supervised Learning with Deep Generative Models"],
      author: [
        { given: "Abdulselami", family: "Sarigül" },
        { given: "Shakir", family: "Mohamed" },
      ],
      URL: "https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
      "container-title": ["Journal of Hygiene"],
      published: { "date-parts": [[2023]] },
    });
  });
});
