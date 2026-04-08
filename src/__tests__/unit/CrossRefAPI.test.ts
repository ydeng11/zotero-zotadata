import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CrossRefAPI } from "@/features/metadata/apis";
import type { SearchQuery, CrossRefWork } from "@/shared/core/types";

const mockZoteroHTTP = {
  request: vi.fn(),
};

describe("CrossRefAPI", () => {
  let crossRefAPI: CrossRefAPI;

  beforeEach(() => {
    (globalThis as { __setHTTPMock?: (m: unknown) => void }).__setHTTPMock?.(
      mockZoteroHTTP,
    );
    crossRefAPI = new CrossRefAPI();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("search query building", () => {
    it("includes multiple authors in search query", () => {
      const query: SearchQuery = {
        title: "Test Paper",
        authors: ["Smith", "Johnson", "Williams"],
        year: 2020,
      };

      const searchQuery = (crossRefAPI as any).buildSearchQuery(query);

      expect(searchQuery).toContain("Smith");
      expect(searchQuery).toContain("Johnson");
      expect(searchQuery).toContain("Williams");
      expect(searchQuery).toMatch(/author.*Smith|Smith.*author/i);
      expect(searchQuery).toMatch(/author.*Johnson|Johnson.*author/i);
      expect(searchQuery).toMatch(/author.*Williams|Williams.*author/i);
    });

    it("uses OR logic for multiple authors", () => {
      const query: SearchQuery = {
        title: "Test Paper",
        authors: ["Smith", "Johnson", "Williams"],
        year: 2020,
      };

      const searchQuery = (crossRefAPI as any).buildSearchQuery(query);

      expect(searchQuery).toContain(" OR ");
    });

    it("limits authors to 3 for better disambiguation", () => {
      const query: SearchQuery = {
        title: "Test Paper",
        authors: ["Smith", "Johnson", "Williams", "Brown", "Davis"],
        year: 2020,
      };

      const searchQuery = (crossRefAPI as any).buildSearchQuery(query);

      expect(searchQuery).toContain("Smith");
      expect(searchQuery).toContain("Johnson");
      expect(searchQuery).toContain("Williams");
      expect(searchQuery).not.toContain("Brown");
      expect(searchQuery).not.toContain("Davis");
    });
  });

  describe("search", () => {
    it("should search for works with title and authors", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          status: "ok",
          "message-type": "work-list",
          "message-version": "1.0.0",
          message: {
            "total-results": 1,
            items: [
              {
                DOI: "10.1000/test.doi",
                title: ["Machine Learning Applications in Healthcare"],
                author: [
                  { given: "John", family: "Smith" },
                  { given: "Jane", family: "Doe" },
                ],
                published: {
                  "date-parts": [[2023]],
                },
                URL: "https://doi.org/10.1000/test.doi",
              } as CrossRefWork,
            ],
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

      const results = await crossRefAPI.search(query);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        title: "Machine Learning Applications in Healthcare",
        authors: ["John Smith", "Jane Doe"],
        year: 2023,
        doi: "10.1000/test.doi",
        source: "CrossRef",
      });
      expect(results[0].confidence).toBeGreaterThan(0.5);
    });

    it("should handle empty search results", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          status: "ok",
          "message-type": "work-list",
          "message-version": "1.0.0",
          message: {
            "total-results": 0,
            items: [],
          },
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const query: SearchQuery = {
        title: "Nonexistent Paper Title",
      };

      const results = await crossRefAPI.search(query);

      expect(results).toHaveLength(0);
    });

    it("should handle API errors gracefully", async () => {
      mockZoteroHTTP.request.mockRejectedValue(new Error("Network error"));

      const query: SearchQuery = {
        title: "Test Title",
      };

      await expect(crossRefAPI.search(query)).rejects.toThrow("Network error");
    });
  });

  describe("getWorkByDOI", () => {
    it("should fetch work by DOI", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          status: "ok",
          "message-type": "work",
          "message-version": "1.0.0",
          message: {
            DOI: "10.1000/test.doi",
            title: ["Test Paper"],
            author: [{ given: "Test", family: "Author" }],
            published: {
              "date-parts": [[2023]],
            },
            URL: "https://doi.org/10.1000/test.doi",
          } as CrossRefWork,
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const result = await crossRefAPI.getWorkByDOI("10.1000/test.doi");

      expect(result).toBeDefined();
      expect(result!.title).toBe("Test Paper");
      expect(result!.doi).toBe("10.1000/test.doi");
      expect(result!.confidence).toBe(1.0);
    });

    it("should return null for non-existent DOI", async () => {
      mockZoteroHTTP.request.mockRejectedValue({ status: 404 });

      const result = await crossRefAPI.getWorkByDOI("10.1000/nonexistent.doi");

      expect(result).toBeNull();
    });
  });

  describe("confidence calculation", () => {
    it("should assign high confidence for exact matches", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          status: "ok",
          "message-type": "work-list",
          "message-version": "1.0.0",
          message: {
            "total-results": 1,
            items: [
              {
                DOI: "10.1000/exact.doi",
                title: ["Exact Title Match"],
                author: [{ given: "Exact", family: "Author" }],
                published: {
                  "date-parts": [[2023]],
                },
                URL: "https://doi.org/10.1000/exact.doi",
              } as CrossRefWork,
            ],
          },
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

      const results = await crossRefAPI.search(query);

      expect(results[0].confidence).toBe(1.0);
    });

    it("should assign lower confidence for partial matches", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          status: "ok",
          "message-type": "work-list",
          "message-version": "1.0.0",
          message: {
            "total-results": 1,
            items: [
              {
                DOI: "10.1000/different.doi",
                title: ["Completely Different Title"],
                author: [{ given: "Different", family: "Author" }],
                published: {
                  "date-parts": [[2020]],
                },
                URL: "https://doi.org/10.1000/different.doi",
              } as CrossRefWork,
            ],
          },
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const query: SearchQuery = {
        title: "Original Title",
        authors: ["Original Author"],
        year: 2023,
      };

      const results = await crossRefAPI.search(query);

      expect(results[0].confidence).toBeLessThan(1);
    });
  });

  describe("API info", () => {
    it("should return correct API information", () => {
      const apiInfo = crossRefAPI.getApiInfo();

      expect(apiInfo).toEqual({
        name: "CrossRef",
        version: "1.0",
        baseUrl: "https://api.crossref.org",
        rateLimit: { requests: 50, window: 1000 },
      });
    });
  });
});
