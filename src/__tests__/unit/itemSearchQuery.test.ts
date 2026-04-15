import { describe, it, expect } from "vitest";
import {
  isSearchQueryActionable,
  parseDoiFromExtra,
} from "@/utils/itemSearchQuery";

describe("itemSearchQuery", () => {
  it("parses DOI from Extra when not in the DOI field", () => {
    expect(parseDoiFromExtra(`Publisher: Foo\nDOI: 10.1000/182\n`)).toMatch(
      /^10\.1000\/182$/,
    );
    expect(parseDoiFromExtra("https://doi.org/10.1038/s41586-020-2649-2")).toBe(
      "10.1038/s41586-020-2649-2",
    );
  });

  it("isSearchQueryActionable requires at least one search key", () => {
    expect(isSearchQueryActionable({})).toBe(false);
    expect(isSearchQueryActionable({ title: "Paper" })).toBe(true);
    expect(isSearchQueryActionable({ doi: "10.1000/182" })).toBe(true);
  });
});
