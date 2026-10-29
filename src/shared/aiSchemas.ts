// Structured-output schemas for the AI features. The server passes these to
// the Claude API (structured outputs) and the browser uses the inferred types.
import { z } from "zod";

export const DOCUMENT_TYPES = [
  "salary_certificate",
  "pillar3a_certificate",
  "lpp_buyback_certificate",
  "bank_statement",
  "securities_tax_statement",
  "health_insurance_premiums",
  "premium_subsidy_decision",
  "childcare_invoice",
  "mortgage_or_loan_statement",
  "property_tax_estimate",
  "pension_certificate",
  "unemployment_or_daily_allowance",
  "donation_receipt",
  "medical_invoice",
  "training_invoice",
  "other",
] as const;

export const FIELD_KEYS = [
  "net_salary_box11",
  "gross_salary_box8",
  "lpp_contributions_box10_1",
  "lpp_buyback_box10_2",
  "pillar3a_paid",
  "lpp_buyback_paid",
  "account_balance_31_12",
  "account_interest_gross",
  "securities_tax_value",
  "income_with_swiss_withholding",
  "income_without_swiss_withholding",
  "health_premiums_total",
  "premium_subsidies",
  "childcare_paid",
  "interest_paid",
  "debt_balance_31_12",
  "property_tax_estimate",
  "pension_avs_ai",
  "pension_lpp",
  "unemployment_or_allowances",
  "donation_amount",
  "medical_costs_out_of_pocket",
  "training_costs",
  "other_amount",
] as const;

export const ExtractionSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  issuer: z.string().describe("Employer, bank, insurer or organisation that issued the document"),
  personName: z.string().describe("Name of the person the document is about, empty if none"),
  taxYear: z.number().int().nullable().describe("Year the amounts refer to"),
  fields: z
    .array(
      z.object({
        key: z.enum(FIELD_KEYS),
        label: z.string().describe("Short English label"),
        value: z.number().describe("Amount in CHF, as printed (no sign tricks)"),
        sourceText: z.string().describe("The exact text/box on the document the value comes from"),
      }),
    )
    .describe("Every tax-relevant amount found"),
  freeTransportBoxF: z.boolean().nullable().describe("Salary certificate box F ticked (free transport to work)"),
  canteenBoxG: z.boolean().nullable().describe("Salary certificate box G ticked (canteen / meal subsidy)"),
  warnings: z.array(z.string()).describe("Anything unclear, unreadable, or inconsistent"),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const DeductionSuggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      code: z.string().describe("VaudTax code, e.g. '618'"),
      title: z.string(),
      estimatedAmountChf: z.number().nullable(),
      reasoning: z.string().describe("Why this applies to this household"),
      officialRule: z.string().describe("The rule from the official instructions, with page number"),
      confidence: z.enum(["high", "medium", "low"]),
      questionForUser: z.string().nullable().describe("What the user must confirm before claiming it"),
    }),
  ),
});
export type DeductionSuggestions = z.infer<typeof DeductionSuggestionsSchema>;
export type DeductionSuggestion = DeductionSuggestions["suggestions"][number] & { validation?: string; validCode?: boolean };

export const ReviewSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["error", "warning", "tip"]),
      code: z.string().nullable(),
      message: z.string(),
      suggestion: z.string(),
    }),
  ),
});
export type Review = z.infer<typeof ReviewSchema>;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
