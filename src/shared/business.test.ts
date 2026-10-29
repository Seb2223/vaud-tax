// Self-employment: AVS scale (mémento 2.02), private shares and depreciation
// (VD 21003), and where the result goes in each canton.
import { describe, expect, it } from "vitest";
import { avsContribution, computeBusiness } from "./business";
import { compute } from "./calc";
import { emptyData, newAsset, newBusiness, newPerson, normalize } from "./defaults";
import type { Business, TaxData } from "./types";

describe("AVS/AI/APG contributions of the self-employed (mémento 2.02)", () => {
  it.each([
    [80000, 0.1, 8000],
    [60500, 0.1, 6050],
    [50000, 0.0784, 3920],
    [10100, 0.05371, 542.47],
    [5000, 0, 530],
  ])("income %i → rate %f, CHF %f", (income, rate, amount) => {
    const r = avsContribution(income);
    expect(r.rate).toBe(rate);
    expect(r.amount).toBeCloseTo(amount, 2);
  });
});

const consultant = (patch: Partial<Business> = {}): Business => ({
  ...newBusiness(),
  name: "Studio",
  revenue: 120000,
  expenses: { rent: 18000, office: 7000, communication: 5000 },
  assets: [{ ...newAsset(), category: "it", bookValueStart: 5000 }],
  carPurchasePrice: 40000,
  carMonths: 12,
  householdCostsBooked: true,
  ownPension: 10000,
  dailyAllowanceInsurance: 2000,
  equityCapital: 20000,
  ...patch,
});
const single = { adults: 1, children: 0 };

describe("business result", () => {
  it("Vaud: records mode with private shares, depreciation, pension and AVS", () => {
    const r = computeBusiness(consultant(), "VD", single);
    expect(r.expenses).toBe(30000);
    expect(r.depreciation).toBe(2000); // 40% of 5,000
    expect(r.carPrivateShare).toBe(4320); // 0.9% × 40,000 × 12
    expect(r.householdPrivateShare).toBe(3540);
    expect(r.grossProfit).toBe(120000 - 30000 - 2000 + 4320 + 3540);
    expect(r.pensionBusiness).toBe(5000);
    expect(r.dailyAllowanceBusiness).toBe(1000);
    // AVS income: 95,860 − 5,000 − 1,000 − 1% × 20,000 = 89,660 → 89,600 × 10%
    expect(r.avsBase).toBe(89600);
    expect(r.avs).toBe(8960);
    expect(r.declared).toBe(95860 - 5000 - 1000 - 8960);
  });

  it("Zurich: AVS isn't deducted from Ziffer 2.1, household flat rate is Vaud-only", () => {
    const r = computeBusiness(consultant(), "ZH", single);
    expect(r.householdPrivateShare).toBe(0);
    expect(r.dailyAllowanceBusiness).toBe(0);
    expect(r.grossProfit).toBe(92320);
    expect(r.avsBase).toBe(87100);
    expect(r.declared).toBe(92320 - 5000);
    expect(r.netAfterAvs).toBe(92320 - 5000 - 8710);
  });

  it("car private share is at least CHF 150 per month", () => {
    expect(computeBusiness(consultant({ carPurchasePrice: 10000, carMonths: 6 }), "VD", single).carPrivateShare).toBe(900);
  });

  it("accounts mode adds back booked own contributions before re-deducting them", () => {
    const b = consultant({ mode: "accounts", netProfit: 60000, avsContributions: 6000, ownPension: 4000, carPurchasePrice: 0, householdCostsBooked: false, dailyAllowanceInsurance: 0 });
    const r = computeBusiness(b, "VD", single);
    expect(r.grossProfit).toBe(70000);
    expect(r.avs).toBe(6000);
    expect(r.avsIsEstimate).toBe(false);
    expect(r.declared).toBe(70000 - 2000 - 6000);
  });

  it("flags depreciation above the official rate and turnover requiring full accounts", () => {
    const b = consultant({ revenue: 600000, assets: [{ ...newAsset(), category: "furniture", bookValueStart: 10000, depreciation: 5000 }] });
    const r = computeBusiness(b, "VD", single);
    expect(r.assets[0]).toMatchObject({ max: 2500, used: 5000, tooHigh: true });
    expect(r.needsFullAccounts).toBe(true);
  });
});

const freelancer = (canton: "VD" | "ZH"): TaxData => {
  const d = { ...emptyData(), canton, commune: canton === "ZH" ? "Zürich" : "Lausanne", communalRate: canton === "ZH" ? 119 : 78.5 };
  d.persons = [{ ...newPerson(), hasPensionFund: false, pillar3a: 30000, business: consultant({ lossCarryForward: 4000 }) }];
  return d;
};

describe("full return of a self-employed person", () => {
  it("Vaud: codes 180, 186, 330, 465 and the large 3a", () => {
    const r = compute(freelancer("VD"));
    const get = (code: string) => r.lines.find((l) => l.code === code)!;
    expect(get("180").icc).toBe(80900);
    expect(get("186").icc).toBe(4000);
    expect(get("330").icc).toBe(5000);
    expect(get("465").icc).toBe(20000);
    // No pension fund: 3a up to 20% of net self-employed income (80,900 → 16,180)
    expect(get("310").icc).toBe(16180);
  });

  it("Zurich: Ziffer 2.1, losses, 16.1 with own AHV, Ziffer 32", () => {
    const r = compute(freelancer("ZH"));
    const get = (code: string, title?: RegExp) => r.lines.find((l) => l.code === code && (!title || title.test(l.title)))!;
    expect(get("2.1", /activity/).icc).toBe(87320);
    expect(get("2.1", /losses/).icc).toBe(4000);
    expect(get("16.1").icc).toBe(5000 + 8710);
    expect(get("32").icc).toBe(20000);
    expect(get("14.1").icc).toBe(Math.round((87320 - 8710) * 0.2));
  });

  it("same taxable business income in both cantons once AVS is deducted", () => {
    // VD deducts AVS inside 180, ZH under 16.1 — the federal taxable income must match.
    const vd = compute(freelancer("VD")).estimate.ifd.taxableIncome;
    const zh = compute(freelancer("ZH")).estimate.ifd.taxableIncome;
    // Only difference: Vaud's household private share (+3,540) and half the daily-allowance insurance.
    expect(Math.abs(vd - zh - 3540)).toBeLessThanOrEqual(2000);
  });

  it("migrates the old single 'net result' field", () => {
    const old = { ...emptyData(), persons: [{ ...newPerson(), selfEmploymentNet: 50000, selfEmployedPensionContributions: 3000 }] };
    const d = normalize(old);
    expect(d.persons[0].business).toMatchObject({ mode: "accounts", netProfit: 50000, ownPension: 3000 });
  });
});
