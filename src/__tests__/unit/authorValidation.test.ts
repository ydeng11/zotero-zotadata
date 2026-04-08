import { describe, it, expect } from "vitest";
import {
  normalizeLastName,
  calculateAuthorOverlap,
  validateMetadataMatch,
} from "@/utils/authorValidation";
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
  });
});
