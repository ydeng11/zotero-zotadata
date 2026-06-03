import { describe, expect, it, vi } from "vitest";
import { IdentifierResolver } from "@/features/metadata/resolvers/IdentifierResolver";
import type { SearchQuery } from "@/shared/core/types";

class TestIdentifierResolver extends IdentifierResolver {
  extract(): string | null {
    return null;
  }

  async discover(): Promise<string | null> {
    return null;
  }

  buildQuery(item: Zotero.Item): SearchQuery {
    return this.buildSearchQuery(item);
  }
}

describe("IdentifierResolver", () => {
  it("uses Zotero date parsing when building search query years", () => {
    const resolver = new TestIdentifierResolver();
    const item = {
      getField: vi.fn((field: string) => {
        if (field === "title") return "A paper";
        if (field === "date") return "20 May 2024";
        return "";
      }),
      getCreators: vi.fn(() => []),
    } as unknown as Zotero.Item;

    expect(resolver.buildQuery(item).year).toBe(2024);
  });
});
