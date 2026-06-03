import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MetadataFetcher,
  type MetadataFetcherServices,
} from "@/modules/MetadataFetcher";
import { DOIDiscoveryService } from "@/modules/metadata/DOIDiscoveryService";
import { MetadataUpdateService } from "@/modules/metadata/MetadataUpdateService";
import { BookMetadataService } from "@/modules/metadata/BookMetadataService";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

function createMockCrossRefAPI() {
  return {
    getCrossRefWorkMessage: vi.fn(),
    fetchWorksByQuery: vi.fn(),
    getWorkByDOI: vi.fn(),
    search: vi.fn(),
    enforceRateLimit: vi.fn(),
  };
}

function createMockOpenAlexAPI() {
  return {
    getWorkByDOI: vi.fn(),
    search: vi.fn(),
    searchExact: vi.fn(),
    searchOpenAccess: vi.fn(),
    enforceRateLimit: vi.fn(),
  };
}

function createMockSemanticScholarAPI() {
  return {
    getPaperByDOI: vi.fn(),
    search: vi.fn(),
    searchPapersWithExternalIds: vi.fn(),
    searchByArxivId: vi.fn(),
    searchOpenAccess: vi.fn(),
    enforceRateLimit: vi.fn(),
  };
}

describe("MetadataFetcher basic DOI workflow", () => {
  let fetcher: MetadataFetcher;
  let mockCrossRefAPI: ReturnType<typeof createMockCrossRefAPI>;
  let mockOpenAlexAPI: ReturnType<typeof createMockOpenAlexAPI>;
  let mockSemanticScholarAPI: ReturnType<typeof createMockSemanticScholarAPI>;
  let mockMetadataUpdate: MetadataUpdateService;
  let mockBookMetadata: BookMetadataService;

  beforeEach(() => {
    mockCrossRefAPI = createMockCrossRefAPI();
    mockOpenAlexAPI = createMockOpenAlexAPI();
    mockSemanticScholarAPI = createMockSemanticScholarAPI();
    mockMetadataUpdate = new MetadataUpdateService();
    mockBookMetadata = new BookMetadataService();

    const doiDiscovery = new DOIDiscoveryService({
      crossRefAPI: mockCrossRefAPI as unknown as NonNullable<
        MetadataFetcherServices["crossRefAPI"]
      >,
      openAlexAPI: mockOpenAlexAPI as unknown as NonNullable<
        MetadataFetcherServices["openAlexAPI"]
      >,
      semanticScholarAPI: mockSemanticScholarAPI as unknown as NonNullable<
        MetadataFetcherServices["semanticScholarAPI"]
      >,
    });

    const services: MetadataFetcherServices = {
      crossRefAPI: mockCrossRefAPI as unknown as NonNullable<
        MetadataFetcherServices["crossRefAPI"]
      >,
      openAlexAPI: mockOpenAlexAPI as unknown as NonNullable<
        MetadataFetcherServices["openAlexAPI"]
      >,
      semanticScholarAPI: mockSemanticScholarAPI as unknown as NonNullable<
        MetadataFetcherServices["semanticScholarAPI"]
      >,
      doiDiscovery,
      metadataUpdate: mockMetadataUpdate,
      bookMetadata: mockBookMetadata,
    };

    fetcher = new MetadataFetcher({
      config: { downloads: { maxConcurrent: 3 } },
      services,
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
      },
      CreatorTypes: { getPrimaryIDForType: vi.fn(() => 1) },
      Date: {
        strToDate: (value: string) => ({ year: value.match(/\d{4}/)?.[0] }),
      },
      Translate: { Search: vi.fn() },
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

    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue({
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

    vi.spyOn(fetcher, "fetchDOIMetadataViaTranslator").mockResolvedValue(false);
    vi.spyOn(mockMetadataUpdate, "supplementDOIMetadata").mockResolvedValue([]);

    const result = await fetcher.fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.source).toBe("CrossRef");
    expect(mockCrossRefAPI.getCrossRefWorkMessage).toHaveBeenCalledWith(
      "10.1000/test.doi",
    );
  });

  it("handles item with DOI but no other metadata", async () => {
    const item = createMockItem({
      title: "",
      DOI: "10.1000/basic.doi",
      creators: [],
    });

    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue({
      DOI: "10.1000/basic.doi",
      title: ["Basic Test Paper"],
      "container-title": ["Basic Journal"],
      published: { "date-parts": [[2022]] },
      author: [{ given: "Alice", family: "Johnson" }],
    });

    vi.spyOn(fetcher, "fetchDOIMetadataViaTranslator").mockResolvedValue(false);
    vi.spyOn(mockMetadataUpdate, "supplementDOIMetadata").mockResolvedValue([]);

    const result = await fetcher.fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(mockCrossRefAPI.getCrossRefWorkMessage).toHaveBeenCalledWith(
      "10.1000/basic.doi",
    );
  });

  it("preserves existing DOI when it matches CrossRef metadata", async () => {
    const item = createMockItem({
      title: "Existing Paper",
      DOI: "10.1000/existing.doi",
      creators: [{ firstName: "Bob", lastName: "Wilson" }],
    });

    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue({
      DOI: "10.1000/existing.doi",
      title: ["Existing Paper"],
      "container-title": ["Existing Journal"],
    });

    vi.spyOn(fetcher, "fetchDOIMetadataViaTranslator").mockResolvedValue(false);
    vi.spyOn(mockMetadataUpdate, "supplementDOIMetadata").mockResolvedValue([]);

    const result = await fetcher.fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(item.getField("DOI")).toBe("10.1000/existing.doi");
  });

  it("stores a normalized DOI when discovery returns a DOI URL", async () => {
    const item = createMockItem({
      title: "Discovered DOI Paper",
      DOI: "",
      creators: [],
    });

    vi.spyOn(
      fetcher.doiDiscoveryService,
      "resolvePreferredDoiForMetadata",
    ).mockResolvedValue("HTTPS://DOI.ORG/10.1000/Discovered.DOI.");
    vi.spyOn(fetcher, "fetchDOIMetadataViaTranslator").mockResolvedValue(false);
    vi.spyOn(mockMetadataUpdate, "supplementDOIMetadata").mockResolvedValue([]);
    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue(null);

    await fetcher.fetchDOIBasedMetadata(item);

    expect(item.getField("DOI")).toBe("10.1000/discovered.doi");
    expect(mockCrossRefAPI.getCrossRefWorkMessage).toHaveBeenCalledWith(
      "10.1000/discovered.doi",
    );
  });
});
