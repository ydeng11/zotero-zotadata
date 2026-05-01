import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SemanticScholarAPI } from "@/features/metadata/apis/SemanticScholarAPI";

const mockZoteroHTTP = {
  request: vi.fn(),
};

describe("SemanticScholarAPI", () => {
  let semanticScholarAPI: SemanticScholarAPI;

  beforeEach(() => {
    (globalThis as { __setHTTPMock?: (m: unknown) => void }).__setHTTPMock?.(
      mockZoteroHTTP,
    );
    semanticScholarAPI = new SemanticScholarAPI();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("search query building", () => {
    it("uses only first author (not multiple authors)", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 0,
          data: [],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await semanticScholarAPI.search({
        title: "Test Paper",
        authors: ["Smith", "Johnson", "Williams"],
        year: 2020,
      });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("author%3A%22Smith%22");
      expect(requestUrl).not.toContain("Johnson");
      expect(requestUrl).not.toContain("Williams");
      expect(requestUrl).not.toContain("OR");
    });

    it("uses URLSearchParams for proper encoding", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 0,
          data: [],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await semanticScholarAPI.search({
        title: "Test Paper",
        year: 2020,
      });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("query=");
      expect(requestUrl).toContain("year%3A2020");
    });

    it("uses last name for author search", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 0,
          data: [],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await semanticScholarAPI.search({
        title: "Test Paper",
        authors: ["John Smith"],
      });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("author%3A%22Smith%22");
    });
  });

  describe("field handling", () => {
    it("builds open access search URL without nesting query params", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 0,
          data: [],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await semanticScholarAPI.searchOpenAccess({
        title: "Open Access Paper",
        authors: ["John Smith"],
      });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("query=Open+Access+Paper");
      expect(requestUrl).not.toContain("query=query%3D");
    });

    it("requests externalIds field (not invalid doi field)", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 0,
          data: [],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await semanticScholarAPI.search({ title: "Test" });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("externalIds");
      expect(requestUrl).not.toContain("fields=doi");
      expect(requestUrl).not.toContain(",doi,");
    });

    it("extracts DOI from externalIds.DOI", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 1,
          data: [
            {
              paperId: "test123",
              title: "Test Paper",
              authors: [{ name: "Test Author" }],
              year: 2023,
              externalIds: {
                DOI: "10.1234/test.doi",
                ArXiv: "2301.12345",
              },
              url: "https://semanticscholar.org/paper/test123",
            },
          ],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const results = await semanticScholarAPI.search({
        title: "Test Paper",
      });

      expect(results).toHaveLength(1);
      expect(results[0].doi).toBe("10.1234/test.doi");
    });

    it("requests publicationTypes field", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 0,
          data: [],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      await semanticScholarAPI.search({ title: "Test" });

      const requestUrl = mockZoteroHTTP.request.mock.calls[0]?.[1];
      expect(requestUrl).toContain("publicationTypes");
    });

    it("maps publicationTypes to itemType", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 2,
          data: [
            {
              paperId: "journal123",
              title: "Journal Paper",
              authors: [{ name: "Test Author" }],
              year: 2023,
              externalIds: { DOI: "10.1234/journal" },
              url: "https://semanticscholar.org/paper/journal123",
              publicationTypes: ["JournalArticle"],
            },
            {
              paperId: "conf123",
              title: "Conference Paper",
              authors: [{ name: "Test Author" }],
              year: 2023,
              externalIds: { DOI: "10.1234/conf" },
              url: "https://semanticscholar.org/paper/conf123",
              publicationTypes: ["Conference"],
            },
          ],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const results = await semanticScholarAPI.search({
        title: "Test",
      });

      expect(results).toHaveLength(2);
      expect(results[0].itemType).toBe("journalArticle");
      expect(results[1].itemType).toBe("conferencePaper");
    });

    it("handles papers without publicationTypes", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 1,
          data: [
            {
              paperId: "test123",
              title: "Test Paper",
              authors: [{ name: "Test Author" }],
              year: 2023,
              externalIds: { DOI: "10.1234/test" },
              url: "https://semanticscholar.org/paper/test123",
            },
          ],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const results = await semanticScholarAPI.search({
        title: "Test Paper",
      });

      expect(results).toHaveLength(1);
      expect(results[0].itemType).toBeUndefined();
    });

    it("extracts ArXiv ID from externalIds for confidence scoring", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        responseText: JSON.stringify({
          total: 1,
          data: [
            {
              paperId: "arxiv123",
              title: "ArXiv Paper",
              authors: [{ name: "Test Author" }],
              year: 2023,
              externalIds: {
                ArXiv: "2301.12345",
              },
              url: "https://semanticscholar.org/paper/arxiv123",
            },
          ],
        }),
        getAllResponseHeaders: () => ({}),
      };

      mockZoteroHTTP.request.mockResolvedValue(mockResponse);

      const results = await semanticScholarAPI.search({
        title: "ArXiv Paper",
        arxivId: "2301.12345",
      });

      expect(results).toHaveLength(1);
      // Strong match (0.3 boost) should result in high confidence
      expect(results[0].confidence).toBeGreaterThan(0.9);
    });
  });
});
