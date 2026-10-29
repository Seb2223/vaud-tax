import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { compute } from "../shared/calc";
import { normalize } from "../shared/defaults";
import { R } from "../shared/rules2025";
import { ZH } from "../shared/rulesZh2025";
import { VAUDTAX } from "../shared/vdLocations";
import { ZHTAX } from "../shared/zhLocations";
import {
  type ChatMessage,
  type DeductionSuggestion,
  DeductionSuggestionsSchema,
  type Extraction,
  ExtractionSchema,
  type Review,
  ReviewSchema,
} from "../shared/aiSchemas";
import type { Canton, TaxData } from "../shared/types";
import { referenceText } from "./reference";

export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

// Created on first use so the site still starts (without AI) when no key is set.
// Reads ANTHROPIC_API_KEY from the environment.
let _client: Anthropic | null = null;
const api = () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiError("The server has no ANTHROPIC_API_KEY configured.", 503);
  return (_client ??= new Anthropic());
};

// Opt-in server-side fallback: if the model declines for policy reasons, the
// API retries on Anthropic's recommended fallback model inside the same call.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const ROLES: Record<Canton, string> = {
  VD: `You help a household in the canton of Vaud, Switzerland, prepare their 2025 tax return (déclaration d'impôt 2025, filed in 2026) using the VaudTax online service.

How to work:
- Write in English, but quote official VaudTax section names, labels and codes in French exactly as they appear in the official documents.
- Base every rule, limit and amount on the official 2025 documents below, and cite them as "IG p. N" (Instructions générales) or "IC p. N" (propriété immobilière). If the documents don't cover a question, say so plainly and suggest the ACI call centre (021 316 00 00) instead of guessing.
- You never fill in the return. You explain where to go in VaudTax (section → item → code) and what to enter.
- Each request includes the household's data and the app's deterministic calculation for each code. Treat those calculated amounts as authoritative; if you think an input is wrong or missing, say which one and why.
- The cantonal/communal tax (ICC) and the federal tax (IFD) have different limits; mention the federal figure when it differs.`,
  ZH: `You help a household in the canton of Zurich, Switzerland, prepare their 2025 tax return (Steuererklärung 2025, filed in 2026) using ZHprivateTax.

How to work:
- Write in English, but quote official form names, labels and Ziffern in German exactly as they appear in the official documents.
- Base every rule, limit and amount on the official 2025 Wegleitung below and cite it as "Wegleitung p. N". If it doesn't cover a question, say so plainly and suggest the municipal tax office (Gemeindesteueramt) instead of guessing.
- You never fill in the return. You explain which form and Ziffer to use (e.g. Formular «Berufsauslagen» → Ziffer 11.1) and what to enter.
- Each request includes the household's data and the app's deterministic calculation for each Ziffer. Treat those calculated amounts as authoritative; if you think an input is wrong or missing, say which one and why.
- The Staatssteuer and the direkte Bundessteuer have different limits; mention the federal figure when it differs.`,
};

function systemBlocks(canton: Canton, extra: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: `${ROLES[canton]}\n\n<official_documents>\n${referenceText(canton)}\n</official_documents>`, cache_control: { type: "ephemeral" } },
    { type: "text", text: extra },
  ];
}

/** Household data plus the app's calculated lines, given to the model as context. */
function householdContext(raw: unknown): string {
  const data = normalize(raw);
  const result = compute(data);
  const lines = result.lines.map((l) => ({
    code: l.code,
    title: l.title,
    person: l.person,
    cantonal: l.icc,
    federal: l.ifd,
    explanation: l.explanation,
    warnings: l.warnings,
  }));
  return `<household_data>\n${JSON.stringify(data)}\n</household_data>\n<calculated_codes>\n${JSON.stringify(lines)}\n</calculated_codes>\n<estimate>\n${JSON.stringify(result.estimate)}\n</estimate>\n<notes>\n${result.notes.join("\n")}\n</notes>`;
}

function checkStop(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === "refusal") throw new AiError("The model declined this request. Try rephrasing it.", 422);
  if (msg.stop_reason === "max_tokens") throw new AiError("The answer was cut off (too long). Try a smaller document or a narrower question.", 502);
}

function wrapApiError(err: unknown): never {
  if (err instanceof AiError) throw err;
  if (err instanceof Anthropic.AuthenticationError) throw new AiError("The server's Anthropic API key is missing or invalid.", 500);
  if (err instanceof Anthropic.RateLimitError) throw new AiError("Rate limited by the Anthropic API — wait a minute and retry.", 429);
  if (err instanceof Anthropic.BadRequestError) throw new AiError(`The API rejected the request: ${err.message}`, 400);
  if (err instanceof Anthropic.APIError) throw new AiError(`Anthropic API error ${err.status ?? ""}: ${err.message}`, 502);
  if (err instanceof Anthropic.APIConnectionError) throw new AiError("Could not reach the Anthropic API.", 502);
  throw err;
}

// ---------------------------------------------------------------------------
// Document reading

const EXTRACT_PROMPT = `Read this Swiss tax document and extract every amount relevant to a 2025 Swiss tax return (Vaud or Zurich).

Notes on common documents:
- Salary certificate (certificat de salaire / Lohnausweis): box 8 = gross salary, box 10.1 = ordinary pension contributions, box 10.2 = pension buy-backs, box 11 = net salary (the amount declared under code 100). Box F ticked = free transport to work; box G ticked = canteen or meal subsidy.
- Pillar 3a certificates: the amount paid in during the year.
- Bank statements: balance on 31 December and gross interest; note if 35% withholding tax was deducted.
- Securities tax statements (relevé fiscal): total tax value, income subject to Swiss withholding tax (column A) and other income (column B).
- Health insurance statements: total premiums for the year per person (basic + supplementary), and any subsidies (subsides).

Only report amounts that are actually printed on the document; never compute or guess missing ones. Put anything unclear in "warnings".`;

export async function extractDocument(file: { data: string; mediaType: string; name: string }, hint: string): Promise<Extraction> {
  const source: Anthropic.Beta.BetaContentBlockParam =
    file.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data }, title: file.name }
      : {
          type: "image",
          source: { type: "base64", media_type: file.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: file.data },
        };
  try {
    const msg = await api().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "high", format: zodOutputFormat(ExtractionSchema) },
      messages: [{ role: "user", content: [source, { type: "text", text: EXTRACT_PROMPT + (hint ? `\n\nThe user says this document is: ${hint}` : "") }] }],
    });
    checkStop(msg);
    if (!msg.parsed_output) throw new AiError("Could not read structured data from the document.");
    return msg.parsed_output;
  } catch (err) {
    wrapApiError(err);
  }
}

// ---------------------------------------------------------------------------
// Deduction finder

/** Legal maximums for codes with a fixed cap, used to check the AI's suggestions. */
function fixedCaps(d: TaxData): Record<string, number> {
  const married = d.civilStatus === "married";
  const adults = married ? 2 : 1;
  const pillar3a = d.persons
    .slice(0, adults)
    .reduce((s, p) => s + (p.hasPensionFund ? R.pillar3a.withPensionFund : R.pillar3a.withoutPensionFundMax), 0);
  const kids = Math.max(1, d.children.length);
  if (d.canton === "ZH")
    return {
      "14": pillar3a,
      "16.2": ZH.training * adults,
      "16.5": married ? ZH.politicalParties.married : ZH.politicalParties.other,
      "16.6": ZH.childcare * kids,
      "17": ZH.dualIncome,
    };
  return {
    "150": R.meals.outside * adults,
    "160": R.otherProfessional.max * adults,
    "165": R.secondaryJob.max * adults,
    "235": R.dualIncomeIcc,
    "310": pillar3a,
    "618": R.training.icc * adults,
    "620": R.politicalParties.icc,
    "660": R.housing.maxDeduction,
    "670": R.childcare.icc * kids,
  };
}

export async function findDeductions(raw: unknown): Promise<DeductionSuggestion[]> {
  const data = normalize(raw);
  try {
    const msg = await api().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      system: systemBlocks(
        data.canton,
        `Task: find deductions this household may be missing or under-claiming for 2025. Only suggest deductions that the official documents support and that plausibly apply given their data. Skip anything already fully claimed in <calculated_codes>. For each suggestion give the ${data.canton === "ZH" ? "Ziffer (e.g. 16.2)" : "VaudTax code (e.g. 618)"}, a realistic CHF estimate if possible (respecting the legal maximums), the rule with its page, and what the user must confirm. Also flag cases where the flat rate vs actual costs choice could be improved. Return an empty list if nothing is missing.`,
      ),
      output_config: { effort: "high", format: zodOutputFormat(DeductionSuggestionsSchema) },
      messages: [{ role: "user", content: householdContext(data) }],
    });
    checkStop(msg);
    const caps = fixedCaps(data);
    return (msg.parsed_output?.suggestions ?? []).map((s) => {
      const zh = data.canton === "ZH";
      // VD codes are plain numbers ("618"); ZH Ziffern have a dot ("16.2").
      const code = zh ? (s.code.match(/\d+(\.\d+)?/)?.[0] ?? s.code.trim()) : s.code.trim().split(/[^0-9]/)[0];
      const known = Object.keys(zh ? ZHTAX : VAUDTAX).map((k) => k.split("-")[0]);
      const validCode = known.includes(code) || (zh && known.includes(code.split(".")[0]));
      let validation: string | undefined;
      let estimatedAmountChf = s.estimatedAmountChf;
      if (!validCode) validation = `"${s.code}" is not a ${zh ? "Ziffer" : "VaudTax code"} known to this app — double-check before using it.`;
      else if (estimatedAmountChf !== null && caps[code] !== undefined && estimatedAmountChf > caps[code]) {
        validation = `Estimate reduced from CHF ${estimatedAmountChf.toLocaleString("de-CH")} to the legal maximum of CHF ${caps[code].toLocaleString("de-CH")}.`;
        estimatedAmountChf = caps[code];
      }
      return { ...s, code, estimatedAmountChf, validCode, validation };
    });
  } catch (err) {
    wrapApiError(err);
  }
}

// ---------------------------------------------------------------------------
// Final review

export async function reviewReturn(raw: unknown): Promise<Review> {
  const data = normalize(raw);
  try {
    const msg = await api().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      system: systemBlocks(
        data.canton,
        `Task: review this household's data before they file. Look for inconsistencies, implausible values, missing mandatory items (premiums without subsidies field, children without childcare details, accounts without interest, property without tax estimate, etc.), amounts over legal caps, and things the official documents say must be attached. Use severity "error" for things that would be wrong on the return, "warning" for likely problems, "tip" for optimisations. Be specific: name the field and the code.`,
      ),
      output_config: { effort: "high", format: zodOutputFormat(ReviewSchema) },
      messages: [{ role: "user", content: householdContext(data) }],
    });
    checkStop(msg);
    if (!msg.parsed_output) throw new AiError("The review came back empty.");
    return msg.parsed_output;
  } catch (err) {
    wrapApiError(err);
  }
}

// ---------------------------------------------------------------------------
// Q&A chat (streamed)

/** Last 20 non-empty messages, always starting on a question (the API requires a user turn first). */
export function chatWindow(history: ChatMessage[], size = 20): ChatMessage[] {
  const recent = history.filter((m) => m.content.trim()).slice(-size);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent;
}

export async function* chat(raw: unknown, history: ChatMessage[]): AsyncGenerator<string> {
  const data = normalize(raw);
  const messages: Anthropic.Beta.BetaMessageParam[] = chatWindow(history).map((m) => ({ role: m.role, content: m.content }));
  if (!messages.length) throw new AiError("The conversation must start with a question.", 400);
  messages[0] = {
    role: "user",
    content: [
      { type: "text", text: householdContext(data) },
      { type: "text", text: messages[0].content as string },
    ],
  };

  try {
    const stream = api().beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      ...FALLBACK,
      system: systemBlocks(
        data.canton,
        `Task: answer the user's questions about their return. Be concise and concrete: name the section or form, the item and the code/Ziffer, and the amount from <calculated_codes> when relevant. Use short paragraphs or bullet points.`,
      ),
      output_config: { effort: "medium" },
      messages,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "\n\n_(The model declined to continue this answer.)_";
  } catch (err) {
    wrapApiError(err);
  }
}
