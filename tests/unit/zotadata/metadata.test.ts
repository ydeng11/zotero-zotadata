// tests/unit/zotadata/metadata.test.ts
// Tests for metadata pipeline functions in zotadata.js

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createZotadataMethod,
  clearCache,
} from "../../helpers/extract-function";
import { createMockItem } from "../../__mocks__/zotero-items";
import { setupTranslateMock } from "../../__mocks__/zotero-translate";

describe("Metadata Pipeline Functions", () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchDOIBasedMetadata", () => {
    let fetchDOIBasedMetadata: (item: any) => Promise<any>;
    let mockExtractDOI: ReturnType<typeof vi.fn>;
    let mockDiscoverDOI: ReturnType<typeof vi.fn>;
    let mockFetchDOIMetadataViaTranslator: ReturnType<typeof vi.fn>;
    let mockFetchCrossRefMetadata: ReturnType<typeof vi.fn>;
    let mockUpdateItemWithMetadata: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockExtractDOI = vi.fn().mockReturnValue(null);
      mockDiscoverDOI = vi.fn().mockResolvedValue(null);
      mockFetchDOIMetadataViaTranslator = vi.fn().mockResolvedValue(false);
      mockFetchCrossRefMetadata = vi.fn().mockResolvedValue(null);
      mockUpdateItemWithMetadata = vi.fn().mockResolvedValue(undefined);

      fetchDOIBasedMetadata = createZotadataMethod("fetchDOIBasedMetadata", {
        extractDOI: mockExtractDOI,
        discoverDOI: mockDiscoverDOI,
        fetchDOIMetadataViaTranslator: mockFetchDOIMetadataViaTranslator,
        fetchCrossRefMetadata: mockFetchCrossRefMetadata,
        updateItemWithMetadata: mockUpdateItemWithMetadata,
      });
    });

    it("should use existing DOI when present", async () => {
      mockExtractDOI.mockReturnValue("10.1000/existing.doi");
      mockFetchDOIMetadataViaTranslator.mockResolvedValue(true);

      const item = createMockItem({ DOI: "10.1000/existing.doi" });
      const result = await fetchDOIBasedMetadata(item);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(mockExtractDOI).toHaveBeenCalledWith(item);
      expect(mockDiscoverDOI).not.toHaveBeenCalled();
      expect(mockFetchDOIMetadataViaTranslator).toHaveBeenCalledWith(
        "10.1000/existing.doi",
        item,
      );
    });

    it("should discover DOI when not present", async () => {
      mockExtractDOI.mockReturnValue(null);
      mockDiscoverDOI.mockResolvedValue("10.1000/discovered.doi");
      mockFetchDOIMetadataViaTranslator.mockResolvedValue(true);

      const item = createMockItem({ title: "Test Paper" });
      const result = await fetchDOIBasedMetadata(item);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(mockDiscoverDOI).toHaveBeenCalledWith(item);
      expect(item.setField).toHaveBeenCalledWith(
        "DOI",
        "10.1000/discovered.doi",
      );
    });

    it("should fallback to CrossRef API when translator fails", async () => {
      mockExtractDOI.mockReturnValue("10.1000/test.doi");
      mockFetchDOIMetadataViaTranslator.mockResolvedValue(false);
      mockFetchCrossRefMetadata.mockResolvedValue({
        DOI: "10.1000/test.doi",
        title: ["Test Paper"],
      });

      const item = createMockItem({ DOI: "10.1000/test.doi" });
      const result = await fetchDOIBasedMetadata(item);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(mockFetchCrossRefMetadata).toHaveBeenCalledWith(
        "10.1000/test.doi",
      );
      expect(mockUpdateItemWithMetadata).toHaveBeenCalledWith(item, {
        DOI: "10.1000/test.doi",
        title: ["Test Paper"],
      });
    });

    it("should add CrossRef Failed tag when both methods fail", async () => {
      mockExtractDOI.mockReturnValue("10.1000/test.doi");
      mockFetchDOIMetadataViaTranslator.mockResolvedValue(false);
      mockFetchCrossRefMetadata.mockResolvedValue(null);

      const item = createMockItem({ DOI: "10.1000/test.doi" });
      const result = await fetchDOIBasedMetadata(item);

      expect(result.success).toBe(false);
      expect(result.error).toBe("CrossRef API failed");
      expect(item.addTag).toHaveBeenCalledWith("CrossRef Failed", 1);
    });

    it("should return error when no DOI discovered", async () => {
      mockExtractDOI.mockReturnValue(null);
      mockDiscoverDOI.mockResolvedValue(null);

      const item = createMockItem({ title: "Unknown Paper" });
      const result = await fetchDOIBasedMetadata(item);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No DOI found");
    });

    it("should set DOI field when DOI is discovered", async () => {
      mockExtractDOI.mockReturnValue(null);
      mockDiscoverDOI.mockResolvedValue("10.1000/discovered.doi");
      mockFetchDOIMetadataViaTranslator.mockResolvedValue(true);

      const item = createMockItem({ title: "Test Paper" });
      await fetchDOIBasedMetadata(item);

      expect(item.setField).toHaveBeenCalledWith(
        "DOI",
        "10.1000/discovered.doi",
      );
    });
  });

  describe("fetchISBNBasedMetadata", () => {
    let fetchISBNBasedMetadata: (item: any) => Promise<any>;
    let mockExtractISBN: ReturnType<typeof vi.fn>;
    let mockDiscoverISBN: ReturnType<typeof vi.fn>;
    let mockFetchBookMetadata: ReturnType<typeof vi.fn>;
    let mockUpdateItemWithBookMetadata: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockExtractISBN = vi.fn().mockReturnValue(null);
      mockDiscoverISBN = vi.fn().mockResolvedValue(null);
      mockFetchBookMetadata = vi.fn().mockResolvedValue(null);
      mockUpdateItemWithBookMetadata = vi.fn().mockResolvedValue(undefined);

      fetchISBNBasedMetadata = createZotadataMethod("fetchISBNBasedMetadata", {
        extractISBN: mockExtractISBN,
        discoverISBN: mockDiscoverISBN,
        fetchBookMetadata: mockFetchBookMetadata,
        updateItemWithBookMetadata: mockUpdateItemWithBookMetadata,
      });
    });

    it("should use existing ISBN when present", async () => {
      mockExtractISBN.mockReturnValue("9780123456789");
      mockFetchBookMetadata.mockResolvedValue({
        title: "Test Book",
        authors: [{ name: "John Smith" }],
      });

      const item = createMockItem({ ISBN: "9780123456789" });
      const result = await fetchISBNBasedMetadata(item);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(mockExtractISBN).toHaveBeenCalledWith(item);
      expect(mockDiscoverISBN).not.toHaveBeenCalled();
      expect(mockFetchBookMetadata).toHaveBeenCalledWith("9780123456789", item);
    });

    it("should discover ISBN when not present", async () => {
      mockExtractISBN.mockReturnValue(null);
      mockDiscoverISBN.mockResolvedValue("9780123456789");
      mockFetchBookMetadata.mockResolvedValue({
        title: "Test Book",
        authors: [{ name: "John Smith" }],
      });

      const item = createMockItem({ title: "Test Book" });
      const result = await fetchISBNBasedMetadata(item);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(mockDiscoverISBN).toHaveBeenCalledWith(item);
      expect(item.setField).toHaveBeenCalledWith("ISBN", "9780123456789");
    });

    it("should handle translator success format", async () => {
      mockExtractISBN.mockReturnValue("9780123456789");
      mockFetchBookMetadata.mockResolvedValue({
        source: "Zotero Translator",
        success: true,
      });

      const item = createMockItem({ ISBN: "9780123456789" });
      const result = await fetchISBNBasedMetadata(item);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(item.addTag).toHaveBeenCalledWith("Metadata Updated", 1);
      expect(item.addTag).toHaveBeenCalledWith("Via Zotero Translator", 1);
    });

    it("should handle traditional API metadata format", async () => {
      mockExtractISBN.mockReturnValue("9780123456789");
      mockFetchBookMetadata.mockResolvedValue({
        title: "Test Book",
        authors: [{ name: "John Smith" }],
        publishers: ["Test Publisher"],
      });

      const item = createMockItem({ ISBN: "9780123456789" });
      const result = await fetchISBNBasedMetadata(item);

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(mockUpdateItemWithBookMetadata).toHaveBeenCalledWith(item, {
        title: "Test Book",
        authors: [{ name: "John Smith" }],
        publishers: ["Test Publisher"],
      });
    });

    it("should add Book API Failed tag when metadata fetch fails", async () => {
      mockExtractISBN.mockReturnValue("9780123456789");
      mockFetchBookMetadata.mockResolvedValue(null);

      const item = createMockItem({ ISBN: "9780123456789" });
      const result = await fetchISBNBasedMetadata(item);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Book API failed");
      expect(item.addTag).toHaveBeenCalledWith("Book API Failed", 1);
    });

    it("should add No ISBN Found tag when no ISBN discovered", async () => {
      mockExtractISBN.mockReturnValue(null);
      mockDiscoverISBN.mockResolvedValue(null);

      const item = createMockItem({ title: "Unknown Book" });
      const result = await fetchISBNBasedMetadata(item);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No ISBN found");
      expect(item.addTag).toHaveBeenCalledWith("No ISBN Found", 1);
    });
  });

  describe("updateItemWithMetadata", () => {
    let updateItemWithMetadata: (item: any, metadata: any) => Promise<void>;

    beforeEach(() => {
      (globalThis as any).Zotero = {
        CreatorTypes: {
          getPrimaryIDForType: () => 1,
        },
      };
      updateItemWithMetadata = createZotadataMethod("updateItemWithMetadata");
    });

    it("should update title when empty or short", async () => {
      const item = createMockItem({ title: "" });
      const metadata = {
        title: ["New Title From Metadata"],
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith(
        "title",
        "New Title From Metadata",
      );
    });

    it("should not update title when already long enough", async () => {
      const item = createMockItem({ title: "This is a long existing title" });
      const metadata = {
        title: ["New Title From Metadata"],
      };

      await updateItemWithMetadata(item, metadata);

      // Title should not be updated since current title is >= 10 chars
      expect(item.setField).not.toHaveBeenCalledWith(
        "title",
        expect.anything(),
      );
    });

    it("should update authors when item has no creators", async () => {
      const item = createMockItem({ creators: [] });

      const metadata = {
        author: [
          { given: "John", family: "Smith" },
          { given: "Jane", family: "Doe" },
        ],
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
    });

    it("should REPLACE existing authors (fix for issue #13 - duplicate authors bug)", async () => {
      const item = createMockItem({
        creators: [
          { firstName: "Existing", lastName: "Author", creatorType: "author" },
          { firstName: "Another", lastName: "Old", creatorType: "author" },
        ],
      });

      const metadata = {
        author: [
          { given: "John", family: "Smith" },
          { given: "Jane", family: "Doe" },
        ],
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
    });

    it("should preserve non-author creators (editors, translators) when replacing authors", async () => {
      const item = createMockItem({
        creators: [
          { firstName: "Existing", lastName: "Author", creatorType: "author" },
          { firstName: "Book", lastName: "Editor", creatorType: "editor" },
          {
            firstName: "Text",
            lastName: "Translator",
            creatorType: "translator",
          },
        ],
      });

      const metadata = {
        author: [{ given: "John", family: "Smith" }],
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "editor", firstName: "Book", lastName: "Editor" },
        {
          creatorType: "translator",
          firstName: "Text",
          lastName: "Translator",
        },
      ]);
    });

    it("should update volume/issue/pages", async () => {
      const item = createMockItem();
      const metadata = {
        volume: "10",
        issue: "2",
        page: "123-145",
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith("volume", "10");
      expect(item.setField).toHaveBeenCalledWith("issue", "2");
      expect(item.setField).toHaveBeenCalledWith("pages", "123-145");
    });

    it("should update URL when not present", async () => {
      const item = createMockItem({ url: "" });
      const metadata = {
        URL: "https://doi.org/10.1000/test.doi",
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith(
        "url",
        "https://doi.org/10.1000/test.doi",
      );
    });

    it("should not update URL when already present", async () => {
      const item = createMockItem({ url: "https://existing.url" });
      const metadata = {
        URL: "https://doi.org/10.1000/test.doi",
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setField).not.toHaveBeenCalledWith("url", expect.anything());
    });

    it("should update publication title from container-title", async () => {
      const item = createMockItem();
      const metadata = {
        "container-title": ["Test Journal"],
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith(
        "publicationTitle",
        "Test Journal",
      );
    });

    it("should update date from published date-parts", async () => {
      const item = createMockItem();
      const metadata = {
        published: {
          "date-parts": [[2023, 5, 15]],
        },
      };

      await updateItemWithMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith("date", "2023");
    });

    it("should save item after updates", async () => {
      const item = createMockItem();
      const metadata = { title: ["Test"] };

      await updateItemWithMetadata(item, metadata);

      expect(item.saveTx).toHaveBeenCalled();
    });
  });

  describe("updateItemWithBookMetadata", () => {
    let updateItemWithBookMetadata: (item: any, metadata: any) => Promise<void>;

    beforeEach(() => {
      (globalThis as any).Zotero = {
        CreatorTypes: {
          getPrimaryIDForType: () => 1,
        },
      };
      updateItemWithBookMetadata = createZotadataMethod(
        "updateItemWithBookMetadata",
      );
    });

    it("should update title when empty or short", async () => {
      const item = createMockItem({ title: "" });
      const metadata = {
        title: "New Book Title",
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith("title", "New Book Title");
    });

    it("should update authors from OpenLibrary format when item has no authors", async () => {
      const item = createMockItem({ creators: [] });

      const metadata = {
        authors: [{ name: "John Smith" }, { name: "Jane Doe" }],
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
    });

    it("should handle authors as string array when item has no authors", async () => {
      const item = createMockItem({ creators: [] });

      const metadata = {
        authors: ["John Smith", "Jane Doe"],
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
    });

    it("should REPLACE existing authors when metadata has authors (fix for duplicate bug)", async () => {
      const item = createMockItem({
        creators: [
          { firstName: "Old", lastName: "Author", creatorType: "author" },
        ],
      });

      const metadata = {
        authors: [{ name: "John Smith" }],
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
      ]);
    });

    it("should preserve non-author creators (editors) when replacing authors", async () => {
      const item = createMockItem({
        creators: [
          { firstName: "Old", lastName: "Author", creatorType: "author" },
          { firstName: "Book", lastName: "Editor", creatorType: "editor" },
        ],
      });

      const metadata = {
        authors: [{ name: "John Smith" }],
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "editor", firstName: "Book", lastName: "Editor" },
      ]);
    });

    it("should not update authors when item has existing authors and metadata has no authors", async () => {
      const item = createMockItem({
        creators: [
          { firstName: "Existing", lastName: "Author", creatorType: "author" },
        ],
      });

      const metadata = {
        title: "Book Title",
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setCreators).not.toHaveBeenCalled();
    });

    it("should update publisher", async () => {
      const item = createMockItem();
      const metadata = {
        publishers: ["Test Publisher"],
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith("publisher", "Test Publisher");
    });

    it("should update publication date", async () => {
      const item = createMockItem();
      const metadata = {
        publish_date: "2023",
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith("date", "2023");
    });

    it("should update number of pages", async () => {
      const item = createMockItem();
      const metadata = {
        number_of_pages: 350,
      };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith("numPages", "350");
    });

    it("should save item after updates", async () => {
      const item = createMockItem();
      const metadata = { title: "Test Book" };

      await updateItemWithBookMetadata(item, metadata);

      expect(item.saveTx).toHaveBeenCalled();
    });
  });

  describe("fetchBookMetadataViaTranslator", () => {
    let fetchBookMetadataViaTranslator: (
      isbn: string,
      item: any,
    ) => Promise<boolean>;

    beforeEach(() => {
      fetchBookMetadataViaTranslator = createZotadataMethod(
        "fetchBookMetadataViaTranslator",
      );
    });

    it("should return true when translator finds metadata", async () => {
      const mockNewItem = {
        getField: vi.fn((field: string) => {
          if (field === "title") return "Book Title from Translator";
          return "";
        }),
        getCreators: vi.fn(() => [{ firstName: "John", lastName: "Smith" }]),
        setCreators: vi.fn(),
        deleted: false,
        saveTx: vi.fn().mockResolvedValue(undefined),
      };

      // Create a mock class constructor
      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([{ translatorID: "test" }]),
        setTranslator: vi.fn(),
        translate: vi.fn().mockResolvedValue([mockNewItem]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "book",
        },
      };

      const item = createMockItem({ ISBN: "9780123456789" });
      const result = await fetchBookMetadataViaTranslator(
        "9780123456789",
        item,
      );

      expect(result).toBe(true);
      expect(MockTranslateSearch).toHaveBeenCalled();
    });

    it("should return false when no translators available", async () => {
      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "book",
        },
      };

      const item = createMockItem({ ISBN: "9780123456789" });
      const result = await fetchBookMetadataViaTranslator(
        "9780123456789",
        item,
      );

      expect(result).toBe(false);
    });

    it("should return false when translation returns no items", async () => {
      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([{ translatorID: "test" }]),
        setTranslator: vi.fn(),
        translate: vi.fn().mockResolvedValue([]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "book",
        },
      };

      const item = createMockItem({ ISBN: "9780123456789" });
      const result = await fetchBookMetadataViaTranslator(
        "9780123456789",
        item,
      );

      expect(result).toBe(false);
    });

    it("should apply fields from translated item", async () => {
      const mockNewItem = {
        getField: vi.fn((field: string) => {
          switch (field) {
            case "title":
              return "Translated Title";
            case "publisher":
              return "Test Publisher";
            case "date":
              return "2023";
            default:
              return "";
          }
        }),
        getCreators: vi.fn(() => []),
        setCreators: vi.fn(),
        deleted: false,
        saveTx: vi.fn().mockResolvedValue(undefined),
      };

      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([{ translatorID: "test" }]),
        setTranslator: vi.fn(),
        translate: vi.fn().mockResolvedValue([mockNewItem]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "book",
        },
      };

      const item = createMockItem({ ISBN: "9780123456789", title: "" });
      await fetchBookMetadataViaTranslator("9780123456789", item);

      expect(item.setField).toHaveBeenCalledWith("title", "Translated Title");
      expect(item.setField).toHaveBeenCalledWith("publisher", "Test Publisher");
      expect(item.setField).toHaveBeenCalledWith("date", "2023");
    });

    it("should handle errors gracefully", async () => {
      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi
          .fn()
          .mockRejectedValue(new Error("Translator error")),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "book",
        },
      };

      const item = createMockItem({ ISBN: "9780123456789" });
      const result = await fetchBookMetadataViaTranslator(
        "9780123456789",
        item,
      );

      expect(result).toBe(false);
    });
  });

  describe("fetchDOIMetadataViaTranslator", () => {
    let fetchDOIMetadataViaTranslator: (
      doi: string,
      item: any,
    ) => Promise<boolean>;

    beforeEach(() => {
      fetchDOIMetadataViaTranslator = createZotadataMethod(
        "fetchDOIMetadataViaTranslator",
      );
    });

    it("should return true when translator finds metadata", async () => {
      const mockNewItem = {
        getField: vi.fn((field: string) => {
          if (field === "title") return "Article Title from Translator";
          return "";
        }),
        getCreators: vi.fn(() => [{ firstName: "John", lastName: "Smith" }]),
        setCreators: vi.fn(),
        deleted: false,
        saveTx: vi.fn().mockResolvedValue(undefined),
      };

      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([{ translatorID: "test" }]),
        setTranslator: vi.fn(),
        translate: vi.fn().mockResolvedValue([mockNewItem]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "journalArticle",
        },
      };

      const item = createMockItem({ DOI: "10.1000/test.doi" });
      const result = await fetchDOIMetadataViaTranslator(
        "10.1000/test.doi",
        item,
      );

      expect(result).toBe(true);
      expect(MockTranslateSearch).toHaveBeenCalled();
    });

    it("should return false when no translators available", async () => {
      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "journalArticle",
        },
      };

      const item = createMockItem({ DOI: "10.1000/test.doi" });
      const result = await fetchDOIMetadataViaTranslator(
        "10.1000/test.doi",
        item,
      );

      expect(result).toBe(false);
    });

    it("should return false when translation returns no items", async () => {
      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([{ translatorID: "test" }]),
        setTranslator: vi.fn(),
        translate: vi.fn().mockResolvedValue([]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "journalArticle",
        },
      };

      const item = createMockItem({ DOI: "10.1000/test.doi" });
      const result = await fetchDOIMetadataViaTranslator(
        "10.1000/test.doi",
        item,
      );

      expect(result).toBe(false);
    });

    it("should apply fields from translated item", async () => {
      const mockNewItem = {
        getField: vi.fn((field: string) => {
          switch (field) {
            case "title":
              return "Translated Article";
            case "publicationTitle":
              return "Test Journal";
            case "volume":
              return "10";
            case "issue":
              return "2";
            case "pages":
              return "123-145";
            default:
              return "";
          }
        }),
        getCreators: vi.fn(() => []),
        deleted: false,
        saveTx: vi.fn().mockResolvedValue(undefined),
      };

      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([{ translatorID: "test" }]),
        setTranslator: vi.fn(),
        translate: vi.fn().mockResolvedValue([mockNewItem]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "journalArticle",
        },
      };

      const item = createMockItem({ DOI: "10.1000/test.doi", title: "" });
      await fetchDOIMetadataViaTranslator("10.1000/test.doi", item);

      expect(item.setField).toHaveBeenCalledWith("title", "Translated Article");
      expect(item.setField).toHaveBeenCalledWith(
        "publicationTitle",
        "Test Journal",
      );
      expect(item.setField).toHaveBeenCalledWith("volume", "10");
      expect(item.setField).toHaveBeenCalledWith("issue", "2");
      expect(item.setField).toHaveBeenCalledWith("pages", "123-145");
    });

    it("should set DOI field if not present", async () => {
      const mockNewItem = {
        getField: vi.fn(() => ""),
        getCreators: vi.fn(() => []),
        deleted: false,
        saveTx: vi.fn().mockResolvedValue(undefined),
      };

      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi.fn().mockResolvedValue([{ translatorID: "test" }]),
        setTranslator: vi.fn(),
        translate: vi.fn().mockResolvedValue([mockNewItem]),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "journalArticle",
        },
      };

      const item = createMockItem({ DOI: "" });
      item.getField = vi.fn((field: string) => {
        if (field === "DOI") return "";
        return "";
      });

      await fetchDOIMetadataViaTranslator("10.1000/test.doi", item);

      expect(item.setField).toHaveBeenCalledWith("DOI", "10.1000/test.doi");
    });

    it("should handle errors gracefully", async () => {
      const MockTranslateSearch = vi.fn().mockImplementation(() => ({
        setIdentifier: vi.fn(),
        getTranslators: vi
          .fn()
          .mockRejectedValue(new Error("Translator error")),
      }));

      (globalThis as any).Zotero = {
        Translate: {
          Search: MockTranslateSearch,
        },
        ItemTypes: {
          getName: () => "journalArticle",
        },
      };

      const item = createMockItem({ DOI: "10.1000/test.doi" });
      const result = await fetchDOIMetadataViaTranslator(
        "10.1000/test.doi",
        item,
      );

      expect(result).toBe(false);
    });
  });

  describe("tryAlternativeISBNFormats", () => {
    let tryAlternativeISBNFormats: (
      originalISBN: string,
      item: any,
    ) => Promise<any>;
    let mockFetchBookMetadataViaTranslator: ReturnType<typeof vi.fn>;
    let mockFetchOpenLibraryMetadata: ReturnType<typeof vi.fn>;
    let mockFetchGoogleBooksMetadata: ReturnType<typeof vi.fn>;
    let mockConvertISBN10to13: ReturnType<typeof vi.fn>;
    let mockConvertISBN13to10: ReturnType<typeof vi.fn>;
    let mockFormatISBNWithHyphens: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetchBookMetadataViaTranslator = vi.fn().mockResolvedValue(false);
      mockFetchOpenLibraryMetadata = vi.fn().mockResolvedValue(null);
      mockFetchGoogleBooksMetadata = vi.fn().mockResolvedValue(null);
      mockConvertISBN10to13 = vi.fn().mockReturnValue(null);
      mockConvertISBN13to10 = vi.fn().mockReturnValue(null);
      mockFormatISBNWithHyphens = vi
        .fn()
        .mockImplementation((isbn: string) => isbn);

      tryAlternativeISBNFormats = createZotadataMethod(
        "tryAlternativeISBNFormats",
        {
          fetchBookMetadataViaTranslator: mockFetchBookMetadataViaTranslator,
          fetchOpenLibraryMetadata: mockFetchOpenLibraryMetadata,
          fetchGoogleBooksMetadata: mockFetchGoogleBooksMetadata,
          convertISBN10to13: mockConvertISBN10to13,
          convertISBN13to10: mockConvertISBN13to10,
          formatISBNWithHyphens: mockFormatISBNWithHyphens,
        },
      );
    });

    it("should try ISBN-10 to ISBN-13 conversion", async () => {
      mockConvertISBN10to13.mockReturnValue("9780123456789");
      mockFetchBookMetadataViaTranslator.mockResolvedValue(true);

      const item = createMockItem();
      const result = await tryAlternativeISBNFormats("0123456789", item);

      expect(result).toEqual({ source: "Zotero Translator", success: true });
      expect(mockConvertISBN10to13).toHaveBeenCalledWith("0123456789");
      expect(mockFetchBookMetadataViaTranslator).toHaveBeenCalledWith(
        "9780123456789",
        item,
      );
    });

    it("should try ISBN-13 to ISBN-10 conversion", async () => {
      mockConvertISBN13to10.mockReturnValue("0123456789");
      mockFetchBookMetadataViaTranslator.mockResolvedValue(true);

      const item = createMockItem();
      const result = await tryAlternativeISBNFormats("9780123456789", item);

      expect(result).toEqual({ source: "Zotero Translator", success: true });
      expect(mockConvertISBN13to10).toHaveBeenCalledWith("9780123456789");
      expect(mockFetchBookMetadataViaTranslator).toHaveBeenCalledWith(
        "0123456789",
        item,
      );
    });

    it("should try OpenLibrary when translator fails", async () => {
      mockConvertISBN13to10.mockReturnValue("0123456789");
      mockFetchBookMetadataViaTranslator.mockResolvedValue(false);
      mockFetchOpenLibraryMetadata.mockResolvedValue({
        title: "Found in OpenLibrary",
      });

      const item = createMockItem();
      const result = await tryAlternativeISBNFormats("9780123456789", item);

      expect(result).toEqual({ title: "Found in OpenLibrary" });
      expect(mockFetchOpenLibraryMetadata).toHaveBeenCalled();
    });

    it("should try Google Books when OpenLibrary fails", async () => {
      mockConvertISBN13to10.mockReturnValue("0123456789");
      mockFetchBookMetadataViaTranslator.mockResolvedValue(false);
      mockFetchOpenLibraryMetadata.mockResolvedValue(null);
      mockFetchGoogleBooksMetadata.mockResolvedValue({
        title: "Found in Google Books",
      });

      const item = createMockItem();
      const result = await tryAlternativeISBNFormats("9780123456789", item);

      expect(result).toEqual({ title: "Found in Google Books" });
      expect(mockFetchGoogleBooksMetadata).toHaveBeenCalled();
    });

    it("should return null when all formats fail", async () => {
      mockConvertISBN13to10.mockReturnValue("0123456789");
      mockFetchBookMetadataViaTranslator.mockResolvedValue(false);
      mockFetchOpenLibraryMetadata.mockResolvedValue(null);
      mockFetchGoogleBooksMetadata.mockResolvedValue(null);

      const item = createMockItem();
      const result = await tryAlternativeISBNFormats("9780123456789", item);

      expect(result).toBe(null);
    });

    it("should handle ISBN with hyphens", async () => {
      mockFetchBookMetadataViaTranslator.mockResolvedValue(true);

      const item = createMockItem();
      await tryAlternativeISBNFormats("978-0-123456-78-9", item);

      // The function cleans ISBN by removing hyphens
      expect(mockConvertISBN13to10).toHaveBeenCalledWith("9780123456789");
    });

    it("should handle errors gracefully", async () => {
      mockConvertISBN13to10.mockImplementation(() => {
        throw new Error("Conversion error");
      });

      const item = createMockItem();
      const result = await tryAlternativeISBNFormats("9780123456789", item);

      expect(result).toBe(null);
    });
  });
});
