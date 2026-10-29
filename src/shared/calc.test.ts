// Checks the rules engine against the worked examples printed in the official
// 2025 instructions (page numbers refer to research/21001_2025.pdf and 21004_2025.pdf).
import { describe, expect, it } from "vitest";
import { compute } from "./calc";
import { ifdTax } from "./federal";
import { familyDeduction, housingDeduction, iccIncomeBaseTax, iccIncomeTax, modestDeduction, rateDeterminingIncome, rentalValue } from "./vd";
import { emptyData, newChild, newEmployment, newPerson, newProperty } from "./defaults";
import { publicTransportFlatRate } from "./rules2025";
import type { TaxData } from "./types";

const withKids = (d: TaxData, n: number) => {
  d.children = Array.from({ length: n }, () => ({ ...newChild(), birthYear: 2015 }));
  return d;
};

describe("ICC income tax (IG p. 61)", () => {
  it("example 1: single, taxable CHF 20,700, Lausanne 78.5%", () => {
    expect(iccIncomeBaseTax(20700)).toBe(995);
    const t = iccIncomeTax(20700, 20700, 78.5);
    expect(t.baseIncome).toBe(995);
    expect(t.reduction).toBe(39.8);
    expect(t.cantonal).toBe(1480.55);
    expect(t.communal).toBe(781.1);
    expect(Math.round((t.cantonal + t.communal) * 100) / 100).toBe(2261.65);
  });

  it("example 2: married, 2 children, taxable CHF 48,200", () => {
    const d = withKids({ ...emptyData(), civilStatus: "married" }, 2);
    const { income820 } = rateDeterminingIncome(d, 48200);
    expect(income820).toBe(17200);
    const t = iccIncomeTax(48200, income820, 78.5);
    expect(t.ratePercent).toBe(4.360465);
    expect(t.baseIncome).toBe(2101.75);
    expect(t.reduction).toBe(84.05);
    expect(t.cantonal).toBe(3127.45);
    expect(t.communal).toBe(1649.85);
  });
});

describe("Family quotient and its cap (IG p. 52–54)", () => {
  const married = (kids: number) => withKids({ ...emptyData(), civilStatus: "married" }, kids);
  const singleParent = (kids: number) => withKids({ ...emptyData(), singleParentHousehold: true }, kids);
  const singleWithKids = (kids: number) => withKids({ ...emptyData(), singleParentHousehold: false }, kids);

  it.each([
    ["married, no children", married(0), 220000, 122200],
    ["married, 4 children, below cap", married(4), 260000, 68400],
    ["married, 4 children, above cap", married(4), 300000, 83700],
    ["single parent, 2 children, below cap", singleParent(2), 195000, 84700],
    ["single parent, 2 children, above cap", singleParent(2), 250000, 113200],
    ["single, 2 children not in own household", singleWithKids(2), 195000, 97500],
    ["single, 2 children, above cap", singleWithKids(2), 240000, 121700],
  ])("%s", (_label, d, taxable, expected) => {
    expect(rateDeterminingIncome(d, taxable).income820).toBe(expected);
  });
});

describe("Social deductions", () => {
  it("modest-income deduction, married with 2 children (IG p. 47)", () => {
    expect(modestDeduction("married", 4, 49295).deduction).toBe(19900);
  });

  it.each([
    [126300, 3300],
    [128399, 3300],
    [128400, 3200],
    [164099, 1600],
    [164100, 1500],
    [165100, 1400],
    [179100, 0],
  ])("family deduction, married 2 children, net income %i → %i (IG p. 50)", (net, expected) => {
    expect(familyDeduction("married", 2, net).deduction).toBe(expected);
  });

  it("family deduction, single parent 2 children = 4,800; not own household = 2,000 (IG p. 51)", () => {
    expect(familyDeduction("singleParent", 2, 100000).deduction).toBe(4800);
    expect(familyDeduction("singleWithChildren", 2, 100000).deduction).toBe(2000);
  });

  it.each([
    [60000, 22000, 6800],
    [80000, 18000, 2000],
    [70000, 12000, 0],
  ])("housing deduction, couple with 2 children, net %i rent %i → %i (IG p. 44)", (net, rent, expected) => {
    expect(housingDeduction(rent, net, true, 2)).toBe(expected);
  });
});

describe("Employment deductions", () => {
  it("public transport flat rate (IG p. 19)", () => {
    expect(publicTransportFlatRate(19)).toBe(2976);
    expect(publicTransportFlatRate(1)).toBe(1176);
    expect(publicTransportFlatRate(80)).toBe(4080);
  });

  const salaried = (patch: Partial<ReturnType<typeof newPerson>>, salary = 80000) => {
    const d = emptyData();
    d.persons = [{ ...newPerson(), ...patch, employments: [{ ...newEmployment(), netSalary: salary }] }];
    return compute(d).lines;
  };

  it.each([
    [19, 6384],
    [45, 12810],
  ])("car, %i km one way, 240 days (IG p. 21)", (km, expected) => {
    const line = salaried({ commuteMode: "car", commuteKm: km, vehicleJustification: "no bus" }).find((l) => l.code === "140")!;
    expect(line.icc).toBe(expected);
    expect(line.ifd).toBe(3300);
  });

  it("other professional expenses: 3% kept within 2,000–4,000 (IG p. 22)", () => {
    expect(salaried({}, 50000).find((l) => l.code === "160")!.icc).toBe(2000);
    expect(salaried({}, 100000).find((l) => l.code === "160")!.icc).toBe(3000);
    expect(salaried({}, 200000).find((l) => l.code === "160")!.icc).toBe(4000);
    expect(salaried({}, 1500).find((l) => l.code === "160")!.icc).toBe(1500);
  });

  it.each([
    [300, 300],
    [6000, 1200],
    [15000, 2400],
  ])("secondary job %i → %i (IG p. 23)", (salary, expected) => {
    const d = emptyData();
    d.persons = [{ ...newPerson(), employments: [{ ...newEmployment(), netSalary: salary, secondary: true }] }];
    expect(compute(d).lines.find((l) => l.code === "165")!.icc).toBe(expected);
  });

  it("insurance premiums, married with 2 children (IG p. 29)", () => {
    const d = withKids({ ...emptyData(), civilStatus: "married", persons: [newPerson(), newPerson()] }, 2);
    d.healthPremiums = 17000;
    d.premiumSubsidies = 4032;
    expect(compute(d).lines.find((l) => l.code === "300")!.icc).toBe(12500);
  });

  it("pillar 3a is capped at CHF 7,258 with a pension fund (IG p. 31)", () => {
    const line = salaried({ pillar3a: 8000 }).find((l) => l.code === "310")!;
    expect(line.icc).toBe(7258);
    expect(line.warnings?.[0]).toMatch(/above the cap/);
  });
});

describe("Property rental value (IC p. 20–21)", () => {
  const prop = (patch: Partial<ReturnType<typeof newProperty>>) => ({ ...newProperty("Outside Vaud"), detachedVilla: true, ...patch });

  it("example 1: 200 m², built 1960 → 23,823; half share → 11,911", () => {
    expect(rentalValue(prop({ surfaceM2: 200, constructionYear: 1960 })).icc).toBeCloseTo(23823, -1);
    expect(Math.abs(rentalValue(prop({ surfaceM2: 200, constructionYear: 1960, ownershipShare: 0.5 })).icc - 11911)).toBeLessThanOrEqual(1);
  });

  it("example 3: 150 m², built 1975 → 20,148", () => {
    expect(Math.abs(rentalValue(prop({ surfaceM2: 150, constructionYear: 1975 })).icc - 20148)).toBeLessThanOrEqual(1);
  });

  it("applies the commune coefficient and the flat/semi-detached coefficient", () => {
    const rv = rentalValue(prop({ commune: "Lausanne", detachedVilla: false, surfaceM2: 100, constructionYear: 2010 }));
    expect(rv.communeCoef).toBe(1.02);
    expect(rv.typeCoef).toBe(0.9);
    expect(rv.icc).toBe(Math.round(16553 * 1.02 * 0.9 * 1.3 * 0.65));
  });
});

describe("Federal tax (ESTV form 58c 2025)", () => {
  it.each([
    [50000, false, 400.8],
    [33300, false, 139.45],
    [108800, false, 3268.8],
    [1000000, false, 115000],
    [100000, true, 1816],
    [200000, true, 11887],
    [940900, true, 108203.5],
    [10000, true, 0],
  ])("taxable %i (married scale: %s) → %f", (income, marriedScale, expected) => {
    expect(ifdTax(income, marriedScale)).toBe(expected);
  });
});

describe("Full return", () => {
  it("single employee in Lausanne produces a consistent estimate", () => {
    const d = emptyData();
    d.persons = [
      {
        ...newPerson(),
        firstName: "Alex",
        employments: [{ ...newEmployment(), employer: "ACME", netSalary: 85000 }],
        commuteMode: "public",
        commuteKm: 12,
        meals: "outside",
        pillar3a: 7258,
      },
    ];
    d.healthPremiums = 5400;
    d.rentPaidNet = 18000;
    const r = compute(d);
    const sum = (code: string) => r.lines.filter((l) => l.code === code).reduce((s, l) => s + l.icc, 0);
    expect(sum("140")).toBe(2531);
    expect(sum("150")).toBe(3200);
    expect(sum("160")).toBe(2550);
    expect(sum("300")).toBe(5000);
    // 85,000 − 2,531 − 3,200 − 2,550 − 7,258 − 5,000 = 64,461
    expect(r.details["650"]).toBe(64461);
    // housing: min(18,000, 11,100) − 20% × 64,461 = −1,792 → 0
    expect(sum("660")).toBe(0);
    expect(r.details["800"]).toBe(64400);
    expect(r.details["810"]).toBe(1);
    expect(r.estimate.total).toBeGreaterThan(0);
    expect(r.estimate.ifd.taxableIncome).toBe(Math.floor((85000 - 2531 - 3200 - 2550 - 7258 - 1800) / 100) * 100);
  });
});
