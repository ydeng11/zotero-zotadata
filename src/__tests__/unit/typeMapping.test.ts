import {
  mapCrossRefTypeToZotero,
  mapSemanticScholarTypeToZotero,
} from "@/utils/typeMapping";

describe("mapSemanticScholarTypeToZotero", () => {
  it("maps JournalArticle to journalArticle", () => {
    expect(mapSemanticScholarTypeToZotero("JournalArticle")).toBe(
      "journalArticle",
    );
  });

  it("maps Conference to conferencePaper", () => {
    expect(mapSemanticScholarTypeToZotero("Conference")).toBe(
      "conferencePaper",
    );
  });

  it("maps Review to journalArticle", () => {
    expect(mapSemanticScholarTypeToZotero("Review")).toBe("journalArticle");
  });

  it("handles array of types and returns first valid mapping", () => {
    expect(
      mapSemanticScholarTypeToZotero(["JournalArticle", "Conference"]),
    ).toBe("journalArticle");
    expect(mapSemanticScholarTypeToZotero(["Conference", "Review"])).toBe(
      "conferencePaper",
    );
  });

  it("returns undefined for unknown types", () => {
    expect(mapSemanticScholarTypeToZotero("UnknownType")).toBe(undefined);
    expect(mapSemanticScholarTypeToZotero(["UnknownType"])).toBe(undefined);
  });

  it("handles undefined/null/empty input", () => {
    expect(mapSemanticScholarTypeToZotero(undefined)).toBe(undefined);
    expect(mapSemanticScholarTypeToZotero(null)).toBe(undefined);
    expect(mapSemanticScholarTypeToZotero([])).toBe(undefined);
  });

  it("is case-insensitive", () => {
    expect(mapSemanticScholarTypeToZotero("journalarticle")).toBe(
      "journalArticle",
    );
    expect(mapSemanticScholarTypeToZotero("CONFERENCE")).toBe(
      "conferencePaper",
    );
  });
});