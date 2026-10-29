// Data model for one household's tax return. Everything here lives in the
// browser (localStorage) and in exported files; the server never stores it.

export type CivilStatus = "single" | "married"; // "married" includes registered partnerships

export type Canton = "VD" | "ZH";

/** Church membership — only matters in cantons with a church tax (Zurich). */
export type Confession = "none" | "reformed" | "catholic" | "christCatholic";

/** Interview answers: which parts of the return apply to this household. */
export const TOPICS = {
  employment: { label: "Salaried job(s)", hint: "Salary certificate from an employer" },
  selfEmployment: { label: "Self-employment / freelance", hint: "Own business or side income invoiced yourself" },
  pensions: { label: "Pensions", hint: "AVS/AI, pension fund, 3a or other pensions received" },
  unemployment: { label: "Unemployment, sickness or military allowances", hint: "Not included on a salary certificate" },
  renting: { label: "Renting your home", hint: "For the housing deduction" },
  property: { label: "Owning property", hint: "Home, holiday flat, rental property" },
  securities: { label: "Shares, funds or bonds", hint: "Brokerage or bank custody account" },
  crypto: { label: "Crypto, gold or cash", hint: "Valued on 31.12.2025" },
  debts: { label: "Mortgage or loans", hint: "Interest paid in 2025" },
  childcare: { label: "Paid childcare", hint: "Crèche, day-care, maman de jour" },
  alimony: { label: "Alimony paid or received", hint: "Separation or divorce" },
  training: { label: "Continuing education", hint: "Courses you paid yourself" },
  medical: { label: "Large medical or dental costs", hint: "Out-of-pocket, not reimbursed" },
  donations: { label: "Donations", hint: "Charities or political parties" },
  dependents: { label: "Supporting another person", hint: "A relative unable to support themselves" },
} as const;
export type Topic = keyof typeof TOPICS;

export type CommuteMode = "none" | "public" | "bike" | "motorbike" | "car";
export type MealsMode = "none" | "outside" | "canteen" | "shift";

export const EXPENSE_CATEGORIES = {
  goods: "Goods & materials bought for resale or production",
  subcontracting: "Subcontractors & third-party services",
  staff: "Staff wages & their social charges",
  rent: "Business premises rent & charges",
  vehicle: "Business vehicle costs (fuel, insurance, repairs, leasing)",
  insurance: "Business insurance (liability, property)",
  office: "Office supplies, software subscriptions, small equipment",
  communication: "Phone, internet, postage",
  marketing: "Advertising, website, marketing",
  travel: "Business travel, meals with clients",
  training: "Professional training for the business",
  fees: "Accounting, legal, bank fees, licences",
  interest: "Interest on business debts",
  other: "Other business expenses",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

/** Depreciation categories with the official maximum declining-balance rates (VD 21003 appendix 3 = ESTV notice A 1995). */
export const ASSET_CATEGORIES = {
  vehicle: { label: "Motor vehicle", rate: 0.4 },
  it: { label: "Computers & software", rate: 0.4 },
  officeMachines: { label: "Office machines", rate: 0.4 },
  furniture: { label: "Furniture & fittings", rate: 0.25 },
  machines: { label: "Production machines", rate: 0.3 },
  tools: { label: "Tools & instruments", rate: 0.45 },
  intangible: { label: "Intangibles (patents, goodwill, licences)", rate: 0.4 },
} as const;
export type AssetCategory = keyof typeof ASSET_CATEGORIES;

export interface BusinessAsset {
  id: string;
  description: string;
  category: AssetCategory;
  /** Book value at the start of 2025 (after previous depreciation). */
  bookValueStart: number;
  /** Purchases during 2025. */
  additions: number;
  /** 0 = use the maximum allowed rate; otherwise the depreciation you book. */
  depreciation: number;
}

/** A self-employed activity (raison individuelle / Einzelunternehmen). */
export interface Business {
  name: string;
  activity: string;
  /** "records": receipts & expenses entered here; "accounts": net profit from your own income statement. */
  mode: "records" | "accounts";
  /** Turnover (chiffre d'affaires / Bruttoumsatz) — always declared. */
  revenue: number;
  expenses: Partial<Record<ExpenseCategory, number>>;
  assets: BusinessAsset[];
  /** "accounts" mode: net profit (or loss) per the income statement. */
  netProfit: number;
  /** "accounts" mode: own AVS and own pension contributions are booked as expenses in netProfit. */
  ownContributionsBooked: boolean;
  /** Purchase price (excl. VAT) of a business car also used privately → private share 0.9%/month. */
  carPurchasePrice: number;
  carMonths: number;
  /** Household energy/phone/TV costs were booked as business expenses → private share (Vaud flat rate). */
  householdCostsBooked: boolean;
  /** Other private shares or withdrawals in kind not already credited to the accounts. */
  otherPrivateShare: number;
  /** Own AVS/AI/APG contributions for 2025 (from the caisse's decision). 0 = use the estimate. */
  avsContributions: number;
  /** Own 2nd-pillar contributions (excluding buy-backs, which go under pension buy-backs). */
  ownPension: number;
  /** Own daily-allowance (loss-of-earnings) insurance premiums. */
  dailyAllowanceInsurance: number;
  /** Equity invested in the business on 31.12.2025 (business assets minus business debts). */
  equityCapital: number;
  /** Business losses of the 7 previous years not yet offset. */
  lossCarryForward: number;
}

export interface Employment {
  id: string;
  employer: string;
  /** Salary certificate box 11 (salaire net). */
  netSalary: number;
  /** Salary certificate box 10.2 (LPP buy-backs deducted from salary). */
  lppBuybackOnCertificate: number;
  /** Secondary job (< 30% of normal hours) → code 105 instead of 100. */
  secondary: boolean;
  /** Box F ticked: employer provides free transport to work. */
  freeTransport: boolean;
  /** Box G ticked: canteen / meal subsidy. */
  canteen: boolean;
}

export interface Person {
  firstName: string;
  confession: Confession;
  employments: Employment[];
  /** Code 110: family/maternity allowances paid directly by a compensation fund, tips. */
  allowancesNotFromEmployer: number;
  /** Affiliated to a pension fund (2nd pillar / LPP). Sets the 3a cap. */
  hasPensionFund: boolean;
  /** Code 310: amount paid into pillar 3a during the year. */
  pillar3a: number;
  /** Code 320: LPP buy-backs NOT already deducted on the salary certificate. */
  lppBuyback: number;
  /** Code 340: loss-of-earnings insurance premiums withheld from salary. */
  lossOfEarningsPremiums: number;

  commuteMode: CommuteMode;
  /** One-way distance home → work in km (shortest route). */
  commuteKm: number;
  /** Days actually commuted (240 = full year). Reduce for home office, part-time, unemployment. */
  commuteDays: number;
  /** Actual public-transport cost, if higher than the flat-rate table (needs proof). */
  publicTransportActualCost: number;
  /** Why a private vehicle is necessary (required for car / motorbike). */
  vehicleJustification: string;

  meals: MealsMode;
  /** Code 160: 0 = use the flat rate (3%, min 2,000, max 4,000); otherwise actual costs. */
  otherProfessionalExpensesActual: number;
  /** Code 618: continuing education / retraining costs paid personally. */
  trainingCosts: number;

  /** Self-employed activity, if any. */
  business: Business | null;

  /** Code 200: unemployment / APG not included on a salary certificate. */
  unemploymentAndApg: number;
  /** Codes 210/220: daily allowances from health/accident/disability insurance. */
  dailyAllowances: number;

  /** Codes 240–270: pensions. */
  pensionAvsAi: number;
  pensionLpp: number;
  pension3a: number;
  pensionOther: number;
}

export interface Child {
  id: string;
  firstName: string;
  birthYear: number;
  /** Adult child still in apprenticeship or studies, fully supported. */
  inEducation: boolean;
  /** Code 670: third-party childcare costs paid during work/training hours (child under 14). */
  childcareCosts: number;
}

export interface BankAccount {
  id: string;
  bank: string;
  /** Balance on 31.12.2025 (CHF). */
  balance: number;
  /** Gross interest 2025 (CHF). */
  interest: number;
  /** True for Swiss accounts where 35% withholding tax was deducted (interest > CHF 200). */
  withholdingTax: boolean;
}

export interface SecurityHolding {
  id: string;
  /** Bank issuing the tax statement, or the security name. */
  description: string;
  /** Tax value on 31.12.2025 (CHF). */
  taxValue: number;
  /** Gross income (dividends/coupons) 2025 subject to Swiss withholding tax (column A). */
  incomeWithWithholding: number;
  /** Gross income not subject to Swiss withholding tax (column B), e.g. foreign dividends. */
  incomeWithoutWithholding: number;
  /** Managed by a third party (bank/broker) → eligible for the 1.5‰ admin-fee flat rate. */
  managedByThirdParty: boolean;
}

export interface Property {
  id: string;
  description: string;
  /** Commune where the property is located (for the rental-value coefficient). */
  commune: string;
  /** Living area in m² (see rules: wall to wall, excludes balconies, cellars, garages). */
  surfaceM2: number;
  /** Year of construction or last heavy renovation. */
  constructionYear: number;
  /** Detached villa (villa individuelle). If false (flat/semi-detached), coefficient 0.9 applies. */
  detachedVilla: boolean;
  /** Your ownership share, e.g. 1 or 0.5. Spouses' shares are added together. */
  ownershipShare: number;
  /** Months during 2025 the property was reserved for your own use (0–12). */
  monthsOwnUse: number;
  /** Main residence (relevant for the housing deduction, code 660). */
  mainResidence: boolean;
  /** Official tax estimate (estimation fiscale) — for wealth tax. */
  taxEstimate: number;
  /** Gross rents received from tenants in 2025. */
  rentalIncome: number;
  /** 0 = use the flat rate; otherwise actual deductible maintenance costs for 2025. */
  maintenanceActual: number;
  /**
   * Vaud: optional override of the computed cantonal (65%) rental value.
   * Zurich: the Eigenmietwert from the property valuation (required — ZH doesn't publish a formula users can apply).
   */
  rentalValueOverride: number;
}

export interface Debt {
  id: string;
  creditor: string;
  /** Balance on 31.12.2025. */
  balance: number;
  /** Interest paid in 2025 (mortgage, private loans). */
  interest: number;
}

export interface TaxData {
  schemaVersion: 1;
  taxYear: 2025;
  canton: Canton;
  commune: string;
  /** Communal tax rate in % of the cantonal base tax (e.g. 78.5 for Lausanne, 119 for the city of Zurich, without church tax). */
  communalRate: number;
  civilStatus: CivilStatus;
  /** Single/divorced/widowed parent running an independent household alone with the child(ren). */
  singleParentHousehold: boolean;
  persons: Person[]; // 1 entry, or 2 when married
  children: Child[];

  // Household-level income
  otherIncome: number; // code 195
  alimonyReceived: number; // code 280
  alimonyPaid: number; // code 630

  // Insurance (code 300)
  healthPremiums: number; // health + accident + life insurance premiums, whole household
  premiumSubsidies: number; // subsides LAMal received

  // Wealth
  bankAccounts: BankAccount[];
  securities: SecurityHolding[];
  cryptoAndCash: number; // code 420, value on 31.12
  vehiclesAndValuables: number; // code 430
  lifeInsuranceSurrenderValue: number; // code 435
  securitiesAdminFeesActual: number; // code 490 — 0 = flat rate
  properties: Property[];
  debts: Debt[];

  // Deductions
  /** Rent paid for the main residence in 2025, without charges (for code 660). */
  rentPaidNet: number;
  /** Childcare is also deductible when a parent is in training or unable to work, not only when both work (IG p. 44). */
  childcareTrainingOrIncapacity: boolean;
  dependents: number; // code 680: other supported persons unable to support themselves
  medicalCosts: number; // code 710: out-of-pocket, not reimbursed
  disabilityCosts: number; // code 710: recognised disability costs (no franchise)
  donations: number; // code 720
  politicalDonations: number; // code 620
  avsNonEarner: number; // code 640: AVS contributions paid as a non-earner

  // Interview state
  topics: Partial<Record<Topic, boolean>>;
  notes: string;
  checklistDone: Record<string, boolean>;
}

/** One instruction in the filling guide: what to enter where. */
export interface GuideLine {
  code: string; // VaudTax code ("140") or Zurich Ziffer ("11.1")
  title: string; // English explanation
  officialLabel: string; // Official label in the return (French for VD, German for ZH)
  path: string[]; // Navigation in VaudTax / ZHprivateTax (section → item)
  icc: number; // Amount for cantonal/communal tax
  ifd?: number; // Federal amount when it differs
  kind: "income" | "deduction" | "wealth" | "debt" | "info";
  person?: string;
  explanation: string; // How the number was derived
  source: string; // Document + page
  warnings?: string[];
}

export interface EstimateRow {
  label: string;
  sub?: string;
  value: number;
  format?: "chf" | "chf2" | "number" | "percent";
  strong?: boolean;
}

export interface EstimateSection {
  title: string;
  rows: EstimateRow[];
}

export interface TaxEstimate {
  /** Cantonal + communal (+ church, personal) tax. */
  cantonTotal: number;
  cantonSections: EstimateSection[];
  taxableIncome: number;
  taxableWealth: number;
  ifd: {
    taxableIncome: number;
    tax: number;
    childRebate: number;
    total: number;
  };
  total: number;
}
