import { describe, it, expect } from "vitest";
import {
  buildCanonicalArxivDoi,
  isSearchQueryActionable,
  normalizeDoi,
  parseArxivId,
  parseDoiFromExtra,
} from "@/utils/itemSearchQuery";

describe("itemSearchQuery", () => {
  it("normalizes DOI prefixes and trailing sentence punctuation", () => {
    expect(normalizeDoi("HTTPS://DOI.ORG/10.5678/Paper.")).toBe(
      "10.5678/Paper",
    );
    expect(normalizeDoi("doi: 10.1000/example]")).toBe("10.1000/example");
  });

  it("parses DOI from Extra when not in the DOI field", () => {
    expect(parseDoiFromExtra(`Publisher: Foo\nDOI: 10.1000/182\n`)).toMatch(
      /^10\.1000\/182$/,
    );
    expect(parseDoiFromExtra("https://doi.org/10.1038/s41586-020-2649-2")).toBe(
      "10.1038/s41586-020-2649-2",
    );
  });

  it("parses DOI from Extra without URL query parameters or fragments", () => {
    expect(
      parseDoiFromExtra(
        "DOI: 10.1038/s41586-020-2649-2?utm_source=zotero#read",
      ),
    ).toBe("10.1038/s41586-020-2649-2");
  });

  it("parses arXiv IDs without trailing punctuation or version suffixes", () => {
    expect(parseArxivId("arXiv: 1706.03762.")).toBe("1706.03762");
    expect(parseArxivId("arXiv: 1706.03762v2.")).toBe("1706.03762");
    expect(buildCanonicalArxivDoi("1706.03762v2.")).toBe(
      "10.48550/arxiv.1706.03762",
    );
  });

  it("isSearchQueryActionable requires at least one search key", () => {
    expect(isSearchQueryActionable({})).toBe(false);
    expect(isSearchQueryActionable({ title: "Paper" })).toBe(true);
    expect(isSearchQueryActionable({ doi: "10.1000/182" })).toBe(true);
  });
});
