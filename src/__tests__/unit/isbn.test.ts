import { describe, expect, it } from "vitest";
import {
  buildAlternativeISBNCandidates,
  convertISBN10to13,
  convertISBN13to10,
  isValidCleanISBN,
} from "@/utils/isbn";

describe("isbn utilities", () => {
  it("does not convert ISBN-10 values with invalid numeric body characters", () => {
    expect(convertISBN10to13("ABCDE1234X")).toBeNull();
  });

  it("does not convert ISBN-13 values with invalid numeric body characters", () => {
    expect(convertISBN13to10("978ABCDE12345")).toBeNull();
  });

  it("does not convert ISBN-10 values with invalid check digits", () => {
    expect(convertISBN10to13("0306406153")).toBeNull();
  });

  it("does not convert ISBN-13 values with invalid check digits", () => {
    expect(convertISBN13to10("9780306406158")).toBeNull();
  });

  it("does not add NaN conversion candidates for malformed ISBN values", () => {
    expect(buildAlternativeISBNCandidates("ABCDE1234X")).not.toContain(
      "978ABCDE123NaN",
    );
  });

  it("does not build alternatives from ISBNs with invalid check digits", () => {
    expect(buildAlternativeISBNCandidates("0306406153")).toEqual([]);
    expect(buildAlternativeISBNCandidates("9780306406158")).toEqual([]);
  });

  it("validates cleaned ISBN-10 and ISBN-13 shapes", () => {
    expect(isValidCleanISBN("0306406152")).toBe(true);
    expect(isValidCleanISBN("123456789X")).toBe(true);
    expect(isValidCleanISBN("9780306406157")).toBe(true);
    expect(isValidCleanISBN("notanisbn")).toBe(false);
    expect(isValidCleanISBN("978notvalid")).toBe(false);
  });

  it("rejects ISBN-shaped values with invalid check digits", () => {
    expect(isValidCleanISBN("0306406153")).toBe(false);
    expect(isValidCleanISBN("9780306406158")).toBe(false);
  });
});
