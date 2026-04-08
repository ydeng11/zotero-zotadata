// tests/unit/zotadata/arxiv-processing.test.ts
// Tests for arXiv processing pipeline functions in zotadata.js

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createZotadataMethod,
  clearCache,
} from "../../helpers/extract-function";
import { createMockItem } from "../../__mocks__/zotero-items";
import {
  createMockHTTP,
  registerFixture,
  clearFixtures,
} from "../../__mocks__/zotero-http";
import { crossrefFixtures } from "../../__mocks__/fixtures/crossref";
import { semanticscholarFixtures } from "../../__mocks__/fixtures/semanticscholar";

describe("arXiv Processing Pipeline", () => {
  let mockHTTP: ReturnType<typeof createMockHTTP>;

  beforeEach(() => {
    clearCache();
    clearFixtures();
    mockHTTP = createMockHTTP();
    (globalThis as any).Zotero = {
      HTTP: mockHTTP,
      HTTP_request: mockHTTP.request,
      Utilities: {
        cleanDOI: (d: string) => (d ? d.trim().toLowerCase() : d),
      },
      Date: {
        strToDate: (d: string) => ({ year: d?.match(/\d{4}/)?.[0] }),
      },
      ItemTypes: {
        getName: vi.fn((typeID: number) => {
          // Map type IDs to names
          const typeMap: Record<number, string> = {
            1: "journalArticle",
            2: "book",
            3: "conferencePaper",
            4: "preprint",
          };
          return typeMap[typeID] || "journalArticle";
        }),
        getID: vi.fn((name: string) => {
          // Map names to type IDs
          const idMap: Record<string, number> = {
            journalArticle: 1,
            book: 2,
            conferencePaper: 3,
            preprint: 4,
          };
          return idMap[name] || 1;
        }),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearFixtures();
  });

  describe("processArxivItem", () => {
    let processArxivItem: any;
    let mockIsArxivItem: ReturnType<typeof vi.fn>;
    let mockFindPublishedVersion: ReturnType<typeof vi.fn>;
    let mockUpdateItemAsPublishedVersion: ReturnType<typeof vi.fn>;
    let mockConvertToPreprint: ReturnType<typeof vi.fn>;
    let mockItemHasPDF: ReturnType<typeof vi.fn>;
    let mockDownloadPublishedVersion: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockIsArxivItem = vi.fn().mockReturnValue(true);
      mockFindPublishedVersion = vi.fn().mockResolvedValue(null);
      mockUpdateItemAsPublishedVersion = vi.fn().mockResolvedValue(undefined);
      mockConvertToPreprint = vi.fn().mockResolvedValue(undefined);
      mockItemHasPDF = vi.fn().mockResolvedValue(false);
      mockDownloadPublishedVersion = vi.fn().mockResolvedValue(undefined);

      processArxivItem = createZotadataMethod("processArxivItem", {
        isArxivItem: mockIsArxivItem,
        findPublishedVersion: mockFindPublishedVersion,
        updateItemAsPublishedVersion: mockUpdateItemAsPublishedVersion,
        convertToPreprint: mockConvertToPreprint,
        itemHasPDF: mockItemHasPDF,
        downloadPublishedVersion: mockDownloadPublishedVersion,
      });
    });

    it("should process arXiv item with published version found", async () => {
      mockFindPublishedVersion.mockResolvedValue("10.1000/published.doi");

      const item = createMockItem({
        title: "Test arXiv Paper",
        publicationTitle: "arXiv",
      });
      item.itemTypeID = 1; // journalArticle

      const result = await processArxivItem(item);

      expect(result.processed).toBe(true);
      expect(result.foundPublished).toBe(true);
      expect(result.converted).toBe(false);
      expect(mockFindPublishedVersion).toHaveBeenCalledWith(item);
      expect(mockUpdateItemAsPublishedVersion).toHaveBeenCalledWith(
        item,
        "10.1000/published.doi",
      );
      expect(mockConvertToPreprint).not.toHaveBeenCalled();
      expect(item.addTag).toHaveBeenCalledWith(
        "Updated to Published Version",
        1,
      );
    });

    it("should convert to preprint when no published version found", async () => {
      mockFindPublishedVersion.mockResolvedValue(null);

      const item = createMockItem({
        title: "Test arXiv Paper",
        publicationTitle: "arXiv",
      });
      item.itemTypeID = 1; // journalArticle

      const result = await processArxivItem(item);

      expect(result.processed).toBe(true);
      expect(result.foundPublished).toBe(false);
      expect(result.converted).toBe(true);
      expect(mockFindPublishedVersion).toHaveBeenCalledWith(item);
      expect(mockConvertToPreprint).toHaveBeenCalledWith(item);
      expect(mockUpdateItemAsPublishedVersion).not.toHaveBeenCalled();
    });

    it("should skip non-arXiv items", async () => {
      mockIsArxivItem.mockReturnValue(false);

      const item = createMockItem({
        title: "Regular Journal Article",
        publicationTitle: "Nature",
      });

      const result = await processArxivItem(item);

      expect(result.processed).toBe(false);
      expect(mockFindPublishedVersion).not.toHaveBeenCalled();
      expect(mockConvertToPreprint).not.toHaveBeenCalled();
    });

    it("should add error tag when processing fails", async () => {
      mockFindPublishedVersion.mockRejectedValue(new Error("Network error"));

      const item = createMockItem({
        title: "Test arXiv Paper",
        publicationTitle: "arXiv",
      });

      const result = await processArxivItem(item);

      expect(result.processed).toBe(false);
      expect(item.addTag).toHaveBeenCalledWith("arXiv Process Error", 1);
    });

    it("should not convert non-journalArticle items when no published version", async () => {
      mockFindPublishedVersion.mockResolvedValue(null);

      const item = createMockItem({
        title: "Test arXiv Paper",
        publicationTitle: "arXiv",
      });
      item.itemTypeID = 3; // conferencePaper

      const result = await processArxivItem(item);

      expect(result.processed).toBe(true);
      expect(result.converted).toBe(false);
      expect(mockConvertToPreprint).not.toHaveBeenCalled();
    });
  });

  describe("findPublishedVersion", () => {
    let findPublishedVersion: any;
    let mockExtractArxivId: ReturnType<typeof vi.fn>;
    let mockSearchCrossRefByArxivId: ReturnType<typeof vi.fn>;
    let mockSearchCrossRefForPublishedVersion: ReturnType<typeof vi.fn>;
    let mockSearchSemanticScholarForPublishedVersion: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockExtractArxivId = vi.fn().mockReturnValue(null);
      mockSearchCrossRefByArxivId = vi.fn().mockResolvedValue(null);
      mockSearchCrossRefForPublishedVersion = vi.fn().mockResolvedValue(null);
      mockSearchSemanticScholarForPublishedVersion = vi
        .fn()
        .mockResolvedValue(null);

      findPublishedVersion = createZotadataMethod("findPublishedVersion", {
        extractArxivId: mockExtractArxivId,
        searchCrossRefByArxivId: mockSearchCrossRefByArxivId,
        searchCrossRefForPublishedVersion:
          mockSearchCrossRefForPublishedVersion,
        searchSemanticScholarForPublishedVersion:
          mockSearchSemanticScholarForPublishedVersion,
      });
    });

    it("should find DOI via arXiv ID search", async () => {
      mockExtractArxivId.mockReturnValue("2301.12345");
      mockSearchCrossRefByArxivId.mockResolvedValue("10.1000/published.doi");

      const item = createMockItem({
        title: "Test Paper",
        extra: "arXiv:2301.12345",
      });

      const result = await findPublishedVersion(item);

      expect(result).toBe("10.1000/published.doi");
      expect(mockSearchCrossRefByArxivId).toHaveBeenCalledWith("2301.12345");
      // Should not call other strategies when arXiv ID search succeeds
      expect(mockSearchCrossRefForPublishedVersion).not.toHaveBeenCalled();
      expect(
        mockSearchSemanticScholarForPublishedVersion,
      ).not.toHaveBeenCalled();
    });

    it("should fallback to CrossRef title search when arXiv ID search fails", async () => {
      mockExtractArxivId.mockReturnValue("2301.12345");
      mockSearchCrossRefByArxivId.mockResolvedValue(null);
      mockSearchCrossRefForPublishedVersion.mockResolvedValue(
        "10.2000/title.doi",
      );

      const item = createMockItem({
        title: "Test Paper",
        extra: "arXiv:2301.12345",
      });

      const result = await findPublishedVersion(item);

      expect(result).toBe("10.2000/title.doi");
      expect(mockSearchCrossRefByArxivId).toHaveBeenCalledWith("2301.12345");
      expect(mockSearchCrossRefForPublishedVersion).toHaveBeenCalledWith(item);
      expect(
        mockSearchSemanticScholarForPublishedVersion,
      ).not.toHaveBeenCalled();
    });

    it("should fallback to Semantic Scholar when CrossRef title search fails", async () => {
      mockExtractArxivId.mockReturnValue(null);
      mockSearchCrossRefForPublishedVersion.mockResolvedValue(null);
      mockSearchSemanticScholarForPublishedVersion.mockResolvedValue(
        "10.3000/semantic.doi",
      );

      const item = createMockItem({
        title: "Test Paper",
      });

      const result = await findPublishedVersion(item);

      expect(result).toBe("10.3000/semantic.doi");
      expect(mockSearchCrossRefByArxivId).not.toHaveBeenCalled();
      expect(mockSearchCrossRefForPublishedVersion).toHaveBeenCalledWith(item);
      expect(mockSearchSemanticScholarForPublishedVersion).toHaveBeenCalledWith(
        item,
      );
    });

    it("should return null when all strategies fail", async () => {
      mockExtractArxivId.mockReturnValue("2301.12345");
      mockSearchCrossRefByArxivId.mockResolvedValue(null);
      mockSearchCrossRefForPublishedVersion.mockResolvedValue(null);
      mockSearchSemanticScholarForPublishedVersion.mockResolvedValue(null);

      const item = createMockItem({
        title: "Unknown Paper",
        extra: "arXiv:2301.12345",
      });

      const result = await findPublishedVersion(item);

      expect(result).toBe(null);
      expect(mockSearchCrossRefByArxivId).toHaveBeenCalledWith("2301.12345");
      expect(mockSearchCrossRefForPublishedVersion).toHaveBeenCalledWith(item);
      expect(mockSearchSemanticScholarForPublishedVersion).toHaveBeenCalledWith(
        item,
      );
    });

    it("should return null when item has no title", async () => {
      const item = createMockItem({
        title: "",
      });
      item.getField = vi.fn((fieldName: string) =>
        fieldName === "title" ? "" : "",
      );

      const result = await findPublishedVersion(item);

      expect(result).toBe(null);
      expect(mockSearchCrossRefByArxivId).not.toHaveBeenCalled();
    });

    it("should skip arXiv ID search when no arXiv ID is found", async () => {
      mockExtractArxivId.mockReturnValue(null);
      mockSearchCrossRefForPublishedVersion.mockResolvedValue(
        "10.1000/title.doi",
      );

      const item = createMockItem({
        title: "Test Paper",
      });

      const result = await findPublishedVersion(item);

      expect(result).toBe("10.1000/title.doi");
      expect(mockSearchCrossRefByArxivId).not.toHaveBeenCalled();
      expect(mockSearchCrossRefForPublishedVersion).toHaveBeenCalledWith(item);
    });
  });

  describe("convertToPreprint", () => {
    let convertToPreprint: any;

    beforeEach(() => {
      convertToPreprint = createZotadataMethod("convertToPreprint");
    });

    it("should change item type to preprint", async () => {
      const item = createMockItem({
        title: "Test Paper",
        publicationTitle: "Some Journal",
      });
      item.itemTypeID = 1; // journalArticle

      await convertToPreprint(item);

      expect(item.setType).toHaveBeenCalledWith(4); // preprint ID
    });

    it("should set repository field to arXiv when not present", async () => {
      const item = createMockItem({
        title: "Test Paper",
        publicationTitle: "Some Journal",
      });
      item.itemTypeID = 1;
      item.getField = vi.fn((fieldName: string) => {
        if (fieldName === "repository") return "";
        if (fieldName === "publicationTitle") return "Some Journal";
        return "";
      });

      await convertToPreprint(item);

      expect(item.setField).toHaveBeenCalledWith("repository", "arXiv");
    });

    it("should clear publicationTitle field", async () => {
      const item = createMockItem({
        title: "Test Paper",
        publicationTitle: "Some Journal",
      });
      item.itemTypeID = 1;

      await convertToPreprint(item);

      expect(item.setField).toHaveBeenCalledWith("publicationTitle", "");
    });

    it("should add Converted to Preprint tag", async () => {
      const item = createMockItem({
        title: "Test Paper",
        publicationTitle: "Some Journal",
      });
      item.itemTypeID = 1;

      await convertToPreprint(item);

      expect(item.addTag).toHaveBeenCalledWith("Converted to Preprint", 1);
    });

    it("should save the item", async () => {
      const item = createMockItem({
        title: "Test Paper",
        publicationTitle: "Some Journal",
      });
      item.itemTypeID = 1;

      await convertToPreprint(item);

      expect(item.saveTx).toHaveBeenCalled();
    });
  });

  describe("updateItemAsPublishedVersion", () => {
    let updateItemAsPublishedVersion: any;
    let mockFetchCrossRefMetadata: ReturnType<typeof vi.fn>;
    let mockUpdateItemWithMetadata: ReturnType<typeof vi.fn>;
    let mockUpdateAttachmentsForPublishedVersion: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetchCrossRefMetadata = vi.fn().mockResolvedValue({
        DOI: "10.1000/published.doi",
        title: ["Published Paper"],
        type: "journal-article",
      });
      mockUpdateItemWithMetadata = vi.fn().mockResolvedValue(undefined);
      mockUpdateAttachmentsForPublishedVersion = vi
        .fn()
        .mockResolvedValue(undefined);

      updateItemAsPublishedVersion = createZotadataMethod(
        "updateItemAsPublishedVersion",
        {
          fetchCrossRefMetadata: mockFetchCrossRefMetadata,
          updateItemWithMetadata: mockUpdateItemWithMetadata,
          updateAttachmentsForPublishedVersion:
            mockUpdateAttachmentsForPublishedVersion,
        },
      );
    });

    it("should convert to conferencePaper when VENUE format with conference venue", async () => {
      const item = createMockItem({
        title: "Test Paper",
      });
      item.itemTypeID = 1; // journalArticle

      await updateItemAsPublishedVersion(
        item,
        "VENUE:NeurIPS Conference|TITLE:Test Paper",
      );

      expect(item.setType).toHaveBeenCalledWith(3); // conferencePaper ID
      expect(item.setField).toHaveBeenCalledWith(
        "proceedingsTitle",
        "NeurIPS Conference",
      );
      expect(item.setField).toHaveBeenCalledWith("repository", "");
    });

    it("should convert to journalArticle when VENUE format with non-conference venue", async () => {
      const item = createMockItem({
        title: "Test Paper",
      });
      item.itemTypeID = 3; // conferencePaper
      item.getField = vi.fn((fieldName: string) => {
        if (fieldName === "repository") return "arXiv";
        return "";
      });

      await updateItemAsPublishedVersion(item, "VENUE:Nature|TITLE:Test Paper");

      expect(item.setType).toHaveBeenCalledWith(1); // journalArticle ID
      expect(item.setField).toHaveBeenCalledWith("publicationTitle", "Nature");
      expect(item.setField).toHaveBeenCalledWith("repository", "");
    });

    it("should handle DOI format and fetch CrossRef metadata", async () => {
      const item = createMockItem({
        title: "Test Paper",
      });
      item.itemTypeID = 4; // preprint

      await updateItemAsPublishedVersion(item, "10.1000/published.doi");

      expect(mockFetchCrossRefMetadata).toHaveBeenCalledWith(
        "10.1000/published.doi",
      );
      expect(item.setField).toHaveBeenCalledWith(
        "DOI",
        "10.1000/published.doi",
      );
      expect(item.setField).toHaveBeenCalledWith("repository", "");
      expect(mockUpdateItemWithMetadata).toHaveBeenCalledWith(
        item,
        expect.objectContaining({
          DOI: "10.1000/published.doi",
        }),
      );
    });

    it("should convert to conferencePaper for proceedings-article type", async () => {
      mockFetchCrossRefMetadata.mockResolvedValue({
        DOI: "10.1000/proceedings.doi",
        title: ["Conference Paper"],
        type: "proceedings-article",
      });

      const item = createMockItem({
        title: "Test Paper",
      });
      item.itemTypeID = 1; // journalArticle

      await updateItemAsPublishedVersion(item, "10.1000/proceedings.doi");

      expect(item.setType).toHaveBeenCalledWith(3); // conferencePaper ID
    });

    it("should handle error gracefully", async () => {
      mockFetchCrossRefMetadata.mockResolvedValue(null);

      const item = createMockItem({
        title: "Test Paper",
      });

      // Should not throw, just return early
      await updateItemAsPublishedVersion(item, "10.1000/invalid.doi");

      // Since metadata fetch failed, item should not be updated
      expect(item.setField).not.toHaveBeenCalledWith("DOI", expect.anything());
    });

    it("should call updateAttachmentsForPublishedVersion", async () => {
      const item = createMockItem({
        title: "Test Paper",
      });
      item.itemTypeID = 1;

      await updateItemAsPublishedVersion(item, "VENUE:Nature|TITLE:Test Paper");

      expect(mockUpdateAttachmentsForPublishedVersion).toHaveBeenCalledWith(
        item,
      );
    });

    it("should recognize ICML as conference venue", async () => {
      const item = createMockItem({
        title: "Test Paper",
      });
      item.itemTypeID = 1;

      await updateItemAsPublishedVersion(
        item,
        "VENUE:ICML 2024|TITLE:Test Paper",
      );

      expect(item.setType).toHaveBeenCalledWith(3); // conferencePaper
    });

    it("should recognize ICLR as conference venue", async () => {
      const item = createMockItem({
        title: "Test Paper",
      });
      item.itemTypeID = 1;

      await updateItemAsPublishedVersion(
        item,
        "VENUE:ICLR 2024|TITLE:Test Paper",
      );

      expect(item.setType).toHaveBeenCalledWith(3); // conferencePaper
    });

    it("should recognize PROCEEDINGS in venue name", async () => {
      const item = createMockItem({
        title: "Test Paper",
      });
      item.itemTypeID = 1;

      await updateItemAsPublishedVersion(
        item,
        "VENUE:Conference Proceedings|TITLE:Test Paper",
      );

      expect(item.setType).toHaveBeenCalledWith(3); // conferencePaper
    });
  });

  describe("searchSemanticScholarForPublishedVersion", () => {
    let searchSemanticScholarForPublishedVersion: any;
    let mockSearchSemanticScholarExactPublished: ReturnType<typeof vi.fn>;
    let mockSearchSemanticScholarRelaxedPublished: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSearchSemanticScholarExactPublished = vi.fn().mockResolvedValue(null);
      mockSearchSemanticScholarRelaxedPublished = vi
        .fn()
        .mockResolvedValue(null);

      searchSemanticScholarForPublishedVersion = createZotadataMethod(
        "searchSemanticScholarForPublishedVersion",
        {
          searchSemanticScholarExactPublished:
            mockSearchSemanticScholarExactPublished,
          searchSemanticScholarRelaxedPublished:
            mockSearchSemanticScholarRelaxedPublished,
        },
      );
    });

    it("should find DOI via exact search", async () => {
      mockSearchSemanticScholarExactPublished.mockResolvedValue(
        "10.1000/exact.doi",
      );

      const item = createMockItem({
        title: "Test Paper",
        creators: [{ lastName: "Smith", firstName: "John" }],
      });

      const result = await searchSemanticScholarForPublishedVersion(item);

      expect(result).toBe("10.1000/exact.doi");
      expect(mockSearchSemanticScholarExactPublished).toHaveBeenCalledWith(
        item,
        "Test Paper",
      );
      expect(mockSearchSemanticScholarRelaxedPublished).not.toHaveBeenCalled();
    });

    it("should fallback to relaxed search when exact search fails", async () => {
      mockSearchSemanticScholarExactPublished.mockResolvedValue(null);
      mockSearchSemanticScholarRelaxedPublished.mockResolvedValue(
        "10.2000/relaxed.doi",
      );

      const item = createMockItem({
        title: "Test Paper",
      });

      const result = await searchSemanticScholarForPublishedVersion(item);

      expect(result).toBe("10.2000/relaxed.doi");
      expect(mockSearchSemanticScholarExactPublished).toHaveBeenCalledWith(
        item,
        "Test Paper",
      );
      expect(mockSearchSemanticScholarRelaxedPublished).toHaveBeenCalledWith(
        item,
        "Test Paper",
      );
    });

    it("should return null when both searches fail", async () => {
      mockSearchSemanticScholarExactPublished.mockResolvedValue(null);
      mockSearchSemanticScholarRelaxedPublished.mockResolvedValue(null);

      const item = createMockItem({
        title: "Unknown Paper",
      });

      const result = await searchSemanticScholarForPublishedVersion(item);

      expect(result).toBe(null);
      expect(mockSearchSemanticScholarExactPublished).toHaveBeenCalled();
      expect(mockSearchSemanticScholarRelaxedPublished).toHaveBeenCalled();
    });

    it("should return null when item has no title", async () => {
      const item = createMockItem({
        title: "",
      });
      item.getField = vi.fn((fieldName: string) =>
        fieldName === "title" ? "" : "",
      );

      const result = await searchSemanticScholarForPublishedVersion(item);

      expect(result).toBe(null);
      expect(mockSearchSemanticScholarExactPublished).not.toHaveBeenCalled();
    });
  });

  describe("searchSemanticScholarExactPublished (integration)", () => {
    let searchSemanticScholarExactPublished: any;

    beforeEach(() => {
      searchSemanticScholarExactPublished = createZotadataMethod(
        "searchSemanticScholarExactPublished",
        {
          titleSimilarity: createZotadataMethod("titleSimilarity"),
        },
      );
    });

    it("should exclude arXiv venue from results", async () => {
      registerFixture(
        "api.semanticscholar.org",
        semanticscholarFixtures.arxivPaper,
      );

      const item = createMockItem({
        title: "arXiv Paper",
      });

      const result = await searchSemanticScholarExactPublished(
        item,
        "arXiv Paper",
      );

      expect(result).toBe(null);
    });

    it("should find published version with high similarity threshold", async () => {
      registerFixture(
        "api.semanticscholar.org",
        semanticscholarFixtures.publishedVersion,
      );

      const item = createMockItem({
        title: "Published Version",
      });

      const result = await searchSemanticScholarExactPublished(
        item,
        "Published Version",
      );

      expect(result).toBe("10.1000/published.doi");
    });

    it("should return null for no results", async () => {
      registerFixture(
        "api.semanticscholar.org",
        semanticscholarFixtures.noResults,
      );

      const item = createMockItem({
        title: "Nonexistent Paper",
      });

      const result = await searchSemanticScholarExactPublished(
        item,
        "Nonexistent Paper",
      );

      expect(result).toBe(null);
    });

    it("should extract DOI from externalIds", async () => {
      registerFixture(
        "api.semanticscholar.org",
        semanticscholarFixtures.singlePaper,
      );

      const item = createMockItem({
        title: "Test Paper Title",
      });

      const result = await searchSemanticScholarExactPublished(
        item,
        "Test Paper Title",
      );

      expect(result).toBe("10.1000/test.doi");
    });

    it("should return VENUE format for papers without DOI", async () => {
      const venueOnlyFixture = {
        status: 200,
        responseText: JSON.stringify({
          data: [
            {
              paperId: "venue123",
              title: "Conference Paper Without DOI",
              venue: "NeurIPS 2024",
              externalIds: {},
            },
          ],
        }),
        getResponseHeader: () => null,
      };
      registerFixture("api.semanticscholar.org", venueOnlyFixture);

      const item = createMockItem({
        title: "Conference Paper Without DOI",
      });

      const result = await searchSemanticScholarExactPublished(
        item,
        "Conference Paper Without DOI",
      );

      expect(result).toBe(
        "VENUE:NeurIPS 2024|TITLE:Conference Paper Without DOI",
      );
    });
  });

  describe("searchSemanticScholarRelaxedPublished (integration)", () => {
    let searchSemanticScholarRelaxedPublished: any;

    beforeEach(() => {
      searchSemanticScholarRelaxedPublished = createZotadataMethod(
        "searchSemanticScholarRelaxedPublished",
        {
          titleSimilarity: createZotadataMethod("titleSimilarity"),
        },
      );
    });

    it("should exclude arXiv venue from results", async () => {
      registerFixture(
        "api.semanticscholar.org",
        semanticscholarFixtures.arxivPaper,
      );

      const item = createMockItem({
        title: "arXiv Paper",
      });

      const result = await searchSemanticScholarRelaxedPublished(
        item,
        "arXiv Paper",
      );

      expect(result).toBe(null);
    });

    it("should find published version with 0.9 similarity threshold", async () => {
      registerFixture(
        "api.semanticscholar.org",
        semanticscholarFixtures.publishedVersion,
      );

      const item = createMockItem({
        title: "Published Version",
      });

      const result = await searchSemanticScholarRelaxedPublished(
        item,
        "Published Version",
      );

      expect(result).toBe("10.1000/published.doi");
    });

    it("should clean title for better matching", async () => {
      // Use a title that will match with high similarity after cleaning
      const matchingFixture = {
        status: 200,
        responseText: JSON.stringify({
          data: [
            {
              paperId: "match123",
              title: "Test Paper Title: A Study", // Matches exactly
              venue: "Nature",
              externalIds: { DOI: "10.1000/matching.doi" },
            },
          ],
        }),
        getResponseHeader: () => null,
      };
      registerFixture("api.semanticscholar.org", matchingFixture);

      const item = createMockItem({
        title: "Test Paper Title: A Study",
      });

      // The relaxed search cleans the title before searching
      const result = await searchSemanticScholarRelaxedPublished(
        item,
        "Test Paper Title: A Study",
      );

      // Should find a match due to relaxed matching
      expect(result).toBe("10.1000/matching.doi");
    });
  });
});
