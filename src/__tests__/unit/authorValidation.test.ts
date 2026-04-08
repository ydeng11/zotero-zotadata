import { describe, it, expect } from "vitest";
import {
  normalizeLastName,
  calculateAuthorOverlap,
} from "@/utils/authorValidation";

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
});
