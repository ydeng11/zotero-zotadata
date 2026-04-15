import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { FileFinder } from "@/modules/FileFinder";
import { ArxivProcessor } from "@/modules/ArxivProcessor";
import {
  extractArxivIdFromItem,
  buildCanonicalArxivDoi,
  isArxivDoi,
} from "@/utils/itemSearchQuery";

function createMockItem(fields: Record<string, any>): any {
  const data: Record<string, any> = {
    id: Math.floor(Math.random() * 10000),
    itemTypeID: 1, // journalArticle
    ...fields,
  };

  return {
    id: data.id,
    itemTypeID: data.itemTypeID,
    getField: (field: string) => data[field],
    setField: vi.fn((field: string, value: any) => {
      data[field] = value;
    }),
    getCreators: () => data.creators || [],
    setCreators: vi.fn(),
    addTag: vi.fn(),
    saveTx: vi.fn(),
    getAttachments: vi.fn(() => []),
    isRegularItem: () => true,
  };
}

describe("Diagnostic: Generative Adversarial Nets Paper", () => {
  const GAN_PAPER = {
    title: "Generative Adversarial Nets",
    arxivId: "1406.2661",
    canonicalArxivDoi: "10.48550/arxiv.1406.2661",
    authors: [
      { firstName: "Ian J.", lastName: "Goodfellow", creatorType: "author" },
      { firstName: "Jean", lastName: "Pouget-Abadie", creatorType: "author" },
      { firstName: "Mehdi", lastName: "Mirza", creatorType: "author" },
      { firstName: "Bing", lastName: "Xu", creatorType: "author" },
      { firstName: "David", lastName: "Warde-Farley", creatorType: "author" },
      { firstName: "Sherjil", lastName: "Ozair", creatorType: "author" },
      { firstName: "Aaron", lastName: "Courville", creatorType: "author" },
      { firstName: "Yoshua", lastName: "Bengio", creatorType: "author" },
    ],
    year: "2014",
  };

  describe("arXiv ID Extraction", () => {
    it("extracts arXiv ID from Extra field with correct format", () => {
      const item = createMockItem({
        title: GAN_PAPER.title,
        extra: "arXiv: 1406.2661",
        publicationTitle: "arXiv",
      });

      const extractedId = extractArxivIdFromItem(item);
      expect(extractedId).toBe("1406.2661");
    });

    it("extracts arXiv ID from URL field", () => {
      const item = createMockItem({
        title: GAN_PAPER.title,
        url: "https://arxiv.org/abs/1406.2661",
      });

      const extractedId = extractArxivIdFromItem(item);
      expect(extractedId).toBe("1406.2661");
    });

    it("builds canonical arXiv DOI correctly", () => {
      const doi = buildCanonicalArxivDoi(GAN_PAPER.arxivId);
      expect(doi).toBe(GAN_PAPER.canonicalArxivDoi);
    });

    it("identifies arXiv DOI correctly", () => {
      expect(isArxivDoi(GAN_PAPER.canonicalArxivDoi)).toBe(true);
      expect(isArxivDoi("10.1000/xyz")).toBe(false);
    });
  });

  describe("Title Similarity Issues", () => {
    it("tests title similarity function with GAN paper title", () => {
      const title1 = "Generative Adversarial Nets";
      const title2 = "Generative Adversarial Nets"; // Exact match
      const title3 =
        "InfoGAN: Interpretable Representation Learning by Information Maximizing Generative Adversarial Nets"; // Similar but different
      const title4 = "Generative Adversarial Nets"; // Different year paper with same title

      // Test with ArxivProcessor's titleSimilarity function
      const sim1 = ArxivProcessor.titleSimilarity(title1, title2);
      const sim2 = ArxivProcessor.titleSimilarity(title1, title3);
      const sim3 = ArxivProcessor.titleSimilarity(title1, title4);

      console.log("Title similarity exact match:", sim1);
      console.log("Title similarity with InfoGAN:", sim2);
      console.log("Title similarity with duplicate title:", sim3);

      expect(sim1).toBe(1.0);
      expect(sim2).toBeLessThan(0.7); // InfoGAN should be rejected
      expect(sim3).toBe(1.0); // Same title would match perfectly
    });
  });

  describe("Metadata Fetching Path", () => {
    let fetcher: MetadataFetcher;

    beforeEach(() => {
      fetcher = new MetadataFetcher();
    });

    it("simulates metadata fetch for GAN paper with no DOI", async () => {
      const item = createMockItem({
        title: GAN_PAPER.title,
        extra: "arXiv: 1406.2661",
        publicationTitle: "arXiv",
        date: GAN_PAPER.year,
        creators: GAN_PAPER.authors,
        DOI: "", // No DOI initially
      });

      // This would trigger DOI discovery
      const extractDOIResult = fetcher.extractDOI(item);
      console.log("Extracted DOI from item:", extractDOIResult);

      // Since no DOI field, it should try to extract from Extra or build canonical arXiv DOI
      expect(extractDOIResult).toBeNull(); // No DOI in standard field

      // Check if canonical arXiv DOI can be built
      const arxivId = extractArxivIdFromItem(item);
      const canonicalDoi = arxivId ? buildCanonicalArxivDoi(arxivId) : null;
      console.log("Canonical arXiv DOI:", canonicalDoi);

      expect(canonicalDoi).toBe(GAN_PAPER.canonicalArxivDoi);
    });

    it("tests what happens when title search returns wrong paper", async () => {
      // Simulate OpenAlex/SemanticScholar returning a different paper with same title
      const mockWrongResult = {
        title: "Generative Adversarial Nets",
        authors: ["Raphael Labaca-Castro"],
        year: 2023,
        doi: "10.1007/978-3-658-40442-0_9",
        venue: "Machine Learning under Malware Attack",
      };

      const similarity = ArxivProcessor.titleSimilarity(
        GAN_PAPER.title,
        mockWrongResult.title,
      );

      console.log(
        "Similarity with wrong paper (same title, different authors):",
        similarity,
      );
      console.log(
        "This paper would match with similarity 1.0 because titles are identical",
      );

      // This is the KEY ISSUE - identical titles from different papers will match
      expect(similarity).toBe(1.0);

      // However, the authors list length differs significantly
      const authorCountDiff =
        GAN_PAPER.authors.length - mockWrongResult.authors.length;
      console.log("Author count difference:", authorCountDiff);
      console.log("GAN paper has", GAN_PAPER.authors.length, "authors");
      console.log("Wrong result has", mockWrongResult.authors.length, "author");

      expect(authorCountDiff).toBe(7); // Significant difference
    });
  });

  describe("File Download Path", () => {
    let fileFinder: FileFinder;

    beforeEach(() => {
      fileFinder = new FileFinder();
    });

    it("tests arXiv PDF URL resolution", async () => {
      const item = createMockItem({
        title: GAN_PAPER.title,
        extra: "arXiv: 1406.2661",
        publicationTitle: "arXiv",
      });

      const arxivId = fileFinder.extractArxivId(item);
      console.log("Extracted arXiv ID:", arxivId);

      if (arxivId) {
        const expectedPdfUrl = `http://arxiv.org/pdf/${arxivId}.pdf`;
        console.log("Expected arXiv PDF URL:", expectedPdfUrl);
        expect(arxivId).toBe("1406.2661");
      }
    });
  });

  describe("Root Cause Analysis", () => {
    it("documents the potential failure scenarios", () => {
      console.log(
        '\n=== ROOT CAUSE ANALYSIS for "Generative Adversarial Nets" ===\n',
      );

      console.log("SCENARIO 1: Title-based DOI discovery fails");
      console.log(
        '- Problem: Multiple papers share identical title "Generative Adversarial Nets"',
      );
      console.log(
        "- Papers with same title: 2014 Goodfellow (original GAN), 2023 Labaca-Castro (different paper)",
      );
      console.log("- Title similarity: 1.0 (identical titles match perfectly)");
      console.log(
        "- Solution needed: Use author count or first author name for disambiguation",
      );

      console.log("\nSCENARIO 2: arXiv PDF URL generation works");
      console.log("- Canonical arXiv DOI: 10.48550/arxiv.1406.2661");
      console.log("- PDF URL: http://arxiv.org/pdf/1406.2661.pdf");
      console.log("- This should work if arXiv ID is extracted correctly");

      console.log("\nSCENARIO 3: Published DOI not discoverable");
      console.log("- Published version: NeurIPS 2014");
      console.log("- Published DOI may not be indexed correctly in APIs");
      console.log("- Some conferences don't have proper DOI registration");

      console.log("\nRECOMMENDED FIXES:");
      console.log("1. Add author-based disambiguation in DOI discovery");
      console.log("2. Check first author lastName match before accepting DOI");
      console.log("3. Verify arXiv ID format in Extra field");
      console.log(
        "4. Add year verification when multiple papers have same title",
      );
    });
  });
});
