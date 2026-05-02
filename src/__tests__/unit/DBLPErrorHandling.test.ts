import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

describe("DBLP Error Handling", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher({
      config: {
        downloads: { maxConcurrent: 3 },
      },
    } as never);

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      log: vi.fn(),
      Utilities: {
        ...globalThis.Zotero.Utilities,
        cleanDOI: (doi: string) =>
          doi
            .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
            .replace(/^doi:\s*/i, "")
            .trim(),
        cleanISBN: (isbn: string) => isbn.replace(/[-\s]/g, ""),
      },
      ItemTypes: {
        getName: vi.fn((typeID: number) => {
          if (typeID === 1) return "journalArticle";
          if (typeID === 2) return "book";
          if (typeID === 3) return "conferencePaper";
          if (typeID === 4) return "preprint";
          return "journalArticle";
        }),
        getID: vi.fn((name: string) => {
          if (name === "journalArticle") return 1;
          if (name === "book") return 2;
          if (name === "conferencePaper") return 3;
          if (name === "preprint") return 4;
          return 1;
        }),
      },
      CreatorTypes: {
        getPrimaryIDForType: vi.fn(() => 1),
      },
      Date: {
        strToDate: (value: string) => ({
          year: value.match(/\d{4}/)?.[0],
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("handles DBLP 500 error gracefully without crashing", async () => {
    const item = createMockItem({
      title: "Adversarial Feature Learning",
      creators: [{ firstName: "Jane", lastName: "Doe" }],
    });

    // Mock HTTP request to return 500 error with HTML response
    const mockRequest = vi.fn().mockResolvedValue({
      status: 500,
      responseText: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>dblp: error 500</title></head>
<body>Internal Server Error</body>
</html>`,
    });
    (globalThis.Zotero.HTTP.request as unknown as ReturnType<typeof vi.fn>) =
      mockRequest;

    const doi = await fetcher.doiDiscoveryService.searchDBLPForDOI(item);

    // Should return null instead of throwing an error
    expect(doi).toBeNull();

    // Should log the error status
    expect(globalThis.Zotero.log).toHaveBeenCalledWith(
      expect.stringContaining("DBLP API returned status 500"),
    );
  });

  it("handles DBLP invalid JSON response gracefully", async () => {
    const item = createMockItem({
      title: "Adversarial Feature Learning",
      creators: [{ firstName: "Jane", lastName: "Doe" }],
    });

    // Mock HTTP request to return 200 but with HTML instead of JSON
    const mockRequest = vi.fn().mockResolvedValue({
      status: 200,
      responseText: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>dblp: error 500</title></head>
<body>Internal Server Error</body>
</html>`,
    });
    (globalThis.Zotero.HTTP.request as unknown as ReturnType<typeof vi.fn>) =
      mockRequest;

    const doi = await fetcher.doiDiscoveryService.searchDBLPForDOI(item);

    // Should return null instead of throwing a JSON parse error
    expect(doi).toBeNull();

    // Should log the JSON parsing error
    expect(globalThis.Zotero.log).toHaveBeenCalledWith(
      expect.stringContaining("DBLP search failed"),
    );
  });

  it("handles DBLP network errors gracefully", async () => {
    const item = createMockItem({
      title: "Adversarial Feature Learning",
      creators: [{ firstName: "Jane", lastName: "Doe" }],
    });

    // Mock HTTP request to throw a network error
    (globalThis.Zotero.HTTP.request as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockRejectedValue(new Error("Network error"));

    const doi = await fetcher.doiDiscoveryService.searchDBLPForDOI(item);

    // Should return null instead of throwing an error
    expect(doi).toBeNull();

    // Should log the network error
    expect(globalThis.Zotero.log).toHaveBeenCalledWith(
      expect.stringContaining("DBLP search failed"),
    );
  });
});
