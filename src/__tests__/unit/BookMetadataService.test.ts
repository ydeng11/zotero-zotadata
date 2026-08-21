import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorType } from "@/shared/core";
import { BookMetadataService } from "@/modules/metadata/BookMetadataService";
import type {
  GoogleBooksVolumeInfo,
  OpenLibraryBookMetadata,
} from "@/modules/metadata/types";
import { createMockItem } from "../../../tests/__mocks__/zotero-items";

const EXPECTED_GOOGLE_BOOKS_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0",
} as const;

describe("BookMetadataService", () => {
  let service: BookMetadataService;

  beforeEach(() => {
    service = new BookMetadataService();
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      log: vi.fn(),
      Utilities: {
        ...globalThis.Zotero.Utilities,
        cleanISBN: (isbn: string) => isbn.replace(/[-\s]/g, ""),
      },
    });
  });

  it("extracts ISBN values from Extra when digits are separated by spaces", () => {
    const item = createMockItem({
      extra: "Publisher: Example Press\nISBN: 978 1 4028 9462 6",
    });

    expect(service.extractISBN(item)).toBe("9781402894626");
  });

  it("ignores malformed ISBN field values", () => {
    const item = createMockItem({ ISBN: "not-an-isbn" });

    expect(service.extractISBN(item)).toBeNull();
  });

  it("ignores Extra ISBN values with invalid check digits", () => {
    const item = createMockItem({
      extra: "Publisher: Example Press\nISBN: 978 0 306 40615 8",
    });

    expect(service.extractISBN(item)).toBeNull();
  });

  it("preserves runtime creator roles and fieldMode from book translators", async () => {
    const translatedCreators = [
      {
        creatorTypeID: 8,
        fieldMode: 1,
        firstName: "",
        lastName: "Oxford University Press Staff",
      },
      {
        creatorTypeID: 10,
        firstName: "Donald A.",
        lastName: "Wittman",
      },
      {
        creatorTypeID: 10,
        firstName: "Barry R.",
        lastName: "Weingast",
      },
    ];
    const MockTranslateSearch = vi.fn().mockImplementation(() => ({
      setIdentifier: vi.fn(),
      getTranslators: vi.fn().mockResolvedValue(["translator"]),
      setTranslator: vi.fn(),
      translate: vi.fn().mockResolvedValue([
        {
          getCreators: () => translatedCreators,
          getField: () => "",
          saveTx: vi.fn().mockResolvedValue(undefined),
        },
      ]),
    }));
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      Translate: { Search: MockTranslateSearch },
      log: vi.fn(),
    });
    const item = createMockItem({
      ISBN: "9780199548477",
      title: "The Oxford Handbook of Political Economy",
    });

    await service.fetchBookMetadata("9780199548477", item);

    expect(item.setCreators).toHaveBeenCalledWith(translatedCreators);
  });

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
    expect(item.setCreators).not.toHaveBeenCalled();
    expect(result.changes).not.toContainEqual(
      expect.stringContaining("Updated authors"),
    );
    expect(item.getCreators()).toEqual([
      { firstName: "Frank", lastName: "Herbert", creatorType: "author" },
    ]);
  });

  it("does not write invalid page counts from book metadata", async () => {
    const item = createMockItem({
      title: "Dune",
      creators: [{ firstName: "Frank", lastName: "Herbert" }],
    });
    const metadata = {
      title: "Dune",
      authors: ["Frank Herbert"],
      publishers: ["Ace"],
      number_of_pages: -10,
    } as OpenLibraryBookMetadata;

    const result = await service.updateItemWithBookMetadata(item, metadata);

    expect(item.setField).not.toHaveBeenCalledWith("numPages", "-10");
    expect(item.getField("numPages")).toBe("");
    expect(result.changes).not.toContain("Updated pages: -10");
  });

  it("writes valid Google Books page counts", async () => {
    const item = createMockItem({
      title: "Dune",
      creators: [{ firstName: "Frank", lastName: "Herbert" }],
    });
    const metadata = {
      title: "Dune",
      authors: ["Frank Herbert"],
      publisher: "Ace",
      pageCount: 412,
    } as GoogleBooksVolumeInfo;

    const result = await service.updateItemWithBookMetadata(item, metadata);

    expect(item.getField("numPages")).toBe("412");
    expect(result.changes).toContain("Updated pages: 412");
  });

  it("does not write whitespace-only book metadata fields", async () => {
    const item = createMockItem({
      title: "",
      creators: [{ firstName: "Frank", lastName: "Herbert" }],
    });
    const metadata = {
      title: "   ",
      authors: ["Frank Herbert"],
      publishers: ["   "],
      publish_date: "   ",
    } as OpenLibraryBookMetadata;

    const result = await service.updateItemWithBookMetadata(item, metadata);

    expect(item.setField).not.toHaveBeenCalledWith("title", "   ");
    expect(item.setField).not.toHaveBeenCalledWith("publisher", "   ");
    expect(item.setField).not.toHaveBeenCalledWith("date", "   ");
    expect(item.getField("title")).toBe("");
    expect(item.getField("publisher")).toBe("");
    expect(item.getField("date")).toBe("");
    expect(result.changes).not.toContain("Updated title:    ");
    expect(result.changes).not.toContain("Updated publisher:    ");
    expect(result.changes).not.toContain("Updated date:    ");
  });

  it("treats whitespace-only existing titles as blank", async () => {
    const item = createMockItem({
      title: "            ",
      creators: [{ firstName: "Frank", lastName: "Herbert" }],
    });
    const metadata = {
      title: "Dune",
      authors: ["Frank Herbert"],
      publishers: ["Ace"],
    } as OpenLibraryBookMetadata;

    const result = await service.updateItemWithBookMetadata(item, metadata);

    expect(item.getField("title")).toBe("Dune");
    expect(result.changes).toContain("Updated title: Dune");
  });

  it("handles transient Google Books failures without letting Zotero treat non-2xx as request failures", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 404,
        responseText: "{}",
        response: "{}",
        getResponseHeader: () => null,
      })
      .mockResolvedValueOnce({
        status: 503,
        responseText: JSON.stringify({
          error: {
            code: 503,
            message: "Service temporarily unavailable.",
          },
        }),
        response: "{}",
        getResponseHeader: () => null,
      });
    const log = vi.fn();
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      HTTP: { request },
      Translate: undefined,
      log,
    });

    const item = createMockItem({ ISBN: "9781399603591" });
    const result = await service.fetchBookMetadata("9781399603591", item);

    expect(result).toBeNull();
    expect(request).toHaveBeenNthCalledWith(
      2,
      "GET",
      "https://www.googleapis.com/books/v1/volumes?q=isbn:9781399603591",
      expect.objectContaining({
        headers: EXPECTED_GOOGLE_BOOKS_HEADERS,
        successCodes: false,
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`[${ErrorType.NETWORK_ERROR}]`),
      3,
    );
  });

  it("sends a browser-like User-Agent when searching Google Books by title", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 404,
        responseText: "{}",
        response: "{}",
        getResponseHeader: () => null,
      })
      .mockResolvedValueOnce({
        status: 200,
        responseText: JSON.stringify({ items: [] }),
        response: "{}",
        getResponseHeader: () => null,
      });
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      HTTP: { request },
      log: vi.fn(),
    });

    const item = createMockItem({ title: "Effective Java" });
    const result = await service.discoverISBN(item);

    expect(result).toBeNull();
    expect(request).toHaveBeenNthCalledWith(
      2,
      "GET",
      "https://www.googleapis.com/books/v1/volumes?q=intitle%3A%22Effective%20Java%22&maxResults=5",
      expect.objectContaining({
        headers: EXPECTED_GOOGLE_BOOKS_HEADERS,
        successCodes: false,
      }),
    );
  });

  it("does not discover malformed ISBN values from title search results", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        responseText: JSON.stringify({
          docs: [
            {
              title: "Dune",
              isbn: ["not-an-isbn", "12345"],
            },
          ],
        }),
        response: "{}",
        getResponseHeader: () => null,
      })
      .mockResolvedValueOnce({
        status: 200,
        responseText: JSON.stringify({
          items: [
            {
              volumeInfo: {
                title: "Dune",
                industryIdentifiers: [
                  { type: "ISBN_13", identifier: "978-not-valid" },
                ],
              },
            },
          ],
        }),
        response: "{}",
        getResponseHeader: () => null,
      });
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      HTTP: { request },
      log: vi.fn(),
    });

    const item = createMockItem({ title: "Dune" });

    await expect(service.discoverISBN(item)).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("skips Google Books calls when googleBooksEnabled is false", async () => {
    const disabledService = new BookMetadataService({
      googleBooksEnabled: false,
    });
    const request = vi.fn();
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      HTTP: { request },
      Translate: undefined,
      log: vi.fn(),
    });

    const item = createMockItem({ ISBN: "9781399603591" });
    const metadata = await disabledService.fetchBookMetadata(
      "9781399603591",
      item,
    );

    expect(metadata).toBeNull();
    // When Google Books is disabled AND OpenLibrary/Translator fail,
    // no Google Books HTTP request should be made at all.
    // The only HTTP requests would be for OpenLibrary (non-Google).
    const googleCalls = request.mock.calls.filter(
      (call: [string, string, ...unknown[]]) =>
        typeof call[1] === "string" && call[1].includes("googleapis.com"),
    );
    expect(googleCalls).toHaveLength(0);
  });

  it("appends API key to Google Books URL when configured", async () => {
    const keyedService = new BookMetadataService({
      googleBooksApiKey: "test-api-key-123",
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 404,
        responseText: "{}",
        response: "{}",
        getResponseHeader: () => null,
      })
      .mockResolvedValueOnce({
        status: 200,
        responseText: JSON.stringify({
          items: [
            {
              volumeInfo: {
                title: "Dune",
                industryIdentifiers: [
                  { type: "ISBN_13", identifier: "9780441013593" },
                ],
              },
            },
          ],
        }),
        response: "{}",
        getResponseHeader: () => null,
      });
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      HTTP: { request },
      log: vi.fn(),
    });

    const item = createMockItem({ title: "Dune" });
    await keyedService.discoverISBN(item);

    // The Google Books call should include the API key
    const googleCall = request.mock.calls.find(
      (call: [string, string, ...unknown[]]) =>
        typeof call[1] === "string" && call[1].includes("googleapis.com"),
    );
    expect(googleCall).toBeDefined();
    expect(googleCall[1]).toContain("&key=test-api-key-123");
  });
});
