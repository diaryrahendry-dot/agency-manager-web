export const DEFAULT_EUR_TO_MGA = 5000;

export function convertEurToMga(amount: number, rate: number = DEFAULT_EUR_TO_MGA): number {
  const numericAmount = Number(amount);
  const numericRate = Number(rate);
  if (!Number.isFinite(numericAmount) || !Number.isFinite(numericRate) || numericRate < 0) return 0;
  return Math.round(numericAmount * numericRate);
}

export function formatMGA(amount: number, rate: number = DEFAULT_EUR_TO_MGA): string {
  return `${convertEurToMga(amount, rate).toLocaleString("fr-FR")} Ar`;
}
