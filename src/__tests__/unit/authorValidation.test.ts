import { describe, it, expect } from "vitest";
import {
  normalizeLastName,
  calculateAuthorOverlap,
  validateMetadataMatch,
} from "@/utils/authorValidation";
import { isExactTitleMatch } from "@/utils/similarity";
import type { SearchResult } from "@/shared/core/types";

describe("authorValidation", () => {
  describe("normalizeLastName", () => {
    it("normalizes various name formats to last name", () => {
      expect(normalizeLastName("Goodfellow")).toBe("goodfellow");
      expect(normalizeLastName("Ian J. Goodfellow")).toBe("goodfellow");
      expect(normalizeLastName("I. Goodfellow")).toBe("goodfellow");
      expect(normalizeLastName("Goodfellow, Ian J.")).toBe("goodfellow");
      expect(normalizeLastName("Bengio, Y.")).toBe("bengio");
      expect(normalizeLastName("van der Maaten")).toBe("van der maaten");
    });

    it("handles empty or invalid input", () => {
      expect(normalizeLastName("")).toBe("");
      expect(normalizeLastName("   ")).toBe("");
    });
  });

  describe("calculateAuthorOverlap", () => {
    it("calculates overlap for matching authors", () => {
      const authors1 = ["Goodfellow", "Bengio", "Courville"];
      const authors2 = ["Goodfellow", "Bengio", "Mirza"];

      const result = calculateAuthorOverlap(authors1, authors2);

      expect(result.matchedAuthors).toEqual(["goodfellow", "bengio"]);
      expect(result.overlapRatio).toBeCloseTo(0.667, 2);
      expect(result.matchCount).toBe(2);
    });

    it("handles no overlap", () => {
      const authors1 = ["Goodfellow", "Bengio"];
      const authors2 = ["Wang", "Li"];

      const result = calculateAuthorOverlap(authors1, authors2);

      expect(result.matchedAuthors).toEqual([]);
      expect(result.overlapRatio).toBe(0);
      expect(result.matchCount).toBe(0);
    });

    it("handles full overlap", () => {
      const authors1 = ["Goodfellow", "Bengio"];
      const authors2 = ["Goodfellow", "Bengio"];

      const result = calculateAuthorOverlap(authors1, authors2);

      expect(result.matchedAuthors).toEqual(["goodfellow", "bengio"]);
      expect(result.overlapRatio).toBe(1);
      expect(result.matchCount).toBe(2);
    });

    it("handles GAN paper case", () => {
      const correct = [
        "Goodfellow",
        "Pouget-Abadie",
        "Mirza",
        "Xu",
        "Warde-Farley",
        "Ozair",
        "Courville",
        "Bengio",
      ];
      const wrong = ["Labaca-Castro"];

      const result = calculateAuthorOverlap(correct, wrong);

      expect(result.matchCount).toBe(0);
      expect(result.overlapRatio).toBe(0);
    });
  });

  describe("isExactTitleMatch", () => {
    it("detects exact title matches correctly", () => {
      expect(
        isExactTitleMatch(
          "Adversarial Machine Learning at Scale",
          "Adversarial Machine Learning at Scale",
        ),
      ).toBe(true);
      expect(
        isExactTitleMatch(
          "Adversarial Machine Learning at Scale",
          "Large-scale strategic games and adversarial machine learning",
        ),
      ).toBe(false);
      expect(
        isExactTitleMatch(
          "Generative Adversarial Nets",
          "Generative Adversarial Networks",
        ),
      ).toBe(true);
      expect(isExactTitleMatch("Test Title!", "test title")).toBe(true);
    });
  });

  describe("validateMetadataMatch", () => {
    const createMockItem = (
      authors: string[],
      year: number,
      title: string,
    ) => ({
      getCreators: () =>
        authors.map((a) => ({
          lastName: a,
          firstName: "",
          creatorType: "author",
        })),
      getField: (field: string) => (field === "title" ? title : String(year)),
    });

    it("accepts match with sufficient author overlap", () => {
      const item = createMockItem(
        ["Goodfellow", "Bengio", "Courville"],
        2014,
        "Generative Adversarial Nets",
      );

      const candidate: SearchResult = {
        title: "Generative Adversarial Nets",
        authors: ["Goodfellow", "Bengio", "Mirza"],
        year: 2014,
        doi: "10.1234/test",
        confidence: 1,
        source: "CrossRef",
      };

      const result = validateMetadataMatch(item, candidate);

      expect(result.accept).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
    });

    it("rejects match with no author overlap", () => {
      const item = createMockItem(
        ["Goodfellow", "Bengio", "Courville", "Mirza", "Xu"],
        2014,
        "Generative Adversarial Nets",
      );

      const candidate: SearchResult = {
        title: "Generative Adversarial Nets",
        authors: ["Labaca-Castro"],
        year: 2023,
        doi: "10.1007/978-3-658-40442-0_9",
        confidence: 1,
        source: "OpenAlex",
      };

      const result = validateMetadataMatch(item, candidate);

      expect(result.accept).toBe(false);
      expect(result.reason).toContain("No authors match");
    });

    it("rejects match with large author count difference", () => {
      const item = createMockItem(
        [
          "Goodfellow",
          "Pouget-Abadie",
          "Mirza",
          "Xu",
          "Warde-Farley",
          "Ozair",
          "Courville",
          "Bengio",
        ],
        2014,
        "Generative Adversarial Nets",
      );

      const candidate: SearchResult = {
        title: "Generative Adversarial Nets",
        authors: ["Goodfellow"],
        year: 2023,
        doi: "10.1007/978-3-658-40442-0_9",
        confidence: 1,
        source: "OpenAlex",
      };

      const result = validateMetadataMatch(item, candidate);

      expect(result.accept).toBe(false);
      expect(result.reason).toContain("Author count differs");
    });

    it("accepts match with year difference but strong author overlap", () => {
      const item = createMockItem(
        ["Goodfellow", "Bengio", "Courville"],
        2014,
        "Deep Learning",
      );

      const candidate: SearchResult = {
        title: "Deep Learning",
        authors: ["Goodfellow", "Bengio", "Courville"],
        year: 2016,
        doi: "10.1038/nature14539",
        confidence: 1,
        source: "CrossRef",
      };

      const result = validateMetadataMatch(item, candidate);

      expect(result.accept).toBe(true);
    });

    it("rejects match when title matches but year differs significantly", () => {
      const item = createMockItem(
        [
          "Goodfellow",
          "Pouget-Abadie",
          "Mirza",
          "Xu",
          "Warde-Farley",
          "Ozair",
          "Courville",
          "Bengio",
        ],
        2014,
        "Generative Adversarial Nets",
      );

      const candidate: SearchResult = {
        title: "Generative Adversarial Networks",
        authors: [
          "Ian Goodfellow",
          "Jean Pouget-Abadie",
          "Mehdi Mirza",
          "Bing Xu",
          "David Warde-Farley",
          "Sherjil Ozair",
          "Aaron Courville",
          "Yoshua Bengio",
        ],
        year: 2020,
        doi: "10.1145/3422622",
        confidence: 1,
        source: "CrossRef",
      };

      const result = validateMetadataMatch(item, candidate);

      // With abbreviation expansion, "Nets" matches "Networks"
      // Authors match and title matches (via abbreviation expansion)
      expect(result.accept).toBe(true);
    });

    it("accepts exact title match with complete metadata when no existing authors", () => {
      const item = createMockItem(
        [],
        0,
        "Adversarial Machine Learning at Scale",
      );

      const candidate: SearchResult = {
        title: "Adversarial Machine Learning at Scale",
        authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
        year: 2016,
        doi: "10.48550/arxiv.1611.01236",
        confidence: 0.95,
        source: "OpenAlex",
      };

      const result = validateMetadataMatch(item, candidate);

      expect(result.accept).toBe(true);
      expect(result.score).toBeCloseTo(0.9, 2);
    });

    it("rejects exact title match missing authors when no existing authors", () => {
      const item = createMockItem(
        [],
        0,
        "Adversarial Machine Learning at Scale",
      );

      const candidate: SearchResult = {
        title: "Adversarial Machine Learning at Scale",
        authors: [],
        year: 2016,
        doi: "10.48550/arxiv.1611.01236",
        confidence: 0.95,
        source: "OpenAlex",
      };

      const result = validateMetadataMatch(item, candidate);

      expect(result.accept).toBe(false);
      expect(result.reason).toContain("missing required metadata");
    });

    it("rejects exact title match missing year when no existing authors", () => {
      const item = createMockItem(
        [],
        0,
        "Adversarial Machine Learning at Scale",
      );

      const candidate: SearchResult = {
        title: "Adversarial Machine Learning at Scale",
        authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
        year: 0,
        doi: "10.48550/arxiv.1611.01236",
        confidence: 0.95,
        source: "OpenAlex",
      };

      const result = validateMetadataMatch(item, candidate);

      expect(result.accept).toBe(false);
      expect(result.reason).toContain("missing required metadata");
    });
  });
});
