import { childrenWithPart } from "./household";
import type { Canton, TaxData } from "./types";

export interface ChecklistItem {
  id: string;
  title: string;
  why: string;
  mandatory: boolean; // must be attached to the return
}

/** Local document names and where they're used, per canton. */
const TERMS: Record<Canton, Record<string, [name: string, where: string]>> = {
  VD: {
    access: ["Tax return envelope / VaudTax access codes", "Your taxpayer number and VaudTax login codes."],
    salary: ["salary certificate (certificat de salaire)", "Codes 100/105"],
    pillar3a: ["Pillar 3a certificate (attestation 3e pilier A)", "Code 310"],
    lpp: ["Pension fund buy-back certificate", "Code 320"],
    premiums: ["Health insurance premium statement 2025 (attestation de primes) for every family member", "Code 300 — premiums and subsidies must both be declared."],
    subsidies: ["Premium subsidy decision (subsides LAMal)", "Code 300"],
    account: ["Bank statement on 31.12.2025 with interest", "Code 410"],
    securities: ["Tax statement (relevé fiscal) on 31.12.2025", "Code 410"],
    property: ["Property tax estimate (estimation fiscale) and living area", "Annexe 07 / code 500"],
    maintenance: ["Maintenance invoices 2025", "Code 540"],
    debt: ["Interest & balance statement 2025", "Codes 610/615 (creditor name and address required)"],
    childcare: ["Childcare invoices (crèche, day-care, maman de jour)", "Code 670"],
    medical: ["Medical / dental invoices and insurer reimbursement statements", "Code 710"],
    donations: ["Donation receipts", "Code 720"],
    training: ["Training / course invoices", "Code 618"],
  },
  ZH: {
    access: ["Tax return letter with ZHprivateTax access codes", "Your register number and login codes."],
    salary: ["salary certificate (Lohnausweis)", "Ziffer 1.1 / 1.2"],
    pillar3a: ["Pillar 3a certificate (Bescheinigung 3. Säule a)", "Ziffer 14"],
    lpp: ["Pension fund buy-back certificate (Einkaufsbescheinigung)", "Ziffer 16.1"],
    premiums: ["Health insurance premium statement 2025 (Prämienbestätigung) for every family member", "Formular «Versicherungsprämien», Ziffer 15."],
    subsidies: ["Premium reduction decision (Prämienverbilligung / IPV)", "Ziffer 15"],
    account: ["Bank statement on 31.12.2025 with interest (Zinsausweis)", "Wertschriftenverzeichnis"],
    securities: ["Bank tax statement (Steuerausweis / Steuerverzeichnis) on 31.12.2025", "Wertschriftenverzeichnis"],
    property: ["Property valuation (Liegenschaftenbewertung: Eigenmietwert and Steuerwert)", "Liegenschaftenverzeichnis"],
    maintenance: ["Maintenance invoices 2025 (detailed list required for actual costs)", "Liegenschaftenverzeichnis"],
    debt: ["Interest & balance statement 2025", "Schuldenverzeichnis (creditor name and address required)"],
    childcare: ["Childcare invoices (Kita, Hort, Tagesfamilie)", "Ziffer 16.6"],
    medical: ["Medical / dental invoices and insurer reimbursement statements", "Hilfsblatt Krankheitskosten, Ziffer 22.1"],
    donations: ["Donation receipts", "Ziffer 22.2"],
    training: ["Training / course invoices", "Hilfsblatt Weiterbildung, Ziffer 16.2"],
  },
};

/** Documents to gather, derived from the household's answers. */
export function buildChecklist(d: TaxData): ChecklistItem[] {
  const t = TERMS[d.canton];
  const zh = d.canton === "ZH";
  const items: ChecklistItem[] = [];
  const add = (id: string, title: string, why: string, mandatory = false) => items.push({ id, title, why, mandatory });
  const persons = d.civilStatus === "married" ? d.persons.slice(0, 2) : d.persons.slice(0, 1);

  add("tax-form", t.access[0], t.access[1], true);

  persons.forEach((p, i) => {
    const who = p.firstName || `Person ${i + 1}`;
    for (const e of p.employments)
      add(`salary-${e.id}`, `${t.salary[0][0].toUpperCase()}${t.salary[0].slice(1)} – ${who}, ${e.employer || "employer"}`, `${t.salary[1]}. Mandatory for every employer.`, true);
    if (p.pillar3a > 0) add(`3a-${i}`, `${t.pillar3a[0]} – ${who}`, `${t.pillar3a[1]}. Mandatory.`, true);
    if (p.lppBuyback > 0) add(`lpp-${i}`, `${t.lpp[0]} – ${who}`, `${t.lpp[1]}.${zh ? " Must be attached." : " Mandatory above CHF 10,000."}`, zh || p.lppBuyback > 10000);
    if (p.commuteMode === "public" && p.publicTransportActualCost > 0)
      add(`pt-${i}`, `Public transport subscription receipts – ${who}`, zh ? "Commuting is deducted at actual cost." : "Only needed because you claim actual costs above the flat rate.");
    if (p.commuteMode === "car" || p.commuteMode === "motorbike")
      add(`vehicle-${i}`, `Reason for using a private vehicle – ${who}`, zh ? "Tick the reason on the Berufsauslagen form (doctor's note if health-related)." : "Code 140. Explain why public transport isn't reasonable.");
    if (p.otherProfessionalExpensesActual > 0) add(`pro-${i}`, `Receipts for actual professional expenses – ${who}`, "Only if you claim more than the flat rate.");
    if (p.trainingCosts > 0) add(`training-${i}`, `${t.training[0]} – ${who}`, `${t.training[1]}.`);
    if (p.business) {
      const b = p.business;
      const name = b.name || b.activity || "activity";
      if (zh) add(`self-${i}`, `Hilfsblatt A and ${b.mode === "accounts" ? "signed annual accounts with private/equity account statements" : "statements of assets & liabilities, receipts & expenses, private withdrawals"} – ${who}, ${name}`, "Ziffer 2. Mandatory.", true);
      else add(`self-${i}`, `${b.mode === "accounts" ? "Signed balance sheet & income statement + Questionnaire 21021-a" : "Statement of receipts, expenses, assets & private withdrawals + Questionnaire 21021-b"} – ${who}, ${name}`, "Codes 180–190. Mandatory.", true);
      add(`avs-dec-${i}`, `${zh ? "AHV contribution decision (Beitragsverfügung) and payments 2025" : "AVS contribution decision (décision de cotisations) and payments 2025"} – ${who}`, "To use the real amount instead of the estimate.");
      if (b.ownPension > 0) add(`biz-lpp-${i}`, `Pension fund certificate for your own contributions${zh ? "" : " (form 21 EDP)"} – ${who}`, zh ? "Ziffer 16.1." : "Code 330.", !zh);
      if (b.mode === "records" && b.assets.length) add(`assets-${i}`, `List of equipment with purchase year and price – ${who}`, "Required to claim depreciation.");
      if (b.carPurchasePrice > 0) add(`car-${i}`, `Purchase invoice of the business car – ${who}`, "Basis of the private-use share (0.9% per month).");
      add(`inv-${i}`, `Year-end inventories: stock, receivables, work in progress, suppliers – ${who}`, "Mandatory for all self-employed, also with simplified records.");
    }
    if (p.unemploymentAndApg) add(`ac-${i}`, `Unemployment / APG certificate – ${who}`, zh ? "Ziffer 3.3." : "Code 200.");
    if (p.dailyAllowances) add(`ij-${i}`, `Daily allowance certificate (insurance) – ${who}`, zh ? "Ziffer 3.4." : "Codes 210/220.");
    if (p.pensionAvsAi) add(`avs-${i}`, `AVS/AHV pension certificate – ${who}`, zh ? "Ziffer 3.1." : "Code 240.");
    if (p.pensionLpp || p.pension3a || p.pensionOther) add(`opens-${i}`, `Pension certificates – ${who}`, zh ? "Ziffer 3.2 (with the taxable percentage)." : "Codes 250–270.");
  });

  add("premiums", t.premiums[0], t.premiums[1]);
  if (d.premiumSubsidies > 0) add("subsidies", t.subsidies[0], `${t.subsidies[1]}.`);
  for (const a of d.bankAccounts) add(`acct-${a.id}`, `${t.account[0]} – ${a.bank || "account"}`, `${t.account[1]} (balance and interest).`, true);
  for (const s of d.securities) add(`sec-${s.id}`, `${t.securities[0]} – ${s.description || "securities"}`, `${t.securities[1]}. Mandatory.`, true);
  if (d.securities.some((s) => s.incomeWithoutWithholding > 0)) add("da1", "Foreign withholding tax details (form DA-1 / R-US 164 for US securities)", "To reclaim foreign withholding tax.");
  if (d.cryptoAndCash > 0) add("crypto", "Crypto / precious metals holdings on 31.12.2025", "Valued with the ESTV year-end price list.");
  if (d.lifeInsuranceSurrenderValue > 0) add("lifeins", "Life insurance surrender value certificate on 31.12.2025", "From your insurer.");
  for (const p of d.properties) {
    add(`prop-${p.id}`, `${t.property[0]} – ${p.description || p.commune}`, `${t.property[1]}.`);
    if (p.maintenanceActual > 0) add(`maint-${p.id}`, `${t.maintenance[0]} – ${p.description || p.commune}`, `${t.maintenance[1]}.`, zh);
  }
  for (const x of d.debts) add(`debt-${x.id}`, `${t.debt[0]} – ${x.creditor || "creditor"}`, `${t.debt[1]}.`);
  if (!zh && d.rentPaidNet > 0) add("lease", "Lease (bail) showing the net rent without charges", "Code 660 housing deduction.");
  if (d.children.some((c) => c.childcareCosts > 0)) add("childcare", t.childcare[0], `${t.childcare[1]}. Mandatory.`, true);
  if (childrenWithPart(d).some((c) => c.inEducation)) add("studies", "Proof of studies / apprenticeship for adult children", zh ? "Child deduction (Ziffer 24.1)." : "Family quotient (code 810).");
  if (d.alimonyPaid > 0 || d.alimonyReceived > 0) add("alimony", "Divorce/separation judgment or agreement and payment proofs", zh ? "Ziffern 5.1 / 13.1." : "Codes 280 / 630.");
  if (d.medicalCosts > 0 || d.disabilityCosts > 0) add("medical", t.medical[0], `${t.medical[1]}.`);
  if (d.donations > 0) add("donations", t.donations[0], `${t.donations[1]}.`);
  if (d.politicalDonations > 0) add("political", "Political party donation receipts", zh ? "Ziffer 16.5." : "Code 620.");
  return items;
}
