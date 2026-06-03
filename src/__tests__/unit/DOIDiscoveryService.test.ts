import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOIDiscoveryService } from "@/modules/metadata/DOIDiscoveryService";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";
import type { MetadataFetcherServices } from "@/modules/MetadataFetcher";

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

describe("DOIDiscoveryService", () => {
  let service: DOIDiscoveryService;
  let mockSemanticScholarAPI: ReturnType<typeof createMockSemanticScholarAPI>;

  beforeEach(() => {
    mockSemanticScholarAPI = createMockSemanticScholarAPI();

    service = new DOIDiscoveryService({
      crossRefAPI: createMockCrossRefAPI() as unknown as NonNullable<
        MetadataFetcherServices["crossRefAPI"]
      >,
      openAlexAPI: createMockOpenAlexAPI() as unknown as NonNullable<
        MetadataFetcherServices["openAlexAPI"]
      >,
      semanticScholarAPI: mockSemanticScholarAPI as unknown as NonNullable<
        MetadataFetcherServices["semanticScholarAPI"]
      >,
    });

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
      },
      Date: {
        strToDate: (value: string) => ({ year: value.match(/\d{4}/)?.[0] }),
      },
    });
  });

  it("rejects Semantic Scholar DOI candidates when exact-title results have no author overlap", async () => {
    const item = createMockItem({
      title: "Duplicate Paper Title",
      date: "2020",
      creators: [{ firstName: "Original", lastName: "Author" }],
    });

    mockSemanticScholarAPI.searchPapersWithExternalIds.mockResolvedValue([
      {
        paperId: "wrong-paper",
        title: "Duplicate Paper Title",
        authors: [{ name: "Wrong Person" }],
        year: 2020,
        externalIds: { DOI: "10.9999/wrong" },
      },
    ]);

    const doi = await service.searchSemanticScholarForDOI(item);

    expect(doi).toBeNull();
    expect(Zotero.log).toHaveBeenCalledWith(
      "Rejected DOI 10.9999/wrong: No authors match",
    );
  });

  it("rejects Google Scholar DOI candidates when the response does not mention the item title", async () => {
    const item = createMockItem({
      title: "Target Paper Title",
      creators: [{ firstName: "Original", lastName: "Author" }],
    });

    (globalThis.Zotero.HTTP.request as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockResolvedValue({
        status: 200,
        responseText:
          "<html><body>Unrelated result https://doi.org/10.9999/wrong</body></html>",
      });

    const doi = await service.searchGoogleScholarForDOI(item);

    expect(doi).toBeNull();
  });
});
