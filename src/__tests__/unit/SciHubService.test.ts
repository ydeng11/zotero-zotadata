import { describe, it, expect, vi, beforeEach } from "vitest";
import { SciHubService } from "@/services/SciHubService";
import type { PreferencesManager } from "@/ui/PreferencesManager";

function makeMockPrefs(): PreferencesManager {
  return {
    isSciHubEnabled: vi.fn(),
    getSciHubMaxErrors: vi.fn(),
  } as unknown as PreferencesManager;
}

describe("SciHubService", () => {
  let service: SciHubService;
  let mockPrefs: PreferencesManager;

  beforeEach(() => {
    mockPrefs = makeMockPrefs();
    service = new SciHubService(mockPrefs);
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
      vi.mocked(mockPrefs.getSciHubMaxErrors).mockReturnValue(2);

      vi.stubGlobal("Zotero", {
        HTTP: {
          request: vi.fn().mockResolvedValue({
            status: 200,
            responseText: '<embed src="https://example.com/paper.pdf">',
          }),
        },
        debug: vi.fn(),
      });

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://example.com/paper.pdf");

      vi.unstubAllGlobals();
    });
  });

  describe("CAPTCHA handling", () => {
    it("tries next mirror when CAPTCHA detected", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);
      vi.mocked(mockPrefs.getSciHubMaxErrors).mockReturnValue(2);

      vi.stubGlobal("Zotero", {
        HTTP: {
          request: vi
            .fn()
            .mockResolvedValueOnce({
              status: 200,
              responseText: "captcha page",
            })
            .mockResolvedValueOnce({
              status: 200,
              responseText: '<embed src="https://pdf.com/paper.pdf">',
            }),
        },
        debug: vi.fn(),
      });

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://pdf.com/paper.pdf");

      vi.unstubAllGlobals();
    });

    it("does not increment error count on CAPTCHA", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);
      vi.mocked(mockPrefs.getSciHubMaxErrors).mockReturnValue(2);

      vi.stubGlobal("Zotero", {
        HTTP: {
          request: vi.fn().mockResolvedValue({
            status: 200,
            responseText: "captcha page",
          }),
        },
        debug: vi.fn(),
      });

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);

      vi.unstubAllGlobals();
    });
  });

  describe("error tracking", () => {
    it("disables after reaching max errors", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);
      vi.mocked(mockPrefs.getSciHubMaxErrors).mockReturnValue(2);

      vi.stubGlobal("Zotero", {
        HTTP: {
          request: vi.fn().mockResolvedValue({ status: 404 }),
        },
        debug: vi.fn(),
      });

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(false);

      vi.unstubAllGlobals();
    });

it("resets errors on success", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);
      vi.mocked(mockPrefs.getSciHubMaxErrors).mockReturnValue(2);

      let callCount = 0;
      vi.stubGlobal("Zotero", {
        HTTP: {
          request: vi
            .fn()
            .mockImplementation(() => {
              callCount++;
              if (callCount <= 2) {
                return Promise.resolve({ status: 404 });
              }
              return Promise.resolve({
                status: 200,
                responseText:
                  '<embed src="https://example.com/paper.pdf">',
              });
            }),
        },
      });

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://example.com/paper.pdf");
      expect(service.shouldTrySciHub()).toBe(true);

      vi.unstubAllGlobals();
    });

      await service.findSciHubPDF("10.1145/3422622");
      await service.findSciHubPDF("10.1145/3422622");

      await service.findSciHubPDF("10.1145/3422622");
      expect(service.shouldTrySciHub()).toBe(true);

      vi.unstubAllGlobals();
    });
  });

  describe("PDF extraction", () => {
    it("extracts PDF from embed tag", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);
      vi.mocked(mockPrefs.getSciHubMaxErrors).mockReturnValue(2);

      vi.stubGlobal("Zotero", {
        HTTP: {
          request: vi.fn().mockResolvedValue({
            status: 200,
            responseText:
              '<embed src="https://sci-hub.ru/downloads/paper.pdf">',
          }),
        },
        debug: vi.fn(),
      });

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://sci-hub.ru/downloads/paper.pdf");

      vi.unstubAllGlobals();
    });

    it("extracts PDF from iframe tag", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);
      vi.mocked(mockPrefs.getSciHubMaxErrors).mockReturnValue(2);

      vi.stubGlobal("Zotero", {
        HTTP: {
          request: vi.fn().mockResolvedValue({
            status: 200,
            responseText: '<iframe src="https://sci-hub.se/paper.pdf">',
          }),
        },
        debug: vi.fn(),
      });

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toBe("https://sci-hub.se/paper.pdf");

      vi.unstubAllGlobals();
    });
  });

  describe("URL resolution", () => {
    it("resolves relative URLs", async () => {
      vi.mocked(mockPrefs.isSciHubEnabled).mockReturnValue(true);
      vi.mocked(mockPrefs.getSciHubMaxErrors).mockReturnValue(2);

      vi.stubGlobal("Zotero", {
        HTTP: {
          request: vi.fn().mockResolvedValue({
            status: 200,
            responseText: '<embed src="/downloads/paper.pdf">',
          }),
        },
        debug: vi.fn(),
      });

      const result = await service.findSciHubPDF("10.1145/3422622");
      expect(result).toMatch(/^https:\/\/sci-hub\.ru\/downloads\/paper\.pdf$/);

      vi.unstubAllGlobals();
    });
  });
});
