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

describe("Title-only Semi-Supervised Learning Paper - Existing Test Pattern", () => {
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

  it("fetches correct metadata when starting with title only and discovers arXiv DOI", async () => {
    const item = createMockItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma" },
        { firstName: "Shakir", lastName: "Mohamed" },
      ],
    });

    vi.spyOn(fetcher, "extractDOI").mockReturnValue(null);
    vi.spyOn(fetcher, "fetchDOIMetadataViaTranslator").mockResolvedValue(false);
    vi.spyOn(
      fetcher.doiDiscoveryService,
      "resolvePreferredDoiForMetadata",
    ).mockResolvedValue("10.48550/arxiv.1406.5298");

    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue({
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

    vi.spyOn(mockMetadataUpdate, "updateItemWithMetadata").mockResolvedValue([
      "Updated title: Semi-Supervised Learning with Deep Generative Models",
      "Updated publication title: arXiv",
    ]);
    vi.spyOn(mockMetadataUpdate, "supplementDOIMetadata").mockResolvedValue([]);

    const result = await fetcher.fetchDOIBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(mockCrossRefAPI.getCrossRefWorkMessage).toHaveBeenCalledWith(
      "10.48550/arxiv.1406.5298",
    );
  });
});
