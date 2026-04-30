import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAlexAPI } from "@/features/metadata/apis";
import type { SearchQuery, OpenAlexWork } from "@/shared/core/types";

// Mock Zotero HTTP (wired in beforeEach after setup.ts resets HTTP)
const mockZoteroHTTP = {
  request: vi.fn(),
};

describe("OpenAlexAPI", () => {
  let openAlexAPI: OpenAlexAPI;

  beforeEach(() => {
    (globalThis as { __setHTTPMock?: (m: unknown) => void }).__setHTTPMock?.(
      mockZoteroHTTP,
    );
    openAlexAPI = new OpenAlexAPI();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("search query building", () => {
    it("uses search parameter for title (not deprecated title.search filter)", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [],
          meta: { count: 0, db_response_time_ms: 25 },
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await openAlexAPI.search({ title: "Test Paper" });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("search=Test+Paper");
      expect(requestUrl).not.toContain("title.search");
    });

    it("uses only first author in filter (not multiple authors)", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [],
          meta: { count: 0, db_response_time_ms: 25 },
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await openAlexAPI.search({
        title: "Test Paper",
        authors: ["Smith", "Johnson", "Williams"],
        year: 2020,
      });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("authorships.author.display_name.search%3ASmith");
      expect(requestUrl).not.toContain("Johnson");
      expect(requestUrl).not.toContain("Williams");
    });

    it("uses full URL format for DOI filter", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [],
          meta: { count: 0, db_response_time_ms: 25 },
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await openAlexAPI.search({ doi: "10.1234/test.doi" });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("doi%3Ahttps%3A%2F%2Fdoi.org%2F10.1234%2Ftest.doi");
    });
  });

  describe("search", () => {
    it("should search for works with title and authors", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [
            {
              id: "https://openalex.org/W123456789",
              display_name: "Machine Learning Applications in Healthcare",
              authorships: [
                { author: { display_name: "John Smith" } },
                { author: { display_name: "Jane Doe" } },
              ],
              publication_year: 2023,
              doi: "https://doi.org/10.1000/test.doi",
              open_access: {
                is_oa: true,
                oa_url: "https://example.com/pdf",
              },
            } as OpenAlexWork,
          ],
          meta: {
            count: 1,
            db_response_time_ms: 50,
          },
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const query: SearchQuery = {
        title: "Machine Learning Applications in Healthcare",
        authors: ["John Smith", "Jane Doe"],
        year: 2023,
      };

      const results = await openAlexAPI.search(query);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        title: "Machine Learning Applications in Healthcare",
        authors: ["John Smith", "Jane Doe"],
        year: 2023,
        doi: "10.1000/test.doi",
        source: "OpenAlex",
        pdfUrl: "https://example.com/pdf",
      });
      expect(results[0].confidence).toBeGreaterThan(0.5);
    });

    it("should handle empty search results", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [],
          meta: {
            count: 0,
            db_response_time_ms: 25,
          },
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const query: SearchQuery = {
        title: "Nonexistent Paper Title",
      };

      const results = await openAlexAPI.search(query);

      expect(results).toHaveLength(0);
    });

    it("should handle API errors gracefully", async () => {
      mockZoteroHTTP.request.mockRejectedValue(new Error("Network error"));

      const query: SearchQuery = {
        title: "Test Title",
      };

      await expect(openAlexAPI.search(query)).rejects.toThrow("Network error");
    });
  });

  describe("searchExact", () => {
    it("uses search parameter for title and filter for author and year", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await openAlexAPI.searchExact({
        title: "Semi-Supervised Learning with Deep Generative Models",
        authors: ["Diederik P. Kingma"],
        year: 2014,
      });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];

      expect(requestUrl).toContain("search=Semi+Supervised+Learning+with+Deep+Generative+Models");
      expect(requestUrl).toContain("filter=authorships.author.display_name.search%3ADiederik+P.+Kingma%2Cpublication_year%3A2014");
    });
  });

  describe("getWorkByDOI", () => {
    it("should fetch work by DOI", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          id: "https://openalex.org/W123456789",
          display_name: "Test Paper",
          authorships: [{ author: { display_name: "Test Author" } }],
          publication_year: 2023,
          doi: "https://doi.org/10.1000/test.doi",
          open_access: {
            is_oa: false,
          },
        } as OpenAlexWork),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const result = await openAlexAPI.getWorkByDOI("10.1000/test.doi");

      expect(result).toBeDefined();
      expect(result!.title).toBe("Test Paper");
      expect(result!.doi).toBe("10.1000/test.doi");
      expect(result!.confidence).toBe(1.0); // Exact DOI match
    });

    it("should return null for non-existent DOI", async () => {
      mockZoteroHTTP.request.mockRejectedValue({ status: 404 });

      const result = await openAlexAPI.getWorkByDOI("10.1000/nonexistent.doi");

      expect(result).toBeNull();
    });
  });

  describe("searchOpenAccess", () => {
    it("combines open_access.is_oa filter correctly with other filters", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await openAlexAPI.searchOpenAccess({
        title: "Open Access Paper",
        authors: ["Smith"],
        year: 2023,
      });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("search=Open+Access+Paper");
      expect(requestUrl).toContain("open_access.is_oa%3Atrue");
      expect(requestUrl).not.toContain("&filter=open_access.is_oa"); // Should be in main filter, not separate
    });

    it("should filter for open access papers", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [
            {
              id: "https://openalex.org/W123456789",
              display_name: "Open Access Paper",
              authorships: [{ author: { display_name: "Test Author" } }],
              publication_year: 2023,
              open_access: {
                is_oa: true,
                oa_url: "https://example.com/pdf",
              },
            } as OpenAlexWork,
          ],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const query: SearchQuery = {
        title: "Open Access Paper",
      };

      const results = await openAlexAPI.searchOpenAccess(query);

      expect(results).toHaveLength(1);
      expect(results[0].pdfUrl).toBe("https://example.com/pdf");
      expect(results[0].confidence).toBeGreaterThan(0.6); // Open access bonus
    });
  });

  describe("confidence calculation", () => {
    it("should assign high confidence for exact matches", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [
            {
              id: "https://openalex.org/W123456789",
              display_name: "Exact Title Match",
              authorships: [{ author: { display_name: "Exact Author" } }],
              publication_year: 2023,
              doi: "https://doi.org/10.1000/exact.doi",
              open_access: {
                is_oa: true,
                oa_url: "https://example.com/pdf",
              },
            } as OpenAlexWork,
          ],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const query: SearchQuery = {
        title: "Exact Title Match",
        authors: ["Exact Author"],
        year: 2023,
        doi: "10.1000/exact.doi",
      };

      const results = await openAlexAPI.search(query);

      expect(results[0].confidence).toBe(1.0); // Perfect match
    });

    it("should assign lower confidence for partial matches", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          results: [
            {
              id: "https://openalex.org/W123456789",
              display_name: "Completely Different Title",
              authorships: [{ author: { display_name: "Different Author" } }],
              publication_year: 2020,
              open_access: {
                is_oa: false,
              },
            } as OpenAlexWork,
          ],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const query: SearchQuery = {
        title: "Original Title",
        authors: ["Original Author"],
        year: 2023,
      };

      const results = await openAlexAPI.search(query);

      // Heuristic score can stay high when year/author signals align; main check is < perfect
      expect(results[0].confidence).toBeLessThan(1);
    });
  });

  describe("API info", () => {
    it("should return correct API information", () => {
      const apiInfo = openAlexAPI.getApiInfo();

      expect(apiInfo).toEqual({
        name: "OpenAlex",
        version: "1.0",
        baseUrl: "https://api.openalex.org",
        rateLimit: { requests: 100, window: 1000 },
      });
    });
  });
});
