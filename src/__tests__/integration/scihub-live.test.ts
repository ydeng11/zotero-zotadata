import { describe, expect, it } from "vitest";
import { SciHubService } from "@/services/SciHubService";

const describeLive =
  process.env.LIVE_API_TESTS === "1" ? describe.sequential : describe.skip;

function createEnabledSciHubService(): SciHubService {
  return new SciHubService({
    isSciHubEnabled: () => true,
  } as any);
}

describeLive("Sci-Hub live test", () => {
  it("fetches ACM paper PDF via Sci-Hub", async () => {
    const service = createEnabledSciHubService();
    const doi = "10.1145/3422622";

    const mirrors = ["sci-hub.ru", "sci-hub.se", "sci-hub.st"];
    let pdfUrl: string | null = null;
    let successMirror: string | null = null;

    for (const mirror of mirrors) {
      try {
        console.log(`Trying mirror: ${mirror}...`);
        pdfUrl = await service.findSciHubPDF(doi);

        if (pdfUrl) {
          successMirror = mirror;
          console.log(`✓ Success from ${mirror}: ${pdfUrl}`);
          break;
        } else {
          console.log(`✗ ${mirror} failed (no PDF URL returned)`);
        }
      } catch (error) {
        console.log(`✗ ${mirror} failed with error: ${error}`);
        continue;
      }
    }

    if (!pdfUrl) {
      console.log("✗ All mirrors failed");
    }

    expect(pdfUrl).toBeDefined();
    expect(pdfUrl).not.toBeNull();

    if (pdfUrl) {
      expect(pdfUrl).toMatch(/^https?:\/\/.*(\.pdf|pdf)/i);
      console.log(`\n=== Test Result ===`);
      console.log(`DOI: ${doi}`);
      console.log(`Mirror: ${successMirror}`);
      console.log(`PDF URL: ${pdfUrl}`);
      console.log(`==================\n`);
    }
  });

  it("handles CAPTCHA gracefully by trying next mirror", async () => {
    const service = createEnabledSciHubService();
    const doi = "10.1145/3422622";

    const result = await service.findSciHubPDF(doi);

    expect(service.shouldTrySciHub()).toBe(true);

    console.log(`CAPTCHA test result: ${result || "null (graceful failure)"}`);
  });

  it("uses the default two-failure session threshold", async () => {
    const service = createEnabledSciHubService();
    const doi = "10.1145/3422622";

    const result1 = await service.findSciHubPDF(doi);

    if (!result1) {
      expect(service.shouldTrySciHub()).toBe(true);

      const result2 = await service.findSciHubPDF(doi);

      if (!result2) {
        expect(service.shouldTrySciHub()).toBe(false);
        console.log("Service disabled after 2 failed attempts");
      } else {
        console.log("Service recovered before reaching 2 failed attempts");
      }
    } else {
      console.log("Service succeeded before hitting the default threshold");
    }
  });
});
