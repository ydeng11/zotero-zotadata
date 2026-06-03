import { describe, it, expect, vi } from "vitest";
import { DOIResolver } from "@/features/metadata/resolvers/DOIResolver";

describe("DOIResolver", () => {
  it("should extract DOI from item", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return "10.1234/test";
        return "";
      }),
    } as unknown as Zotero.Item;

    const doi = resolver.extract(mockItem);
    expect(doi).toBe("10.1234/test");
  });

  it("should extract DOI from URL field", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return "";
        if (field === "url") return "https://doi.org/10.5678/paper";
        return "";
      }),
    } as unknown as Zotero.Item;

    const doi = resolver.extract(mockItem);
    expect(doi).toBe("10.5678/paper");
  });

  it("should normalize mixed-case DOI URL prefixes", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return "HTTPS://DOI.ORG/10.5678/Paper";
        return "";
      }),
    } as unknown as Zotero.Item;

    const doi = resolver.extract(mockItem);
    expect(doi).toBe("10.5678/paper");
  });

  it("should trim sentence punctuation from extracted DOI URLs", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return "";
        if (field === "url") return "See https://doi.org/10.5678/paper.";
        return "";
      }),
    } as unknown as Zotero.Item;

    const doi = resolver.extract(mockItem);
    expect(doi).toBe("10.5678/paper");
  });

  it("should ignore URL query parameters and fragments when extracting DOI URLs", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return "";
        if (field === "url") {
          return "https://doi.org/10.5678/paper?utm_source=zotero#read";
        }
        return "";
      }),
    } as unknown as Zotero.Item;

    const doi = resolver.extract(mockItem);
    expect(doi).toBe("10.5678/paper");
  });

  it("should ignore URL query parameters and fragments in Extra DOI values", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return "";
        if (field === "url") return "";
        if (field === "extra") {
          return "DOI: 10.5678/paper?utm_source=zotero#read";
        }
        return "";
      }),
    } as unknown as Zotero.Item;

    const doi = resolver.extract(mockItem);
    expect(doi).toBe("10.5678/paper");
  });

  it("should extract DOI URLs from labeled Extra values", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return "";
        if (field === "url") return "";
        if (field === "extra") {
          return "DOI: https://doi.org/10.5678/paper.";
        }
        return "";
      }),
    } as unknown as Zotero.Item;

    const doi = resolver.extract(mockItem);
    expect(doi).toBe("10.5678/paper");
  });
});
