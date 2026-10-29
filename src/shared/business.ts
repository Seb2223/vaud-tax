// Self-employed activity (raison individuelle / Einzelunternehmen): from the
// business records to the taxable result, the AVS estimate and what goes where.
// Sources:
//   VD-21003 = Instructions complémentaires 2025, activité lucrative indépendante (ACI Vaud)
//   ZH-A     = Merkblatt zum Hilfsblatt A 2025 (Steueramt Zürich)
//   AVS-2.02 = Mémento 2.02 « Cotisations des indépendants à l'AVS, à l'AI et aux APG » (thresholds since 2025)
import { floor100, pos } from "./money";
import { ASSET_CATEGORIES, type Business, type Canton, EXPENSE_CATEGORIES, type ExpenseCategory } from "./types";

export const BUSINESS_RULES = {
  bookkeepingThreshold: 500000, // full accounts (CO 957) from this turnover
  carPrivateShareMonthly: 0.009, // 0.9% of purchase price per month (VD-21003 p. 18; same federal practice)
  carPrivateShareMinMonthly: 150, // at least CHF 1,800 per year
  householdPrivateShare: { firstAdult: 3540, perExtraAdult: 900, perChild: 600 }, // VD-21003 appendix 2
  ownPensionBusinessShare: 0.5, // half of own 2nd-pillar contributions is a business expense (VD-21003 p. 21, ZH-A)
  dailyAllowanceBusinessShareVD: 0.5, // VD-21003 p. 21
  avs: {
    equityInterest: 0.01, // 2025 rate deducted from AVS income (caisse AVS)
    minIncome: 10100,
    maxScaleIncome: 60500,
    minContribution: 530,
    fullRate: 0.1, // AVS 8.1 + AI 1.4 + APG 0.5
    // [income from, rate] for the sliding scale (AVS-2.02 §6)
    scale: [
      [10100, 0.05371], [17600, 0.05494], [23000, 0.05617], [25500, 0.05741], [28000, 0.05864], [30500, 0.05987],
      [33000, 0.06235], [35500, 0.06481], [38000, 0.06728], [40500, 0.06976], [43000, 0.07222], [45500, 0.07469],
      [48000, 0.0784], [50500, 0.08209], [53000, 0.0858], [55500, 0.08951], [58000, 0.09321],
    ] as [number, number][],
  },
} as const;

/** AVS/AI/APG contributions of a self-employed person on a given annual income (AVS-2.02). */
export function avsContribution(income: number): { rate: number; amount: number } {
  const base = floor100(income);
  const A = BUSINESS_RULES.avs;
  if (base < A.minIncome) return { rate: 0, amount: A.minContribution };
  if (base >= A.maxScaleIncome) return { rate: A.fullRate, amount: Math.round(base * A.fullRate * 100) / 100 };
  let rate = A.scale[0][1];
  for (const [from, r] of A.scale) if (base >= from) rate = r;
  return { rate, amount: Math.round(base * rate * 100) / 100 };
}

export interface AssetDepreciation {
  id: string;
  max: number;
  used: number;
  tooHigh: boolean;
}

export interface BusinessResult {
  revenue: number;
  expenses: number;
  depreciation: number;
  assets: AssetDepreciation[];
  carPrivateShare: number;
  householdPrivateShare: number;
  privateShares: number;
  /** Profit before own AVS, own pension and own daily-allowance insurance. */
  grossProfit: number;
  pensionBusiness: number;
  pensionPrivate: number;
  dailyAllowanceBusiness: number;
  dailyAllowancePrivate: number;
  avsBase: number;
  avsEstimate: { rate: number; amount: number };
  avs: number;
  avsIsEstimate: boolean;
  /** Net income from the activity after all business costs incl. AVS — the figure for the pillar 3a cap and the dual-income deduction. */
  netAfterAvs: number;
  /** Amount declared as self-employment income: VD code 180 (AVS already deducted) / ZH Ziffer 2.1 (AVS deducted under 16.1). */
  declared: number;
  needsFullAccounts: boolean;
}

/** Household size for the Vaud private-share flat rate. */
export interface HouseholdSize {
  adults: number;
  children: number;
}

export function computeBusiness(b: Business, canton: Canton, household: HouseholdSize): BusinessResult {
  const R = BUSINESS_RULES;
  const revenue = pos(b.revenue);
  const records = b.mode === "records";

  const expenses = records ? (Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).reduce((s, k) => s + pos(b.expenses[k] ?? 0), 0) : 0;
  const assets = records
    ? b.assets.map((a) => {
        const max = Math.round((pos(a.bookValueStart) + pos(a.additions)) * ASSET_CATEGORIES[a.category].rate);
        const used = pos(a.depreciation) > 0 ? Math.round(pos(a.depreciation)) : max;
        return { id: a.id, max, used, tooHigh: used > max };
      })
    : [];
  const depreciation = assets.reduce((s, a) => s + a.used, 0);

  const months = Math.min(12, Math.max(0, b.carMonths || 0));
  const carPrivateShare =
    pos(b.carPurchasePrice) > 0 ? Math.round(Math.max(b.carPurchasePrice * R.carPrivateShareMonthly, R.carPrivateShareMinMonthly) * months) : 0;
  const hp = R.householdPrivateShare;
  const householdPrivateShare =
    b.householdCostsBooked && canton === "VD" ? hp.firstAdult + Math.max(0, household.adults - 1) * hp.perExtraAdult + household.children * hp.perChild : 0;
  const privateShares = carPrivateShare + householdPrivateShare + pos(b.otherPrivateShare);

  const ownPension = pos(b.ownPension);
  const avsGiven = pos(b.avsContributions);
  // In "accounts" mode the booked own contributions are added back first (Hilfsblatt A 2.2 / 4.1).
  const booked = !records && b.ownContributionsBooked ? avsGiven + ownPension : 0;
  const grossProfit = Math.round((records ? revenue - expenses - depreciation : (b.netProfit || 0) + booked) + privateShares);

  const pensionBusiness = Math.round(ownPension * R.ownPensionBusinessShare);
  const pensionPrivate = ownPension - pensionBusiness;
  const ij = pos(b.dailyAllowanceInsurance);
  const dailyAllowanceBusiness = canton === "VD" ? Math.round(ij * R.dailyAllowanceBusinessShareVD) : 0;
  const dailyAllowancePrivate = ij - dailyAllowanceBusiness;

  // AVS income: business income before own AVS, after half the own pension contributions, minus 1% interest on equity.
  const avsBase = floor100(Math.max(0, grossProfit - pensionBusiness - dailyAllowanceBusiness - pos(b.equityCapital) * R.avs.equityInterest));
  const avsEstimate = avsContribution(avsBase);
  const avs = avsGiven > 0 ? avsGiven : Math.round(avsEstimate.amount);
  const netAfterAvs = grossProfit - pensionBusiness - dailyAllowanceBusiness - avs;

  return {
    revenue,
    expenses,
    depreciation,
    assets,
    carPrivateShare,
    householdPrivateShare,
    privateShares,
    grossProfit,
    pensionBusiness,
    pensionPrivate,
    dailyAllowanceBusiness,
    dailyAllowancePrivate,
    avsBase,
    avsEstimate,
    avs,
    avsIsEstimate: avsGiven === 0,
    netAfterAvs,
    declared: canton === "VD" ? netAfterAvs : grossProfit - pensionBusiness,
    needsFullAccounts: revenue >= R.bookkeepingThreshold,
  };
}
