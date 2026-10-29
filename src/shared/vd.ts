// Vaud (ICC) rules for 2025. No AI involved: every amount here is computed
// from the user's data and the official figures in rules2025.ts.

import communes from "./data/communes.json";
import { computeBusiness, type HouseholdSize } from "./business";
import { federalTax, scaleTax } from "./federal";
import { activePersons, childrenWithPart, type FamilyKind, familyKind, TAX_YEAR } from "./household";
import { chf, clamp, floor100, floor1000, pos, round05, round100 } from "./money";
import { buildingAgeCoefficient, ICC_INCOME_SCALE, ICC_WEALTH_SCALE, publicTransportFlatRate, R, rentalBaseValue, src } from "./rules2025";
import type { CalcResult } from "./calc";
import type { GuideLine, Person, Property, TaxData } from "./types";
import { loc } from "./vdLocations";

export interface Commune {
  name: string;
  district: string;
  rate: number;
  rateConfirmed2025: boolean;
  rentalValueCoef: number;
}
export const COMMUNES = communes as Commune[];
export const findCommune = (name: string) => COMMUNES.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());

// ---------------------------------------------------------------------------
// Tax scales

export const iccIncomeBaseTax = (rateIncome: number) => scaleTax(ICC_INCOME_SCALE, floor100(rateIncome), 100);

export function iccWealthBaseTax(wealth: number): number {
  if (wealth < ICC_WEALTH_SCALE[0][0]) return 0;
  return round05(scaleTax(ICC_WEALTH_SCALE, floor1000(wealth), 1000));
}

/** ICC income tax from taxable income (code 800) and rate-determining income (code 820). IG p. 60–61. */
export function iccIncomeTax(taxable800: number, income820: number, communalRate: number) {
  const base820 = iccIncomeBaseTax(income820);
  const ratePercent = income820 > 0 ? Math.round((base820 / income820) * 100 * 1e6) / 1e6 : 0;
  const baseIncome = round05((taxable800 * ratePercent) / 100);
  const reduction = round05(baseIncome * R.cantonalIncomeReduction);
  let cantonal = round05((baseIncome - reduction) * R.cantonalCoefficient);
  let communal = round05((baseIncome * communalRate) / 100);
  // LI art. 47: cantonal + communal income tax may not exceed 30% of taxable income.
  const cap = R.maxIncomeTaxShare * taxable800;
  const capped = cantonal + communal > cap;
  if (capped) {
    const factor = cap / (cantonal + communal);
    cantonal = round05(cantonal * factor);
    communal = round05(communal * factor);
  }
  return { ratePercent, baseIncome, reduction, cantonal, communal, capped };
}

/** Code 660 (IG p. 44). */
export function housingDeduction(rent: number, net650: number, coupleOrSingleParent: boolean, kids: number): number {
  if (rent <= 0) return 0;
  const maxRent = (coupleOrSingleParent ? R.housing.maxRentCoupleOrSingleParent : R.housing.maxRentSingle) + kids * R.housing.perChild;
  return Math.round(clamp(Math.min(rent, maxRent) - R.housing.incomeShare * net650, 0, R.housing.maxDeduction));
}

/** Code 695 (IG p. 45–47). Returns the deduction and the table values used. */
export function modestDeduction(kind: FamilyKind, householdSize: number, income690: number) {
  const table = kind === "married" ? R.modest.B : kind === "singleParent" ? R.modest.C : R.modest.A;
  const idx = Math.min(householdSize, 7);
  const extra = Math.max(0, householdSize - 7);
  const limit = table.limit[idx] + extra * R.modest.extraPersonLimit;
  const max = table.max[idx] + extra * R.modest.extraPersonMax;
  let deduction = 0;
  if (income690 > 0 && income690 < limit) deduction = income690 <= max ? income690 : Math.max(0, max - round100((income690 - max) / 2));
  return { deduction, limit, max };
}

/** Code 725 (IG p. 49–51). */
export function familyDeduction(kind: FamilyKind, kids: number, net650: number) {
  const base = (kind === "married" ? R.family.married : kind === "singleParent" ? R.family.singleParent : 0) + kids * R.family.perChild;
  let reduction = 0;
  if (net650 >= R.family.threshold) {
    const s1 = Math.floor((Math.min(net650, R.family.step1Until) - R.family.threshold) / R.family.step1Size);
    const s2 = net650 > R.family.step1Until ? Math.floor((net650 - R.family.step1Until) / R.family.step2Size) : 0;
    reduction = (s1 + s2) * R.family.stepAmount;
  }
  return { base, deduction: Math.max(0, base - reduction) };
}

// ---------------------------------------------------------------------------
// Family quotient

export function familyParts(d: TaxData): number {
  const kids = childrenWithPart(d).length;
  const base = { married: R.quotient.married, singleParent: R.quotient.singleParent, singleWithChildren: R.quotient.single, single: R.quotient.single }[
    familyKind(d)
  ];
  return base + kids * R.quotient.perChild;
}

/** Rate-determining income (code 820), including the quotient cap (IG p. 52–54). */
export function rateDeterminingIncome(d: TaxData, taxable800: number): { income820: number; capped: boolean } {
  const kids = childrenWithPart(d).length;
  const kind = familyKind(d);
  const parts = familyParts(d);
  if (kids === 0 || kind === "single") return { income820: floor100(taxable800 / parts), capped: false };

  const capIncome = extrapolate(R.quotient.capIncome, kids);
  if (taxable800 <= capIncome) return { income820: floor100(taxable800 / parts), capped: false };

  const [baseParts, table] =
    kind === "married"
      ? [R.quotient.married, R.quotient.marriedCapDeduction]
      : kind === "singleParent"
        ? [R.quotient.singleParent, R.quotient.singleParentCapDeduction]
        : [R.quotient.single, R.quotient.singleWithChildCapDeduction];
  return { income820: floor100(taxable800 / baseParts - extrapolate(table as readonly number[], kids)), capped: true };
}

/** Table lookup by number of children, extrapolating linearly past the published rows. */
function extrapolate(table: readonly number[], n: number): number {
  const last = table.length - 1;
  if (n <= last) return table[n];
  return table[last] + (n - last) * (table[last] - table[last - 1]);
}

// ---------------------------------------------------------------------------
// Property rental value (IC p. 11–20)

export interface RentalValue {
  base: number;
  ageCoef: number;
  communeCoef: number;
  typeCoef: number;
  indexed: number;
  icc: number;
  ifd: number;
  communeKnown: boolean;
}

export function rentalValue(p: Property): RentalValue {
  const commune = findCommune(p.commune);
  const base = rentalBaseValue(p.surfaceM2);
  const ageCoef = buildingAgeCoefficient(p.constructionYear);
  const communeCoef = commune?.rentalValueCoef ?? 1.0;
  const typeCoef = p.detachedVilla ? 1 : R.property.groupedHousingCoef;
  const indexed = base * ageCoef * communeCoef * typeCoef * R.property.indexation;
  const share = clamp(p.ownershipShare || 1, 0, 1) * clamp(p.monthsOwnUse, 0, 12) / 12;
  if (p.rentalValueOverride > 0) {
    // Override is the ICC (65%) value; derive the IFD value from it.
    const icc = Math.round(p.rentalValueOverride * share);
    return { base, ageCoef, communeCoef, typeCoef, indexed, icc, ifd: Math.round((icc / R.property.iccShare) * R.property.ifdShare), communeKnown: !!commune };
  }
  return {
    base,
    ageCoef,
    communeCoef,
    typeCoef,
    indexed: Math.round(indexed),
    icc: Math.round(indexed * R.property.iccShare * share),
    ifd: Math.round(indexed * R.property.ifdShare * share),
    communeKnown: !!commune,
  };
}

function maintenanceFlat(p: Property, rv: RentalValue) {
  const age = TAX_YEAR - p.constructionYear;
  const iccRate = age <= R.property.maintenanceIcc.youngMaxAge ? R.property.maintenanceIcc.youngRate : R.property.maintenanceIcc.oldRate;
  const rent = pos(p.rentalIncome);
  const rentIcc =
    age <= R.property.maintenanceIcc.youngMaxAge
      ? Math.min(rent * R.property.rentalMaintenanceIcc.youngRate, R.property.rentalMaintenanceIcc.youngCap)
      : Math.min(rent * R.property.rentalMaintenanceIcc.oldRate, R.property.rentalMaintenanceIcc.oldCap);
  const ifdRate = age <= R.property.maintenanceIfd.youngMaxAge ? R.property.maintenanceIfd.youngRate : R.property.maintenanceIfd.oldRate;
  return {
    icc: Math.round(rv.icc * iccRate + rentIcc),
    ifd: Math.round((rv.ifd + rent) * ifdRate),
    iccRate,
    ifdRate,
    age,
  };
}

// ---------------------------------------------------------------------------
// Per-person employment deductions

interface PersonCalc {
  label: string;
  main: number; // 100
  secondary: number; // 105
  allowances: number; // 110
  commuteIcc: number;
  commuteIfd: number;
  meals: number;
  otherPro: number;
  secondaryPro: number;
  selfEmployed: number;
  /** Private half of the self-employed person's own daily-allowance insurance (→ code 300). */
  privateInsurance: number;
  lossCarryForward: number;
  pillar3a: number;
  pillar3aCap: number;
  lppBuyback: number;
  selfPension: number;
  lossOfEarnings: number;
  trainingIcc: number;
  trainingIfd: number;
  /** Earned income net of professional costs and pension contributions (for code 235). */
  netEarned: number;
  hasEarnedIncome: boolean;
}

const SRC_SELF = "Instructions complémentaires 2025, activité lucrative indépendante (ACI Vaud, doc 21003)";

function computePerson(p: Person, index: number, lines: GuideLine[], household: HouseholdSize): PersonCalc {
  const label = p.firstName || `Person ${index + 1}`;
  const mainJobs = p.employments.filter((e) => !e.secondary);
  const sideJobs = p.employments.filter((e) => e.secondary);
  const main = mainJobs.reduce((s, e) => s + pos(e.netSalary), 0);
  const secondary = sideJobs.reduce((s, e) => s + pos(e.netSalary), 0);
  const allowances = pos(p.allowancesNotFromEmployer);
  const salaried = main + secondary > 0;
  // 0 is a real answer (full home office), so only fall back to a full year when the field is missing.
  const days = clamp(Number.isFinite(p.commuteDays) ? p.commuteDays : R.commute.fullYearDays, 0, 366);
  const dayShare = days / R.commute.fullYearDays;

  const add = (code: string, l: Omit<GuideLine, "code" | "officialLabel" | "path" | "person">) =>
    lines.push({ code, ...loc(code), person: label, ...l });

  for (const e of mainJobs)
    add("100", {
      title: `Main salary – ${e.employer || "employer"}`,
      icc: pos(e.netSalary),
      kind: "income",
      explanation: "Net salary from box 11 of the salary certificate (after AVS/AI/APG/AC/AANP and pension contributions).",
      source: src("IG", 17),
    });
  for (const e of sideJobs)
    add("105", {
      title: `Secondary job – ${e.employer || "employer"}`,
      icc: pos(e.netSalary),
      kind: "income",
      explanation: "Box 11 of the salary certificate. Secondary = regularly under 30% of normal working hours.",
      source: src("IG", 18),
    });
  if (allowances)
    add("110", {
      title: "Allowances not paid by the employer",
      icc: allowances,
      kind: "income",
      explanation: "Family, birth, maternity/paternity allowances paid directly by a compensation fund, tips, etc.",
      source: src("IG", 18),
    });

  // Code 140 – commuting
  let commuteIcc = 0;
  let commuteExpl = "";
  const warnings: string[] = [];
  const freeTransport = p.employments.some((e) => e.freeTransport);
  if (salaried && p.commuteMode !== "none" && !freeTransport) {
    const km = pos(p.commuteKm);
    if (p.commuteMode === "public") {
      const flat = Math.round(publicTransportFlatRate(km) * dayShare);
      commuteIcc = flat;
      commuteExpl = `Public transport flat rate for ${km} km one way: ${chf(publicTransportFlatRate(km))}/year × ${days}/240 days = ${chf(flat)}.`;
      if (pos(p.publicTransportActualCost) > flat) {
        commuteIcc = Math.round(pos(p.publicTransportActualCost));
        commuteExpl += ` Your actual cost ${chf(commuteIcc)} is higher and is used instead — keep the receipts (IG p. 20: "frais effectifs plus élevés dûment justifiés").`;
      }
    } else if (p.commuteMode === "bike") {
      commuteIcc = Math.round(R.commute.bikePerYear * dayShare);
      commuteExpl = `Bicycle/moped flat rate CHF 700/year × ${days}/240 days.`;
    } else {
      const yearlyKm = km * 2 * days;
      if (p.commuteMode === "motorbike") {
        commuteIcc = Math.round(yearlyKm * R.commute.motorbikePerKm);
        commuteExpl = `${km} km × 2 × ${days} days = ${yearlyKm.toLocaleString("de-CH")} km × 40 ct.`;
      } else {
        const first = Math.min(yearlyKm, R.commute.carThresholdKm);
        commuteIcc = Math.round(first * R.commute.carPerKmFirst15000 + (yearlyKm - first) * R.commute.carPerKmBeyond);
        commuteExpl = `${km} km × 2 × ${days} days = ${yearlyKm.toLocaleString("de-CH")} km; 70 ct/km up to 15,000 km, 35 ct/km beyond.`;
      }
      if (!p.vehicleJustification.trim())
        warnings.push(
          "A private vehicle is only accepted if public transport is unavailable or unreasonable (disability, far from a stop, many changes, vehicle needed for work). Saving time is not enough (IG p. 20). Add your justification, otherwise the tax office may only allow the public-transport rate of " +
            chf(Math.round(publicTransportFlatRate(km) * dayShare)) +
            ".",
        );
    }
    if (days < R.commute.fullYearDays)
      warnings.push(`Reduced to ${days} days. Also declare home-office days / work interruptions under "Périodes d’interruption de travail".`);
  }
  if (salaried && freeTransport)
    warnings.push("Box F of your salary certificate is ticked (free transport provided by the employer): no commuting deduction.");
  const commuteIfd = Math.min(commuteIcc, R.commute.ifdCap);
  if (commuteIcc || warnings.length)
    add("140", {
      title: "Commuting costs",
      icc: commuteIcc,
      ifd: commuteIfd !== commuteIcc ? commuteIfd : undefined,
      kind: "deduction",
      explanation:
        commuteExpl +
        ` In VaudTax enter the means of transport, the one-way distance (${pos(p.commuteKm)} km) and the number of days; VaudTax computes the amount.` +
        (commuteIfd !== commuteIcc ? ` Federal tax caps this at ${chf(R.commute.ifdCap)}.` : ""),
      source: src("IG", "19–20, 62"),
      warnings,
    });

  // Code 150 – meals
  let meals = 0;
  const mealWarnings: string[] = [];
  if (salaried && p.meals !== "none") {
    const canteen = p.meals === "canteen" || p.employments.some((e) => e.canteen);
    const rate = p.meals === "shift" ? R.meals.shift : canteen ? R.meals.canteen : R.meals.outside;
    meals = Math.round(rate * dayShare);
    if (canteen && p.meals === "outside")
      mealWarnings.push("Box G of a salary certificate is ticked (canteen or meal subsidy), so only half the meal deduction applies.");
    add("150", {
      title: p.meals === "shift" ? "Meals – shift / night work" : "Meals taken away from home",
      icc: meals,
      kind: "deduction",
      explanation: `${chf(rate)} per year${canteen && p.meals !== "shift" ? " (half rate: canteen/employer subsidy)" : ""} × ${days}/240 days.`,
      source: src("IG", 21),
      warnings: mealWarnings,
    });
  }

  // Code 160 – other professional expenses
  let otherPro = 0;
  if (main > 0) {
    const base = main + mainJobs.reduce((s, e) => s + pos(e.lppBuybackOnCertificate), 0);
    const flat = base < R.otherProfessional.min ? base : clamp(base * R.otherProfessional.rate, R.otherProfessional.min, R.otherProfessional.max);
    const actual = pos(p.otherProfessionalExpensesActual);
    otherPro = Math.round(actual > 0 ? actual : flat);
    add("160", {
      title: "Other professional expenses",
      icc: otherPro,
      kind: "deduction",
      explanation:
        actual > 0
          ? `Actual costs claimed. The flat rate would be ${chf(Math.round(flat))}. Keep receipts; flat rate and actual costs can't be combined.`
          : `Flat rate: 3% of net salary ${chf(base)} = ${chf(Math.round(base * 0.03))}, kept between CHF 2,000 and CHF 4,000. Choose "forfait" in VaudTax.`,
      source: src("IG", 22),
    });
  }

  // Code 165 – secondary job flat rate
  let secondaryPro = 0;
  if (secondary > 0) {
    secondaryPro = Math.round(secondary < R.secondaryJob.min ? secondary : clamp(secondary * R.secondaryJob.rate, R.secondaryJob.min, R.secondaryJob.max));
    add("165", {
      title: "Secondary job expenses",
      icc: secondaryPro,
      kind: "deduction",
      explanation: "20% of the secondary salary, between CHF 800 and CHF 2,400 (never more than the salary itself).",
      source: src("IG", 23),
    });
  }

  // Self-employment (codes 180 / 186 / 330, questionnaire 21021)
  const b = p.business;
  const biz = b ? computeBusiness(b, "VD", household) : null;
  const selfEmployed = biz ? biz.declared : 0;
  if (b && biz) {
    const w: string[] = [];
    if (biz.needsFullAccounts && b.mode === "records")
      w.push("Turnover of CHF 500,000 or more: you must keep full accounts (CO 957) and attach the balance sheet and income statement.");
    if (biz.avsIsEstimate)
      w.push(
        `Own AVS/AI/APG contributions are estimated at ${chf(biz.avs)} (${(biz.avsEstimate.rate * 100).toFixed(3)}% of ${chf(biz.avsBase)}). Use the amount of your caisse's 2025 decision if you have it; a provision for contributions still due on 2025 income is accepted. Administration fees (up to 5%) and family-allowance contributions are not included.`,
      );
    for (const a of biz.assets)
      if (a.tooHigh) w.push(`Depreciation of ${chf(a.used)} exceeds the official maximum of ${chf(a.max)} for this asset category.`);
    const parts = [
      b.mode === "records"
        ? `Turnover ${chf(biz.revenue)} − expenses ${chf(biz.expenses)}${biz.depreciation ? ` − depreciation ${chf(biz.depreciation)}` : ""}`
        : `Net profit per your accounts ${chf(b.netProfit)}${b.ownContributionsBooked && (biz.avs || pos(b.ownPension)) ? " (own AVS and pension contributions added back, then re-deducted below)" : ""}`,
      biz.carPrivateShare ? `+ private use of the car ${chf(biz.carPrivateShare)} (0.9% of ${chf(b.carPurchasePrice)} per month, min CHF 150)` : "",
      biz.householdPrivateShare ? `+ private share of household costs ${chf(biz.householdPrivateShare)} (flat rate)` : "",
      pos(b.otherPrivateShare) ? `+ other private shares ${chf(pos(b.otherPrivateShare))}` : "",
      biz.pensionBusiness ? `− half of own 2nd-pillar contributions ${chf(biz.pensionBusiness)}` : "",
      biz.dailyAllowanceBusiness ? `− half of own daily-allowance insurance ${chf(biz.dailyAllowanceBusiness)}` : "",
      `− own AVS/AI/APG ${chf(biz.avs)}${biz.avsIsEstimate ? " (estimate)" : ""}`,
    ].filter(Boolean);
    add("180", {
      title: `Self-employed activity${b.name || b.activity ? ` – ${b.name || b.activity}` : ""}`,
      icc: selfEmployed,
      kind: "income",
      explanation: `${parts.join(" ")} = ${chf(selfEmployed)}. Enter the turnover ${chf(biz.revenue)} in the side column. Attach the ${b.mode === "accounts" ? "signed balance sheet and income statement with Questionnaire 21021-a" : "statement of receipts, expenses, assets and private withdrawals with Questionnaire 21021-b"}; private car use goes under letter E no. 5, own AVS under letter C, own pension under letter D.`,
      source: `${SRC_SELF}, pp. 9–26`,
      warnings: w,
    });
    if (pos(b.lossCarryForward))
      add("186", {
        title: "Business losses carried forward",
        icc: pos(b.lossCarryForward),
        kind: "deduction",
        explanation: "Losses of the 7 previous business years not yet offset against other income; oldest first. Don't deduct them inside the 2025 result.",
        source: `${SRC_SELF}, p. 26`,
      });
  }

  for (const [code, amount, title] of [
    ["200", p.unemploymentAndApg, "Unemployment / military service (APG) allowances"],
    ["210", p.dailyAllowances, "Daily allowances (health/accident/disability insurance)"],
    ["240", p.pensionAvsAi, "AVS / AI pension"],
    ["250", p.pensionLpp, "Occupational pension (2nd pillar)"],
    ["260", p.pension3a, "Pillar 3a pension"],
    ["270", p.pensionOther, "Other pensions (3rd pillar B, LAA/SUVA, life annuities)"],
  ] as const)
    if (pos(amount))
      add(code, {
        title,
        icc: pos(amount),
        kind: "income",
        explanation: "Amount from the official certificate, unless already included on a salary certificate.",
        source: src("IG", code < "240" ? 26 : "27–28"),
      });

  const proCosts = commuteIcc + meals + otherPro + secondaryPro;
  const earned = main + secondary + (biz ? biz.netAfterAvs : 0);

  // Code 310 – pillar 3a
  const pillar3aCap = p.hasPensionFund
    ? R.pillar3a.withPensionFund
    : Math.min(R.pillar3a.withoutPensionFundMax, Math.max(0, (earned - proCosts) * R.pillar3a.withoutPensionFundRate));
  const pillar3a = Math.min(pos(p.pillar3a), pillar3aCap);
  if (pos(p.pillar3a))
    add("310", {
      title: "Pillar 3a contributions",
      icc: Math.round(pillar3a),
      kind: "deduction",
      explanation: p.hasPensionFund
        ? `Affiliated to a pension fund: maximum ${chf(R.pillar3a.withPensionFund)} for 2025.`
        : `No pension fund: 20% of net earned income, maximum ${chf(R.pillar3a.withoutPensionFundMax)}. Your cap: ${chf(Math.round(pillar3aCap))}.`,
      source: src("IG", 31),
      warnings:
        pos(p.pillar3a) > pillar3aCap
          ? [`You paid ${chf(pos(p.pillar3a))}, which is above the cap. Only ${chf(Math.round(pillar3aCap))} is deductible; ask your bank to refund the excess.`]
          : ["Attach the official 3a certificate (attestation)."],
    });

  const lppBuyback = pos(p.lppBuyback);
  if (lppBuyback)
    add("320", {
      title: "Pension fund buy-back (2nd pillar)",
      icc: lppBuyback,
      kind: "deduction",
      explanation: "Only buy-backs not already deducted on the salary certificate (box 10.2).",
      source: src("IG", 31),
      warnings: [
        lppBuyback > 10000 ? "Over CHF 10,000: the pension fund's certificate is mandatory." : "Keep the pension fund's certificate.",
        "Capital withdrawn within 3 years of a buy-back can cancel the deduction.",
      ],
    });

  const selfPension = biz ? biz.pensionPrivate : 0;
  if (selfPension)
    add("330", {
      title: "Own pension contributions (self-employed)",
      icc: selfPension,
      kind: "deduction",
      explanation: "The other half of your own 2nd-pillar contributions (the first half is a business expense). Attach the pension fund's certificate (form 21 EDP).",
      source: `${SRC_SELF}, p. 21`,
    });

  const lossOfEarnings = pos(p.lossOfEarningsPremiums);
  if (lossOfEarnings)
    add("340", {
      title: "Loss-of-earnings insurance premiums",
      icc: lossOfEarnings,
      kind: "deduction",
      explanation: "Contractual premiums withheld from salary for daily-allowance insurance. Federal tax includes these in the overall insurance cap.",
      source: src("IG", 31),
    });

  const training = pos(p.trainingCosts);
  const trainingIcc = Math.min(training, R.training.icc);
  const trainingIfd = Math.min(training, R.training.ifd);
  if (training)
    add("618", {
      title: "Continuing education / retraining",
      icc: trainingIcc,
      ifd: trainingIfd !== trainingIcc ? trainingIfd : undefined,
      kind: "deduction",
      explanation: `Costs you paid yourself (not the employer), excluding a first secondary-level diploma. Max CHF 12,000 cantonal / CHF 13,000 federal.`,
      source: src("IG", "42, 63"),
    });

  const netEarned = earned - proCosts - pillar3a - lppBuyback - selfPension - lossOfEarnings;
  const privateInsurance = biz ? biz.dailyAllowancePrivate : 0;
  const lossCarryForward = b ? pos(b.lossCarryForward) : 0;
  return {
    label,
    main,
    secondary,
    allowances,
    commuteIcc,
    commuteIfd,
    meals,
    otherPro,
    secondaryPro,
    selfEmployed,
    privateInsurance,
    lossCarryForward,
    pillar3a,
    pillar3aCap,
    lppBuyback,
    selfPension,
    lossOfEarnings,
    trainingIcc,
    trainingIfd,
    netEarned,
    hasEarnedIncome: earned > 0 || !!b,
  };
}

// ---------------------------------------------------------------------------
// Whole return

export function computeVD(d: TaxData): CalcResult {
  const lines: GuideLine[] = [];
  const notes: string[] = [];
  const married = d.civilStatus === "married";
  const household = { adults: activePersons(d).length, children: childrenWithPart(d).length };
  const persons = activePersons(d).map((p, i) => computePerson(p, i, lines, household));
  const kids = childrenWithPart(d);
  const kind = familyKind(d);
  const add = (code: string, l: Omit<GuideLine, "code" | "officialLabel" | "path">) => lines.push({ code, ...loc(code), ...l });

  const sumP = (f: (p: PersonCalc) => number) => persons.reduce((s, p) => s + f(p), 0);

  // --- Household income
  const otherIncome = pos(d.otherIncome);
  if (otherIncome)
    add("195", { title: "Other income", icc: otherIncome, kind: "income", explanation: "Sub-letting (furnished: 80% of rent received), royalties, family allowances for non-employees, etc.", source: src("IG", 25) });
  const alimonyIn = pos(d.alimonyReceived);
  if (alimonyIn)
    add("280", { title: "Alimony received", icc: alimonyIn, kind: "income", explanation: "For yourself and for minor children in your custody. Also fill in table 1.A.", source: src("IG", 28) });

  // --- Dual-income deduction (code 235)
  let dualIcc = 0;
  let dualIfd = 0;
  if (married && persons.length === 2 && persons.every((p) => p.hasEarnedIncome)) {
    const lower = Math.max(0, Math.min(persons[0].netEarned, persons[1].netEarned));
    dualIcc = Math.round(Math.min(R.dualIncomeIcc, lower));
    dualIfd = Math.round(Math.min(lower, clamp(lower * R.dualIncomeIfd.rate, R.dualIncomeIfd.min, R.dualIncomeIfd.max)));
    add("235", {
      title: "Dual-income deduction (both spouses work)",
      icc: dualIcc,
      ifd: dualIfd,
      kind: "deduction",
      explanation: `Cantonal: CHF 1,700 from the lower net income (${chf(Math.round(lower))}). Federal: 50% of the lower net income, between CHF 8,600 and CHF 14,100. VaudTax applies it automatically once both incomes are entered.`,
      source: src("IG", "26, 62"),
    });
  }

  // --- Securities & accounts (code 410)
  const accountInterest = d.bankAccounts.reduce((s, a) => s + pos(a.interest), 0);
  const accountBalance = d.bankAccounts.reduce((s, a) => s + pos(a.balance), 0);
  const secIncome = d.securities.reduce((s, x) => s + pos(x.incomeWithWithholding) + pos(x.incomeWithoutWithholding), 0);
  const secValue = d.securities.reduce((s, x) => s + pos(x.taxValue), 0);
  const withholdingBase =
    d.bankAccounts.filter((a) => a.withholdingTax).reduce((s, a) => s + pos(a.interest), 0) + d.securities.reduce((s, x) => s + pos(x.incomeWithWithholding), 0);
  if (d.bankAccounts.length)
    add("410-accounts", {
      title: "Bank and postal accounts",
      icc: Math.round(accountInterest),
      kind: "income",
      explanation: `Enter each account (bank preceded by country code, e.g. "CH UBS", last 8 characters of the account number) with its balance on 31.12.2025 and gross interest. Total balance ${chf(accountBalance)}; total interest ${chf(accountInterest, 2)}.`,
      source: src("IG", "32–34"),
    });
  if (d.securities.length)
    add("410-securities", {
      title: "Securities (shares, funds, bonds, bank tax statement)",
      icc: Math.round(secIncome),
      kind: "income",
      explanation: `If your bank provides a tax statement (relevé fiscal), only copy its totals. Income subject to Swiss withholding tax goes in column A, other income in column B. Total tax value ${chf(secValue)}; income ${chf(secIncome, 2)}.`,
      source: src("IG", "32–36"),
    });
  if (withholdingBase > 0)
    notes.push(
      `Withholding tax refund: 35% of ${chf(withholdingBase, 2)} = ${chf(round05(withholdingBase * 0.35), 2)} is credited against your tax bill if declared in the état des titres (IG p. 37).`,
    );

  // --- Savings interest deduction (code 480, ICC only)
  const savingsCap = (married ? R.savingsInterest.married : R.savingsInterest.single) + kids.length * R.savingsInterest.perChild;
  const savingsDeduction = Math.round(Math.min(accountInterest, savingsCap));
  if (savingsDeduction > 0)
    add("480", {
      title: "Savings interest deduction (cantonal only)",
      icc: savingsDeduction,
      kind: "deduction",
      explanation: `Interest on savings/current accounts and bonds, up to ${chf(savingsCap)} for your situation. Not for shares or funds. Federal tax includes it in the insurance cap.`,
      source: src("IG", 40),
    });

  // --- Securities admin fees (code 490)
  const managedValue = d.securities.filter((s) => s.managedByThirdParty).reduce((s, x) => s + pos(x.taxValue), 0);
  const adminFlat = Math.round(managedValue * R.securitiesAdminFlatRate);
  const adminFees = pos(d.securitiesAdminFeesActual) > 0 ? Math.round(pos(d.securitiesAdminFeesActual)) : adminFlat;
  if (adminFees > 0)
    add("490", {
      title: "Securities custody / administration fees",
      icc: adminFees,
      kind: "deduction",
      explanation:
        pos(d.securitiesAdminFeesActual) > 0
          ? `Actual custody fees (not trading commissions or advisory fees). Flat rate would be ${chf(adminFlat)}.`
          : `Flat rate 1.5‰ of securities managed by a bank/broker (${chf(managedValue)}), accepted without receipts.`,
      source: src("IG", 40),
    });

  // --- Property (codes 500, 540)
  let rentalIcc = 0;
  let rentalIfd = 0;
  let maintIcc = 0;
  let maintIfd = 0;
  let ownMainResidenceRentalValue = 0;
  let propertyWealth = 0;
  for (const p of d.properties) {
    const rv = rentalValue(p);
    const rent = pos(p.rentalIncome);
    rentalIcc += rv.icc + rent;
    rentalIfd += rv.ifd + rent;
    if (p.mainResidence) ownMainResidenceRentalValue += rv.icc;
    propertyWealth += pos(p.taxEstimate) * clamp(p.ownershipShare || 1, 0, 1);
    const w: string[] = [];
    if (!rv.communeKnown) w.push(`Commune "${p.commune}" not found in the Vaud list; coefficient 1.00 used (correct for properties elsewhere in Switzerland).`);
    add("500", {
      title: `Property: ${p.description || p.commune}`,
      icc: rv.icc + rent,
      ifd: rv.ifd + rent,
      kind: "income",
      explanation:
        p.rentalValueOverride > 0
          ? `Rental value taken from your override (${chf(p.rentalValueOverride)} before share/months)${rent ? ` plus rents ${chf(rent)}` : ""}.`
          : `Annexe 07 formula: base for ${p.surfaceM2} m² ${chf(rv.base)} × age ${rv.ageCoef} × commune ${rv.communeCoef} × type ${rv.typeCoef} × 130% = ${chf(rv.indexed)}; cantonal 65%, federal 90%; × share ${p.ownershipShare} × ${p.monthsOwnUse}/12 months.${rent ? ` Plus rents received ${chf(rent)}.` : ""} Enter surface, year, commune and type in VaudTax's form; it computes the value.`,
      source: src("IC", "10–20"),
      warnings: w,
    });
    const flat = maintenanceFlat(p, rv);
    const actual = pos(p.maintenanceActual);
    const mi = actual > 0 ? Math.round(actual) : flat.icc;
    const mf = actual > 0 ? Math.round(actual) : flat.ifd;
    maintIcc += mi;
    maintIfd += mf;
    add("540", {
      title: `Maintenance costs: ${p.description || p.commune}`,
      icc: mi,
      ifd: mf !== mi ? mf : undefined,
      kind: "deduction",
      explanation:
        actual > 0
          ? `Actual costs (repairs, building insurance, management, PPE renovation-fund withdrawals). The flat rate would be ${chf(flat.icc)} cantonal / ${chf(flat.ifd)} federal — compare before choosing.`
          : `Flat rate: ${flat.iccRate * 100}% of the cantonal rental value (building ${flat.age} years old; 20% if ≤ 20 years, else 30%). Federal: ${flat.ifdRate * 100}% (10% if ≤ 10 years).`,
      source: src("IC", "7–9, 23"),
      warnings: actual > 0 && actual < flat.icc ? ["Your actual costs are below the flat rate — the flat rate is more favourable this year."] : undefined,
    });
  }

  // --- Debts (codes 610 / 615)
  const debtInterest = d.debts.reduce((s, x) => s + pos(x.interest), 0);
  const debtTotal = d.debts.reduce((s, x) => s + pos(x.balance), 0);
  const grossWealthIncomeIcc = accountInterest + secIncome + rentalIcc;
  const interestCap = grossWealthIncomeIcc + R.debtInterestAllowanceAboveWealthIncome;
  const interestDeduction = Math.round(Math.min(debtInterest, interestCap));
  // Federal cap uses the federal (90%) rental value, so it can be higher.
  const interestDeductionIfd = Math.round(
    Math.min(debtInterest, accountInterest + secIncome + rentalIfd + R.debtInterestAllowanceAboveWealthIncome),
  );
  if (d.debts.length) {
    add("610", {
      title: "Private debt interest (mortgage, loans)",
      icc: interestDeduction,
      ifd: interestDeductionIfd !== interestDeduction ? interestDeductionIfd : undefined,
      kind: "deduction",
      explanation: "List each creditor (name and address). Deductible up to gross investment income + CHF 50,000. Repayments (amortisation) are not deductible.",
      source: src("IG", 41),
      warnings: debtInterest > interestCap ? [`Interest ${chf(debtInterest)} exceeds the cap of ${chf(Math.round(interestCap))}.`] : undefined,
    });
    add("615", { title: "Private debts on 31.12.2025", icc: Math.round(debtTotal), kind: "debt", explanation: "Deducted from your wealth.", source: src("IG", 41) });
  }

  // --- Other wealth
  for (const [code, value, title, expl] of [
    ["420", d.cryptoAndCash, "Cash, gold, crypto-currencies", "Market value on 31.12.2025 (ESTV price list for crypto/precious metals)."],
    ["430", d.vehiclesAndValuables, "Vehicles, collections, jewellery", "Market value on 31.12.2025."],
    ["435", d.lifeInsuranceSurrenderValue, "Life insurance surrender value", "Surrender value on 31.12.2025 from your insurer. Not for 2nd pillar or pillar 3a."],
  ] as const)
    if (pos(value)) add(code, { title, icc: Math.round(pos(value)), kind: "wealth", explanation: expl, source: src("IG", 38) });

  // --- Insurance premiums (code 300)
  const ownDailyAllowance = sumP((p) => p.privateInsurance);
  const premiumsNet = Math.max(0, pos(d.healthPremiums) + ownDailyAllowance - pos(d.premiumSubsidies));
  const insuranceCapIcc =
    (married ? R.insurance.icc.married : R.insurance.icc.single) + kids.length * R.insurance.icc.perChild + pos(d.dependents) * R.insurance.icc.perDependent;
  const insuranceIcc = Math.round(Math.min(premiumsNet, insuranceCapIcc));
  const noPensionContributions = persons.every((p) => p.pillar3a === 0 && p.lppBuyback === 0) && d.persons.every((p) => !p.hasPensionFund);
  const insuranceCapIfd =
    (married ? R.insurance.ifd.married : R.insurance.ifd.single) * (noPensionContributions ? R.insurance.ifd.noPensionContributionsFactor : 1) +
    (kids.length + pos(d.dependents)) * R.insurance.ifd.perChild;
  const lossOfEarningsTotal = sumP((p) => p.lossOfEarnings);
  const insuranceIfd = Math.round(Math.min(premiumsNet + lossOfEarningsTotal + accountInterest, insuranceCapIfd));
  if (premiumsNet > 0 || d.premiumSubsidies > 0)
    add("300", {
      title: "Health, accident and life insurance premiums",
      icc: insuranceIcc,
      ifd: insuranceIfd,
      kind: "deduction",
      explanation: `Enter the premiums (${chf(pos(d.healthPremiums))}) and the subsidies received (${chf(pos(d.premiumSubsidies))}) — both are mandatory. Cantonal cap for your family: ${chf(insuranceCapIcc)}. Federal: one combined cap of ${chf(Math.round(insuranceCapIfd))} for premiums, loss-of-earnings premiums and savings interest.`,
      source: src("IG", "29–30, 62–63"),
    });

  // --- Other deductions
  const political = pos(d.politicalDonations);
  if (political)
    add("620", {
      title: "Donations to political parties",
      icc: Math.min(political, R.politicalParties.icc),
      ifd: Math.min(political, R.politicalParties.ifd),
      kind: "deduction",
      explanation: "Registered parties, or represented in a cantonal parliament, or ≥ 3% in the last cantonal election. Max CHF 10,100 cantonal / CHF 10,600 federal.",
      source: src("IG", "43, 63"),
    });
  const alimonyOut = pos(d.alimonyPaid);
  if (alimonyOut)
    add("630", { title: "Alimony paid", icc: alimonyOut, kind: "deduction", explanation: "To a separated/divorced spouse and for minor children. Fill in table 1.B.", source: src("IG", 43) });
  const avs = pos(d.avsNonEarner);
  if (avs) add("640", { title: "AVS contributions as a non-earner", icc: avs, kind: "deduction", explanation: "AVS/AI/APG/AC contributions paid without gainful activity.", source: src("IG", 44) });

  // Childcare (code 670) — part of the net income (code 650)
  const childcareEligible =
    d.childcareTrainingOrIncapacity ||
    (married && persons.length === 2 && persons.every((p) => p.hasEarnedIncome)) ||
    (!married && persons.some((p) => p.hasEarnedIncome));
  let childcareIcc = 0;
  let childcareIfd = 0;
  for (const c of d.children) {
    const cost = pos(c.childcareCosts);
    if (!cost) continue;
    const under14 = c.birthYear > TAX_YEAR - R.childcare.maxAge;
    const w: string[] = [];
    if (!under14) w.push("Only for children under 14, so nothing is deducted.");
    if (!childcareEligible)
      w.push(
        "Not deducted: both spouses must work (or the single parent must work). If a parent is in training or unable to work, tick that option under “Other deductions”.",
      );
    const allowed = under14 && childcareEligible;
    const ci = allowed ? Math.min(cost, R.childcare.icc) : 0;
    const cf = allowed ? Math.min(cost, R.childcare.ifd) : 0;
    childcareIcc += ci;
    childcareIfd += cf;
    add("670", {
      title: `Childcare costs – ${c.firstName || "child"}`,
      icc: ci,
      ifd: cf !== ci ? cf : undefined,
      kind: allowed ? "deduction" : "info",
      explanation: "Third-party care (crèche, day-care, maman de jour) during working hours, excluding food. Max CHF 15,200 cantonal / CHF 25,800 federal per child. Receipts are mandatory.",
      source: src("IG", "44, 63"),
      warnings: w,
    });
  }

  // =========================================================================
  // ICC chain: 650 → 690 → 700 → 800
  const incomeIcc =
    sumP((p) => p.main + p.secondary + p.allowances + p.selfEmployed) +
    d.persons.slice(0, persons.length).reduce((s, p) => s + pos(p.unemploymentAndApg) + pos(p.dailyAllowances) + pos(p.pensionAvsAi) + pos(p.pensionLpp) + pos(p.pension3a) + pos(p.pensionOther), 0) +
    otherIncome +
    alimonyIn +
    accountInterest +
    secIncome +
    rentalIcc;
  const deductionsIcc =
    sumP((p) => p.commuteIcc + p.meals + p.otherPro + p.secondaryPro + p.pillar3a + p.lppBuyback + p.selfPension + p.lossOfEarnings + p.trainingIcc + p.lossCarryForward) +
    dualIcc +
    insuranceIcc +
    savingsDeduction +
    adminFees +
    maintIcc +
    interestDeduction +
    Math.min(political, R.politicalParties.icc) +
    alimonyOut +
    avs +
    childcareIcc;
  const net650 = Math.round(incomeIcc - deductionsIcc);

  // 660 housing
  const housingRent = pos(d.rentPaidNet) + ownMainResidenceRentalValue;
  const coupleOrSingleParent = kind === "married" || kind === "singleParent";
  const maxRent = (coupleOrSingleParent ? R.housing.maxRentCoupleOrSingleParent : R.housing.maxRentSingle) + kids.length * R.housing.perChild;
  const housing = housingDeduction(housingRent, net650, coupleOrSingleParent, kids.length);
  if (housingRent > 0)
    add("660", {
      title: "Housing deduction (main residence)",
      icc: housing,
      kind: housing > 0 ? "deduction" : "info",
      explanation: `Rent without charges (or own rental value) ${chf(Math.round(housingRent))}, capped at ${chf(maxRent)}, minus 20% of net income (code 650 ≈ ${chf(net650)}); max CHF 6,800. Enter your annual net rent in VaudTax — it computes the deduction.`,
      source: src("IG", 44),
    });

  // 680 dependents
  const dependents = pos(d.dependents) * R.dependentIcc;
  if (dependents)
    add("680", {
      title: "Other dependent persons",
      icc: dependents,
      kind: "deduction",
      explanation: "CHF 3,400 per person unable to support themselves whom you support with at least CHF 3,400/year (not spouse, children or partner).",
      source: src("IG", 45),
    });
  const income690 = net650 - housing - dependents;

  // 695 modest taxpayer
  const householdSize = (married ? 2 : 1) + kids.length;
  const { deduction: modest, limit: modestLimit } = modestDeduction(kind, householdSize, income690);
  if (modest > 0)
    add("695", {
      title: "Modest-income deduction",
      icc: modest,
      kind: "deduction",
      explanation: `Household of ${householdSize}: income (code 690 ≈ ${chf(income690)}) below the limit of ${chf(modestLimit)}. Computed automatically by VaudTax.`,
      source: src("IG", "45–47"),
    });
  const income700 = income690 - modest;

  // 710 medical
  const medicalIcc = Math.round(Math.max(0, pos(d.medicalCosts) - R.medicalFranchise * income700) + pos(d.disabilityCosts));
  if (pos(d.medicalCosts) || pos(d.disabilityCosts))
    add("710", {
      title: "Medical, dental and disability costs",
      icc: medicalIcc,
      kind: medicalIcc > 0 ? "deduction" : "info",
      explanation: `Only the part of medical/dental costs you paid yourself above 5% of code 700 (≈ ${chf(Math.round(R.medicalFranchise * income700))}) is deductible. Disability costs are fully deductible. Enter the full amounts in VaudTax; it applies the 5% threshold.`,
      source: src("IG", 48),
      warnings: medicalIcc === 0 && pos(d.medicalCosts) ? ["Your medical costs are below the 5% threshold, so nothing is deducted."] : undefined,
    });

  // 720 donations
  const donations = pos(d.donations);
  const donationsIcc = donations >= R.donations.minTotal ? Math.round(Math.min(donations, R.donations.maxShare * income700)) : 0;
  if (donations)
    add("720", {
      title: "Donations to public-benefit organisations",
      icc: donationsIcc,
      kind: donationsIcc > 0 ? "deduction" : "info",
      explanation: "Swiss tax-exempt public-benefit organisations (not churches). Minimum CHF 100 in total, maximum 20% of code 700. Keep the receipts.",
      source: src("IG", 49),
    });

  // 725 family deduction
  const { base: familyBase, deduction: family } = familyDeduction(kind, kids.length, net650);
  if (familyBase > 0)
    add("725", {
      title: "Family deduction",
      icc: family,
      kind: family > 0 ? "deduction" : "info",
      explanation: `${chf(familyBase)} for your family situation, reduced by CHF 100 per CHF 2,100 of net income above CHF 126,300 (then per CHF 1,000 above CHF 164,100). Computed automatically by VaudTax.`,
      source: src("IG", "49–51"),
    });

  const taxable800 = floor100(income700 - medicalIcc - donationsIcc - family);
  const parts = familyParts(d);
  const { income820, capped } = rateDeterminingIncome(d, taxable800);
  if (capped) notes.push("Your income is above the family-quotient cap, so the rate-determining income (code 820) is limited (IG p. 52–54).");

  // ICC tax
  const {
    ratePercent,
    baseIncome,
    reduction,
    cantonal: cantonalIncomeTax,
    communal: communalIncomeTax,
  } = iccIncomeTax(taxable800, income820, d.communalRate);

  // ICC wealth
  const businessEquity = activePersons(d).reduce((s, p) => s + (p.business ? pos(p.business.equityCapital) : 0), 0);
  if (businessEquity)
    add("465", {
      title: "Business assets (net)",
      icc: Math.round(businessEquity),
      kind: "wealth",
      explanation:
        "Equity of your business on 31.12.2025. Declare the business assets (stock at cost with the allowed 1/3 reduction, receivables, equipment at book value) under code 465 and business debts in Annexe 02; business bank accounts go in the état des titres with the 'Exploitation' box ticked.",
      source: `${SRC_SELF}, pp. 27–29`,
    });
  const grossWealth =
    businessEquity +
    accountBalance + secValue + pos(d.cryptoAndCash) + pos(d.vehiclesAndValuables) + pos(d.lifeInsuranceSurrenderValue) + propertyWealth;
  const netWealth = grossWealth - debtTotal;
  const exemption = married ? R.wealthExemption.married : R.wealthExemption.single;
  const taxableWealth = netWealth >= exemption ? floor1000(netWealth) : 0;
  const baseTaxWealth = iccWealthBaseTax(taxableWealth);
  const cantonalWealthTax = round05(baseTaxWealth * R.cantonalCoefficient);
  const communalWealthTax = round05((baseTaxWealth * d.communalRate) / 100);
  if (netWealth > 0 && taxableWealth === 0) notes.push(`Net wealth ${chf(Math.round(netWealth))} is below the ${chf(exemption)} threshold: no wealth tax.`);

  add("810", {
    title: "Family quotient (parts)",
    icc: parts,
    kind: "info",
    explanation: `${kind === "married" ? "1.8 (married)" : kind === "singleParent" ? "1.3 (single parent, own household)" : "1.0"} + 0.5 × ${kids.length} child(ren). VaudTax derives this from the "Enfants et personnes à charge" section — check every child is listed.`,
    source: src("IG", 51),
  });

  // =========================================================================
  // IFD
  const ifd = federalTax({
    married,
    parentalScale: kind === "married" || kind === "singleParent",
    kids: kids.length,
    dependents: pos(d.dependents),
    income: incomeIcc - rentalIcc + rentalIfd,
    deductions:
      sumP((p) => p.commuteIfd + p.meals + p.otherPro + p.secondaryPro + p.pillar3a + p.lppBuyback + p.selfPension + p.trainingIfd + p.lossCarryForward) +
      dualIfd +
      insuranceIfd +
      adminFees +
      maintIfd +
      interestDeductionIfd +
      Math.min(political, R.politicalParties.ifd) +
      alimonyOut +
      avs +
      childcareIfd,
    medical: d.medicalCosts,
    disability: d.disabilityCosts,
    donations,
  });

  const cantonTotal = round05(cantonalIncomeTax + communalIncomeTax + cantonalWealthTax + communalWealthTax);
  const commune = d.commune || "commune";
  return {
    lines,
    notes,
    details: { "650": net650, "690": income690, "700": income700, "800": taxable800, "810": parts, "820": income820 },
    estimate: {
      cantonTotal,
      taxableIncome: taxable800,
      taxableWealth,
      cantonSections: [
        {
          title: "Cantonal and communal income tax (ICC)",
          rows: [
            { label: "Net income", sub: "code 650", value: net650 },
            { label: "After housing & dependents deductions", sub: "code 690", value: income690 },
            { label: "After modest-income deduction", sub: "code 700", value: income700 },
            { label: "Taxable income", sub: "code 800, rounded down to CHF 100", value: taxable800, strong: true },
            { label: "Family parts", sub: "code 810", value: parts, format: "number" },
            { label: "Rate-determining income", sub: "code 820", value: income820 },
            { label: "Tax rate", value: ratePercent, format: "percent" },
            { label: "Cantonal base tax (100%)", value: baseIncome, format: "chf2" },
            { label: "− 4% cantonal reduction 2025", value: reduction, format: "chf2" },
            { label: `Cantonal income tax (${R.cantonalCoefficient * 100}%)`, value: cantonalIncomeTax, format: "chf2", strong: true },
            { label: `Communal income tax – ${commune} (${d.communalRate}%)`, value: communalIncomeTax, format: "chf2", strong: true },
          ],
        },
        {
          title: "Wealth tax (ICC)",
          rows: [
            { label: "Taxable wealth", sub: "rounded down to CHF 1,000; nil below CHF 60,000 (couples 120,000)", value: taxableWealth },
            { label: "Base tax", value: baseTaxWealth, format: "chf2" },
            { label: "Cantonal wealth tax (155%)", value: cantonalWealthTax, format: "chf2", strong: true },
            { label: `Communal wealth tax (${d.communalRate}%)`, value: communalWealthTax, format: "chf2", strong: true },
          ],
        },
      ],
      ifd,
      total: round05(cantonTotal + ifd.total),
    },
  };
}
