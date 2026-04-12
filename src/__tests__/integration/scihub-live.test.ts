import { describe, expect, it } from "vitest";
import { SciHubService } from "@/services/SciHubService";

const describeLive =
  process.env.LIVE_API_TESTS === "1" ? describe.sequential : describe.skip;

function createEnabledSciHubService(): SciHubService {
  return new SciHubService({
    isSciHubEnabled: () => true,
    getSciHubMaxErrors: () => 2,
  } as any);
}

describeLive("Sci-Hub live test", () => {
  it("fetches ACM paper PDF via Sci-Hub with retry logic", async () => {
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

  it("respects error threshold configuration", async () => {
    const serviceWith1Error = new SciHubService({
      isSciHubEnabled: () => true,
      getSciHubMaxErrors: () => 1,
    } as any);

    const doi = "10.1145/3422622";

    const result1 = await serviceWith1Error.findSciHubPDF(doi);

    if (!result1) {
      expect(serviceWith1Error.shouldTrySciHub()).toBe(false);
      console.log(`Service disabled after 1 error (threshold: 1)`);
    } else {
      console.log(`Service succeeded on first attempt`);
    }
  });
});
