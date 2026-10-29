// Compares the tariffs, family quotient, multipliers, church and personal tax
// with results from the official ESTV tax calculator (tools/estv_fixtures.py).
import { describe, expect, it } from "vitest";
import fixtures from "./data/estv-fixtures-2025.json";
import { emptyData, newChild, newPerson } from "./defaults";
import { ifdTax } from "./federal";
import { R } from "./rules2025";
import type { Confession } from "./types";
import { iccIncomeTax, iccWealthBaseTax, rateDeterminingIncome } from "./vd";
import { findZhCommune, zhIncomeSimpleTax, zhTaxes, zhWealthSimpleTax } from "./zh";

type Case = (typeof fixtures.cases)[number] & { confession?: string };
const cases = fixtures.cases as Case[];
const label = (c: Case) =>
  `${c.canton} ${c.married ? "married" : "single"}${c.kids ? ` +${c.kids} child` : ""}, income ${c.income}, wealth ${c.wealth}${c.confession ? `, ${c.confession}` : ""}`;

// The calculator rounds to whole francs.
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

describe("federal tax matches ESTV", () => {
  it.each(cases.map((c) => [label(c), c] as const))("%s", (_l, c) => {
    const parental = c.married || c.kids > 0;
    const tax = ifdTax(c.income, parental) - (parental ? c.kids * R.ifd.childRebate : 0);
    near(Math.max(0, tax), c.expected.IncomeTaxFed);
  });
});

describe("Vaud matches ESTV (Lausanne 78.5%)", () => {
  it.each(cases.filter((c) => c.canton === "VD").map((c) => [label(c), c] as const))("%s", (_l, c) => {
    const d = { ...emptyData(), civilStatus: c.married ? ("married" as const) : ("single" as const), singleParentHousehold: !c.married && c.kids > 0 };
    d.children = Array.from({ length: c.kids }, () => ({ ...newChild(), birthYear: 2016 }));
    const { income820, capped } = rateDeterminingIncome(d, c.income);
    // Known discrepancy: above the family-quotient cap the ESTV calculator disagrees with the
    // worked examples printed in the official 2025 instructions (IG p. 53–54), which this app
    // follows (see calc.test.ts). Only compare cases below the cap.
    if (!capped) {
      const t = iccIncomeTax(c.income, income820, 78.5);
      near(t.cantonal, c.expected.IncomeTaxCanton);
      near(t.communal, c.expected.IncomeTaxCity);
    }
    const exemption = c.married ? R.wealthExemption.married : R.wealthExemption.single;
    const base = iccWealthBaseTax(c.wealth >= exemption ? c.wealth : 0);
    near(base * R.cantonalCoefficient, c.expected.FortuneTaxCanton);
    near(base * 0.785, c.expected.FortuneTaxCity);
  });
});

describe("Zurich matches ESTV (city of Zurich 119%)", () => {
  const zurich = findZhCommune("Zürich")!;
  it.each(cases.filter((c) => c.canton === "ZH").map((c) => [label(c), c] as const))("%s", (_l, c) => {
    const marriedTariff = c.married || c.kids > 0;
    const conf = (c.confession ?? "none") as Confession;
    const adults = Array.from({ length: c.married ? 2 : 1 }, () => ({ ...newPerson(), confession: conf }));
    const churchRates = adults.map((p) => (p.confession === "none" ? 0 : (zurich.church[p.confession] ?? 0)));

    const simpleIncome = zhIncomeSimpleTax(c.income, marriedTariff);
    near(simpleIncome, c.expected.IncomeSimpleTaxCanton);
    const inc = zhTaxes(simpleIncome, zurich.rate, churchRates);
    near(inc.state, c.expected.IncomeTaxCanton);
    near(inc.communal, c.expected.IncomeTaxCity);
    near(inc.church, c.expected.IncomeTaxChurch);

    const simpleWealth = zhWealthSimpleTax(c.wealth, marriedTariff);
    near(simpleWealth, c.expected.FortuneSimpleTaxCanton);
    const w = zhTaxes(simpleWealth, zurich.rate, churchRates);
    near(w.state, c.expected.FortuneTaxCanton);
    near(w.communal, c.expected.FortuneTaxCity);
    near(w.church, c.expected.FortuneTaxChurch);

    expect(24 * adults.length).toBe(c.expected.PersonalTax);
  });
});
