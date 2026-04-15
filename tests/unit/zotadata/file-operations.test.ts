// tests/unit/zotadata/file-operations.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createZotadataMethod,
  clearCache,
} from "../../helpers/extract-function";
import {
  createMockItem,
  createMockAttachment,
  resetMockCounters,
} from "../../__mocks__/zotero-items";
import {
  createMockHTTP,
  registerFixture,
  clearFixtures,
} from "../../__mocks__/zotero-http";
import { unpaywallFixtures } from "../../__mocks__/fixtures/unpaywall";
import { coreFixtures } from "../../__mocks__/fixtures/core";

describe("File Operations", () => {
  let mockHTTP: ReturnType<typeof createMockHTTP>;

  beforeEach(() => {
    clearCache();
    clearFixtures();
    resetMockCounters();
    mockHTTP = createMockHTTP();
    (globalThis as any).Zotero = {
      HTTP: mockHTTP,
      HTTP_request: mockHTTP.request,
      Items: {
        get: vi.fn(),
      },
      Attachments: {
        LINK_MODE_IMPORTED_FILE: 0,
        LINK_MODE_IMPORTED_URL: 1,
        LINK_MODE_LINKED_FILE: 2,
        LINK_MODE_LINKED_URL: 3,
      },
      ItemTypes: {
        getName: vi.fn((typeId: number) => {
          if (typeId === 1) return "journalArticle";
          if (typeId === 2) return "book";
          return "journalArticle";
        }),
      },
      Utilities: {
        cleanDOI: (d: string) => (d ? d.trim().toLowerCase() : d),
        cleanISBN: (i: string) => (i ? i.replace(/[-\s]/g, "") : i),
      },
      Prefs: {
        get: vi.fn(() => "test@example.com"),
        set: vi.fn(),
        clear: vi.fn(),
      },
      getMainWindow: vi.fn(() => ({
        prompt: vi.fn(() => "test@example.com"),
        alert: vi.fn(),
      })),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearFixtures();
  });

  describe("itemHasPDF", () => {
    let itemHasPDF: (item: any) => Promise<boolean>;

    beforeEach(() => {
      itemHasPDF = createZotadataMethod("itemHasPDF");
    });

    it("should return true when item has valid PDF attachment", async () => {
      const mockAttachment = {
        id: 100,
        isPDFAttachment: vi.fn(() => true),
        getFile: vi.fn(() => ({ exists: () => true })),
      };

      const item = createMockItem({ title: "Test Paper" });
      item.getAttachments = vi.fn(() => [100]);
      (Zotero.Items.get as ReturnType<typeof vi.fn>).mockReturnValue(
        mockAttachment,
      );

      const result = await itemHasPDF(item);

      expect(result).toBe(true);
      expect(item.getAttachments).toHaveBeenCalled();
      expect(mockAttachment.isPDFAttachment).toHaveBeenCalled();
    });

    it("should return false when item has non-PDF attachment", async () => {
      const mockAttachment = {
        id: 100,
        isPDFAttachment: vi.fn(() => false),
        getFile: vi.fn(() => ({ exists: () => true })),
      };

      const item = createMockItem({ title: "Test Paper" });
      item.getAttachments = vi.fn(() => [100]);
      (Zotero.Items.get as ReturnType<typeof vi.fn>).mockReturnValue(
        mockAttachment,
      );

      const result = await itemHasPDF(item);

      expect(result).toBe(false);
    });

    it("should return false when PDF file does not exist", async () => {
      const mockAttachment = {
        id: 100,
        isPDFAttachment: vi.fn(() => true),
        getFile: vi.fn(() => ({ exists: () => false })),
      };

      const item = createMockItem({ title: "Test Paper" });
      item.getAttachments = vi.fn(() => [100]);
      (Zotero.Items.get as ReturnType<typeof vi.fn>).mockReturnValue(
        mockAttachment,
      );

      const result = await itemHasPDF(item);

      expect(result).toBe(false);
    });

    it("should return false when getFile throws error", async () => {
      const mockAttachment = {
        id: 100,
        isPDFAttachment: vi.fn(() => true),
        getFile: vi.fn(() => {
          throw new Error("File not found");
        }),
      };

      const item = createMockItem({ title: "Test Paper" });
      item.getAttachments = vi.fn(() => [100]);
      (Zotero.Items.get as ReturnType<typeof vi.fn>).mockReturnValue(
        mockAttachment,
      );

      const result = await itemHasPDF(item);

      expect(result).toBe(false);
    });

    it("should return false when item has no attachments", async () => {
      const item = createMockItem({ title: "Test Paper" });
      item.getAttachments = vi.fn(() => []);

      const result = await itemHasPDF(item);

      expect(result).toBe(false);
    });

    it("should check multiple attachments and find PDF", async () => {
      const mockNonPDF = {
        id: 100,
        isPDFAttachment: vi.fn(() => false),
        getFile: vi.fn(() => ({ exists: () => true })),
      };
      const mockPDF = {
        id: 101,
        isPDFAttachment: vi.fn(() => true),
        getFile: vi.fn(() => ({ exists: () => true })),
      };

      const item = createMockItem({ title: "Test Paper" });
      item.getAttachments = vi.fn(() => [100, 101]);
      (Zotero.Items.get as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(mockNonPDF)
        .mockReturnValueOnce(mockPDF);

      const result = await itemHasPDF(item);

      expect(result).toBe(true);
    });
  });

  describe("verifyStoredAttachment", () => {
    let verifyStoredAttachment: (attachment: any) => boolean;

    beforeEach(() => {
      verifyStoredAttachment = createZotadataMethod("verifyStoredAttachment");
    });

    it("should return true for stored file with existing file", () => {
      const attachment = createMockAttachment({
        linkMode: 0, // LINK_MODE_IMPORTED_FILE
        filePath: "/path/to/file.pdf",
        fileExists: true,
      });
      attachment.getField = vi.fn(() => "Test PDF");

      const result = verifyStoredAttachment(attachment);

      expect(result).toBe(true);
    });

    it("should return true for imported URL attachment", () => {
      const attachment = createMockAttachment({
        linkMode: 1, // LINK_MODE_IMPORTED_URL
        filePath: "/path/to/file.pdf",
        fileExists: true,
      });
      attachment.getField = vi.fn(() => "Test PDF");

      const result = verifyStoredAttachment(attachment);

      expect(result).toBe(true);
    });

    it("should return false for linked file (not stored)", () => {
      const attachment = createMockAttachment({
        linkMode: 2, // LINK_MODE_LINKED_FILE
        filePath: "/path/to/file.pdf",
        fileExists: true,
      });
      attachment.getField = vi.fn(() => "Test PDF");

      const result = verifyStoredAttachment(attachment);

      expect(result).toBe(false);
    });

    it("should return false for URL link (not stored)", () => {
      const attachment = createMockAttachment({
        linkMode: 3, // LINK_MODE_LINKED_URL
        filePath: null,
        fileExists: false,
      });
      attachment.getField = vi.fn(() => "Test URL");

      const result = verifyStoredAttachment(attachment);

      expect(result).toBe(false);
    });

    it("should return false when file does not exist", () => {
      const attachment = createMockAttachment({
        linkMode: 0, // LINK_MODE_IMPORTED_FILE
        filePath: "/path/to/file.pdf",
        fileExists: false,
      });
      attachment.getField = vi.fn(() => "Test PDF");

      const result = verifyStoredAttachment(attachment);

      expect(result).toBe(false);
    });

    it("should return false for null attachment", () => {
      const result = verifyStoredAttachment(null);

      expect(result).toBe(false);
    });

    it("should return false for undefined attachment", () => {
      const result = verifyStoredAttachment(undefined);

      expect(result).toBe(false);
    });
  });

  describe("findUnpaywallPDF", () => {
    let findUnpaywallPDF: (doi: string) => Promise<string | null>;

    beforeEach(() => {
      findUnpaywallPDF = createZotadataMethod("findUnpaywallPDF", {
        getConfiguredEmail: () => "test@example.com",
      });
    });

    it("should return PDF URL when open access PDF found", async () => {
      registerFixture("api.unpaywall.org", unpaywallFixtures.openAccessPDF);

      const result = await findUnpaywallPDF("10.1000/test.doi");

      expect(result).toBe("https://example.com/paper.pdf");
    });

    it("should return null when no open access available", async () => {
      registerFixture("api.unpaywall.org", unpaywallFixtures.noOpenAccess);

      const result = await findUnpaywallPDF("10.1000/test.doi");

      expect(result).toBe(null);
    });

    it("should return null when no PDF URL in response", async () => {
      registerFixture("api.unpaywall.org", unpaywallFixtures.noPDFURL);

      const result = await findUnpaywallPDF("10.1000/test.doi");

      expect(result).toBe(null);
    });

    it("should return null when email is not configured", async () => {
      findUnpaywallPDF = createZotadataMethod("findUnpaywallPDF", {
        getConfiguredEmail: () => null,
      });

      const result = await findUnpaywallPDF("10.1000/test.doi");

      expect(result).toBe(null);
    });

    it("should handle HTTP errors gracefully", async () => {
      registerFixture("api.unpaywall.org", unpaywallFixtures.serverError);

      const result = await findUnpaywallPDF("10.1000/test.doi");

      expect(result).toBe(null);
    });

    it("should handle 404 not found gracefully", async () => {
      registerFixture("api.unpaywall.org", unpaywallFixtures.notFound);

      const result = await findUnpaywallPDF("10.1000/nonexistent.doi");

      expect(result).toBe(null);
    });
  });

  describe("findCorePDFByDOI", () => {
    let findCorePDFByDOI: (doi: string) => Promise<string | null>;

    beforeEach(() => {
      findCorePDFByDOI = createZotadataMethod("findCorePDFByDOI");
    });

    it("should return PDF URL when found with downloadUrl", async () => {
      registerFixture("api.core.ac.uk", coreFixtures.pdfFound);

      const result = await findCorePDFByDOI("10.1000/test.doi");

      expect(result).toBe("https://core.ac.uk/download/pdf/12345.pdf");
    });

    it("should return first valid PDF URL from multiple results", async () => {
      registerFixture("api.core.ac.uk", coreFixtures.multipleResults);

      const result = await findCorePDFByDOI("10.1000/test.doi");

      expect(result).toBe("https://core.ac.uk/download/pdf/22222.pdf");
    });

    it("should return null when no results found", async () => {
      registerFixture("api.core.ac.uk", coreFixtures.noResults);

      const result = await findCorePDFByDOI("10.1000/test.doi");

      expect(result).toBe(null);
    });

    it("should return null when downloadUrl is null", async () => {
      registerFixture("api.core.ac.uk", coreFixtures.noDownloadUrl);

      const result = await findCorePDFByDOI("10.1000/test.doi");

      expect(result).toBe(null);
    });

    it("should return null when URL is not a PDF", async () => {
      registerFixture("api.core.ac.uk", coreFixtures.nonPdfUrl);

      const result = await findCorePDFByDOI("10.1000/test.doi");

      expect(result).toBe(null);
    });

    it("should handle HTTP errors gracefully", async () => {
      registerFixture("api.core.ac.uk", coreFixtures.serverError);

      const result = await findCorePDFByDOI("10.1000/test.doi");

      expect(result).toBe(null);
    });
  });

  describe("findArxivPDF", () => {
    it("should return arXiv PDF URL when arXiv ID is found", async () => {
      const mockExtractArxivId = vi.fn(() => "2301.12345");
      const findArxivPDF = createZotadataMethod("findArxivPDF", {
        extractArxivId: mockExtractArxivId,
        titleSimilarity: createZotadataMethod("titleSimilarity"),
        searchArxiv: vi.fn().mockResolvedValue(null),
      });

      const item = createMockItem({
        title: "Test arXiv Paper",
        extra: "arXiv:2301.12345",
      });

      const result = await findArxivPDF(item);

      expect(result).toBe("http://arxiv.org/pdf/2301.12345.pdf");
    });

    it("should search arXiv by title when no arXiv ID", async () => {
      const mockExtractArxivId = vi.fn(() => null);
      const mockSearchArxiv = vi.fn().mockResolvedValue("2301.99999");
      const findArxivPDF = createZotadataMethod("findArxivPDF", {
        extractArxivId: mockExtractArxivId,
        titleSimilarity: createZotadataMethod("titleSimilarity"),
        searchArxiv: mockSearchArxiv,
      });

      const item = createMockItem({ title: "Test Paper" });

      const result = await findArxivPDF(item);

      expect(result).toBe("http://arxiv.org/pdf/2301.99999.pdf");
      expect(mockSearchArxiv).toHaveBeenCalledWith("Test Paper");
    });

    it("should return null when no arXiv ID and search fails", async () => {
      const mockExtractArxivId = vi.fn(() => null);
      const mockSearchArxiv = vi.fn().mockResolvedValue(null);
      const findArxivPDF = createZotadataMethod("findArxivPDF", {
        extractArxivId: mockExtractArxivId,
        titleSimilarity: createZotadataMethod("titleSimilarity"),
        searchArxiv: mockSearchArxiv,
      });

      const item = createMockItem({ title: "Test Paper" });

      const result = await findArxivPDF(item);

      expect(result).toBe(null);
    });

    it("should return null when item has no title", async () => {
      const mockExtractArxivId = vi.fn(() => null);
      const findArxivPDF = createZotadataMethod("findArxivPDF", {
        extractArxivId: mockExtractArxivId,
        titleSimilarity: createZotadataMethod("titleSimilarity"),
        searchArxiv: vi.fn().mockResolvedValue(null),
      });

      const item = createMockItem({ title: "" });
      item.getField = vi.fn((field: string) => (field === "title" ? "" : ""));

      const result = await findArxivPDF(item);

      expect(result).toBe(null);
    });

    it("should handle errors gracefully", async () => {
      const mockExtractArxivId = vi.fn(() => {
        throw new Error("Extraction error");
      });
      const findArxivPDF = createZotadataMethod("findArxivPDF", {
        extractArxivId: mockExtractArxivId,
        titleSimilarity: createZotadataMethod("titleSimilarity"),
        searchArxiv: vi.fn().mockResolvedValue(null),
      });

      const item = createMockItem({ title: "Test Paper" });

      const result = await findArxivPDF(item);

      expect(result).toBe(null);
    });
  });

  describe("findPublishedPDF", () => {
    it("should return URL from Unpaywall when found", async () => {
      const mockFindUnpaywallPDF = vi
        .fn()
        .mockResolvedValue("https://unpaywall.com/paper.pdf");
      const mockFindCorePDFByDOI = vi.fn().mockResolvedValue(null);
      const findPublishedPDF = createZotadataMethod("findPublishedPDF", {
        findUnpaywallPDF: mockFindUnpaywallPDF,
        findCorePDFByDOI: mockFindCorePDFByDOI,
      });

      const result = await findPublishedPDF("10.1000/test.doi");

      expect(result).toBe("https://unpaywall.com/paper.pdf");
      expect(mockFindUnpaywallPDF).toHaveBeenCalledWith("10.1000/test.doi");
      expect(mockFindCorePDFByDOI).not.toHaveBeenCalled();
    });

    it("should fallback to CORE when Unpaywall returns null", async () => {
      const mockFindUnpaywallPDF = vi.fn().mockResolvedValue(null);
      const mockFindCorePDFByDOI = vi
        .fn()
        .mockResolvedValue("https://core.ac.uk/download/pdf/123.pdf");
      const findPublishedPDF = createZotadataMethod("findPublishedPDF", {
        findUnpaywallPDF: mockFindUnpaywallPDF,
        findCorePDFByDOI: mockFindCorePDFByDOI,
      });

      const result = await findPublishedPDF("10.1000/test.doi");

      expect(result).toBe("https://core.ac.uk/download/pdf/123.pdf");
      expect(mockFindUnpaywallPDF).toHaveBeenCalledWith("10.1000/test.doi");
      expect(mockFindCorePDFByDOI).toHaveBeenCalledWith("10.1000/test.doi");
    });

    it("should return null when both Unpaywall and CORE return null", async () => {
      const mockFindUnpaywallPDF = vi.fn().mockResolvedValue(null);
      const mockFindCorePDFByDOI = vi.fn().mockResolvedValue(null);
      const findPublishedPDF = createZotadataMethod("findPublishedPDF", {
        findUnpaywallPDF: mockFindUnpaywallPDF,
        findCorePDFByDOI: mockFindCorePDFByDOI,
      });

      const result = await findPublishedPDF("10.1000/test.doi");

      expect(result).toBe(null);
    });
  });

  describe("findFileForItem", () => {
    it("should find PDF via Unpaywall for article with DOI", async () => {
      const mockFindUnpaywallPDF = vi
        .fn()
        .mockResolvedValue("https://example.com/paper.pdf");
      const mockFindCorePDFByDOI = vi.fn().mockResolvedValue(null);
      const mockFindArxivPDF = vi.fn().mockResolvedValue(null);

      const findFileForItem = createZotadataMethod("findFileForItem", {
        extractDOI: vi.fn().mockReturnValue("10.1000/test.doi"),
        extractISBN: vi.fn().mockReturnValue(null),
        extractArxivId: vi.fn().mockReturnValue(null),
        findUnpaywallPDF: mockFindUnpaywallPDF,
        findCorePDFByDOI: mockFindCorePDFByDOI,
        findArxivPDF: mockFindArxivPDF,
        findLibGenPDF: vi.fn().mockResolvedValue(null),
        tryCustomResolvers: vi
          .fn()
          .mockResolvedValue({ url: null, source: null }),
        findInternetArchiveBook: vi.fn().mockResolvedValue(null),
        findOpenLibraryPDF: vi.fn().mockResolvedValue(null),
        findGoogleBooksFullText: vi.fn().mockResolvedValue(null),
        titleSimilarity: createZotadataMethod("titleSimilarity"),
      });

      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1000/test.doi",
      });
      item.itemTypeID = 1; // journalArticle

      const result = await findFileForItem(item);

      expect(result).toEqual({
        url: "https://example.com/paper.pdf",
        source: "Unpaywall",
      });
    });

    it("should find PDF via arXiv for article without DOI", async () => {
      const mockFindArxivPDF = vi
        .fn()
        .mockResolvedValue("http://arxiv.org/pdf/2301.12345.pdf");

      const findFileForItem = createZotadataMethod("findFileForItem", {
        extractDOI: vi.fn().mockReturnValue(null),
        extractISBN: vi.fn().mockReturnValue(null),
        extractArxivId: vi.fn().mockReturnValue(null),
        findUnpaywallPDF: vi.fn().mockResolvedValue(null),
        findCorePDFByDOI: vi.fn().mockResolvedValue(null),
        findArxivPDF: mockFindArxivPDF,
        findLibGenPDF: vi.fn().mockResolvedValue(null),
        tryCustomResolvers: vi
          .fn()
          .mockResolvedValue({ url: null, source: null }),
        findInternetArchiveBook: vi.fn().mockResolvedValue(null),
        findOpenLibraryPDF: vi.fn().mockResolvedValue(null),
        findGoogleBooksFullText: vi.fn().mockResolvedValue(null),
        titleSimilarity: createZotadataMethod("titleSimilarity"),
      });

      const item = createMockItem({ title: "Test arXiv Paper" });
      item.itemTypeID = 1; // journalArticle

      const result = await findFileForItem(item);

      expect(result).toEqual({
        url: "http://arxiv.org/pdf/2301.12345.pdf",
        source: "arXiv",
      });
    });

    it("should find PDF via CORE when Unpaywall fails", async () => {
      const mockFindUnpaywallPDF = vi.fn().mockResolvedValue(null);
      const mockFindCorePDFByDOI = vi
        .fn()
        .mockResolvedValue("https://core.ac.uk/download/pdf/123.pdf");

      const findFileForItem = createZotadataMethod("findFileForItem", {
        extractDOI: vi.fn().mockReturnValue("10.1000/test.doi"),
        extractISBN: vi.fn().mockReturnValue(null),
        extractArxivId: vi.fn().mockReturnValue(null),
        findUnpaywallPDF: mockFindUnpaywallPDF,
        findCorePDFByDOI: mockFindCorePDFByDOI,
        findArxivPDF: vi.fn().mockResolvedValue(null),
        findLibGenPDF: vi.fn().mockResolvedValue(null),
        tryCustomResolvers: vi
          .fn()
          .mockResolvedValue({ url: null, source: null }),
        findInternetArchiveBook: vi.fn().mockResolvedValue(null),
        findOpenLibraryPDF: vi.fn().mockResolvedValue(null),
        findGoogleBooksFullText: vi.fn().mockResolvedValue(null),
        titleSimilarity: createZotadataMethod("titleSimilarity"),
      });

      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1000/test.doi",
      });
      item.itemTypeID = 1; // journalArticle

      const result = await findFileForItem(item);

      expect(result).toEqual({
        url: "https://core.ac.uk/download/pdf/123.pdf",
        source: "CORE",
      });
    });

    it("should return null when no sources find PDF", async () => {
      const findFileForItem = createZotadataMethod("findFileForItem", {
        extractDOI: vi.fn().mockReturnValue("10.1000/test.doi"),
        extractISBN: vi.fn().mockReturnValue(null),
        extractArxivId: vi.fn().mockReturnValue(null),
        findUnpaywallPDF: vi.fn().mockResolvedValue(null),
        findCorePDFByDOI: vi.fn().mockResolvedValue(null),
        findArxivPDF: vi.fn().mockResolvedValue(null),
        findLibGenPDF: vi.fn().mockResolvedValue(null),
        tryCustomResolvers: vi
          .fn()
          .mockResolvedValue({ url: null, source: null }),
        findInternetArchiveBook: vi.fn().mockResolvedValue(null),
        findOpenLibraryPDF: vi.fn().mockResolvedValue(null),
        findGoogleBooksFullText: vi.fn().mockResolvedValue(null),
        titleSimilarity: createZotadataMethod("titleSimilarity"),
      });

      const item = createMockItem({ title: "Unknown Paper" });
      item.itemTypeID = 1; // journalArticle

      const result = await findFileForItem(item);

      expect(result).toEqual({
        url: null,
        source: null,
      });
    });

    it("should use book-specific strategy for books", async () => {
      const mockFindInternetArchiveBook = vi
        .fn()
        .mockResolvedValue("https://archive.org/book.pdf");

      const findFileForItem = createZotadataMethod("findFileForItem", {
        extractDOI: vi.fn().mockReturnValue(null),
        extractISBN: vi.fn().mockReturnValue("978-0-123456-78-9"),
        extractArxivId: vi.fn().mockReturnValue(null),
        findUnpaywallPDF: vi.fn().mockResolvedValue(null),
        findCorePDFByDOI: vi.fn().mockResolvedValue(null),
        findArxivPDF: vi.fn().mockResolvedValue(null),
        findLibGenPDF: vi.fn().mockResolvedValue(null),
        tryCustomResolvers: vi
          .fn()
          .mockResolvedValue({ url: null, source: null }),
        findInternetArchiveBook: mockFindInternetArchiveBook,
        findOpenLibraryPDF: vi.fn().mockResolvedValue(null),
        findGoogleBooksFullText: vi.fn().mockResolvedValue(null),
        titleSimilarity: createZotadataMethod("titleSimilarity"),
      });

      const item = createMockItem({ title: "Test Book" });
      item.itemTypeID = 2; // book

      const result = await findFileForItem(item);

      expect(result).toEqual({
        url: "https://archive.org/book.pdf",
        source: "Internet Archive",
      });
    });

    it("should handle errors gracefully", async () => {
      const mockFindUnpaywallPDF = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));

      const findFileForItem = createZotadataMethod("findFileForItem", {
        extractDOI: vi.fn().mockReturnValue("10.1000/test.doi"),
        extractISBN: vi.fn().mockReturnValue(null),
        extractArxivId: vi.fn().mockReturnValue(null),
        findUnpaywallPDF: mockFindUnpaywallPDF,
        findCorePDFByDOI: vi.fn().mockResolvedValue(null),
        findArxivPDF: vi.fn().mockResolvedValue(null),
        findLibGenPDF: vi.fn().mockResolvedValue(null),
        tryCustomResolvers: vi
          .fn()
          .mockResolvedValue({ url: null, source: null }),
        findInternetArchiveBook: vi.fn().mockResolvedValue(null),
        findOpenLibraryPDF: vi.fn().mockResolvedValue(null),
        findGoogleBooksFullText: vi.fn().mockResolvedValue(null),
        titleSimilarity: createZotadataMethod("titleSimilarity"),
      });

      const item = createMockItem({ title: "Test Paper" });
      item.itemTypeID = 1; // journalArticle

      const result = await findFileForItem(item);

      expect(result).toEqual({
        url: null,
        source: null,
      });
    });
  });
});
