// tests/unit/zotadata/discovery.test.ts
// Tests for discovery orchestration functions in zotadata.js

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createZotadataMethod,
  clearCache,
} from "../../helpers/extract-function";
import { createMockItem } from "../../__mocks__/zotero-items";

describe("Discovery Functions", () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("discoverDOI", () => {
    let discoverDOI: (item: any) => Promise<string | null>;
    let mockSearchCrossRefForDOI: ReturnType<typeof vi.fn>;
    let mockSearchOpenAlexForDOI: ReturnType<typeof vi.fn>;
    let mockSearchSemanticScholarForDOI: ReturnType<typeof vi.fn>;
    let mockSearchDBLPForDOI: ReturnType<typeof vi.fn>;
    let mockSearchGoogleScholarForDOI: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Create mock functions for subordinate search methods
      mockSearchCrossRefForDOI = vi.fn().mockResolvedValue(null);
      mockSearchOpenAlexForDOI = vi.fn().mockResolvedValue(null);
      mockSearchSemanticScholarForDOI = vi.fn().mockResolvedValue(null);
      mockSearchDBLPForDOI = vi.fn().mockResolvedValue(null);
      mockSearchGoogleScholarForDOI = vi.fn().mockResolvedValue(null);

      discoverDOI = createZotadataMethod("discoverDOI", {
        searchCrossRefForDOI: mockSearchCrossRefForDOI,
        searchOpenAlexForDOI: mockSearchOpenAlexForDOI,
        searchSemanticScholarForDOI: mockSearchSemanticScholarForDOI,
        searchDBLPForDOI: mockSearchDBLPForDOI,
        searchGoogleScholarForDOI: mockSearchGoogleScholarForDOI,
      });
    });

    it("should return DOI from CrossRef when found first", async () => {
      mockSearchCrossRefForDOI.mockResolvedValue("10.1000/crossref.doi");

      const item = createMockItem({ title: "Test Paper" });
      const result = await discoverDOI(item);

      expect(result).toBe("10.1000/crossref.doi");
      expect(mockSearchCrossRefForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchCrossRefForDOI).toHaveBeenCalledTimes(1);
      // Should not call other search functions when CrossRef succeeds
      expect(mockSearchOpenAlexForDOI).not.toHaveBeenCalled();
      expect(mockSearchSemanticScholarForDOI).not.toHaveBeenCalled();
      expect(mockSearchDBLPForDOI).not.toHaveBeenCalled();
      expect(mockSearchGoogleScholarForDOI).not.toHaveBeenCalled();
    });

    it("should fallback to OpenAlex when CrossRef returns null", async () => {
      mockSearchCrossRefForDOI.mockResolvedValue(null);
      mockSearchOpenAlexForDOI.mockResolvedValue("10.2000/openalex.doi");

      const item = createMockItem({ title: "Test Paper" });
      const result = await discoverDOI(item);

      expect(result).toBe("10.2000/openalex.doi");
      expect(mockSearchCrossRefForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchOpenAlexForDOI).toHaveBeenCalledWith(item);
      // Should not call remaining search functions when OpenAlex succeeds
      expect(mockSearchSemanticScholarForDOI).not.toHaveBeenCalled();
      expect(mockSearchDBLPForDOI).not.toHaveBeenCalled();
      expect(mockSearchGoogleScholarForDOI).not.toHaveBeenCalled();
    });

    it("should fallback to Semantic Scholar when CrossRef and OpenAlex return null", async () => {
      mockSearchCrossRefForDOI.mockResolvedValue(null);
      mockSearchOpenAlexForDOI.mockResolvedValue(null);
      mockSearchSemanticScholarForDOI.mockResolvedValue(
        "10.3000/semanticscholar.doi",
      );

      const item = createMockItem({ title: "Test Paper" });
      const result = await discoverDOI(item);

      expect(result).toBe("10.3000/semanticscholar.doi");
      expect(mockSearchCrossRefForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchOpenAlexForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchSemanticScholarForDOI).toHaveBeenCalledWith(item);
      // Should not call remaining search functions when Semantic Scholar succeeds
      expect(mockSearchDBLPForDOI).not.toHaveBeenCalled();
      expect(mockSearchGoogleScholarForDOI).not.toHaveBeenCalled();
    });

    it("should fallback to DBLP when CrossRef, OpenAlex, and Semantic Scholar return null", async () => {
      mockSearchCrossRefForDOI.mockResolvedValue(null);
      mockSearchOpenAlexForDOI.mockResolvedValue(null);
      mockSearchSemanticScholarForDOI.mockResolvedValue(null);
      mockSearchDBLPForDOI.mockResolvedValue("10.4000/dblp.doi");

      const item = createMockItem({ title: "Test Paper" });
      const result = await discoverDOI(item);

      expect(result).toBe("10.4000/dblp.doi");
      expect(mockSearchCrossRefForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchOpenAlexForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchSemanticScholarForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchDBLPForDOI).toHaveBeenCalledWith(item);
      // Should not call Google Scholar when DBLP succeeds
      expect(mockSearchGoogleScholarForDOI).not.toHaveBeenCalled();
    });

    it("should fallback to Google Scholar when all other sources return null", async () => {
      mockSearchCrossRefForDOI.mockResolvedValue(null);
      mockSearchOpenAlexForDOI.mockResolvedValue(null);
      mockSearchSemanticScholarForDOI.mockResolvedValue(null);
      mockSearchDBLPForDOI.mockResolvedValue(null);
      mockSearchGoogleScholarForDOI.mockResolvedValue(
        "10.5000/googlescholar.doi",
      );

      const item = createMockItem({ title: "Test Paper" });
      const result = await discoverDOI(item);

      expect(result).toBe("10.5000/googlescholar.doi");
      expect(mockSearchCrossRefForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchOpenAlexForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchSemanticScholarForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchDBLPForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchGoogleScholarForDOI).toHaveBeenCalledWith(item);
    });

    it("should return null when all sources fail", async () => {
      mockSearchCrossRefForDOI.mockResolvedValue(null);
      mockSearchOpenAlexForDOI.mockResolvedValue(null);
      mockSearchSemanticScholarForDOI.mockResolvedValue(null);
      mockSearchDBLPForDOI.mockResolvedValue(null);
      mockSearchGoogleScholarForDOI.mockResolvedValue(null);

      const item = createMockItem({ title: "Unknown Paper" });
      const result = await discoverDOI(item);

      expect(result).toBe(null);
      expect(mockSearchCrossRefForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchOpenAlexForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchSemanticScholarForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchDBLPForDOI).toHaveBeenCalledWith(item);
      expect(mockSearchGoogleScholarForDOI).toHaveBeenCalledWith(item);
    });

    it("should call search functions in correct order", async () => {
      const callOrder: string[] = [];

      mockSearchCrossRefForDOI.mockImplementation(async () => {
        callOrder.push("crossref");
        return null;
      });
      mockSearchOpenAlexForDOI.mockImplementation(async () => {
        callOrder.push("openalex");
        return null;
      });
      mockSearchSemanticScholarForDOI.mockImplementation(async () => {
        callOrder.push("semanticscholar");
        return null;
      });
      mockSearchDBLPForDOI.mockImplementation(async () => {
        callOrder.push("dblp");
        return null;
      });
      mockSearchGoogleScholarForDOI.mockImplementation(async () => {
        callOrder.push("googlescholar");
        return null;
      });

      const item = createMockItem({ title: "Test Paper" });
      await discoverDOI(item);

      expect(callOrder).toEqual([
        "crossref",
        "openalex",
        "semanticscholar",
        "dblp",
        "googlescholar",
      ]);
    });

    it("should propagate errors from search functions", async () => {
      mockSearchCrossRefForDOI.mockRejectedValue(new Error("Network error"));

      const item = createMockItem({ title: "Test Paper" });

      // The function doesn't have try-catch, so it propagates the error
      await expect(discoverDOI(item)).rejects.toThrow("Network error");
    });
  });

  describe("discoverISBN", () => {
    let discoverISBN: (item: any) => Promise<string | null>;
    let mockSearchOpenLibraryForISBN: ReturnType<typeof vi.fn>;
    let mockSearchGoogleBooksForISBN: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Create mock functions for subordinate search methods
      mockSearchOpenLibraryForISBN = vi.fn().mockResolvedValue(null);
      mockSearchGoogleBooksForISBN = vi.fn().mockResolvedValue(null);

      discoverISBN = createZotadataMethod("discoverISBN", {
        searchOpenLibraryForISBN: mockSearchOpenLibraryForISBN,
        searchGoogleBooksForISBN: mockSearchGoogleBooksForISBN,
      });
    });

    it("should return ISBN from OpenLibrary when found first", async () => {
      mockSearchOpenLibraryForISBN.mockResolvedValue("978-0-123456-78-9");

      const item = createMockItem({ title: "Test Book" });
      const result = await discoverISBN(item);

      expect(result).toBe("978-0-123456-78-9");
      expect(mockSearchOpenLibraryForISBN).toHaveBeenCalledWith(item);
      expect(mockSearchOpenLibraryForISBN).toHaveBeenCalledTimes(1);
      // Should not call Google Books when OpenLibrary succeeds
      expect(mockSearchGoogleBooksForISBN).not.toHaveBeenCalled();
    });

    it("should fallback to Google Books when OpenLibrary returns null", async () => {
      mockSearchOpenLibraryForISBN.mockResolvedValue(null);
      mockSearchGoogleBooksForISBN.mockResolvedValue("978-1-234567-89-0");

      const item = createMockItem({ title: "Test Book" });
      const result = await discoverISBN(item);

      expect(result).toBe("978-1-234567-89-0");
      expect(mockSearchOpenLibraryForISBN).toHaveBeenCalledWith(item);
      expect(mockSearchGoogleBooksForISBN).toHaveBeenCalledWith(item);
    });

    it("should return null when all sources fail", async () => {
      mockSearchOpenLibraryForISBN.mockResolvedValue(null);
      mockSearchGoogleBooksForISBN.mockResolvedValue(null);

      const item = createMockItem({ title: "Unknown Book" });
      const result = await discoverISBN(item);

      expect(result).toBe(null);
      expect(mockSearchOpenLibraryForISBN).toHaveBeenCalledWith(item);
      expect(mockSearchGoogleBooksForISBN).toHaveBeenCalledWith(item);
    });

    it("should call search functions in correct order", async () => {
      const callOrder: string[] = [];

      mockSearchOpenLibraryForISBN.mockImplementation(async () => {
        callOrder.push("openlibrary");
        return null;
      });
      mockSearchGoogleBooksForISBN.mockImplementation(async () => {
        callOrder.push("googlebooks");
        return null;
      });

      const item = createMockItem({ title: "Test Book" });
      await discoverISBN(item);

      expect(callOrder).toEqual(["openlibrary", "googlebooks"]);
    });

    it("should propagate errors from search functions", async () => {
      mockSearchOpenLibraryForISBN.mockRejectedValue(new Error("API error"));

      const item = createMockItem({ title: "Test Book" });

      // The function doesn't have try-catch, so it propagates the error
      await expect(discoverISBN(item)).rejects.toThrow("API error");
    });
  });
});
