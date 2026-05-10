import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorType } from "@/shared/core";
import { BookMetadataService } from "@/modules/metadata/BookMetadataService";
import type { OpenLibraryBookMetadata } from "@/modules/metadata/types";
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
    });
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
      'https://www.googleapis.com/books/v1/volumes?q=intitle%3A%22Effective%20Java%22&maxResults=5',
      expect.objectContaining({
        headers: EXPECTED_GOOGLE_BOOKS_HEADERS,
        successCodes: false,
      }),
    );
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
    const metadata = await disabledService.fetchBookMetadata("9781399603591", item);

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
