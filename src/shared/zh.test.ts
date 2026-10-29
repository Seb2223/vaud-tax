// Zurich deduction rules (Wegleitung 2025) on full returns.
import { describe, expect, it } from "vitest";
import { compute } from "./calc";
import { emptyData, newChild, newEmployment, newPerson } from "./defaults";
import type { TaxData } from "./types";
import { iccIncomeTax } from "./vd";

const zhData = (patch: Partial<TaxData> = {}): TaxData => ({ ...emptyData(), canton: "ZH", commune: "Zürich", communalRate: 119, ...patch });
const employee = (salary: number, patch: Partial<ReturnType<typeof newPerson>> = {}) => ({
  ...newPerson(),
  employments: [{ ...newEmployment(), employer: "ACME", netSalary: salary }],
  ...patch,
});
const sum = (d: TaxData, code: string) => compute(d).lines.filter((l) => l.code === code).reduce((s, l) => s + l.icc, 0);
const lineBy = (d: TaxData, title: RegExp) => compute(d).lines.find((l) => title.test(l.title))!;

describe("Zurich return", () => {
  it("single employee in the city of Zurich", () => {
    const d = zhData();
    d.persons = [employee(85000, { commuteMode: "public", publicTransportActualCost: 800, meals: "outside", pillar3a: 7258 })];
    d.healthPremiums = 5400;
    d.bankAccounts = [{ id: "a", bank: "ZKB", balance: 40000, interest: 100, withholdingTax: false }];
    const r = compute(d);
    // Berufsauslagen 11.1: 800 (Abo) + 3,200 (meals 240 × 15, capped) + 2,550 (3% of 85,000)
    expect(sum(d, "11.1")).toBe(800 + 3200 + 2550);
    expect(sum(d, "14.1")).toBe(7258);
    // Ziffer 15: premiums + savings interest, capped at CHF 2,900 (single, with pension fund)
    expect(sum(d, "15")).toBe(2900);
    // 85,000 + 100 − 6,550 − 7,258 − 2,900 = 68,392
    expect(r.details["21"]).toBe(68392);
    expect(r.details["25"]).toBe(68300);
    // Personal tax CHF 24 is part of the cantonal total; no church tax by default
    expect(r.estimate.cantonSections.find((s) => s.title === "Personal tax")!.rows[0].value).toBe(24);
  });

  it("commuting is capped at CHF 5,200 (state) and CHF 3,300 (federal)", () => {
    const d = zhData();
    d.persons = [employee(90000, { commuteMode: "car", commuteKm: 30, commuteDays: 240, vehicleJustification: "no train" })];
    const l = lineBy(d, /Commuting/);
    expect(l.icc).toBe(5200);
    expect(l.ifd).toBe(3300);
  });

  it("meals at a canteen: CHF 7.50 per day, max CHF 1,600", () => {
    const d = zhData();
    d.persons = [employee(90000, { meals: "canteen", commuteDays: 100 })];
    expect(lineBy(d, /Meals/).icc).toBe(750);
  });

  it("married with two children: child deduction, dual-income deduction, childcare cap", () => {
    const d = zhData({ civilStatus: "married" });
    d.persons = [employee(90000), employee(60000)];
    d.children = [
      { ...newChild(), birthYear: 2019, childcareCosts: 30000 },
      { ...newChild(), birthYear: 2015 },
    ];
    expect(sum(d, "24.1")).toBe(2 * 9300);
    expect(sum(d, "17")).toBe(6100);
    expect(sum(d, "16.6")).toBe(25000);
    expect(lineBy(d, /Childcare/).ifd).toBe(25800);
    // Married tariff applies (simple tax at taxable income ≈ married scale)
    expect(compute(d).estimate.cantonSections[0].rows.some((r) => r.label.includes("Verheiratetentarif"))).toBe(true);
  });

  it("church tax uses the commune's rate for each spouse's confession", () => {
    const d = zhData({ civilStatus: "married" });
    d.persons = [employee(80000, { confession: "reformed" }), employee(40000, { confession: "none" })];
    const income = compute(d).estimate.cantonSections[0];
    const simple = income.rows.find((r) => r.label.startsWith("Simple state tax"))!.value;
    const church = income.rows.find((r) => r.label.startsWith("Church tax"))!.value;
    // Zurich city reformed 10%, split in half because only one spouse is a member
    expect(church).toBeCloseTo((simple * 0.1) / 2, 0);
  });

  it("property: Eigenmietwert minus 20% flat maintenance (federal 10% for new buildings)", () => {
    const d = zhData();
    d.persons = [employee(100000)];
    d.properties = [
      {
        id: "p",
        description: "Flat",
        commune: "Zürich",
        surfaceM2: 90,
        constructionYear: 2020,
        detachedVilla: false,
        ownershipShare: 1,
        monthsOwnUse: 12,
        mainResidence: true,
        taxEstimate: 900000,
        rentalIncome: 0,
        maintenanceActual: 0,
        rentalValueOverride: 24000,
      },
    ];
    const l = lineBy(d, /Property/);
    expect(l.icc).toBe(24000 - 4800);
    expect(l.ifd).toBe(24000 - 2400);
    expect(sum(d, "31.1")).toBe(900000);
  });
});

describe("Vaud 30% cap (LI art. 47)", () => {
  it("cantonal + communal income tax never exceeds 30% of taxable income", () => {
    const t = iccIncomeTax(1_000_000, 1_000_000, 78.5);
    expect(t.capped).toBe(true);
    expect(Math.round(t.cantonal + t.communal)).toBe(300000);
  });
});
