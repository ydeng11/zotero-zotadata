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

      await service.updateItemWithMetadata(item, metadata);

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

    it("overwrites authors from CrossRef even without overlap (DOI match trusted)", async () => {
      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1234/test",
        date: "2020",
        creators: [
          { firstName: "Original", lastName: "Author", creatorType: "author" },
        ],
      });

      const metadata = {
        DOI: "10.1234/test",
        title: ["Test Paper"],
        published: { "date-parts": [[2020]] },
        author: [
          { given: "Unrelated", family: "Person" },
          { given: "Another", family: "Mismatch" },
        ],
      };

      const changes = await service.updateItemWithMetadata(item, metadata);

      // Confidence 1 → CrossRef trusted
      expect(item.setCreators).toHaveBeenCalled();
      expect(changes).toContainEqual(
        expect.stringContaining("Updated authors"),
      );
    });

    it("rewrites authors idempotently for validated CrossRef metadata", async () => {
      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1234/test",
        date: "2020",
        creators: [
          { firstName: "J.", lastName: "Smith", creatorType: "author" },
          { firstName: "Book", lastName: "Editor", creatorType: "editor" },
        ],
      });

      const metadata = {
        DOI: "10.1234/test",
        title: ["Test Paper"],
        published: { "date-parts": [[2020]] },
        author: [
          { given: "John", family: "Smith" },
          { given: "Jane", family: "Doe" },
        ],
      };

      await service.updateItemWithMetadata(item, metadata);
      const creatorsAfterFirstUpdate = item.getCreators();
      await service.updateItemWithMetadata(item, metadata);

      expect(item.getCreators()).toEqual(creatorsAfterFirstUpdate);
      expect(item.getCreators()).toEqual([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
        { creatorType: "editor", firstName: "Book", lastName: "Editor" },
      ]);
    });

    it("does not preserve Zotero creatorTypeID authors as non-authors", async () => {
      const item = createMockItem({
        title: "BPR: Bayesian Personalized Ranking from Implicit Feedback",
        DOI: "10.48550/arxiv.1205.2618",
        date: "2012",
        creators: [],
      });
      item.getCreators = vi.fn(() => [
        { firstName: "Steffen", lastName: "Rendle", creatorTypeID: 1 },
        {
          firstName: "Christoph",
          lastName: "Freudenthaler",
          creatorTypeID: 1,
        },
        { firstName: "Zeno", lastName: "Gantner", creatorTypeID: 1 },
        { firstName: "Lars", lastName: "Schmidt-Thieme", creatorTypeID: 1 },
        { firstName: "Program", lastName: "Chair", creatorType: "editor" },
      ]) as Zotero.Item["getCreators"];

      const metadata = {
        DOI: "10.48550/arxiv.1205.2618",
        title: ["BPR: Bayesian Personalized Ranking from Implicit Feedback"],
        published: { "date-parts": [[2012]] },
        author: [
          { given: "Steffen", family: "Rendle" },
          { given: "Christoph", family: "Freudenthaler" },
          { given: "Zeno", family: "Gantner" },
          { given: "Lars", family: "Schmidt-Thieme" },
        ],
      };

      await service.updateItemWithMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "Steffen", lastName: "Rendle" },
        {
          creatorType: "author",
          firstName: "Christoph",
          lastName: "Freudenthaler",
        },
        { creatorType: "author", firstName: "Zeno", lastName: "Gantner" },
        {
          creatorType: "author",
          firstName: "Lars",
          lastName: "Schmidt-Thieme",
        },
        { creatorType: "editor", firstName: "Program", lastName: "Chair" },
      ]);
    });

    it("overwrites authors from CrossRef when DOI matches despite title mismatch", async () => {
      const item = createMockItem({
        title: "Curated Local Paper",
        DOI: "10.1234/stale",
        creators: [
          { firstName: "Original", lastName: "Author", creatorType: "author" },
        ],
      });

      const staleMetadata = {
        DOI: "10.1234/stale",
        title: ["Completely Different Paper"],
        author: [{ given: "Wrong", family: "Author" }],
      };

      const changes = await service.updateItemWithMetadata(item, staleMetadata);

      // DOI match → trusted regardless of title mismatch
      expect(item.setCreators).toHaveBeenCalled();
      expect(changes).toContainEqual(
        expect.stringContaining("Updated authors"),
      );
    });

    it("preserves existing publication fields when CrossRef metadata is for a different paper", async () => {
      const item = createMockItem({
        title: "Curated Local Paper",
        DOI: "10.1234/stale",
        publicationTitle: "Local Journal",
        date: "2021",
        volume: "7",
        issue: "2",
        pages: "10-20",
        creators: [
          { firstName: "Original", lastName: "Author", creatorType: "author" },
        ],
      });

      const staleMetadata = {
        DOI: "10.1234/stale",
        title: ["Completely Different Paper"],
        "container-title": ["Wrong Journal"],
        published: { "date-parts": [[1999]] },
        volume: "99",
        issue: "9",
        page: "900-999",
        author: [{ given: "Wrong", family: "Author" }],
      };

      const changes = await service.updateItemWithMetadata(item, staleMetadata);

      expect(item.setField).not.toHaveBeenCalledWith(
        "publicationTitle",
        "Wrong Journal",
      );
      expect(item.setField).not.toHaveBeenCalledWith("date", "1999");
      expect(item.setField).not.toHaveBeenCalledWith("volume", "99");
      expect(item.setField).not.toHaveBeenCalledWith("issue", "9");
      expect(item.setField).not.toHaveBeenCalledWith("pages", "900-999");
      expect(changes).not.toContainEqual(
        expect.stringContaining("Updated publication title"),
      );
      expect(changes).not.toContainEqual(
        expect.stringContaining("Updated date"),
      );
      expect(changes).not.toContainEqual(
        expect.stringContaining("Updated volume"),
      );
      expect(changes).not.toContainEqual(
        expect.stringContaining("Updated issue"),
      );
      expect(changes).not.toContainEqual(
        expect.stringContaining("Updated pages"),
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

      await service.updateItemWithMetadata(item, metadata);

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "New", lastName: "Author" },
        { creatorType: "editor", firstName: "Book", lastName: "Editor" },
      ]);
    });

    it("overwrites authors from OpenAlex supplement even without overlap", async () => {
      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1234/test",
        date: "2020",
        creators: [
          { firstName: "Original", lastName: "Author", creatorType: "author" },
        ],
      });
      const typedService = service as unknown as {
        openAlexAPI: {
          getWorkByDOI: ReturnType<typeof vi.fn>;
        };
      };
      typedService.openAlexAPI.getWorkByDOI = vi.fn().mockResolvedValue({
        title: "Test Paper",
        authors: ["Unrelated Person", "Another Mismatch"],
        year: 2020,
      });

      const changes = await service.supplementDOIMetadata(item, "10.1234/test");

      // OpenAlex supplement uses confidence 1 — trusted
      expect(item.setCreators).toHaveBeenCalled();
      expect(changes).toContainEqual(
        expect.stringContaining("Updated authors"),
      );
    });

    it("rewrites authors from OpenAlex supplement when metadata validates", async () => {
      const item = createMockItem({
        title: "Test Paper",
        DOI: "10.1234/test",
        date: "2020",
        creators: [
          { firstName: "J.", lastName: "Smith", creatorType: "author" },
        ],
      });
      const typedService = service as unknown as {
        openAlexAPI: {
          getWorkByDOI: ReturnType<typeof vi.fn>;
        };
      };
      typedService.openAlexAPI.getWorkByDOI = vi.fn().mockResolvedValue({
        title: "Test Paper",
        authors: ["John Smith", "Jane Doe"],
        year: 2020,
      });

      const changes = await service.supplementDOIMetadata(item, "10.1234/test");

      expect(item.setCreators).toHaveBeenCalledWith([
        { creatorType: "author", firstName: "John", lastName: "Smith" },
        { creatorType: "author", firstName: "Jane", lastName: "Doe" },
      ]);
      expect(changes).toContainEqual("Updated authors: John Smith, Jane Doe");
    });
  });
});
