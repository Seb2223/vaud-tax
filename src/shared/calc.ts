// Entry point: picks the canton's rules. Each canton engine produces the
// filling-guide lines and an estimate; federal tax is shared (federal.ts).
import { computeVD, COMMUNES as VD_COMMUNES, findCommune as findVdCommune } from "./vd";
import { computeZH, findZhCommune, ZH_COMMUNES } from "./zh";
import type { Canton, GuideLine, TaxData, TaxEstimate } from "./types";

export { TAX_YEAR, childrenWithPart } from "./household";

export interface CalcResult {
  lines: GuideLine[];
  estimate: TaxEstimate;
  notes: string[];
  /** Key intermediate figures by code/Ziffer, e.g. "650" (VD) or "21" (ZH). */
  details: Record<string, number>;
}

export function compute(d: TaxData): CalcResult {
  return d.canton === "ZH" ? computeZH(d) : computeVD(d);
}

export interface CommuneInfo {
  name: string;
  /** Communal tax rate in % (without church tax). */
  rate: number;
  /** True when the rate is confirmed for tax year 2025. */
  confirmed: boolean;
  note?: string;
}

const ZH_SPLIT_RATES: Record<string, string> = {
  Uster: "Uster has two rates (112% / 110%) depending on the school district — check your tax bill.",
  Turbenthal: "Turbenthal has two rates (122% / 112%) depending on the school district — check your tax bill.",
};

export function communesFor(canton: Canton): CommuneInfo[] {
  return canton === "ZH"
    ? ZH_COMMUNES.map((c) => ({ name: c.name, rate: c.rate, confirmed: true, note: ZH_SPLIT_RATES[c.name] }))
    : VD_COMMUNES.map((c) => ({ name: c.name, rate: c.rate, confirmed: c.rateConfirmed2025 }));
}

export function findCommuneInfo(canton: Canton, name: string): CommuneInfo | undefined {
  const c = canton === "ZH" ? findZhCommune(name) : findVdCommune(name);
  return c ? communesFor(canton).find((x) => x.name === c.name) : undefined;
}

export const CANTONS: Record<Canton, { name: string; software: string; capital: string; capitalRate: number; lang: "fr" | "de" }> = {
  VD: { name: "Vaud", software: "VaudTax", capital: "Lausanne", capitalRate: 78.5, lang: "fr" },
  ZH: { name: "Zurich", software: "ZHprivateTax", capital: "Zürich", capitalRate: 119, lang: "de" },
};
