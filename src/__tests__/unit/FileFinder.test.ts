import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileFinder } from "@/modules/FileFinder";

function makeMockItem(overrides: Record<string, unknown> = {}): Zotero.Item {
  const fields: Record<string, string> = {
    title: "Test Paper Title",
    DOI: "10.1234/test.2024",
    date: "2024",
    extra: "",
    ...(overrides.fields as Record<string, string> | undefined),
  };

  return {
    id: (overrides.id as number) ?? 1,
    libraryID: (overrides.libraryID as number) ?? 1,
    isRegularItem: () => (overrides.isRegular as boolean) ?? true,
    getField: (f: string) => fields[f] ?? "",
    getCreators: () =>
      (overrides.creators as Array<{
        firstName: string;
        lastName: string;
        creatorType: string;
      }>) ?? [{ firstName: "Jane", lastName: "Doe", creatorType: "author" }],
    getAttachments: () => (overrides.attachmentIds as number[]) ?? [],
    isAttachment: () => false,
  } as unknown as Zotero.Item;
}

describe("FileFinder", () => {
  let finder: FileFinder;
  let mockOpenAlex: { searchOpenAccess: ReturnType<typeof vi.fn> };
  let mockS2: { searchOpenAccess: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOpenAlex = { searchOpenAccess: vi.fn().mockResolvedValue([]) };
    mockS2 = { searchOpenAccess: vi.fn().mockResolvedValue([]) };

    finder = new FileFinder(mockOpenAlex as any, mockS2 as any);
  });

  it("skips non-regular items", async () => {
    const item = makeMockItem({ isRegular: false });
    const result = await finder.processItem(item);
    expect(result.outcome).toBe("skipped_not_regular");
  });

  it("reports already_has_file when a stored attachment exists", async () => {
    const attachments = new Map<number, unknown>();
    attachments.set(100, {
      isAttachment: () => true,
      isPDFAttachment: () => true,
      attachmentLinkMode: 2,
      attachmentContentType: "application/pdf",
      fileExists: vi.fn().mockResolvedValue(true),
      getFile: () => ({ exists: () => true }),
    });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      Items: { get: (id: number) => attachments.get(id) ?? null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
      },
    });

    const item = makeMockItem({ attachmentIds: [100] });
    const result = await finder.processItem(item);

    expect(result.outcome).toBe("already_has_file");
    vi.unstubAllGlobals();
  });

  it("does not treat snapshot-only attachments as existing PDFs", async () => {
    const attachments = new Map<number, unknown>();
    attachments.set(100, {
      isAttachment: () => true,
      isPDFAttachment: () => false,
      attachmentLinkMode: 2,
      attachmentContentType: "text/html",
      fileExists: vi.fn().mockResolvedValue(true),
      getFile: () => ({ exists: () => true }),
    });

    const importFromURL = vi.fn().mockResolvedValue({ id: 204 });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      locale: "en-US",
      Items: { get: (id: number) => attachments.get(id) ?? null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 404,
          responseText: "{}",
        }),
      },
    });

    mockOpenAlex.searchOpenAccess.mockResolvedValue([
      {
        title: "Test Paper Title",
        authors: ["Jane Doe"],
        pdfUrl: "https://example.com/paper.pdf",
        confidence: 0.9,
        source: "OpenAlex",
      },
    ]);

    const item = makeMockItem({ attachmentIds: [100] });
    const result = await finder.processItem(item);

    expect(result.outcome).toBe("downloaded");
    expect(importFromURL).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("returns no_source_found when no API has a PDF", async () => {
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 404,
          responseText: "{}",
        }),
      },
    });

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe("no_source_found");
    vi.unstubAllGlobals();
  });

  it("downloads PDF when OpenAlex returns an OA result", async () => {
    const importFromURL = vi.fn().mockResolvedValue({ id: 200 });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 404,
          responseText: "{}",
        }),
      },
    });

    mockOpenAlex.searchOpenAccess.mockResolvedValue([
      {
        title: "Test Paper Title",
        authors: ["Jane Doe"],
        doi: "10.1234/test.2024",
        pdfUrl: "https://example.com/paper.pdf",
        confidence: 0.9,
        source: "OpenAlex",
      },
    ]);

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe("downloaded");
    expect(result.source).toBe("OpenAlex");
    expect(importFromURL).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/paper.pdf",
        parentItemID: 1,
      }),
    );

    vi.unstubAllGlobals();
  });

  it("prefers Unpaywall when DOI is available", async () => {
    const importFromURL = vi.fn().mockResolvedValue({ id: 201 });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 200,
          responseText: JSON.stringify({
            is_oa: true,
            best_oa_location: {
              url_for_pdf: "https://unpaywall.example.com/paper.pdf",
            },
          }),
        }),
      },
    });

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe("downloaded");
    expect(result.source).toBe("Unpaywall");
    expect(importFromURL).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://unpaywall.example.com/paper.pdf",
      }),
    );
    expect(mockOpenAlex.searchOpenAccess).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("ignores a mismatched non-arXiv DOI for arXiv-like items and falls back to the arXiv PDF", async () => {
    const importFromURL = vi.fn().mockResolvedValue({ id: 205 });
    const request = vi.fn().mockResolvedValue({
      status: 404,
      responseText: "{}",
    });
    (mockOpenAlex as any).getWorkByDOI = vi.fn().mockResolvedValue({
      title: "Completely Different Paper",
      authors: ["Someone Else"],
      year: 2003,
      doi: "10.1000/official",
      url: "https://openalex.org/W999",
      confidence: 1,
      source: "OpenAlex",
    });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      locale: "en-US",
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request,
      },
    });

    const item = makeMockItem({
      fields: {
        title: "Semi-Supervised Learning with Deep Generative Models",
        DOI: "10.1000/official",
        url: "https://arxiv.org/abs/1406.5298",
        extra: "arXiv: 1406.5298",
        publicationTitle: "arXiv",
        date: "2014",
      },
      creators: [
        {
          firstName: "Diederik P.",
          lastName: "Kingma",
          creatorType: "author",
        },
      ],
    });

    const result = await finder.processItem(item);

    expect(result.outcome).toBe("downloaded");
    expect(result.source).toBe("arXiv");
    expect(request).toHaveBeenNthCalledWith(
      1,
      "GET",
      expect.stringContaining("10.48550%2Farxiv.1406.5298"),
      expect.anything(),
    );
    expect(request).not.toHaveBeenCalledWith(
      "GET",
      expect.stringContaining("10.1000%2Fofficial"),
      expect.anything(),
    );
    expect(importFromURL).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://arxiv.org/pdf/1406.5298.pdf",
      }),
    );

    vi.unstubAllGlobals();
  });

  it("falls through to Semantic Scholar if others fail", async () => {
    const importFromURL = vi.fn().mockResolvedValue({ id: 202 });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 404,
          responseText: "{}",
        }),
      },
    });

    mockOpenAlex.searchOpenAccess.mockResolvedValue([]);
    mockS2.searchOpenAccess.mockResolvedValue([
      {
        title: "Test Paper Title",
        authors: ["Jane Doe"],
        pdfUrl: "https://s2.example.com/paper.pdf",
        confidence: 0.85,
        source: "Semantic Scholar",
      },
    ]);

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe("downloaded");
    expect(result.source).toBe("Semantic Scholar");

    vi.unstubAllGlobals();
  });

  it("reports download_failed when importFromURL throws", async () => {
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      log: () => {},
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL: vi.fn().mockRejectedValue(new Error("Network error")),
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 200,
          responseText: JSON.stringify({
            is_oa: true,
            best_oa_location: { url_for_pdf: "https://example.com/bad.pdf" },
          }),
        }),
      },
    });

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe("download_failed");
    expect(result.error).toContain("Network error");

    vi.unstubAllGlobals();
  });

  it("falls back to manual stored-file import when importFromURL fails", async () => {
    const importFromURL = vi
      .fn()
      .mockRejectedValue(new Error("Primary import failed"));
    const importFromBuffer = vi.fn().mockResolvedValue({
      id: 203,
      attachmentLinkMode: 2,
      getFile: () => ({ exists: () => true }),
      fileExists: vi.fn().mockResolvedValue(true),
    });
    const pdfBytes = new TextEncoder().encode(
      `%PDF-1.4\n${"0".repeat(1200)}\n%%EOF`,
    ).buffer;

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      log: () => {},
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        LINK_MODE_IMPORTED_FILE: 2,
        importFromURL,
        importFromBuffer,
      },
      HTTP: {
        request: vi
          .fn()
          .mockResolvedValueOnce({
            status: 200,
            responseText: JSON.stringify({
              is_oa: true,
              best_oa_location: {
                url_for_pdf: "https://example.com/fallback.pdf",
              },
            }),
          })
          .mockResolvedValueOnce({
            status: 200,
            response: pdfBytes,
          }),
      },
    });

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe("downloaded");
    expect(importFromURL).toHaveBeenCalled();
    expect(importFromBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        parentItemID: 1,
        contentType: "application/pdf",
      }),
    );

    vi.unstubAllGlobals();
  });

  it("detects existing PDFs using the legacy attachment check", async () => {
    const item = makeMockItem({ attachmentIds: [100] });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      Items: {
        get: vi.fn(() => ({
          isPDFAttachment: () => true,
          getFile: () => ({ exists: () => true }),
        })),
      },
    });

    await expect((finder as any).itemHasPDF(item)).resolves.toBe(true);

    vi.unstubAllGlobals();
  });

  it("sends locale-aware headers during file discovery requests", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 404,
      responseText: "{}",
    });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      locale: "de-DE",
      HTTP: { request },
    });

    await (finder as any).findCorePDFByDOI("10.1000/example");

    expect(request).toHaveBeenCalledWith(
      "GET",
      expect.stringContaining("api.core.ac.uk"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept-Language": "de-DE,de;q=0.9",
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("sends locale-aware headers during manual PDF downloads", async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      response: new TextEncoder().encode(`%PDF-1.4\n${"0".repeat(1200)}\n%%EOF`)
        .buffer,
    });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      locale: "de-DE",
      HTTP: { request },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        importFromBuffer: vi.fn().mockResolvedValue({
          id: 205,
          attachmentLinkMode: 2,
          getFile: () => ({ exists: () => true }),
          fileExists: vi.fn().mockResolvedValue(true),
        }),
      },
    });

    await (finder as any).manualDownloadAndImport(
      makeMockItem(),
      "https://example.com/paper.pdf",
      "Test Paper Title",
    );

    expect(request).toHaveBeenCalledWith(
      "GET",
      "https://example.com/paper.pdf",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept-Language": "de-DE,de;q=0.9",
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("keeps downloads eligible when the source has no language signal", async () => {
    const importFromURL = vi.fn().mockResolvedValue({ id: 206 });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      locale: "de-DE",
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 404,
          responseText: "{}",
        }),
      },
    });

    mockOpenAlex.searchOpenAccess.mockResolvedValue([
      {
        title: "Test Paper Title",
        authors: ["Jane Doe"],
        pdfUrl: "https://example.com/paper.pdf",
        confidence: 0.9,
        source: "OpenAlex",
      },
    ]);

    const result = await finder.processItem(makeMockItem());

    expect(result.outcome).toBe("downloaded");
    expect(importFromURL).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/paper.pdf",
      }),
    );

    vi.unstubAllGlobals();
  });

  it("uses the article source order from the original file finder", async () => {
    const item = makeMockItem({
      fields: {
        title: "Test Paper Title",
        DOI: "10.1234/test.2024",
        date: "2024",
        extra: "",
      },
    });

    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      ItemTypes: {
        getName: vi.fn(() => "journalArticle"),
      },
      Utilities: {
        ...globalThis.Zotero.Utilities,
        cleanDOI: (doi: string) => doi,
        cleanISBN: (isbn: string) => isbn,
      },
    });

    vi.spyOn(finder as any, "extractDOI").mockReturnValue("10.1234/test.2024");
    vi.spyOn(finder as any, "extractISBN").mockReturnValue(null);
    vi.spyOn(finder as any, "findUnpaywallPDF").mockResolvedValue(null);
    vi.spyOn(finder as any, "findArxivPDF").mockResolvedValue(
      "http://arxiv.org/pdf/2301.12345.pdf",
    );
    const coreSpy = vi
      .spyOn(finder as any, "findCorePDFByDOI")
      .mockResolvedValue("https://core.example.com/paper.pdf");

    const result = await (finder as any).findFileForItem(item);

    expect(result).toEqual({
      url: "http://arxiv.org/pdf/2301.12345.pdf",
      source: "arXiv",
    });
    expect(coreSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  describe("buildSearchQuery", () => {
    it("extracts DOI, title, authors, year, and arXiv ID", () => {
      const item = makeMockItem({
        fields: {
          title: "Attention Is All You Need",
          DOI: "10.5555/3295222.3295349",
          date: "2017",
          extra: "arXiv: 1706.03762",
        },
        creators: [
          { firstName: "Ashish", lastName: "Vaswani", creatorType: "author" },
        ],
      });

      const query = FileFinder.buildSearchQuery(item);

      expect(query.title).toBe("Attention Is All You Need");
      expect(query.doi).toBe("10.5555/3295222.3295349");
      expect(query.year).toBe(2017);
      expect(query.authors).toEqual(["Ashish Vaswani"]);
      expect(query.arxivId).toBe("1706.03762");
    });
  });

  describe("formatSummary", () => {
    it("formats mixed results", () => {
      const item = makeMockItem();
      const results = [
        { item, outcome: "downloaded" as const, source: "OpenAlex" },
        { item, outcome: "downloaded" as const, source: "Unpaywall" },
        { item, outcome: "already_has_file" as const },
        { item, outcome: "no_source_found" as const },
        { item, outcome: "download_failed" as const, error: "timeout" },
      ];

      const summary = FileFinder.formatSummary(results, 5);

      expect(summary).toContain("5 item(s) checked");
      expect(summary).toContain("2 PDFs downloaded");
      expect(summary).toContain("OpenAlex");
      expect(summary).toContain("Unpaywall");
      expect(summary).toContain("1 already had files");
      expect(summary).toContain("1 — no open-access PDF found");
      expect(summary).toContain("1 download failed");
    });

    it("handles zero-action summary", () => {
      const summary = FileFinder.formatSummary([], 0);
      expect(summary).toContain("Nothing to do");
    });
  });
});
