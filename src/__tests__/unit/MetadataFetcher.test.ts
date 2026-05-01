import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MetadataFetcher,
  type MetadataFetcherServices,
} from "@/modules/MetadataFetcher";
import { DOIDiscoveryService } from "@/modules/metadata/DOIDiscoveryService";
import { MetadataUpdateService } from "@/modules/metadata/MetadataUpdateService";
import { BookMetadataService } from "@/modules/metadata/BookMetadataService";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";
import { validateMetadataMatch } from "@/utils/authorValidation";

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

describe("MetadataFetcher legacy compatibility", () => {
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

  it("discovers DOIs in the original fallback order", async () => {
    const item = createMockItem({
      title: "Test Paper",
      creators: [{ firstName: "Jane", lastName: "Doe" }],
    });
    const callOrder: string[] = [];

    vi.spyOn(
      fetcher.doiDiscoveryService,
      "searchCrossRefForDOI",
    ).mockImplementation(async () => {
      callOrder.push("crossref");
      return null;
    });
    vi.spyOn(
      fetcher.doiDiscoveryService,
      "searchOpenAlexForDOI",
    ).mockImplementation(async () => {
      callOrder.push("openalex");
      return null;
    });
    vi.spyOn(
      fetcher.doiDiscoveryService,
      "searchDBLPForDOI",
    ).mockImplementation(async () => {
      callOrder.push("dblp");
      return null;
    });
    vi.spyOn(
      fetcher.doiDiscoveryService,
      "searchSemanticScholarForDOI",
    ).mockImplementation(async () => {
      callOrder.push("semanticscholar");
      return "10.3000/found.doi";
    });
    vi.spyOn(
      fetcher.doiDiscoveryService,
      "searchGoogleScholarForDOI",
    ).mockImplementation(async () => {
      callOrder.push("googlescholar");
      return null;
    });

    const discovered = await fetcher.discoverDOI(item);

    expect(discovered).toBe("10.3000/found.doi");
    expect(callOrder).toEqual([
      "crossref",
      "openalex",
      "dblp",
      "semanticscholar",
    ]);
  });

  it("falls back to CrossRef metadata when translator lookup fails", async () => {
    const item = createMockItem({
      DOI: "10.1000/test.doi",
      title: "Original Title",
    });

    vi.spyOn(fetcher, "extractDOI").mockReturnValue("10.1000/test.doi");
    vi.spyOn(fetcher, "fetchDOIMetadataViaTranslator").mockResolvedValue(false);
    vi.spyOn(
      fetcher.doiDiscoveryService,
      "resolvePreferredDoiForMetadata",
    ).mockResolvedValue("10.1000/test.doi");

    mockCrossRefAPI.getCrossRefWorkMessage.mockResolvedValue({
      DOI: "10.1000/test.doi",
      title: ["Recovered Title"],
    });

    vi.spyOn(mockMetadataUpdate, "updateItemWithMetadata").mockResolvedValue([
      "Updated title: Recovered Title",
    ]);
    vi.spyOn(mockMetadataUpdate, "supplementDOIMetadata").mockResolvedValue([]);

    const result = await fetcher.fetchDOIBasedMetadata(item);

    expect(result).toEqual(
      expect.objectContaining({ success: true, updated: true }),
    );
    expect(mockCrossRefAPI.getCrossRefWorkMessage).toHaveBeenCalledWith(
      "10.1000/test.doi",
    );
  });

  it("preserves existing authors when applying a weak search match", async () => {
    vi.mocked(Zotero.ItemTypes.getName).mockImplementation((typeID: number) => {
      if (typeID === 99) return "report";
      if (typeID === 1) return "journalArticle";
      if (typeID === 2) return "book";
      if (typeID === 3) return "conferencePaper";
      if (typeID === 4) return "preprint";
      return "journalArticle";
    });

    const item = createMockItem({
      itemTypeID: 99,
      title: "Curated Local Title",
      date: "2020",
      creators: [{ firstName: "Original", lastName: "Author" }],
    });

    mockCrossRefAPI.search.mockResolvedValue([
      {
        title: "Completely Different Paper",
        authors: ["Wrong Author"],
        year: 2024,
        confidence: 0.1,
        source: "CrossRef",
      },
    ]);

    const result = await fetcher.fetchMetadataForItem(item);

    expect(result.success).toBe(true);
    expect(item.setCreators).not.toHaveBeenCalled();
    expect(item.getCreators()).toEqual([
      {
        firstName: "Original",
        lastName: "Author",
        creatorType: "author",
      },
    ]);
  });

  it("treats translator-applied book metadata as a successful update", async () => {
    const item = createMockItem({
      ISBN: "9780123456789",
      title: "Original Book",
      itemTypeID: 2,
    });

    vi.spyOn(mockBookMetadata, "extractISBN").mockReturnValue("9780123456789");
    vi.spyOn(mockBookMetadata, "fetchBookMetadata").mockResolvedValue({
      source: "Zotero Translator",
      success: true,
    });

    const result = await fetcher.fetchISBNBasedMetadata(item);

    expect(result).toEqual(
      expect.objectContaining({ success: true, updated: true }),
    );
  });

  it("extracts a DOI from Google Scholar HTML like the legacy implementation", async () => {
    const item = createMockItem({
      title: "Test Paper",
      creators: [{ firstName: "Jane", lastName: "Doe" }],
    });

    (globalThis.Zotero.HTTP.request as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockResolvedValue({
        status: 200,
        responseText:
          "<html><body>See https://doi.org/10.3000/test.doi and more text</body></html>",
      });

    const doi =
      await fetcher.doiDiscoveryService.searchGoogleScholarForDOI(item);

    expect(doi).toBe("10.3000/test.doi");
  });

  it("uses Semantic Scholar externalIds DOI for exact DOI discovery", async () => {
    const item = createMockItem({
      title: "Exact Match Paper",
      creators: [{ firstName: "Jane", lastName: "Doe" }],
    });

    mockSemanticScholarAPI.searchPapersWithExternalIds.mockResolvedValue([
      {
        paperId: "paper-1",
        title: "Exact Match Paper",
        authors: [{ name: "Jane Doe" }],
        externalIds: { DOI: "10.4000/exact-match" },
      },
    ]);

    const doi =
      await fetcher.doiDiscoveryService.searchSemanticScholarForDOI(item);

    expect(doi).toBe("10.4000/exact-match");
  });
});

describe("MetadataFetcher GAN paper validation", () => {
  it("rejects wrong paper with identical title but different authors", async () => {
    const item = createMockItem({
      title: "Generative Adversarial Nets",
      extra: "arXiv: 1406.2661",
      publicationTitle: "arXiv",
      date: "2014",
      creators: [
        { firstName: "Ian J.", lastName: "Goodfellow", creatorType: "author" },
        { firstName: "Jean", lastName: "Pouget-Abadie", creatorType: "author" },
        { firstName: "Mehdi", lastName: "Mirza", creatorType: "author" },
        { firstName: "Bing", lastName: "Xu", creatorType: "author" },
        {
          firstName: "David",
          lastName: "Warde-Farley",
          creatorType: "author",
        },
        { firstName: "Sherjil", lastName: "Ozair", creatorType: "author" },
        { firstName: "Aaron", lastName: "Courville", creatorType: "author" },
        { firstName: "Yoshua", lastName: "Bengio", creatorType: "author" },
      ],
    });

    const wrongResult = {
      title: "Generative Adversarial Nets",
      authors: ["Raphael Labaca-Castro"],
      year: 2023,
      doi: "10.1007/978-3-658-40442-0_9",
      confidence: 1,
      source: "OpenAlex",
    };

    const validation = validateMetadataMatch(item, wrongResult);

    expect(validation.accept).toBe(false);
    expect(validation.reason).toContain("No authors match");
  });

  it("accepts correct paper with matching authors", async () => {
    const item = createMockItem({
      title: "Generative Adversarial Nets",
      extra: "arXiv: 1406.2661",
      publicationTitle: "arXiv",
      date: "2014",
      creators: [
        { firstName: "Ian J.", lastName: "Goodfellow", creatorType: "author" },
        { firstName: "Yoshua", lastName: "Bengio", creatorType: "author" },
      ],
    });

    const correctResult = {
      title: "Generative Adversarial Nets",
      authors: ["Ian Goodfellow", "Yoshua Bengio"],
      year: 2014,
      doi: "10.5555/2969033.2969125",
      confidence: 1,
      source: "CrossRef",
    };

    const validation = validateMetadataMatch(item, correctResult);

    expect(validation.accept).toBe(true);
    expect(validation.matchedAuthors).toBeGreaterThanOrEqual(2);
  });
});
