import { describe, it, expect } from "vitest";
import { validateMetadataMatch } from "@/utils/authorValidation";

describe("authorValidation - No Authors Case", () => {
  it("should accept match when item has no authors", () => {
    const item = {
      getCreators: () => [],
      getField: (field: string) => {
        if (field === "title") return "Adversarial Machine Learning at Scale";
        if (field === "date") return "2016";
        return "";
      },
    };

    const candidate = {
      title: "Adversarial Machine Learning at Scale",
      authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
      year: 2016,
      doi: "10.48550/arxiv.1611.01236",
      confidence: 0.95,
      source: "CrossRef",
    };

    const result = validateMetadataMatch(item, candidate);

    console.log("Result:", result);

    // Should accept the match even though there are no existing authors
    expect(result.accept).toBe(true);
    expect(result.reason).toBe("Strong match");
  });

  it("should reject match when item has no authors but title similarity is low", () => {
    const item = {
      getCreators: () => [],
      getField: (field: string) => {
        if (field === "title") return "Completely Different Title";
        if (field === "date") return "2016";
        return "";
      },
    };

    const candidate = {
      title: "Adversarial Machine Learning at Scale",
      authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
      year: 2016,
      doi: "10.48550/arxiv.1611.01236",
      confidence: 0.95,
      source: "CrossRef",
    };

    const result = validateMetadataMatch(item, candidate);

    // Should reject due to low title similarity
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("Weak match");
  });
});
