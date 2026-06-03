import { describe, it, expect } from "vitest";
import { isExactTitleMatch } from "@/utils/similarity";

describe("isExactTitleMatch", () => {
  it("matches identical titles", () => {
    expect(isExactTitleMatch("Hello World", "Hello World")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isExactTitleMatch("Hello World", "hello world")).toBe(true);
  });

  it("ignores punctuation differences", () => {
    expect(isExactTitleMatch("Hello, World!", "Hello World")).toBe(true);
  });

  it("ignores non-alphanumeric characters", () => {
    expect(isExactTitleMatch("State-of-the-Art", "State of the Art")).toBe(
      true,
    );
  });

  it("returns false for different titles", () => {
    expect(isExactTitleMatch("Hello World", "Goodbye World")).toBe(false);
  });

  it("returns false when both strings are whitespace only", () => {
    expect(isExactTitleMatch("   ", "\t\n")).toBe(false);
  });

  it("returns false when one title is empty", () => {
    expect(isExactTitleMatch("", "Hello World")).toBe(false);
  });

  it("handles non-string input gracefully", () => {
    expect(isExactTitleMatch(undefined as unknown as string, "Test")).toBe(
      false,
    );
    expect(isExactTitleMatch("Test", null as unknown as string)).toBe(false);
  });
});
