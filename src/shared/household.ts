// Household facts and flat-rate rules that are the same in every canton
// (federal harmonisation), shared by the canton engines.
import { clamp } from "./money";
import type { TaxData } from "./types";

export const TAX_YEAR = 2025;

/** Minor children (born 2008–2025) and adult children in apprenticeship or studies. */
export function childrenWithPart(d: TaxData) {
  return d.children.filter((c) => c.birthYear >= TAX_YEAR - 17 || c.inEducation);
}

export type FamilyKind = "married" | "singleParent" | "singleWithChildren" | "single";

export function familyKind(d: TaxData): FamilyKind {
  const kids = childrenWithPart(d).length;
  if (d.civilStatus === "married") return "married";
  if (kids > 0 && d.singleParentHousehold) return "singleParent";
  if (kids > 0) return "singleWithChildren";
  return "single";
}

export const activePersons = (d: TaxData) => (d.civilStatus === "married" ? d.persons.slice(0, 2) : d.persons.slice(0, 1));

/** Other professional expenses: 3% of net salary, CHF 2,000–4,000, never above the salary (VD IG p. 22, ZH Wegleitung p. 12). */
export function otherProfessionalFlat(netSalary: number) {
  return netSalary < 2000 ? netSalary : clamp(netSalary * 0.03, 2000, 4000);
}

/** Secondary job: 20% of the income, CHF 800–2,400, never above the income. */
export function secondaryJobFlat(income: number) {
  return income < 800 ? income : clamp(income * 0.2, 800, 2400);
}

/** Pillar 3a cap 2025: CHF 7,258 with a pension fund, else 20% of net earned income up to CHF 36,288. */
export function pillar3aCap(hasPensionFund: boolean, netEarned: number) {
  return hasPensionFund ? 7258 : Math.min(36288, Math.max(0, netEarned * 0.2));
}

/** Car commuting: 70 ct/km (VD: 35 ct beyond 15,000 km). */
export function carCost(yearlyKm: number, degressive: boolean) {
  if (!degressive) return yearlyKm * 0.7;
  const first = Math.min(yearlyKm, 15000);
  return first * 0.7 + (yearlyKm - first) * 0.35;
}
