import { describe, expect, it } from "vitest";
import { FileUtils } from "@/shared/utils/FileUtils";

describe("FileUtils", () => {
  it("preserves the normalized extension separator when truncating filenames", () => {
    const filename = FileUtils.generateSafeFilename(
      "A very long filename for a downloaded attachment",
      "pdf",
      24,
    );

    expect(filename).toHaveLength(24);
    expect(filename.endsWith(".pdf")).toBe(true);
  });

  it("keeps filenames within maxLength when the extension consumes the limit", () => {
    const filename = FileUtils.generateSafeFilename(
      "A very long filename for a downloaded attachment",
      "pdf",
      3,
    );

    expect(filename.length).toBeLessThanOrEqual(3);
  });

  it("compares two empty files without returning NaN similarity", () => {
    const comparison = FileUtils.compareFiles(
      new ArrayBuffer(0),
      new ArrayBuffer(0),
    );

    expect(comparison).toEqual({
      identical: true,
      similarity: 1,
      sizeDifference: 0,
    });
  });
});
