import { describe, expect, it } from "vitest";
import { extractYearFromDate } from "@/utils/itemFields";

describe("itemFields", () => {
  it("extracts a year from common bibliographic date text", () => {
    expect(extractYearFromDate("May 2024")).toBe(2024);
  });

  it("does not treat a leading day number as the publication year", () => {
    expect(extractYearFromDate("20 May 2024")).toBe(2024);
  });
});
