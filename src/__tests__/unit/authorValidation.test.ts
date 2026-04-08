import { describe, it, expect } from "vitest";
import { normalizeLastName } from "@/utils/authorValidation";

describe("authorValidation", () => {
  describe("normalizeLastName", () => {
    it("normalizes various name formats to last name", () => {
      expect(normalizeLastName("Goodfellow")).toBe("goodfellow");
      expect(normalizeLastName("Ian J. Goodfellow")).toBe("goodfellow");
      expect(normalizeLastName("I. Goodfellow")).toBe("goodfellow");
      expect(normalizeLastName("Goodfellow, Ian J.")).toBe("goodfellow");
      expect(normalizeLastName("Bengio, Y.")).toBe("bengio");
      expect(normalizeLastName("van der Maaten")).toBe("van der maaten");
    });

    it("handles empty or invalid input", () => {
      expect(normalizeLastName("")).toBe("");
      expect(normalizeLastName("   ")).toBe("");
    });
  });
});
