// Zurich (Staats- und Gemeindesteuer) rules for 2025. Deterministic: every
// amount comes from the user's data and the official figures in rulesZh2025.ts.
import type { CalcResult } from "./calc";
import zhCommunes from "./data/communes-zh.json";
import { computeBusiness, type HouseholdSize } from "./business";
import { federalTax } from "./federal";
import {
  activePersons,
  carCost,
  childrenWithPart,
  familyKind,
  otherProfessionalFlat,
  pillar3aCap,
  secondaryJobFlat,
  TAX_YEAR,
} from "./household";
import { chf, clamp, floor100, floor1000, pos, round05 } from "./money";
import { R } from "./rules2025";
import { bracketTax, ZH, ZH_INCOME_BASIC, ZH_INCOME_MARRIED, ZH_WEALTH_BASIC, ZH_WEALTH_MARRIED, zsrc } from "./rulesZh2025";
import type { Confession, GuideLine, Person, TaxData } from "./types";
import { zloc } from "./zhLocations";

export interface ZhCommune {
  name: string;
  bfs: number;
  rate: number;
  church: Record<Exclude<Confession, "none">, number | null>;
}
export const ZH_COMMUNES = zhCommunes as ZhCommune[];
export const findZhCommune = (name: string) => ZH_COMMUNES.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());

/** Einfache Staatssteuer on income (§ 35 StG). Married tariff also for single parents living with their children. */
export const zhIncomeSimpleTax = (taxable: number, marriedTariff: boolean) =>
  round05(bracketTax(marriedTariff ? ZH_INCOME_MARRIED : ZH_INCOME_BASIC, floor100(taxable), 100));

/** Einfache Staatssteuer on wealth (§ 47 StG), rates in ‰. */
export const zhWealthSimpleTax = (taxable: number, marriedTariff: boolean) =>
  round05(bracketTax(marriedTariff ? ZH_WEALTH_MARRIED : ZH_WEALTH_BASIC, floor1000(taxable), 1000));

/** Applies the multipliers to the simple tax. `churchRates` holds each adult's church rate in %, split equally. */
export function zhTaxes(simpleTax: number, communalRate: number, churchRates: number[]) {
  const churchShare = churchRates.length ? churchRates.reduce((s, r) => s + r, 0) / churchRates.length : 0;
  return {
    state: round05(simpleTax * ZH.stateMultiplier),
    communal: round05((simpleTax * communalRate) / 100),
    church: round05((simpleTax * churchShare) / 100),
  };
}

const CONFESSION_LABEL: Record<Confession, string> = {
  none: "none",
  reformed: "Reformed (evangelisch-reformiert)",
  catholic: "Roman Catholic (römisch-katholisch)",
  christCatholic: "Christ Catholic (christkatholisch)",
};

// ---------------------------------------------------------------------------

interface ZhPerson {
  label: string;
  main: number;
  secondary: number;
  allowances: number;
  selfEmployed: number;
  commuteState: number;
  commuteFed: number;
  meals: number;
  otherPro: number;
  secondaryPro: number;
  pillar3a: number;
  lppBuyback: number;
  selfPension: number;
  /** Own AHV/IV/EO contributions of the self-employed person (→ Ziffer 16.1). */
  selfAvs: number;
  lossCarryForward: number;
  lossOfEarnings: number;
  training: number;
  pensions: number;
  netEarned: number;
  hasEarnedIncome: boolean;
}

type AddFn = (key: string, code: string, l: Omit<GuideLine, "code" | "officialLabel" | "path">) => void;

const SRC_SELF = "Merkblatt zum Hilfsblatt A 2025 (Steueramt Zürich)";

function computePerson(p: Person, index: number, add: AddFn, household: HouseholdSize): ZhPerson {
  const label = p.firstName || `Person ${index + 1}`;
  const n = index + 1; // Ziffer suffix: x.1 = Person 1, x.2 = Person 2 in the Berufsauslagen columns
  const mainJobs = p.employments.filter((e) => !e.secondary);
  const sideJobs = p.employments.filter((e) => e.secondary);
  const main = mainJobs.reduce((s, e) => s + pos(e.netSalary), 0);
  const secondary = sideJobs.reduce((s, e) => s + pos(e.netSalary), 0);
  const salaried = main + secondary > 0;
  const days = clamp(Number.isFinite(p.commuteDays) ? p.commuteDays : 240, 0, 366);
  const workDays = Math.min(days, ZH.commute.maxDays);
  const line = (key: string, code: string, l: Omit<GuideLine, "code" | "officialLabel" | "path" | "person">) => add(key, code, { person: label, ...l });

  for (const e of mainJobs)
    line("1.1", "1.1", {
      title: `Main salary – ${e.employer || "employer"}`,
      icc: pos(e.netSalary),
      kind: "income",
      explanation: "Net salary from box 11 of the Lohnausweis (after AHV/IV/EO/ALV, NBU and pension contributions).",
      source: zsrc("FORM", "Ziffer 1.1"),
    });
  for (const e of sideJobs)
    line("1.2", "1.2", {
      title: `Secondary job – ${e.employer || "employer"}`,
      icc: pos(e.netSalary),
      kind: "income",
      explanation: "Box 11 of the Lohnausweis for each secondary job.",
      source: zsrc("FORM", "Ziffer 1.2"),
    });
  const allowances = pos(p.allowancesNotFromEmployer) + pos(p.dailyAllowances);
  if (allowances)
    line("3.4", "3.4", {
      title: "Family allowances, daily allowances, maternity pay (paid directly, not via the employer)",
      icc: allowances,
      kind: "income",
      explanation: "Only amounts paid directly by a compensation fund or insurer — not those already on the Lohnausweis.",
      source: zsrc("FORM", "Ziffer 3.4"),
    });

  // Berufsauslagen 1: Fahrkosten
  let commuteState = 0;
  let commuteExpl = "";
  const warnings: string[] = [];
  const companyCar = p.employments.some((e) => e.freeTransport);
  if (salaried && p.commuteMode !== "none" && !companyCar) {
    const km = pos(p.commuteKm);
    if (p.commuteMode === "public") {
      commuteState = Math.round(pos(p.publicTransportActualCost));
      commuteExpl = `Your actual subscription costs (Abonnement) ${chf(commuteState)}.`;
      if (!commuteState) warnings.push("In Zurich you deduct the actual cost of your public-transport subscription — enter it under “Your numbers”.");
    } else if (p.commuteMode === "bike") {
      commuteState = Math.round((ZH.commute.bikePerYear * workDays) / 240);
      commuteExpl = `Bicycle / small motorbike flat rate CHF 700 per year${workDays < 240 ? ` × ${workDays}/240 days` : ""}.`;
    } else {
      const yearlyKm = km * 2 * workDays;
      commuteState = Math.round(p.commuteMode === "car" ? carCost(yearlyKm, false) : yearlyKm * ZH.commute.motorbikePerKm);
      commuteExpl = `${km} km × 2 × ${workDays} days = ${yearlyKm.toLocaleString("de-CH")} km × ${p.commuteMode === "car" ? "70" : "40"} ct (max. 240 days).`;
      if (!p.vehicleJustification.trim())
        warnings.push(
          "A private vehicle is only accepted with a reason ticked on the form: no public transport, more than 1 hour saved per day, the employer requires it, or illness/disability (doctor's note). Add your reason.",
        );
    }
    if (commuteState > ZH.commute.cap) {
      commuteExpl += ` Capped at CHF ${ZH.commute.cap.toLocaleString("de-CH")} for the state tax.`;
      commuteState = ZH.commute.cap;
    }
  }
  if (salaried && companyCar) warnings.push("You have a company car / free transport (box F): no commuting deduction.");
  const commuteFed = Math.min(commuteState, ZH.commute.ifdCap);
  if (commuteState || warnings.length)
    line("11-commute", `11.${n}`, {
      title: "Commuting costs",
      icc: commuteState,
      ifd: commuteFed !== commuteState ? commuteFed : undefined,
      kind: "deduction",
      explanation: `${commuteExpl} Federal tax caps this at CHF 3,300.`,
      source: zsrc("WL", 13),
      warnings,
    });

  // Berufsauslagen 2: Verpflegung
  let meals = 0;
  if (salaried && p.meals !== "none") {
    const reduced = p.meals === "canteen" || (p.meals === "outside" && p.employments.some((e) => e.canteen));
    meals = reduced ? Math.min(ZH.meals.perDayReduced * workDays, ZH.meals.maxReduced) : Math.min(ZH.meals.perDay * workDays, ZH.meals.max);
    line("11-meals", `11.${n}`, {
      title: p.meals === "shift" ? "Meals – shift or night work" : "Meals away from home",
      icc: Math.round(meals),
      kind: "deduction",
      explanation: reduced
        ? `CHF 7.50 per working day (canteen or employer contribution), max CHF 1,600: ${workDays} days.`
        : `CHF 15 per working day, max CHF 3,200 per year: ${workDays} days.`,
      source: zsrc("WL", 13),
    });
  }

  // Berufsauslagen 3: übrige Berufskosten
  let otherPro = 0;
  if (main > 0) {
    const base = main + mainJobs.reduce((s, e) => s + pos(e.lppBuybackOnCertificate), 0);
    const flat = otherProfessionalFlat(base);
    const actual = pos(p.otherProfessionalExpensesActual);
    otherPro = Math.round(actual > 0 ? actual : flat);
    line("11-other", `11.${n}`, {
      title: "Other professional expenses",
      icc: otherPro,
      kind: "deduction",
      explanation:
        actual > 0
          ? `Actual costs claimed (attach a list). The flat rate would be ${chf(Math.round(flat))}.`
          : `Flat rate: 3% of net salary ${chf(base)}, between CHF 2,000 and CHF 4,000. Covers work clothes, tools, IT, literature, home office, professional associations.`,
      source: zsrc("WL", 13),
    });
  }

  // Berufsauslagen 5: Nebenerwerb
  let secondaryPro = 0;
  if (secondary > 0) {
    secondaryPro = Math.round(secondaryJobFlat(secondary));
    line("11-secondary", `11.${n}`, {
      title: "Secondary job expenses",
      icc: secondaryPro,
      kind: "deduction",
      explanation: "20% of all secondary-job income, between CHF 800 and CHF 2,400 (covers its commuting and meals too).",
      source: zsrc("WL", 14),
    });
  }

  // Self-employment: Hilfsblatt A → Ziffer 2.1; own AHV and pension → Ziffer 16.1
  const b = p.business;
  const biz = b ? computeBusiness(b, "ZH", household) : null;
  const lossCarry = b ? pos(b.lossCarryForward) : 0;
  const selfEmployed = biz ? biz.declared : 0;
  if (b && biz) {
    const w: string[] = [];
    if (biz.needsFullAccounts && b.mode === "records")
      w.push("Turnover of CHF 500,000 or more: full accounts (kaufmännische Buchführung) are mandatory — use the Hilfsblatt A for full accounts and attach the signed annual accounts.");
    if (biz.avsIsEstimate)
      w.push(
        `Own AHV/IV/EO contributions are estimated at ${chf(biz.avs)} (${(biz.avsEstimate.rate * 100).toFixed(3)}% of ${chf(biz.avsBase)}). Use the amount from your Ausgleichskasse's 2025 decision if you have it. Administration fees and family-allowance contributions are not included.`,
      );
    for (const a of biz.assets) if (a.tooHigh) w.push(`Depreciation of ${chf(a.used)} exceeds the ESTV maximum of ${chf(a.max)} for this asset category.`);
    const parts = [
      b.mode === "records"
        ? `Turnover ${chf(biz.revenue)} − expenses ${chf(biz.expenses)}${biz.depreciation ? ` − depreciation ${chf(biz.depreciation)}` : ""}`
        : `Reingewinn per your accounts ${chf(b.netProfit)}${b.ownContributionsBooked && (biz.avs || pos(b.ownPension)) ? " + own AHV and pension contributions added back (Hilfsblatt A 2.2 / 4.1)" : ""}`,
      biz.carPrivateShare ? `+ Privatanteil Auto ${chf(biz.carPrivateShare)} (0.9% of ${chf(b.carPurchasePrice)} per month)` : "",
      pos(b.otherPrivateShare) ? `+ other private shares ${chf(pos(b.otherPrivateShare))}` : "",
      biz.pensionBusiness ? `− half of own 2nd-pillar contributions ${chf(biz.pensionBusiness)}` : "",
    ].filter(Boolean);
    line("2.1", "2.1", {
      title: `Self-employed activity${b.name || b.activity ? ` – ${b.name || b.activity}` : ""}`,
      icc: selfEmployed,
      kind: "income",
      explanation: `${parts.join(" ")} = ${chf(selfEmployed)}. Own AHV contributions are not deducted here but under Ziffer 16.1. Fill in the Hilfsblatt A (${b.mode === "accounts" ? "kaufmännische Buchführung — attach the signed annual accounts and the private/equity account statements" : "vereinfachte Buchführung — attach the statements of assets and liabilities, receipts and expenses, private withdrawals and contributions"}); Bruttoumsatz ${chf(biz.revenue)}.`,
      source: SRC_SELF,
      warnings: w,
    });
    if (lossCarry)
      line("2.1-loss", "2.1", {
        title: "Business losses carried forward",
        icc: lossCarry,
        kind: "deduction",
        explanation: "Losses of the 7 previous business years not yet offset, oldest first. On the Hilfsblatt A under «Weitere Abzüge (z. B. Verrechnung Vorjahresverluste)» — the Ziffer 2.1 amount is reduced accordingly.",
        source: `${SRC_SELF}, section G`,
      });
  }

  if (pos(p.pensionAvsAi))
    line("3.1", "3.1", { title: "AHV / IV pension", icc: pos(p.pensionAvsAi), kind: "income", explanation: "Taxable at 100%.", source: zsrc("FORM", "Ziffer 3.1") });
  const otherPensions = pos(p.pensionLpp) + pos(p.pension3a) + pos(p.pensionOther);
  if (otherPensions)
    line("3.2", "3.2", {
      title: "Pensions (pension fund, 3a, life annuities)",
      icc: otherPensions,
      kind: "income",
      explanation: "Enter each pension with its taxable percentage. Pension-fund pensions are normally 100%; private life annuities only partly.",
      source: zsrc("FORM", "Ziffer 3.2"),
      warnings: pos(p.pensionOther) ? ["Private life annuities (3b) are only partly taxable — check the percentage on the insurer's certificate."] : undefined,
    });
  if (pos(p.unemploymentAndApg))
    line("3.3", "3.3", {
      title: "Unemployment benefits / APG",
      icc: pos(p.unemploymentAndApg),
      kind: "income",
      explanation: "Paid directly by the unemployment fund (not via the employer).",
      source: zsrc("FORM", "Ziffer 3.3"),
    });

  const proCosts = commuteState + meals + otherPro + secondaryPro;
  const earned = main + secondary + (biz ? biz.netAfterAvs : 0);
  const cap = pillar3aCap(p.hasPensionFund, earned - proCosts);
  const pillar3a = Math.min(pos(p.pillar3a), cap);
  if (pos(p.pillar3a))
    line("14", `14.${n}`, {
      title: "Pillar 3a contributions",
      icc: Math.round(pillar3a),
      kind: "deduction",
      explanation: p.hasPensionFund ? "With a pension fund: maximum CHF 7,258 for 2025." : `No pension fund: 20% of earned income, max CHF 36,288. Your cap: ${chf(Math.round(cap))}.`,
      source: zsrc("WL", 15),
      warnings:
        pos(p.pillar3a) > cap
          ? [`You paid ${chf(pos(p.pillar3a))}, above the cap — only ${chf(Math.round(cap))} is deductible.`]
          : ["Attach the 3a certificate (Bescheinigung)."],
    });

  const training = pos(p.trainingCosts);
  return {
    label,
    main,
    secondary,
    allowances,
    selfEmployed,
    commuteState,
    commuteFed,
    meals,
    otherPro,
    secondaryPro,
    pillar3a,
    lppBuyback: pos(p.lppBuyback),
    selfPension: biz ? biz.pensionPrivate : 0,
    selfAvs: biz ? biz.avs : 0,
    lossCarryForward: lossCarry,
    lossOfEarnings: pos(p.lossOfEarningsPremiums) + (biz ? biz.dailyAllowancePrivate : 0),
    training,
    pensions: pos(p.pensionAvsAi) + otherPensions + pos(p.unemploymentAndApg),
    netEarned: earned - proCosts - pillar3a - pos(p.lppBuyback) - (biz ? biz.pensionPrivate : 0),
    hasEarnedIncome: earned > 0 || !!b,
  };
}

// ---------------------------------------------------------------------------

export function computeZH(d: TaxData): CalcResult {
  const lines: GuideLine[] = [];
  const notes: string[] = [];
  const add: AddFn = (key, code, l) => lines.push({ code, ...zloc(key), ...l });
  const married = d.civilStatus === "married";
  const adults = activePersons(d);
  const household = { adults: adults.length, children: childrenWithPart(d).length };
  const persons = adults.map((p, i) => computePerson(p, i, add, household));
  const sumP = (f: (p: ZhPerson) => number) => persons.reduce((s, p) => s + f(p), 0);
  const kids = childrenWithPart(d);
  const kind = familyKind(d);
  const dependents = pos(d.dependents);
  const marriedTariff = kind === "married" || kind === "singleParent";

  // --- Securities and accounts (Ziffer 4.1 / 30.1)
  const accountInterest = d.bankAccounts.reduce((s, a) => s + pos(a.interest), 0);
  const accountBalance = d.bankAccounts.reduce((s, a) => s + pos(a.balance), 0);
  const secIncome = d.securities.reduce((s, x) => s + pos(x.incomeWithWithholding) + pos(x.incomeWithoutWithholding), 0);
  const secValue = d.securities.reduce((s, x) => s + pos(x.taxValue), 0);
  const withholdingBase =
    d.bankAccounts.filter((a) => a.withholdingTax).reduce((s, a) => s + pos(a.interest), 0) + d.securities.reduce((s, x) => s + pos(x.incomeWithWithholding), 0);
  if (accountInterest + secIncome > 0 || d.bankAccounts.length || d.securities.length)
    add("4.1", "4.1", {
      title: "Income from accounts and securities",
      icc: Math.round(accountInterest + secIncome),
      kind: "income",
      explanation: `List every account and security in the Wertschriftenverzeichnis: income with Swiss withholding tax in column A, without in column B. Interest ${chf(accountInterest, 2)}, dividends/coupons ${chf(secIncome, 2)}.`,
      source: zsrc("WL", "pp. 30–32"),
    });
  if (withholdingBase > 0)
    notes.push(`Withholding tax refund: 35% of ${chf(withholdingBase, 2)} = ${chf(round05(withholdingBase * 0.35), 2)} is credited on your tax bill if declared in the Wertschriftenverzeichnis.`);

  const alimonyIn = pos(d.alimonyReceived);
  if (alimonyIn)
    add("5.1", "5.1", { title: "Alimony received", icc: alimonyIn, kind: "income", explanation: "For yourself (5.1) and for minor children (5.2).", source: zsrc("FORM", "Ziffer 5.1/5.2") });
  const otherIncome = pos(d.otherIncome);
  if (otherIncome) add("5.4", "5.4", { title: "Other income", icc: otherIncome, kind: "income", explanation: "Describe it on the form.", source: zsrc("FORM", "Ziffer 5.4") });

  // --- Property (Ziffer 6 / 31.1)
  let propIncomeState = 0;
  let propIncomeFed = 0;
  let rentalGross = 0;
  let propertyWealth = 0;
  for (const p of d.properties) {
    const share = clamp(p.ownershipShare || 1, 0, 1);
    const emw = Math.round(pos(p.rentalValueOverride) * share * (clamp(p.monthsOwnUse, 0, 12) / 12));
    const rent = pos(p.rentalIncome);
    const gross = emw + rent;
    const age = TAX_YEAR - p.constructionYear;
    const actual = pos(p.maintenanceActual);
    const maintState = Math.round(actual > 0 ? actual : gross * ZH.maintenanceFlat);
    const maintFed = Math.round(actual > 0 ? actual : gross * (age <= R.property.maintenanceIfd.youngMaxAge ? 0.1 : 0.2));
    rentalGross += gross;
    propIncomeState += gross - maintState;
    propIncomeFed += gross - maintFed;
    propertyWealth += pos(p.taxEstimate) * share;
    const w: string[] = [];
    if (p.monthsOwnUse > 0 && !p.rentalValueOverride)
      w.push("Enter the Eigenmietwert from your property valuation (Liegenschaftenbewertung) or last assessment — it isn't computed here.");
    if (actual > 0 && actual < gross * ZH.maintenanceFlat) w.push(`The 20% flat rate (${chf(Math.round(gross * ZH.maintenanceFlat))}) is higher than your actual costs this year.`);
    add("6", "6", {
      title: `Property: ${p.description || p.commune || "property"}`,
      icc: gross - maintState,
      ifd: maintFed !== maintState ? gross - maintFed : undefined,
      kind: "income",
      explanation: `Eigenmietwert ${chf(emw)}${rent ? ` + rents ${chf(rent)}` : ""} − maintenance ${chf(maintState)} (${actual > 0 ? "actual costs, attach a list" : "20% flat rate"}). Federal flat rate: ${age <= 10 ? "10%" : "20%"} (building ${age} years old).`,
      source: zsrc("WL", "pp. 28–29"),
      warnings: w,
    });
  }

  // --- Debts (Ziffer 12 / 34)
  const debtInterest = d.debts.reduce((s, x) => s + pos(x.interest), 0);
  const debtTotal = d.debts.reduce((s, x) => s + pos(x.balance), 0);
  const interestCap = accountInterest + secIncome + rentalGross + ZH.debtInterestAllowance;
  const interest = Math.round(Math.min(debtInterest, interestCap));
  if (d.debts.length) {
    add("12", "12", {
      title: "Debt interest (mortgage, loans)",
      icc: interest,
      kind: "deduction",
      explanation: "List every creditor in the Schuldenverzeichnis. Deductible up to investment income (incl. Eigenmietwert) + CHF 50,000.",
      source: zsrc("WL", 14),
      warnings: debtInterest > interestCap ? [`Interest ${chf(debtInterest)} exceeds the cap of ${chf(Math.round(interestCap))}.`] : undefined,
    });
    add("34", "34", { title: "Debts on 31.12.2025", icc: Math.round(debtTotal), kind: "debt", explanation: "From the Schuldenverzeichnis.", source: zsrc("FORM", "Ziffer 34") });
  }

  const alimonyOut = pos(d.alimonyPaid);
  if (alimonyOut)
    add("13.1", "13.1", { title: "Alimony paid", icc: alimonyOut, kind: "deduction", explanation: "To a former spouse (13.1) or for minor children (13.2). Attach payment proofs.", source: zsrc("FORM", "Ziffer 13") });

  // --- Insurance and savings interest (Ziffer 15)
  const premiumsNet = Math.max(0, pos(d.healthPremiums) - pos(d.premiumSubsidies));
  const lossOfEarnings = sumP((p) => p.lossOfEarnings);
  const noPension = persons.every((p) => p.pillar3a === 0 && p.lppBuyback === 0) && adults.every((p) => !p.hasPensionFund);
  const insuranceAmount = premiumsNet + lossOfEarnings + accountInterest;
  const capState =
    (married ? ZH.insurance.married : ZH.insurance.single) * (noPension ? ZH.insurance.noPensionContributionsFactor : 1) + (kids.length + dependents) * ZH.insurance.perChild;
  const capFed =
    (married ? R.insurance.ifd.married : R.insurance.ifd.single) * (noPension ? R.insurance.ifd.noPensionContributionsFactor : 1) + (kids.length + dependents) * R.insurance.ifd.perChild;
  const insuranceState = Math.round(Math.min(insuranceAmount, capState));
  const insuranceFed = Math.round(Math.min(insuranceAmount, capFed));
  if (insuranceAmount > 0 || d.premiumSubsidies > 0)
    add("15", "15", {
      title: "Insurance premiums and savings interest",
      icc: insuranceState,
      ifd: insuranceFed,
      kind: "deduction",
      explanation: `Premiums ${chf(pos(d.healthPremiums))} − subsidies ${chf(pos(d.premiumSubsidies))}${lossOfEarnings ? ` + loss-of-earnings premiums ${chf(lossOfEarnings)}` : ""} + savings interest ${chf(Math.round(accountInterest))}, up to the cap of ${chf(Math.round(capState))} (state) / ${chf(Math.round(capFed))} (federal).`,
      source: zsrc("WL", "pp. 15–16"),
    });

  // --- Other deductions (Ziffer 16)
  const avs = pos(d.avsNonEarner);
  const selfAvs = sumP((p) => p.selfAvs);
  const buybacks = sumP((p) => p.lppBuyback);
  const selfPension = sumP((p) => p.selfPension);
  const pensionContrib = buybacks + selfPension + selfAvs + avs;
  if (pensionContrib)
    add("16.1", "16.1", {
      title: "AHV contributions and pension contributions",
      icc: Math.round(pensionContrib),
      kind: "deduction",
      explanation: [
        buybacks ? `pension fund buy-backs ${chf(buybacks)}` : "",
        selfPension ? `the private half of own 2nd-pillar contributions ${chf(selfPension)}` : "",
        selfAvs ? `own AHV/IV/EO contributions as self-employed ${chf(selfAvs)}` : "",
        avs ? `AHV paid as a non-earner ${chf(avs)}` : "",
      ]
        .filter(Boolean)
        .join(" + ")
        .replace(/^./, (c) => c.toUpperCase()) + ". Attach the certificates.",
      source: selfAvs ? `${zsrc("WL", 16)}; ${SRC_SELF}` : zsrc("WL", 16),
      warnings: buybacks ? ["Capital withdrawn within 3 years of a buy-back cancels the deduction."] : undefined,
    });
  const trainingTotal = sumP((p) => p.training);
  const trainingState = sumP((p) => Math.min(p.training, ZH.training));
  const trainingFed = sumP((p) => Math.min(p.training, R.training.ifd));
  if (trainingTotal)
    add("16.2", "16.2", {
      title: "Professional training costs",
      icc: trainingState,
      ifd: trainingFed !== trainingState ? trainingFed : undefined,
      kind: "deduction",
      explanation: "Costs you paid yourself after a first secondary-level diploma (or from age 20). Max CHF 12,400 per person (federal 13,000). Fill in the Hilfsblatt.",
      source: zsrc("WL", 16),
    });
  const managedValue = d.securities.filter((s) => s.managedByThirdParty).reduce((s, x) => s + pos(x.taxValue), 0);
  const adminFlat = Math.round(Math.min(managedValue * ZH.adminFees.rate, ZH.adminFees.max));
  const adminFees = pos(d.securitiesAdminFeesActual) > 0 ? Math.round(pos(d.securitiesAdminFeesActual)) : adminFlat;
  if (adminFees > 0)
    add("16.3", "16.3", {
      title: "Securities administration costs",
      icc: adminFees,
      kind: "deduction",
      explanation:
        pos(d.securitiesAdminFeesActual) > 0
          ? `Actual custody costs (prove payment). Flat rate would be ${chf(adminFlat)}.`
          : `Flat rate 3‰ of securities managed by a bank (${chf(managedValue)}), max CHF 6,000, no receipts needed.`,
      source: zsrc("WL", 16),
    });
  if (pos(d.disabilityCosts))
    add("16.4", "16.4", { title: "Disability-related costs", icc: pos(d.disabilityCosts), kind: "deduction", explanation: "Fully deductible; fill in the Hilfsblatt.", source: zsrc("WL", 16) });
  const political = pos(d.politicalDonations);
  const politicalState = Math.min(political, married ? ZH.politicalParties.married : ZH.politicalParties.other);
  const politicalFed = Math.min(political, R.politicalParties.ifd);
  if (political)
    add("16.5", "16.5", {
      title: "Donations to political parties",
      icc: politicalState,
      ifd: politicalFed !== politicalState ? politicalFed : undefined,
      kind: "deduction",
      explanation: `Max ${chf(married ? ZH.politicalParties.married : ZH.politicalParties.other)} for the state tax, CHF 10,600 federal. Attach a list.`,
      source: zsrc("WL", 17),
    });

  const childcareEligible =
    d.childcareTrainingOrIncapacity || (married && persons.length === 2 && persons.every((p) => p.hasEarnedIncome)) || (!married && persons.some((p) => p.hasEarnedIncome));
  let childcareState = 0;
  let childcareFed = 0;
  for (const c of d.children) {
    const cost = pos(c.childcareCosts);
    if (!cost) continue;
    const eligibleAge = c.birthYear >= TAX_YEAR - 14; // form: Jahrgang 2011–2025
    const allowed = eligibleAge && childcareEligible;
    const cs = allowed ? Math.min(cost, ZH.childcare) : 0;
    const cf = allowed ? Math.min(cost, R.childcare.ifd) : 0;
    childcareState += cs;
    childcareFed += cf;
    const w: string[] = [];
    if (!eligibleAge) w.push("Only for children born 2011 or later.");
    if (!childcareEligible) w.push("Not deducted: both spouses must work (or the single parent), or be in training / unable to work.");
    add("16.6", "16.6", {
      title: `Childcare costs – ${c.firstName || "child"}`,
      icc: cs,
      ifd: cf !== cs ? cf : undefined,
      kind: allowed ? "deduction" : "info",
      explanation: "Proven third-party care costs linked to work, training or incapacity. Max CHF 25,000 per child (federal 25,800).",
      source: zsrc("WL", 18),
      warnings: w,
    });
  }

  // --- Dual-income deduction (Ziffer 17)
  let dualState = 0;
  let dualFed = 0;
  if (married && persons.length === 2 && persons.every((p) => p.hasEarnedIncome)) {
    const lower = Math.max(0, Math.min(persons[0].netEarned, persons[1].netEarned));
    dualState = Math.round(Math.min(ZH.dualIncome, lower));
    dualFed = Math.round(Math.min(lower, clamp(lower * R.dualIncomeIfd.rate, R.dualIncomeIfd.min, R.dualIncomeIfd.max)));
    add("17", "17", {
      title: "Dual-income deduction",
      icc: dualState,
      ifd: dualFed,
      kind: "deduction",
      explanation: `State: CHF 6,100 from the lower remaining earned income (${chf(Math.round(lower))}). Federal: 50% of it, between CHF 8,600 and CHF 14,100.`,
      source: zsrc("WL", 18),
    });
  }

  // =========================================================================
  // Einkommensberechnung (Ziffern 19–25)
  const incomeState =
    sumP((p) => p.main + p.secondary + p.allowances + p.selfEmployed + p.pensions) + accountInterest + secIncome + alimonyIn + otherIncome + propIncomeState;
  const proState = sumP((p) => p.commuteState + p.meals + p.otherPro + p.secondaryPro);
  const deductionsState =
    proState +
    sumP((p) => p.lossCarryForward) +
    interest +
    alimonyOut +
    sumP((p) => p.pillar3a) +
    insuranceState +
    pensionContrib +
    trainingState +
    adminFees +
    pos(d.disabilityCosts) +
    politicalState +
    childcareState +
    dualState;
  const net21 = Math.round(incomeState - deductionsState);
  const medical = Math.round(Math.max(0, pos(d.medicalCosts) - ZH.medicalFranchise * net21));
  if (pos(d.medicalCosts))
    add("22.1", "22.1", {
      title: "Medical and dental costs",
      icc: medical,
      kind: medical > 0 ? "deduction" : "info",
      explanation: `Only costs you paid yourself above 5% of net income (Ziffer 21 ≈ ${chf(net21)}, so ${chf(Math.round(net21 * 0.05))}). Fill in the Hilfsblatt.`,
      source: zsrc("WL", 19),
      warnings: medical === 0 ? ["Below the 5% threshold, so nothing is deducted."] : undefined,
    });
  const donations = pos(d.donations);
  const donationsState = donations >= ZH.donations.minTotal ? Math.round(Math.min(donations, ZH.donations.maxShare * net21)) : 0;
  if (donations)
    add("22.2", "22.2", {
      title: "Donations to public-benefit organisations",
      icc: donationsState,
      kind: donationsState > 0 ? "deduction" : "info",
      explanation: "Swiss tax-exempt organisations; at least CHF 100 in total, at most 20% of net income. Attach a list.",
      source: zsrc("WL", 19),
    });
  const income23 = net21 - medical - donationsState;
  const childDeduction = kids.length * ZH.childDeduction;
  const supportDeduction = dependents * ZH.supportDeduction;
  if (kids.length)
    add("24.1", "24.1", {
      title: "Child deduction",
      icc: childDeduction,
      ifd: kids.length * R.ifd.childDeduction,
      kind: "deduction",
      explanation: `CHF 9,300 per child (federal 6,800). List every child on page 1 of the return.`,
      source: zsrc("FORM", "Ziffer 24.1"),
    });
  if (dependents)
    add("24.2", "24.2", {
      title: "Supported persons",
      icc: supportDeduction,
      ifd: dependents * R.ifd.dependentDeduction,
      kind: "deduction",
      explanation: "CHF 2,800 per person you support with at least that amount (federal CHF 6,800, requires at least 6,800 of support).",
      source: zsrc("FORM", "Ziffer 24.2"),
    });
  const taxableIncome = floor100(income23 - childDeduction - supportDeduction);

  // --- Wealth (Ziffern 30–35)
  if (accountBalance + secValue > 0)
    add("30.1", "30.1", {
      title: "Accounts and securities (tax value)",
      icc: Math.round(accountBalance + secValue),
      kind: "wealth",
      explanation: `Balances and tax values on 31.12.2025 from the Wertschriftenverzeichnis: accounts ${chf(accountBalance)}, securities ${chf(secValue)}.`,
      source: zsrc("WL", "pp. 30–32"),
    });
  for (const [key, value, title, expl] of [
    ["30.2", d.cryptoAndCash, "Cash, gold, precious metals", "Value on 31.12.2025. Crypto-currencies belong in the Wertschriftenverzeichnis (30.1) at the ESTV year-end price."],
    ["30.3", d.lifeInsuranceSurrenderValue, "Life and annuity insurance", "Tax value from the insurer's certificate."],
    ["30.4", d.vehiclesAndValuables, "Motor vehicles (and other assets)", "Vehicles at purchase price minus depreciation; other valuables under Ziffer 30.6."],
  ] as const)
    if (pos(value)) add(key, key, { title, icc: Math.round(pos(value)), kind: "wealth", explanation: expl, source: zsrc("FORM", `Ziffer ${key}`) });
  if (propertyWealth)
    add("31.1", "31.1", { title: "Real estate (tax value)", icc: Math.round(propertyWealth), kind: "wealth", explanation: "Steuerwert from the property valuation, your share.", source: zsrc("WL", 28) });
  const businessEquity = adults.reduce((s, p) => s + (p.business ? pos(p.business.equityCapital) : 0), 0);
  if (businessEquity)
    add("32", "32", {
      title: "Equity of your business",
      icc: Math.round(businessEquity),
      kind: "wealth",
      explanation: "Eigenkapital on 31.12.2025 per the Hilfsblatt A, without business securities and accounts (those go in the Wertschriftenverzeichnis, marked «G») and without business real estate (Liegenschaftenverzeichnis).",
      source: zsrc("FORM", "Ziffer 32"),
    });
  const assets =
    businessEquity + accountBalance + secValue + pos(d.cryptoAndCash) + pos(d.lifeInsuranceSurrenderValue) + pos(d.vehiclesAndValuables) + propertyWealth;
  const taxableWealth = floor1000(Math.max(0, assets - debtTotal));

  // --- Tax
  const simpleIncome = zhIncomeSimpleTax(taxableIncome, marriedTariff);
  const simpleWealth = zhWealthSimpleTax(taxableWealth, marriedTariff);
  const commune = findZhCommune(d.commune);
  const churchRates = adults.map((p) => (p.confession === "none" ? 0 : (commune?.church[p.confession] ?? 0)));
  const income = zhTaxes(simpleIncome, d.communalRate, churchRates);
  const wealth = zhTaxes(simpleWealth, d.communalRate, churchRates);
  const personal = ZH.personalTax * adults.length;
  if (adults.some((p) => p.confession !== "none") && !commune)
    notes.push("Commune not found in the Zurich list, so church tax couldn't be computed.");
  const cantonTotal = round05(income.state + income.communal + income.church + wealth.state + wealth.communal + wealth.church + personal);

  // --- Federal
  const ifd = federalTax({
    married,
    parentalScale: kind === "married" || kind === "singleParent",
    kids: kids.length,
    dependents,
    income: incomeState - propIncomeState + propIncomeFed,
    deductions:
      sumP((p) => p.commuteFed + p.meals + p.otherPro + p.secondaryPro + p.pillar3a + p.lossCarryForward) +
      Math.round(Math.min(debtInterest, interestCap)) +
      alimonyOut +
      insuranceFed +
      pensionContrib +
      trainingFed +
      adminFees +
      politicalFed +
      childcareFed +
      dualFed,
    medical: d.medicalCosts,
    disability: d.disabilityCosts,
    donations,
  });

  const churchLabel = adults
    .filter((p) => p.confession !== "none")
    .map((p) => CONFESSION_LABEL[p.confession])
    .join(" / ");
  return {
    lines,
    notes,
    details: { "21": net21, "23": income23, "25": taxableIncome, "35": taxableWealth, simpleIncome, simpleWealth },
    estimate: {
      cantonTotal,
      taxableIncome,
      taxableWealth,
      cantonSections: [
        {
          title: "Income (Staats- und Gemeindesteuer)",
          rows: [
            { label: "Net income", sub: "Ziffer 21", value: net21 },
            { label: "Reineinkommen", sub: "Ziffer 23", value: income23 },
            { label: "Taxable income", sub: "Ziffer 25, rounded down to CHF 100", value: taxableIncome, strong: true },
            { label: `Simple state tax (${marriedTariff ? "Verheiratetentarif" : "Grundtarif"})`, sub: "einfache Staatssteuer, § 35 StG", value: simpleIncome, format: "chf2" },
            { label: "State tax (98%)", value: income.state, format: "chf2", strong: true },
            { label: `Communal tax – ${d.commune || "commune"} (${d.communalRate}%)`, value: income.communal, format: "chf2", strong: true },
            ...(income.church ? [{ label: `Church tax – ${churchLabel}`, value: income.church, format: "chf2" as const, strong: true }] : []),
          ],
        },
        {
          title: "Wealth",
          rows: [
            { label: "Taxable wealth", sub: "Ziffer 35, rounded down to CHF 1,000", value: taxableWealth },
            { label: `Simple state tax (${marriedTariff ? "Verheiratetentarif" : "Grundtarif"})`, sub: "§ 47 StG; nil up to CHF 80,000 (couples 159,000)", value: simpleWealth, format: "chf2" },
            { label: "State tax (98%)", value: wealth.state, format: "chf2", strong: true },
            { label: `Communal tax (${d.communalRate}%)`, value: wealth.communal, format: "chf2", strong: true },
            ...(wealth.church ? [{ label: "Church tax", value: wealth.church, format: "chf2" as const, strong: true }] : []),
          ],
        },
        { title: "Personal tax", rows: [{ label: `CHF 24 per adult × ${adults.length}`, sub: "Personalsteuer, § 200 StG", value: personal, format: "chf2", strong: true }] },
      ],
      ifd,
      total: round05(cantonTotal + ifd.total),
    },
  };
}
