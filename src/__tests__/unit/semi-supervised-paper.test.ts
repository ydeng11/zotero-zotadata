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
  } as any;
}

function createMockOpenAlexAPI() {
  return {
    getWorkByDOI: vi.fn(),
    search: vi.fn(),
    searchExact: vi.fn(),
    searchOpenAccess: vi.fn(),
    enforceRateLimit: vi.fn(),
  } as any;
}

function createMockSemanticScholarAPI() {
  return {
    getPaperByDOI: vi.fn(),
    search: vi.fn(),
    searchPapersWithExternalIds: vi.fn(),
    searchByArxivId: vi.fn(),
    searchOpenAccess: vi.fn(),
    enforceRateLimit: vi.fn(),
  } as any;
}

describe("Semi-Supervised Learning Paper Metadata Update", () => {
  let fetcher: MetadataFetcher;
  let mockCrossRefAPI: ReturnType<typeof createMockCrossRefAPI>;
  let mockMetadataUpdate: MetadataUpdateService;

  beforeEach(() => {
    mockCrossRefAPI = createMockCrossRefAPI();
    const mockOpenAlexAPI = createMockOpenAlexAPI();
    const mockSemanticScholarAPI = createMockSemanticScholarAPI();
    mockMetadataUpdate = new MetadataUpdateService();
    const mockBookMetadata = new BookMetadataService();

    const doiDiscovery = new DOIDiscoveryService({
      crossRefAPI: mockCrossRefAPI,
      openAlexAPI: mockOpenAlexAPI,
      semanticScholarAPI: mockSemanticScholarAPI,
    });

    const services: MetadataFetcherServices = {
      crossRefAPI: mockCrossRefAPI,
      openAlexAPI: mockOpenAlexAPI,
      semanticScholarAPI: mockSemanticScholarAPI,
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

  it("updates metadata correctly for Semi-Supervised Learning paper in English", async () => {
    const item = createMockItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      DOI: "10.29228/joh.67701",
      url: "https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
      extra: "00753 \narXiv: 1406.5298",
      creators: [
        { firstName: "Abdulselami", lastName: "SARIGL" },
        { firstName: "Shakir", lastName: "Mohamed" },
      ],
    });

    vi.spyOn(fetcher, "extractDOI").mockReturnValue("10.29228/joh.67701");
    vi.spyOn(fetcher, "fetchDOIMetadataViaTranslator").mockResolvedValue(false);
    vi.spyOn(
      fetcher.doiDiscoveryService,
      "resolvePreferredDoiForMetadata",
    ).mockResolvedValue("10.29228/joh.67701");

    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue({
      DOI: "10.29228/joh.67701",
      title: ["Semi-Supervised Learning with Deep Generative Models"],
      author: [
        { given: "Abdulselami", family: "Sarigl" },
        { given: "Shakir", family: "Mohamed" },
      ],
      URL: "https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
      "container-title": ["Journal of Hygiene"],
      published: { "date-parts": [[2023]] },
    });

    vi.spyOn(mockMetadataUpdate, "updateItemWithMetadata").mockResolvedValue([
      "Updated title: Semi-Supervised Learning with Deep Generative Models",
      "Updated publication title: Journal of Hygiene",
    ]);
    vi.spyOn(mockMetadataUpdate, "supplementDOIMetadata").mockResolvedValue([]);

    const result = await fetcher.fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
  });
});
