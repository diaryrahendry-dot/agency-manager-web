import { describe, expect, it } from "vitest";
import { convertEurToMga, formatMGA } from "../shared/currency";

describe("currency helpers", () => {
  it("converts euros to ariary using the configured rate", () => {
    expect(convertEurToMga(2400, 5000)).toBe(12000000);
    expect(formatMGA(2400, 5000)).toBe("12 000 000 Ar");
  });

  it("returns zero for invalid or negative rates", () => {
    expect(convertEurToMga(Number.NaN, 5000)).toBe(0);
    expect(convertEurToMga(100, -1)).toBe(0);
  });
});
