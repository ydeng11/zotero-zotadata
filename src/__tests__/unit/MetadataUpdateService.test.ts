import { describe, expect, it, vi, beforeEach } from "vitest";
import { MetadataUpdateService } from "@/modules/metadata/MetadataUpdateService";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

describe("MetadataUpdateService", () => {
  let service: MetadataUpdateService;

  beforeEach(() => {
    service = new MetadataUpdateService();
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      log: vi.fn(),
      CreatorTypes: { getPrimaryIDForType: vi.fn(() => 1) },
    });
  });

  describe("shouldUpdateTitle", () => {
    it("returns true for empty current title", () => {
      expect(service.shouldUpdateTitle("", "New Title")).toBe(true);
    });

    it("returns false for empty new title", () => {
      expect(service.shouldUpdateTitle("Current Title", "")).toBe(false);
    });

    it("returns false when titles are not exact match (truncation case)", () => {
      const current = "Machine Learning paper abstract";
      const newTitle = "Machine Learning paper abstract full version";
      const result = service.shouldUpdateTitle(current, newTitle);
      expect(result).toBe(false);
    });

    it("returns false when titles are similar (similarity >= 0.8)", () => {
      const current = "Machine Learning at Scale";
      const newTitle = "Machine Learning at Large Scale";
      const result = service.shouldUpdateTitle(current, newTitle);
      expect(result).toBe(false);
    });

    it("returns false when new title is shorter", () => {
      const current = "Generative Adversarial Networks for Image Synthesis";
      const newTitle = "GAN";
      const result = service.shouldUpdateTitle(current, newTitle);
      expect(result).toBe(false);
    });

    it("WRONG-PAPER CASE: should NOT return true for low similarity + longer title (wrong paper match)", () => {
      const current = "GAN";
      const newTitle =
        "Generative Adversarial Nets for Text-to-Image Translation";
      const result = service.shouldUpdateTitle(current, newTitle);
      expect(result).toBe(false);
    });

    it("WRONG-PAPER CASE: should NOT return true when curated short title matches wrong longer title", () => {
      const current = "BERT";
      const newTitle = "BERT-based Text Classification for Medical Documents";
      const result = service.shouldUpdateTitle(current, newTitle);
      expect(result).toBe(false);
    });
  });

  describe("updateItemWithMetadata", () => {
    it("WRONG-PAPER CASE: should NOT unconditionally overwrite short titles (< 10 chars)", async () => {
      const item = createMockItem({
        title: "GAN",
        DOI: "",
      });

      const wrongMetadata = {
        DOI: "10.1234/wrong-paper",
        title: ["Generative Adversarial Nets for Text-to-Image Translation"],
        author: [{ given: "Wrong", family: "Author" }],
      };

      const changes = await service.updateItemWithMetadata(item, wrongMetadata);

      expect(item.setField).not.toHaveBeenCalledWith(
        "title",
        expect.any(String),
      );
      expect(changes).not.toContainEqual(
        expect.stringContaining("Updated title"),
      );
    });

    it("preserves curated short title even when metadata title exists", async () => {
      const item = createMockItem({
        title: "RNA",
        DOI: "",
      });

      const metadata = {
        DOI: "10.1234/test",
        title: ["RNA Sequencing Methods Review"],
        author: [{ given: "Test", family: "Author" }],
      };

      const changes = await service.updateItemWithMetadata(item, metadata);

      expect(item.setField).not.toHaveBeenCalledWith(
        "title",
        expect.any(String),
      );
    });

    it("updates empty title field", async () => {
      const item = createMockItem({
        title: "",
        DOI: "",
      });

      const metadata = {
        DOI: "10.1234/test",
        title: ["Valid Title"],
        author: [{ given: "Test", family: "Author" }],
      };

      const changes = await service.updateItemWithMetadata(item, metadata);

      expect(item.setField).toHaveBeenCalledWith("title", "Valid Title");
      expect(changes).toContainEqual("Updated title: Valid Title");
    });

    it("updates authors when item has no authors", async () => {
      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1234/test",
        creators: [],
      });

      const metadata = {
        DOI: "10.1234/test",
        title: ["Test Paper"],
        author: [
          { given: "John", family: "Smith" },
          { given: "Jane", family: "Doe" },
        ],
      };

      const changes = await service.updateItemWithMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
      expect(changes).toContainEqual(
        expect.stringContaining("Updated authors"),
      );
    });

    it("REPLACES existing authors (fix for issue #13 - duplicate authors bug)", async () => {
      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1234/test",
        creators: [
          { firstName: "Existing", lastName: "Author", creatorType: "author" },
          { firstName: "Another", lastName: "Old", creatorType: "author" },
        ],
      });

      const metadata = {
        DOI: "10.1234/test",
        title: ["Test Paper"],
        author: [{ given: "Different", family: "Author" }],
      };

      const changes = await service.updateItemWithMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "Different", lastName: "Author" },
      ]);
      expect(changes).toContainEqual(
        expect.stringContaining("Updated authors"),
      );
    });

    it("preserves non-author creators when replacing authors", async () => {
      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1234/test",
        creators: [
          { firstName: "Existing", lastName: "Author", creatorType: "author" },
          { firstName: "Book", lastName: "Editor", creatorType: "editor" },
        ],
      });

      const metadata = {
        DOI: "10.1234/test",
        title: ["Test Paper"],
        author: [{ given: "New", family: "Author" }],
      };

      const changes = await service.updateItemWithMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "New", lastName: "Author" },
        { creatorType: "editor", firstName: "Book", lastName: "Editor" },
      ]);
    });
  });
});
