// Turns a confirmed AI document reading into changes to the household data.
// The user reviews (and can edit) every value before this runs.
import type { Extraction } from "./aiSchemas";
import { newAccount, newDebt, newEmployment, newSecurity } from "./defaults";
import type { TaxData } from "./types";

export interface ApplyTarget {
  personIndex: number;
  childId?: string;
  propertyId?: string;
}

export type FieldValues = Partial<Record<Extraction["fields"][number]["key"], number>>;

/** Sums rows that share a key (e.g. one premium line per family member). `rows` holds user-edited values by row index. */
export function valuesOf(x: Extraction, rows: number[] = x.fields.map((f) => f.value)): FieldValues {
  const v: FieldValues = {};
  x.fields.forEach((f, i) => (v[f.key] = (v[f.key] ?? 0) + (rows[i] ?? f.value)));
  return v;
}

/** Human-readable description of what applying will do (shown before the user confirms). */
export function describeApply(x: Extraction): string {
  switch (x.documentType) {
    case "salary_certificate":
      return "Adds an employment (code 100/105) with the net salary from box 11.";
    case "pillar3a_certificate":
      return "Adds to the person's pillar 3a contributions (code 310).";
    case "lpp_buyback_certificate":
      return "Adds to the person's pension-fund buy-backs (code 320).";
    case "bank_statement":
      return "Adds a bank account with balance and interest (code 410).";
    case "securities_tax_statement":
      return "Adds a securities holding / tax statement (code 410).";
    case "health_insurance_premiums":
      return "Adds these premiums to the household total (code 300).";
    case "premium_subsidy_decision":
      return "Adds these subsidies to the household total (code 300).";
    case "childcare_invoice":
      return "Adds to the chosen child's childcare costs (code 670).";
    case "mortgage_or_loan_statement":
      return "Adds a debt with its interest (codes 610/615).";
    case "property_tax_estimate":
      return "Sets the chosen property's tax estimate (wealth).";
    case "pension_certificate":
      return "Sets the person's pension amounts (codes 240/250).";
    case "unemployment_or_daily_allowance":
      return "Adds to the person's unemployment / daily allowances (code 200/210).";
    case "donation_receipt":
      return "Adds to donations (code 720).";
    case "medical_invoice":
      return "Adds to out-of-pocket medical costs (code 710).";
    case "training_invoice":
      return "Adds to the person's training costs (code 618).";
    default:
      return "Not applied automatically — enter the relevant amounts by hand.";
  }
}

export function applyExtraction(d: TaxData, x: Extraction, v: FieldValues, t: ApplyTarget): void {
  const p = d.persons[t.personIndex] ?? d.persons[0];
  const n = (k: keyof FieldValues) => v[k] ?? 0;
  switch (x.documentType) {
    case "salary_certificate":
      p.employments.push({
        ...newEmployment(),
        employer: x.issuer,
        netSalary: n("net_salary_box11"),
        lppBuybackOnCertificate: n("lpp_buyback_box10_2"),
        freeTransport: x.freeTransportBoxF ?? false,
        canteen: x.canteenBoxG ?? false,
      });
      break;
    // Added, not replaced: people often have several 3a accounts.
    case "pillar3a_certificate":
      p.pillar3a += n("pillar3a_paid");
      break;
    case "lpp_buyback_certificate":
      p.lppBuyback += n("lpp_buyback_paid");
      break;
    case "bank_statement":
      d.bankAccounts.push({
        ...newAccount(),
        bank: x.issuer,
        balance: n("account_balance_31_12"),
        interest: n("account_interest_gross"),
        withholdingTax: n("account_interest_gross") > 200,
      });
      break;
    case "securities_tax_statement":
      d.securities.push({
        ...newSecurity(),
        description: x.issuer,
        taxValue: n("securities_tax_value"),
        incomeWithWithholding: n("income_with_swiss_withholding"),
        incomeWithoutWithholding: n("income_without_swiss_withholding"),
      });
      break;
    case "health_insurance_premiums":
      d.healthPremiums += n("health_premiums_total");
      d.premiumSubsidies += n("premium_subsidies");
      break;
    case "premium_subsidy_decision":
      d.premiumSubsidies += n("premium_subsidies");
      break;
    case "childcare_invoice": {
      const c = d.children.find((c) => c.id === t.childId) ?? d.children[0];
      if (c) c.childcareCosts += n("childcare_paid");
      break;
    }
    case "mortgage_or_loan_statement":
      d.debts.push({ ...newDebt(), creditor: x.issuer, balance: n("debt_balance_31_12"), interest: n("interest_paid") });
      break;
    case "property_tax_estimate": {
      const prop = d.properties.find((q) => q.id === t.propertyId) ?? d.properties[0];
      if (prop) prop.taxEstimate = n("property_tax_estimate");
      break;
    }
    case "pension_certificate":
      if (v.pension_avs_ai !== undefined) p.pensionAvsAi = n("pension_avs_ai");
      if (v.pension_lpp !== undefined) p.pensionLpp = n("pension_lpp");
      break;
    case "unemployment_or_daily_allowance":
      p.unemploymentAndApg += n("unemployment_or_allowances");
      break;
    case "donation_receipt":
      d.donations += n("donation_amount");
      break;
    case "medical_invoice":
      d.medicalCosts += n("medical_costs_out_of_pocket");
      break;
    case "training_invoice":
      p.trainingCosts += n("training_costs");
      break;
  }
}

export const needsChild = (x: Extraction) => x.documentType === "childcare_invoice";
export const needsProperty = (x: Extraction) => x.documentType === "property_tax_estimate";
export const needsPerson = (x: Extraction) =>
  ["salary_certificate", "pillar3a_certificate", "lpp_buyback_certificate", "pension_certificate", "unemployment_or_daily_allowance", "training_invoice"].includes(
    x.documentType,
  );
