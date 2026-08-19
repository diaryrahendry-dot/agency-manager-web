import { describe, expect, it } from "vitest";
import { convertEurToMga, convertMgaToEur, formatCurrency, formatMGA, normalizeCurrencyAmount } from "../shared/currency";

describe("currency helpers", () => {
  it("converts euros to ariary using the configured rate", () => {
    expect(convertEurToMga(2400, 5000)).toBe(12000000);
    expect(formatMGA(2400, 5000)).toBe("12 000 000 Ar");
  });

  it("converts ariary input back to the stored euro reference", () => {
    expect(convertMgaToEur(12000000, 5000)).toBe(2400);
    expect(convertMgaToEur(0, 5000)).toBe(0);
  });

  it("formats the selected currency and normalizes the stored reference", () => {
    expect(formatCurrency(7500000, "MGA")).toBe("7 500 000 Ar");
    expect(formatCurrency(1500, "EUR")).toBe("1 500 €");
    expect(normalizeCurrencyAmount("7500000", "MGA", "5000")).toEqual({ amount: 1500, currency: "MGA", amountInCurrency: 7500000, exchangeRate: 5000 });
    expect(normalizeCurrencyAmount("1500", "EUR")).toEqual({ amount: 1500, currency: "EUR", amountInCurrency: 1500, exchangeRate: 1 });
  });

  it("rejects invalid amounts and exchange rates", () => {
    expect(() => normalizeCurrencyAmount(-1, "MGA", 5000)).toThrow("montant");
    expect(() => normalizeCurrencyAmount(100, "MGA", 0)).toThrow("taux");
    expect(convertEurToMga(Number.NaN, 5000)).toBe(0);
    expect(convertEurToMga(100, -1)).toBe(0);
  });
});
