import { describe, expect, it } from "vitest";
import { StringUtils } from "@/shared/utils/StringUtils";

describe("StringUtils", () => {
  it("extracts DOI values without trailing sentence punctuation", () => {
    expect(
      StringUtils.extractDOI("Available at https://doi.org/10.1234/example."),
    ).toBe("10.1234/example");
  });

  it("extracts DOI values without URL query parameters or fragments", () => {
    expect(
      StringUtils.extractDOI(
        "Available at https://doi.org/10.1234/example?source=zotero#read",
      ),
    ).toBe("10.1234/example");
  });

  it("keeps truncated output within maxLength when suffix is longer", () => {
    expect(StringUtils.truncate("abcdef", 2)).toBe("..");
  });

  it("does not treat search words as substrings inside longer words", () => {
    expect(StringUtils.containsAnyWords("paid access", ["AI"])).toBe(false);
    expect(StringUtils.containsAllWords("paid access", ["AI"])).toBe(false);
  });

  it("returns a finite TF-IDF score for empty corpora", () => {
    expect(StringUtils.calculateTfIdf("term", "term", [])).toBe(0);
  });

  it("does not count substring-only corpus matches for TF-IDF document frequency", () => {
    const score = StringUtils.calculateTfIdf("ai", "ai systems", [
      "paid access",
      "ai systems",
      "fairness research",
    ]);

    expect(score).toBeGreaterThan(0);
  });

  it("does not return negative TF-IDF scores for terms present across the corpus", () => {
    const score = StringUtils.calculateTfIdf("ai", "ai systems", [
      "ai systems",
      "ai research",
    ]);

    expect(score).toBeGreaterThanOrEqual(0);
  });
});
