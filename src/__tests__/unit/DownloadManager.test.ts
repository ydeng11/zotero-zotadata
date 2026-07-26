import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadManager } from "@/services/DownloadManager";

const TEST_URL = "https://example.com/paper.pdf";

function createPDFBytes(): ArrayBuffer {
  return new TextEncoder().encode(
    `%PDF-1.4\n${"test content ".repeat(12)}\n%%EOF`,
  ).buffer;
}

function mockFetchResponse(response: Response): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("DownloadManager size limits", () => {
  beforeEach(() => {
    vi.stubGlobal("Zotero", {
      ...globalThis.Zotero,
      HTTP: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a declared response larger than maxFileSize", async () => {
    const data = createPDFBytes();
    mockFetchResponse(
      new Response(data, {
        status: 200,
        headers: {
          "content-length": String(data.byteLength),
          "content-type": "application/pdf",
        },
      }),
    );

    const manager = new DownloadManager();

    await expect(
      manager.downloadFile(TEST_URL, {
        maxFileSize: data.byteLength - 1,
      }),
    ).rejects.toThrow("exceeds limit");
  });

  it("stops a streamed response when it grows beyond maxFileSize", async () => {
    const firstChunk = new Uint8Array(64);
    const secondChunk = new Uint8Array(64);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(firstChunk);
        controller.enqueue(secondChunk);
        controller.close();
      },
    });
    mockFetchResponse(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );

    const manager = new DownloadManager();

    await expect(
      manager.downloadFile(TEST_URL, { maxFileSize: 100 }),
    ).rejects.toThrow("exceeds limit");
  });

  it("accepts a valid PDF exactly at maxFileSize", async () => {
    const data = createPDFBytes();
    mockFetchResponse(
      new Response(data, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );

    const manager = new DownloadManager();
    const result = await manager.downloadFile(TEST_URL, {
      maxFileSize: data.byteLength,
    });

    expect(result.success).toBe(true);
    expect(result.fileSize).toBe(data.byteLength);
  });
});
