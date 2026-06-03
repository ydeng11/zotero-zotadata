import { describe, expect, it } from "vitest";
import { URLUtils } from "@/shared/utils/URLUtils";

describe("URLUtils", () => {
  it("does not flag a normal HTTPS URL as suspicious", () => {
    const result = URLUtils.validateAndCleanURL(
      "https://example.com/paper.pdf",
    );

    expect(result.valid).toBe(true);
    expect(result.warnings).not.toContain("URL contains suspicious patterns");
    expect(result.security.suspiciousPatterns).toEqual([]);
  });

  it("does not expose NaN filesize for invalid download size parameters", () => {
    const result = URLUtils.analyzeDownloadURL(
      "https://example.com/paper.pdf?size=unknown",
    );

    expect(result.filesize).toBeUndefined();
  });

  it("keeps download metadata when a filename has malformed percent encoding", () => {
    const result = URLUtils.analyzeDownloadURL(
      "https://arxiv.org/pdf/%E0%A4%A.pdf?size=1024",
    );

    expect(result.directDownload).toBe(true);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.filesize).toBe(1024);
    expect(result.filename).toBe("%E0%A4%A.pdf");
  });

  it("trusts exact academic domains and their subdomains", () => {
    expect(URLUtils.isTrustedAcademicSource("https://arxiv.org/pdf/1234")).toBe(
      true,
    );
    expect(
      URLUtils.isTrustedAcademicSource("https://export.arxiv.org/pdf/1234"),
    ).toBe(true);
  });

  it("does not trust domains that only contain an academic domain substring", () => {
    expect(
      URLUtils.isTrustedAcademicSource(
        "https://evil-arxiv.org.example.com/paper.pdf",
      ),
    ).toBe(false);
  });

  it("generates CrossRef alternatives without DOI URL query parameters", () => {
    const alternatives = URLUtils.generateAlternativeURLs(
      "https://doi.org/10.1234/example?utm_source=zotero#read",
    );

    expect(alternatives).toContain(
      "https://api.crossref.org/works/10.1234/example",
    );
    expect(alternatives).not.toContain(
      "https://api.crossref.org/works/10.1234/example?utm_source=zotero#read",
    );
  });

  it("generates CrossRef alternatives from normalized DOI URL paths", () => {
    const alternatives = URLUtils.generateAlternativeURLs(
      "https://doi.org/10.1234/Example.",
    );

    expect(alternatives).toContain(
      "https://api.crossref.org/works/10.1234/example",
    );
    expect(alternatives).not.toContain(
      "https://api.crossref.org/works/10.1234/Example.",
    );
  });
});
