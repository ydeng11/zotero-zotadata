import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookMetadataService } from "@/modules/metadata/BookMetadataService";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";
import type { OpenLibraryBookMetadata } from "@/modules/metadata/types";

describe("BookMetadataService", () => {
  let service: BookMetadataService;
  let httpRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new BookMetadataService();
    httpRequest = vi.fn();
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      log: vi.fn(),
      HTTP: {
        request: httpRequest,
      },
      Utilities: {
        ...globalThis.Zotero.Utilities,
        cleanISBN: (isbn: string) => isbn.replace(/[-\s]/g, ""),
      },
      CreatorTypes: {
        ...(globalThis.Zotero as unknown as { CreatorTypes: object })
          .CreatorTypes,
        getName: (creatorTypeID: number) =>
          creatorTypeID === 1 ? "author" : "editor",
      },
    });
  });

  function mockJsonResponse(payload: unknown): {
    status: number;
    responseText: string;
  } {
    return {
      status: 200,
      responseText: JSON.stringify(payload),
    };
  }

  function mockBookMetadataHTTP(): void {
    httpRequest.mockImplementation((_method: string, url: string) => {
      if (url.includes("ISBN:9781399603591")) {
        return Promise.resolve(mockJsonResponse({}));
      }

      if (url.includes("q=isbn%3A9781399603591")) {
        return Promise.resolve(mockJsonResponse({ items: [] }));
      }

      if (url.includes("search.json")) {
        return Promise.resolve(
          mockJsonResponse({
            docs: [
              {
                author_name: ["Joe Abercrombie"],
                isbn: ["9781399603560", "1399603566"],
                title: "The Devils",
              },
            ],
          }),
        );
      }

      if (url.includes("ISBN:9781399603560")) {
        return Promise.resolve(
          mockJsonResponse({
            "ISBN:9781399603560": {
              details: {
                authors: [{ name: "Joe Abercrombie" }],
                publish_date: "06 May 2025",
                publishers: ["Orion Publishing Co"],
                title: "The Devils",
              },
            },
          }),
        );
      }

      return Promise.resolve(mockJsonResponse({ items: [] }));
    });
  }

  it("skips author validation when fetched book authors have no usable names", async () => {
    const item = createMockItem({
      title: "Dune",
      creators: [{ firstName: "Frank", lastName: "Herbert" }],
    });
    const metadata = {
      title: "Dune",
      authors: [{ key: "/authors/OL79034A" }],
      publishers: ["Ace"],
    } as unknown as OpenLibraryBookMetadata;

    const result = await service.updateItemWithBookMetadata(item, metadata);

    expect(result.rejectionReason).toBeUndefined();
    expect(item.setField).toHaveBeenCalledWith("publisher", "Ace");
  });

  it("uses a guarded title fallback when an ebook ISBN lookup misses", async () => {
    mockBookMetadataHTTP();
    const item = createMockItem({
      ISBN: "978-1399603591",
      title: "The Devils",
      creators: [{ firstName: "Joe", lastName: "Abercrombie" }],
      itemTypeID: 2,
    });

    const result = await service.fetchISBNBasedMetadata(item);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        updated: true,
      }),
    );
    expect(item.getField("ISBN")).toBe("978-1399603591");
    expect(item.getField("extra")).toContain(
      "Zotadata fallback edition: 9781399603560",
    );
    expect(result.changes).toContain(
      "Used fallback edition ISBN: 9781399603560",
    );
    expect(result.changes).toContain("Stored fallback edition ISBN in Extra");
  });

  it("uses fallback with a Zotero full-name author creator", async () => {
    mockBookMetadataHTTP();
    const item = createMockItem({
      ISBN: "978-1-3996-0359-1",
      title: "The Devils",
      itemTypeID: 2,
    });
    vi.mocked(item.getCreators).mockReturnValue([
      {
        creatorTypeID: 1,
        lastName: "Joe Abercrombie",
      } as unknown as ReturnType<typeof item.getCreators>[number],
    ]);

    const result = await service.fetchISBNBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(
      httpRequest.mock.calls.some(([, url]) =>
        String(url).includes("author=Joe%20Abercrombie"),
      ),
    ).toBe(true);
    expect(item.getField("extra")).toContain(
      "Zotadata fallback edition: 9781399603560",
    );
  });

  it("does not derive fallback author data from a prefixed title", async () => {
    mockBookMetadataHTTP();
    const item = createMockItem({
      ISBN: "978-1399603591",
      title: "Joe Abercrombie - The Devils",
      itemTypeID: 2,
    });

    const result = await service.fetchISBNBasedMetadata(item);

    expect(result.success).toBe(false);
    expect(
      httpRequest.mock.calls.some(([, url]) =>
        String(url).includes("author=Joe%20Abercrombie"),
      ),
    ).toBe(false);
    expect(item.getField("extra")).not.toContain(
      "Zotadata fallback edition:",
    );
  });

  it("rejects fallback ISBN candidates with a mismatched title", async () => {
    httpRequest.mockImplementation((_method: string, url: string) => {
      if (url.includes("search.json")) {
        return Promise.resolve(
          mockJsonResponse({
            docs: [
              {
                author_name: ["Joe Abercrombie"],
                isbn: ["9781399603560"],
                title: "Best Served Cold",
              },
            ],
          }),
        );
      }

      return Promise.resolve(mockJsonResponse({}));
    });
    const item = createMockItem({
      ISBN: "978-1399603591",
      title: "The Devils",
      creators: [{ firstName: "Joe", lastName: "Abercrombie" }],
      itemTypeID: 2,
    });

    const result = await service.fetchISBNBasedMetadata(item);

    expect(result.success).toBe(false);
    expect(item.getField("extra")).not.toContain("Zotadata fallback edition:");
    expect(
      httpRequest.mock.calls.some(([, url]) =>
        String(url).includes("ISBN:9781399603560"),
      ),
    ).toBe(false);
  });

  it("rejects fallback ISBN candidates with mismatched authors", async () => {
    httpRequest.mockImplementation((_method: string, url: string) => {
      if (url.includes("search.json")) {
        return Promise.resolve(
          mockJsonResponse({
            docs: [
              {
                author_name: ["Jane Austen"],
                isbn: ["9781399603560"],
                title: "The Devils",
              },
            ],
          }),
        );
      }

      return Promise.resolve(mockJsonResponse({}));
    });
    const item = createMockItem({
      ISBN: "978-1399603591",
      title: "The Devils",
      creators: [{ firstName: "Joe", lastName: "Abercrombie" }],
      itemTypeID: 2,
    });

    const result = await service.fetchISBNBasedMetadata(item);

    expect(result.success).toBe(false);
    expect(item.getField("extra")).not.toContain("Zotadata fallback edition:");
    expect(
      httpRequest.mock.calls.some(([, url]) =>
        String(url).includes("ISBN:9781399603560"),
      ),
    ).toBe(false);
  });

  it("does not use title fallback when exact ISBN lookup succeeds", async () => {
    httpRequest.mockImplementation((_method: string, url: string) => {
      if (url.includes("ISBN:9781399603560")) {
        return Promise.resolve(
          mockJsonResponse({
            "ISBN:9781399603560": {
              details: {
                authors: [{ name: "Joe Abercrombie" }],
                publishers: ["Orion Publishing Co"],
                title: "The Devils",
              },
            },
          }),
        );
      }

      return Promise.resolve(mockJsonResponse({}));
    });
    const item = createMockItem({
      ISBN: "9781399603560",
      title: "The Devils",
      creators: [{ firstName: "Joe", lastName: "Abercrombie" }],
      itemTypeID: 2,
    });

    const result = await service.fetchISBNBasedMetadata(item);

    expect(result.success).toBe(true);
    expect(
      httpRequest.mock.calls.some(([, url]) =>
        String(url).includes("search.json"),
      ),
    ).toBe(false);
  });
});
