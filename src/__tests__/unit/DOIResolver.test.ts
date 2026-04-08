import { describe, it, expect, vi } from "vitest";
import { DOIResolver } from "@/features/metadata/resolvers/DOIResolver";

describe("DOIResolver", () => {
  it("should extract DOI from item", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return "10.1234/test";
        return null;
      }),
    };

    const doi = resolver.extract(mockItem as any);
    expect(doi).toBe("10.1234/test");
  });

  it("should extract DOI from URL field", () => {
    const resolver = new DOIResolver();

    const mockItem = {
      getField: vi.fn((field: string) => {
        if (field === "DOI") return null;
        if (field === "url") return "https://doi.org/10.5678/paper";
        return null;
      }),
    };

    const doi = resolver.extract(mockItem as any);
    expect(doi).toBe("10.5678/paper");
  });
});
