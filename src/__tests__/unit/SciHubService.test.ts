import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SciHubService } from "@/services/SciHubService";
import type { PreferencesManager } from "@/ui/PreferencesManager";

function makeMockPrefs(): PreferencesManager {
  return {
    isSciHubEnabled: vi.fn(),
  } as unknown as PreferencesManager;
}

function stubZoteroHTTP(request: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal("Zotero", {
    ...(globalThis as any).Zotero,
    HTTP: { request },
    debug: vi.fn(),
  });
}

describe("SciHubService", () => {
  let service: SciHubService;
  let mockPrefs: PreferencesManager;

  beforeEach(() => {
    mockPrefs = makeMockPrefs();
    service = new SciHubService(mockPrefs);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("preference checking", () => {
    it("returns null when Sci-Hub is disabled", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(false);

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBeNull();
      expect(service.shouldTrySciHub()).toBe(false);
    });

    it("tries Sci-Hub when enabled", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);

      stubZoteroHTTP(
        vi.fn().mockResolvedValue({
          status: 200,
          responseText: '<embed src="https://example.com/paper.pdf">',
        }),
      );

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://example.com/paper.pdf");
    });
  });

  describe("CAPTCHA handling", () => {
    it("tries next mirror when CAPTCHA detected", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);

      stubZoteroHTTP(
        vi
          .fn()
          .mockResolvedValueOnce({
            status: 200,
            responseText: "captcha page",
          })
          .mockResolvedValueOnce({
            status: 200,
            responseText: '<embed src="https://pdf.com/paper.pdf">',
          }),
      );

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://pdf.com/paper.pdf");
    });

    it("does not increment error count on CAPTCHA", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);

      stubZoteroHTTP(
        vi.fn().mockResolvedValue({
          status: 200,
          responseText: "captcha page",
        }),
      );

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);
    });
  });

  describe("error tracking", () => {
    it("disables after two failed lookups", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);

      stubZoteroHTTP(vi.fn().mockResolvedValue({ status: 404 }));

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(false);
    });

    it("resets errors on success", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);

      let callCount = 0;
      stubZoteroHTTP(
        vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 2) {
            return Promise.resolve({ status: 404 });
          }
          return Promise.resolve({
            status: 200,
            responseText: '<embed src="https://example.com/paper.pdf">',
          });
        }),
      );

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://example.com/paper.pdf");
      expect(service.shouldTrySciHub()).toBe(true);
    });
  });

  describe("PDF extraction", () => {
    it("extracts PDF from embed tag", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);

      stubZoteroHTTP(
        vi.fn().mockResolvedValue({
          status: 200,
          responseText: '<embed src="https://sci-hub.ru/downloads/paper.pdf">',
        }),
      );

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://sci-hub.ru/downloads/paper.pdf");
    });

    it("extracts PDF from iframe tag", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);

      stubZoteroHTTP(
        vi.fn().mockResolvedValue({
          status: 200,
          responseText: '<iframe src="https://sci-hub.se/paper.pdf">',
        }),
      );

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://sci-hub.se/paper.pdf");
    });
  });

  describe("URL resolution", () => {
    it("resolves relative URLs", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);

      stubZoteroHTTP(
        vi.fn().mockResolvedValue({
          status: 200,
          responseText: '<embed src="/downloads/paper.pdf">',
        }),
      );

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toMatch(/^https:\/\/sci-hub\.ru\/downloads\/paper\.pdf$/);
    });
  });
});
