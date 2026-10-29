// Federal direct tax (IFD / direkte Bundessteuer) — identical in every canton.
import { floor05, floor100, pos, round05 } from "./money";
import { IFD_FLAT_RATE, IFD_MARRIED_FLAT_FROM, IFD_MARRIED_SCALE, IFD_SINGLE_FLAT_FROM, IFD_SINGLE_SCALE, R } from "./rules2025";

/** Base tax from a [from, tax, ratePer100] scale, stepping in whole units. */
export function scaleTax(scale: [number, number, number][], x: number, unit: number): number {
  let row = scale[0];
  for (const r of scale) if (x >= r[0]) row = r;
  if (x < row[0]) return 0;
  return row[1] + Math.floor((x - row[0]) / unit) * row[2];
}

/** ESTV form 58c 2025. Married scale also applies to single parents. */
export function ifdTax(taxable: number, marriedScale: boolean): number {
  const x = floor100(taxable);
  if (marriedScale ? x >= IFD_MARRIED_FLAT_FROM : x >= IFD_SINGLE_FLAT_FROM) return floor05(x * IFD_FLAT_RATE);
  return floor05(scaleTax(marriedScale ? IFD_MARRIED_SCALE : IFD_SINGLE_SCALE, x, 100));
}

export interface FederalInput {
  married: boolean;
  /** Married, or single living with children/supported persons → married scale + CHF 263 per child. */
  parentalScale: boolean;
  kids: number;
  dependents: number;
  income: number;
  /** All deductions except medical costs, donations and social deductions. */
  deductions: number;
  medical: number;
  disability: number;
  donations: number;
}

export interface FederalResult {
  taxableIncome: number;
  tax: number;
  childRebate: number;
  total: number;
}

/** Tail of the federal computation (VD IG p. 65, same on the ZH form): medical franchise, donations, social deductions, scale. */
export function federalTax(f: FederalInput): FederalResult {
  // Full medical costs first, donations capped on "revenu intermédiaire I",
  // then the 5% franchise is added back as RI II × 5/95.
  const medical = pos(f.medical);
  const ri1 = f.income - f.deductions - medical - pos(f.disability);
  const donations = pos(f.donations) >= R.donations.minTotal ? Math.min(pos(f.donations), Math.max(0, R.donations.maxShare * ri1)) : 0;
  const ri2 = ri1 - donations;
  const franchise = Math.min(Math.max(0, ri2) * (5 / 95), medical);
  const social = (f.married ? R.ifd.marriedDeduction : 0) + f.kids * R.ifd.childDeduction + f.dependents * R.ifd.dependentDeduction;
  const taxableIncome = floor100(ri2 + franchise - social);
  const tax = ifdTax(taxableIncome, f.parentalScale);
  const childRebate = f.parentalScale ? Math.min(tax, (f.kids + f.dependents) * R.ifd.childRebate) : 0;
  return { taxableIncome, tax, childRebate, total: Math.max(0, round05(tax - childRebate)) };
}
