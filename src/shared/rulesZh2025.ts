// Official figures for tax period 2025, canton of Zurich (Staats- und Gemeindesteuer).
// Sources (stored in research/zh/):
//   WL    = Wegleitung zur Steuererklärung 2025 (Kantonales Steueramt Zürich)
//   FORM  = Steuererklärung 2025 form (StA Form. 303)
//   RRB   = RRB 833/2025, tariff table, column "teuerungsausgeglichen" — the tariff in force
//           from 1.1.2024 until the next adjustment on 1.1.2026, i.e. valid for 2025
//   PARAM = Quellensteuertarife 2025 – Grundlagen und Berechnungsparameter (state multiplier)
//   StG   = Steuergesetz Kanton Zürich (§ 47 wealth tariff for single parents, § 199/200 personal tax)

export const ZH_SOURCES = {
  WL: "Wegleitung zur Steuererklärung 2025 (Steueramt Kanton Zürich)",
  FORM: "Steuererklärung 2025, Kanton Zürich (Form. 303)",
  RRB: "Tariff in force 2024–2025 (RRB 833/2025, table 'teuerungsausgeglichen')",
  PARAM: "Quellensteuer 2025 – Grundlagen und Berechnungsparameter (Steueramt Zürich)",
  StG: "Steuergesetz des Kantons Zürich",
} as const;

export const zsrc = (doc: keyof typeof ZH_SOURCES, where: number | string) => `${ZH_SOURCES[doc]}${where ? `, ${typeof where === "number" ? `p. ${where}` : where}` : ""}`;

export const ZH = {
  stateMultiplier: 0.98, // Staatssteuerfuss 98% (PARAM)
  personalTax: 24, // per adult (StG § 199–200)
  commute: { cap: 5200, ifdCap: 3300, bikePerYear: 700, carPerKm: 0.7, motorbikePerKm: 0.4, maxDays: 240 }, // WL p. 13, FORM
  meals: { perDay: 15, perDayReduced: 7.5, max: 3200, maxReduced: 1600 }, // WL p. 13
  insurance: { single: 2900, married: 5800, perChild: 1300, noPensionContributionsFactor: 1.5 }, // WL p. 16
  training: 12400, // WL p. 16 (federal 13,000)
  politicalParties: { married: 20600, other: 10300 }, // WL p. 17 (federal 10,600)
  childcare: 25000, // WL p. 18, per child under 14 (federal 25,800)
  dualIncome: 6100, // WL p. 18
  childDeduction: 9300, // FORM Ziffer 24.1 (federal 6,800)
  supportDeduction: 2800, // FORM Ziffer 24.2 (federal 6,800)
  adminFees: { rate: 0.003, max: 6000 }, // 3‰ of third-party-managed securities, max CHF 6,000 (WL p. 16)
  maintenanceFlat: 0.2, // 20% of rental value / rents per property (WL p. 29)
  debtInterestAllowance: 50000, // WL p. 14
  medicalFranchise: 0.05, // 5% of Nettoeinkommen, Ziffer 21 (WL p. 19)
  donations: { minTotal: 100, maxShare: 0.2 }, // of Ziffer 21 (WL p. 19)
} as const;

/** [bracket width in CHF, rate] — rate in % for income, ‰ for wealth. Last bracket has infinite width. */
type Brackets = [number, number][];

// Einkommenssteuer, § 35 StG (RRB 833/2025)
export const ZH_INCOME_BASIC: Brackets = [
  [6900, 0], [4900, 2], [4800, 3], [7900, 4], [9600, 5], [11000, 6], [12900, 7],
  [17400, 8], [33600, 9], [33200, 10], [52700, 11], [68400, 12], [Infinity, 13],
];
export const ZH_INCOME_MARRIED: Brackets = [
  [13900, 0], [6300, 2], [8000, 3], [9700, 4], [11100, 5], [14300, 6], [31800, 7],
  [31900, 8], [47900, 9], [57200, 10], [62100, 11], [71600, 12], [Infinity, 13],
];

// Vermögenssteuer, § 47 StG (RRB 833/2025), rates in ‰
export const ZH_WEALTH_BASIC: Brackets = [[80000, 0], [238000, 0.5], [399000, 1], [636000, 1.5], [956000, 2], [953000, 2.5], [Infinity, 3]];
export const ZH_WEALTH_MARRIED: Brackets = [[159000, 0], [239000, 0.5], [397000, 1], [637000, 1.5], [955000, 2], [955000, 2.5], [Infinity, 3]];

export function bracketTax(brackets: Brackets, amount: number, divisor: number): number {
  let rest = Math.max(0, amount);
  let tax = 0;
  for (const [width, rate] of brackets) {
    const part = Math.min(rest, width);
    tax += (part * rate) / divisor;
    rest -= part;
    if (rest <= 0) break;
  }
  return tax;
}
