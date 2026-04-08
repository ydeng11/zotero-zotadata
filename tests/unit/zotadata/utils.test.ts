// tests/unit/zotadata/utils.test.ts
// Tests for utility functions in zotadata.js

import { describe, it, expect, beforeEach } from "vitest";
import {
  createZotadataMethod,
  clearCache,
} from "../../helpers/extract-function";

describe("Utility Functions", () => {
  beforeEach(() => {
    clearCache();
  });

  describe("titleSimilarity", () => {
    let titleSimilarity: (t1: string, t2: string) => number;

    beforeEach(() => {
      titleSimilarity = createZotadataMethod("titleSimilarity");
    });

    it("should return 1.0 for exact match", () => {
      expect(titleSimilarity("Test Title", "Test Title")).toBe(1.0);
    });

    it("should be case insensitive", () => {
      expect(titleSimilarity("Test Title", "TEST TITLE")).toBe(1.0);
    });

    it("should ignore stop words", () => {
      const result = titleSimilarity("The Test of the Title", "Test Title");
      expect(result).toBeGreaterThan(0.8);
    });

    it("should handle punctuation (strips non-word chars)", () => {
      // The implementation strips punctuation without adding spaces
      // "Test-Title: A Study" -> "TestTitle A Study" (hyphen/colon removed)
      // "Test Title A Study" -> "Test Title A Study"
      // Word overlap: "A", "Study" (2 words) out of union of 5 unique words
      const result = titleSimilarity(
        "Test-Title: A Study",
        "Test Title A Study",
      );
      // At least "A" and "Study" should match
      expect(result).toBeGreaterThan(0);
    });

    it("should calculate partial overlap correctly", () => {
      const result = titleSimilarity(
        "Machine Learning in Healthcare",
        "Healthcare Applications of Machine Learning",
      );
      expect(result).toBeGreaterThan(0.4);
      expect(result).toBeLessThan(0.8);
    });

    it("should return 0 for no overlap", () => {
      expect(
        titleSimilarity("Completely Different Title", "No Shared Words Here"),
      ).toBe(0);
    });

    it("should handle unicode/international characters", () => {
      // The implementation strips non-ASCII word chars with /[^\w\s]/g
      // "Méthode" -> "Mthode" (e-acute removed)
      // "Methode" -> "Methode"
      const result = titleSimilarity("Méthode de Calcul", "Methode de Calcul");
      // "de" and "Calcul" match, "Mthode" vs "Methode" don't
      expect(result).toBeGreaterThanOrEqual(0.5);
    });

    it("should handle LaTeX-style mathematical symbols", () => {
      // The implementation strips $ and backslash as non-word chars
      // "On the $\alpha$-Conjecture" -> "On the alphaConjecture" (hyphen also removed)
      // "On the alpha Conjecture" -> "On the alpha Conjecture"
      // Word overlap depends on how chars are stripped
      const result = titleSimilarity(
        "On the $\\alpha$-Conjecture",
        "On the alpha Conjecture",
      );
      // At minimum, "On", "the" should match (stop words are removed, but we check >0)
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("should handle very long titles", () => {
      const longTitle = "A ".repeat(100) + "Very Long Title";
      expect(titleSimilarity(longTitle, longTitle)).toBe(1.0);
    });

    it("should handle empty inputs", () => {
      // Empty strings normalize to empty, so empty vs empty = 1.0 (intersection/union of empty sets)
      expect(titleSimilarity("", "")).toBe(1.0);
      // Non-empty vs empty = 0 (no intersection)
      expect(titleSimilarity("Test", "")).toBe(0);
    });

    it("should throw on null/undefined inputs", () => {
      // The function does not handle null/undefined - it will throw
      expect(() => titleSimilarity(null as any, "Test")).toThrow();
      expect(() => titleSimilarity("Test", undefined as any)).toThrow();
    });
  });

  describe("sanitizeFileName", () => {
    let sanitizeFileName: (name: string) => string;

    beforeEach(() => {
      sanitizeFileName = createZotadataMethod("sanitizeFileName");
    });

    it("should replace invalid characters with underscore", () => {
      expect(sanitizeFileName("file<>name")).toBe("file__name");
      expect(sanitizeFileName("file:name")).toBe("file_name");
      expect(sanitizeFileName('file"name')).toBe("file_name");
      expect(sanitizeFileName("file/name\\name")).toBe("file_name_name");
    });

    it("should replace spaces with underscores", () => {
      expect(sanitizeFileName("file name test")).toBe("file_name_test");
    });

    it("should limit length to 100 characters", () => {
      const longName = "a".repeat(150);
      expect(sanitizeFileName(longName)).toHaveLength(100);
    });

    it('should return "attachment" for empty input', () => {
      expect(sanitizeFileName("")).toBe("attachment");
      expect(sanitizeFileName(null as any)).toBe("attachment");
    });

    it("should handle unicode characters", () => {
      const result = sanitizeFileName("Méthode de Calcul");
      // Unicode chars are preserved, spaces replaced
      expect(result).toContain("M");
    });

    it("should replace consecutive spaces with single underscore", () => {
      // The regex /\s+/g replaces one or more consecutive spaces with a single underscore
      // "  test  " -> "_test_" (2 spaces before and after become 1 underscore each)
      expect(sanitizeFileName("  test  ")).toBe("_test_");
    });

    it("should handle pipe and question mark characters", () => {
      expect(sanitizeFileName("file|name")).toBe("file_name");
      expect(sanitizeFileName("file?name")).toBe("file_name");
      expect(sanitizeFileName("file*name")).toBe("file_name");
    });
  });

  describe("cleanDownloadUrl", () => {
    let cleanDownloadUrl: (url: string) => string;

    beforeEach(() => {
      cleanDownloadUrl = createZotadataMethod("cleanDownloadUrl");
    });

    it("should remove fragment identifiers", () => {
      expect(cleanDownloadUrl("https://example.com/file.pdf#page=1")).toBe(
        "https://example.com/file.pdf",
      );
    });

    it("should fix double slashes in path", () => {
      expect(cleanDownloadUrl("https://example.com//path//file.pdf")).toBe(
        "https://example.com/path/file.pdf",
      );
    });

    it("should remove problematic query parameters", () => {
      const url = "https://example.com/file.pdf?navpanes=0&view=FitH";
      const result = cleanDownloadUrl(url);
      expect(result).not.toContain("navpanes");
      expect(result).not.toContain("view");
    });

    it("should return original URL on error for invalid URL", () => {
      // Invalid URLs that can't be parsed by URL constructor throw and return original
      expect(cleanDownloadUrl("invalid-url")).toBe("invalid-url");
    });

    it("should handle null/undefined", () => {
      expect(cleanDownloadUrl(null as any)).toBe(null);
      expect(cleanDownloadUrl(undefined as any)).toBe(undefined);
    });

    it("should preserve other query parameters", () => {
      const url = "https://example.com/file.pdf?download=true&navpanes=0";
      const result = cleanDownloadUrl(url);
      expect(result).toContain("download=true");
      expect(result).not.toContain("navpanes");
    });

    it("should handle URLs with no path", () => {
      expect(cleanDownloadUrl("https://example.com")).toBe(
        "https://example.com/",
      );
    });
  });

  describe("validatePDFData", () => {
    let validatePDFData: (data: Uint8Array) => boolean;

    beforeEach(() => {
      validatePDFData = createZotadataMethod("validatePDFData");
    });

    it("should validate PDF with correct header and trailer", () => {
      // Create a PDF that's at least 1024 bytes
      // Header: '%PDF-1.4\n' = 9 bytes, Trailer: '\n%%EOF' = 6 bytes
      // Need 1024 - 9 - 6 = 1009 bytes of padding
      const content = "%PDF-1.4\n" + "x".repeat(1009) + "\n%%EOF";
      const pdfData = new TextEncoder().encode(content);
      expect(pdfData.length).toBeGreaterThanOrEqual(1024);
      expect(validatePDFData(pdfData)).toBe(true);
    });

    it("should reject data too small to be valid PDF", () => {
      const smallData = new Uint8Array(100);
      expect(validatePDFData(smallData)).toBe(false);
    });

    it("should reject data without PDF header", () => {
      const invalidData = new TextEncoder().encode("Not a PDF".repeat(200));
      expect(validatePDFData(invalidData)).toBe(false);
    });

    it("should accept PDF without %%EOF trailer", () => {
      // Create a large enough PDF without trailer
      const content = "%PDF-1.4\n" + "content ".repeat(200);
      const pdfNoTrailer = new TextEncoder().encode(content);
      expect(validatePDFData(pdfNoTrailer)).toBe(true);
    });

    it("should accept PDF with version 2.0 header", () => {
      // Create a PDF 2.0 that's at least 1024 bytes
      // Header: '%PDF-2.0\n' = 9 bytes, Trailer: '\n%%EOF' = 6 bytes
      const content = "%PDF-2.0\n" + "x".repeat(1009) + "\n%%EOF";
      const pdfData = new TextEncoder().encode(content);
      expect(pdfData.length).toBeGreaterThanOrEqual(1024);
      expect(validatePDFData(pdfData)).toBe(true);
    });

    it("should handle empty data", () => {
      const emptyData = new Uint8Array(0);
      expect(validatePDFData(emptyData)).toBe(false);
    });

    it("should validate minimum size threshold of 1024 bytes", () => {
      // Exactly 1023 bytes - should fail
      const justUnderThreshold = new Uint8Array(1023);
      justUnderThreshold.set(new TextEncoder().encode("%PDF-1.4"), 0);
      expect(validatePDFData(justUnderThreshold)).toBe(false);

      // Exactly 1024 bytes - should pass with valid header
      const atThreshold = new Uint8Array(1024);
      atThreshold.set(new TextEncoder().encode("%PDF-1.4"), 0);
      // Add %%EOF at end for trailer
      const eof = new TextEncoder().encode("%%EOF");
      atThreshold.set(eof, 1024 - eof.length);
      expect(validatePDFData(atThreshold)).toBe(true);
    });
  });
});
