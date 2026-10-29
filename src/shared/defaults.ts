import type { BankAccount, Business, BusinessAsset, Child, Debt, Employment, Person, Property, SecurityHolding, TaxData } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const newEmployment = (): Employment => ({
  id: uid(),
  employer: "",
  netSalary: 0,
  lppBuybackOnCertificate: 0,
  secondary: false,
  freeTransport: false,
  canteen: false,
});

export const newPerson = (): Person => ({
  firstName: "",
  confession: "none",
  employments: [],
  allowancesNotFromEmployer: 0,
  hasPensionFund: true,
  pillar3a: 0,
  lppBuyback: 0,
  lossOfEarningsPremiums: 0,
  commuteMode: "none",
  commuteKm: 0,
  commuteDays: 240,
  publicTransportActualCost: 0,
  vehicleJustification: "",
  meals: "none",
  otherProfessionalExpensesActual: 0,
  trainingCosts: 0,
  business: null,
  unemploymentAndApg: 0,
  dailyAllowances: 0,
  pensionAvsAi: 0,
  pensionLpp: 0,
  pension3a: 0,
  pensionOther: 0,
});

export const newBusiness = (): Business => ({
  name: "",
  activity: "",
  mode: "records",
  revenue: 0,
  expenses: {},
  assets: [],
  netProfit: 0,
  ownContributionsBooked: true,
  carPurchasePrice: 0,
  carMonths: 12,
  householdCostsBooked: false,
  otherPrivateShare: 0,
  avsContributions: 0,
  ownPension: 0,
  dailyAllowanceInsurance: 0,
  equityCapital: 0,
  lossCarryForward: 0,
});
export const newAsset = (): BusinessAsset => ({ id: uid(), description: "", category: "it", bookValueStart: 0, additions: 0, depreciation: 0 });

export const newChild = (): Child => ({ id: uid(), firstName: "", birthYear: 2015, inEducation: false, childcareCosts: 0 });
export const newAccount = (): BankAccount => ({ id: uid(), bank: "", balance: 0, interest: 0, withholdingTax: false });
export const newSecurity = (): SecurityHolding => ({
  id: uid(),
  description: "",
  taxValue: 0,
  incomeWithWithholding: 0,
  incomeWithoutWithholding: 0,
  managedByThirdParty: true,
});
export const newProperty = (commune = ""): Property => ({
  id: uid(),
  description: "",
  commune,
  surfaceM2: 100,
  constructionYear: 2000,
  detachedVilla: false,
  ownershipShare: 1,
  monthsOwnUse: 12,
  mainResidence: true,
  taxEstimate: 0,
  rentalIncome: 0,
  maintenanceActual: 0,
  rentalValueOverride: 0,
});
export const newDebt = (): Debt => ({ id: uid(), creditor: "", balance: 0, interest: 0 });

export const emptyData = (): TaxData => ({
  schemaVersion: 1,
  taxYear: 2025,
  canton: "VD",
  commune: "Lausanne",
  communalRate: 78.5,
  civilStatus: "single",
  singleParentHousehold: false,
  persons: [newPerson()],
  children: [],
  otherIncome: 0,
  alimonyReceived: 0,
  alimonyPaid: 0,
  healthPremiums: 0,
  premiumSubsidies: 0,
  bankAccounts: [],
  securities: [],
  cryptoAndCash: 0,
  vehiclesAndValuables: 0,
  lifeInsuranceSurrenderValue: 0,
  securitiesAdminFeesActual: 0,
  properties: [],
  debts: [],
  rentPaidNet: 0,
  childcareTrainingOrIncapacity: false,
  dependents: 0,
  medicalCosts: 0,
  disabilityCosts: 0,
  donations: 0,
  politicalDonations: 0,
  avsNonEarner: 0,
  topics: { employment: true, renting: true },
  notes: "",
  checklistDone: {},
});

/** Fill missing fields (older exports, partial AI imports) with defaults. */
export function normalize(raw: unknown): TaxData {
  const base = emptyData();
  const d = { ...base, ...(raw as Partial<TaxData>) } as TaxData;
  d.persons = (d.persons?.length ? d.persons : base.persons).map((p) => {
    // Older files had a single "net result" field; turn it into an activity in "accounts" mode.
    const legacy = p as Person & { selfEmploymentNet?: number; selfEmployedPensionContributions?: number };
    let business = p.business ? { ...newBusiness(), ...p.business, assets: (p.business.assets ?? []).map((a) => ({ ...newAsset(), ...a })) } : null;
    if (!business && legacy.selfEmploymentNet)
      business = { ...newBusiness(), mode: "accounts", netProfit: legacy.selfEmploymentNet, ownContributionsBooked: false, ownPension: legacy.selfEmployedPensionContributions ?? 0 };
    delete legacy.selfEmploymentNet;
    delete legacy.selfEmployedPensionContributions;
    return { ...newPerson(), ...p, business, employments: (p.employments ?? []).map((e) => ({ ...newEmployment(), ...e })) };
  });
  d.children = (d.children ?? []).map((c) => ({ ...newChild(), ...c }));
  d.bankAccounts = (d.bankAccounts ?? []).map((a) => ({ ...newAccount(), ...a }));
  d.securities = (d.securities ?? []).map((s) => ({ ...newSecurity(), ...s }));
  d.properties = (d.properties ?? []).map((p) => ({ ...newProperty(), ...p }));
  d.debts = (d.debts ?? []).map((x) => ({ ...newDebt(), ...x }));
  d.checklistDone = d.checklistDone ?? {};
  d.topics = d.topics ?? base.topics;
  return d;
}
