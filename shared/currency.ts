export const DEFAULT_EUR_TO_MGA = 5000;
export type CurrencyCode = "EUR" | "MGA";

export function formatEUR(amount: number): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "0 €";
  return `${numericAmount.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
}

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  return currency === "MGA" ? `${Number(amount).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Ar` : formatEUR(amount);
}

export function normalizeCurrencyAmount(amount: number | string, currency: CurrencyCode, exchangeRate?: number | string) {
  const numericAmount = Number(amount);
  const numericRate = currency === "MGA" ? Number(exchangeRate ?? DEFAULT_EUR_TO_MGA) : 1;
  if (!Number.isFinite(numericAmount) || numericAmount < 0) throw new Error("Le montant est invalide");
  if (!Number.isFinite(numericRate) || numericRate <= 0) throw new Error("Le taux EUR/MGA est invalide");
  return {
    amount: Number((currency === "MGA" ? numericAmount / numericRate : numericAmount).toFixed(2)),
    currency,
    amountInCurrency: Number(numericAmount.toFixed(2)),
    exchangeRate: Number(numericRate.toFixed(2)),
  };
}

export function convertEurToMga(amount: number, rate: number = DEFAULT_EUR_TO_MGA): number {
  const numericAmount = Number(amount);
  const numericRate = Number(rate);
  if (!Number.isFinite(numericAmount) || !Number.isFinite(numericRate) || numericRate < 0) return 0;
  return Math.round(numericAmount * numericRate);
}

export function convertMgaToEur(amount: number, rate: number = DEFAULT_EUR_TO_MGA): number {
  const numericAmount = Number(amount);
  const numericRate = Number(rate);
  if (!Number.isFinite(numericAmount) || !Number.isFinite(numericRate) || numericRate <= 0) return 0;
  return numericAmount / numericRate;
}

export function formatMGA(amount: number, rate: number = DEFAULT_EUR_TO_MGA): string {
  return `${convertEurToMga(amount, rate).toLocaleString("fr-FR")} Ar`;
}
