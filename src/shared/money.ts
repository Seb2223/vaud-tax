/** Round to the nearest 5 centimes (Swiss commercial rounding). */
export const round05 = (x: number) => Math.round(x * 20) / 20;

/** Round down to the next 5 centimes (federal tax, form 58c note 2). */
export const floor05 = (x: number) => Math.floor(x * 20 + 1e-9) / 20;

/** Drop fractions below CHF 100 (taxable income, IG p. 51). */
export const floor100 = (x: number) => (x <= 0 ? 0 : Math.floor(x / 100) * 100);

/** Drop fractions below CHF 1,000 (taxable wealth, IG p. 51). */
export const floor1000 = (x: number) => (x <= 0 ? 0 : Math.floor(x / 1000) * 1000);

/** Commercial rounding to the hundred: 1–49 down, 50–99 up (IG p. 47). */
export const round100 = (x: number) => Math.round(x / 100) * 100;

export const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

export const pos = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

export const chf = (x: number, decimals = 0) =>
  "CHF " +
  x.toLocaleString("de-CH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/’/g, "'");
