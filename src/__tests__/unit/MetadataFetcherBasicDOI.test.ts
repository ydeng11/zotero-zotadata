import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

describe("MetadataFetcher basic DOI workflow", () => {
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

  it("successfully fetches metadata for basic item with valid DOI and empty fields", async () => {
    const item = createMockItem({
      title: "",
      DOI: "10.1000/test.doi",
      creators: [],
    });

    // Mock CrossRef API response
    vi.spyOn(fetcher as any, "fetchDOIMetadataViaTranslator").mockResolvedValue(
      false,
    );
    vi.spyOn(fetcher as any, "fetchCrossRefMetadata").mockResolvedValue({
      DOI: "10.1000/test.doi",
      title: ["Updated Title from CrossRef"],
      "container-title": ["Journal of Testing"],
      published: { "date-parts": [[2023]] },
      volume: "1",
      issue: "1",
      page: "1-10",
      URL: "https://doi.org/10.1000/test.doi",
      author: [
        { given: "Jane", family: "Doe" },
        { given: "John", family: "Smith" },
      ],
    });

    const result = await (fetcher as any).fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.source).toBe("CrossRef");
    expect(result.changes).toContain(
      "Updated title: Updated Title from CrossRef",
    );
    expect(result.changes).toContain(
      "Updated publication title: Journal of Testing",
    );
    expect(result.changes).toContain("Updated authors: 2");

    // Verify item was actually updated
    expect(item.getField("title")).toBe("Updated Title from CrossRef");
    expect(item.getField("publicationTitle")).toBe("Journal of Testing");
    expect(item.getField("date")).toBe("2023");
    expect(item.getField("volume")).toBe("1");
    expect(item.getField("issue")).toBe("1");
    expect(item.getField("pages")).toBe("1-10");
    expect(item.getField("url")).toBe("https://doi.org/10.1000/test.doi");

    const creators = item.getCreators();
    expect(creators).toHaveLength(2);
    expect(creators[0].firstName).toBe("Jane");
    expect(creators[0].lastName).toBe("Doe");
    expect(creators[1].firstName).toBe("John");
    expect(creators[1].lastName).toBe("Smith");
  });

  it("handles item with DOI but no other metadata", async () => {
    const item = createMockItem({
      title: "",
      DOI: "10.1000/basic.doi",
      creators: [],
    });

    vi.spyOn(fetcher as any, "fetchDOIMetadataViaTranslator").mockResolvedValue(
      false,
    );
    vi.spyOn(fetcher as any, "fetchCrossRefMetadata").mockResolvedValue({
      DOI: "10.1000/basic.doi",
      title: ["Basic Test Paper"],
      "container-title": ["Basic Journal"],
      published: { "date-parts": [[2022]] },
      author: [{ given: "Alice", family: "Johnson" }],
    });

    const result = await (fetcher as any).fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(item.getField("title")).toBe("Basic Test Paper");
    expect(item.getField("publicationTitle")).toBe("Basic Journal");
    expect(item.getField("date")).toBe("2022");

    const creators = item.getCreators();
    expect(creators).toHaveLength(1);
    expect(creators[0].firstName).toBe("Alice");
    expect(creators[0].lastName).toBe("Johnson");
  });

  it("preserves existing DOI when it matches CrossRef metadata", async () => {
    const item = createMockItem({
      title: "Existing Paper",
      DOI: "10.1000/existing.doi",
      creators: [{ firstName: "Bob", lastName: "Wilson" }],
    });

    vi.spyOn(fetcher as any, "fetchDOIMetadataViaTranslator").mockResolvedValue(
      false,
    );
    vi.spyOn(fetcher as any, "fetchCrossRefMetadata").mockResolvedValue({
      DOI: "10.1000/existing.doi",
      title: ["Existing Paper"],
      "container-title": ["Existing Journal"],
    });

    const result = await (fetcher as any).fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(item.getField("DOI")).toBe("10.1000/existing.doi");
    expect(result.changes).not.toContain("Added DOI");
    expect(result.changes).not.toContain("Updated DOI");
  });
});
