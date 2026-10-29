import { findCommuneInfo, TAX_YEAR } from "../../shared/calc";
import { newAccount, newDebt, newEmployment, newProperty, newSecurity } from "../../shared/defaults";
import { chf } from "../../shared/money";
import { publicTransportFlatRate, R } from "../../shared/rules2025";
import type { CommuteMode, MealsMode, Person, TaxData } from "../../shared/types";
import { BusinessForm } from "../components/BusinessForm";
import { Callout, Card, Grid, MoneyField, SelectField, TextField, Toggle } from "../components/Fields";
import type { Update } from "../store";

type Props = { data: TaxData; update: Update };

/** Code badge for a field: VaudTax code, or the matching Ziffer of the Zurich return. */
const ZH_ZIFFER: Record<string, string> = {
  "100": "1.1", "105": "1.2", "110": "3.4", "140": "11", "150": "11", "160": "11", "180": "2.1", "330": "16.1", "200": "3.3", "210": "3.4",
  "240": "3.1", "250": "3.2", "260": "3.2", "270": "3.2", "310": "14", "320": "16.1", "340": "15", "618": "16.2", "300": "15", "195": "5.4",
  "280": "5.1", "630": "13.1", "490": "16.3", "420": "30.2", "430": "30.4", "435": "30.3", "500": "6", "540": "6", "670": "16.6", "710": "22.1",
  "720": "22.2", "620": "16.5", "680": "24.2",
};
const codeFor = (d: TaxData, code: string) => (d.canton === "ZH" ? ZH_ZIFFER[code] : code);

function PersonCard({ data, update, i }: Props & { i: number }) {
  const p = data.persons[i];
  const t = data.topics;
  const zh = data.canton === "ZH";
  const c = (code: string) => codeFor(data, code);
  const set = (fn: (p: Person) => void) => update((d) => fn(d.persons[i]));
  const name = p.firstName || (data.civilStatus === "married" ? `Taxpayer ${i + 1}` : "You");

  return (
    <Card title={name} subtitle="Income and deductions that belong to this person.">
      {t.employment && (
        <>
          <h4>Employers</h4>
          {p.employments.map((e, k) => (
            <div className="row-item" key={e.id}>
              <Grid>
                <TextField label="Employer" value={e.employer} onChange={(v) => set((p) => void (p.employments[k].employer = v))} />
                <MoneyField
                  label="Net salary (box 11)"
                  code={c(e.secondary ? "105" : "100")}
                  value={e.netSalary}
                  onChange={(v) => set((p) => void (p.employments[k].netSalary = v))}
                />
                <MoneyField
                  label="Pension buy-back in box 10.2"
                  value={e.lppBuybackOnCertificate}
                  onChange={(v) => set((p) => void (p.employments[k].lppBuybackOnCertificate = v))}
                  hint="Usually 0."
                />
              </Grid>
              <div className="inline-toggles">
                <Toggle label="Secondary job (< 30% of normal hours)" checked={e.secondary} onChange={(v) => set((p) => void (p.employments[k].secondary = v))} />
                <Toggle label="Box F ticked (free transport)" checked={e.freeTransport} onChange={(v) => set((p) => void (p.employments[k].freeTransport = v))} />
                <Toggle label="Box G ticked (canteen / meal subsidy)" checked={e.canteen} onChange={(v) => set((p) => void (p.employments[k].canteen = v))} />
              </div>
              <button className="link danger" onClick={() => set((p) => void p.employments.splice(k, 1))}>
                Remove employer
              </button>
            </div>
          ))}
          <button className="btn" onClick={() => set((p) => void p.employments.push(newEmployment()))}>
            + Add employer
          </button>
          <MoneyField
            label="Allowances not paid via the employer"
            code={c("110")}
            value={p.allowancesNotFromEmployer}
            onChange={(v) => set((p) => void (p.allowancesNotFromEmployer = v))}
            hint="Family/birth/maternity allowances paid directly by a compensation fund, tips."
          />

          <h4>Commuting & meals</h4>
          <Grid>
            <SelectField<CommuteMode>
              label="How do you get to work?"
              code={c("140")}
              value={p.commuteMode}
              onChange={(v) => set((p) => void (p.commuteMode = v))}
              options={[
                { value: "none", label: "No commuting costs" },
                { value: "public", label: "Public transport" },
                { value: "bike", label: "Bicycle / e-bike / moped" },
                { value: "motorbike", label: "Motorbike (> 50 cm³)" },
                { value: "car", label: "Car" },
              ]}
            />
            {p.commuteMode !== "none" && (
              <>
                <MoneyField label="One-way distance" unit="km" value={p.commuteKm} onChange={(v) => set((p) => void (p.commuteKm = v))} hint="Shortest route home → work." />
                <MoneyField
                  label="Days commuted in 2025"
                  unit="days"
                  value={p.commuteDays}
                  onChange={(v) => set((p) => void (p.commuteDays = Math.round(v)))}
                  hint="240 = full year. Reduce for home office, part-time, unemployment, illness."
                />
              </>
            )}
            {p.commuteMode === "public" &&
              (zh ? (
                <MoneyField
                  label="Annual subscription cost (Abonnement)"
                  value={p.publicTransportActualCost}
                  onChange={(v) => set((p) => void (p.publicTransportActualCost = v))}
                  hint="In Zurich you deduct what you actually paid for your public-transport pass (max CHF 5,200)."
                />
              ) : (
                <MoneyField
                  label="Actual public transport cost (optional)"
                  value={p.publicTransportActualCost}
                  onChange={(v) => set((p) => void (p.publicTransportActualCost = v))}
                  hint={`Only if above the flat rate (${chf(publicTransportFlatRate(p.commuteKm))} for ${p.commuteKm || 0} km). Needs receipts.`}
                />
              ))}
          </Grid>
          {(p.commuteMode === "car" || p.commuteMode === "motorbike") && (
            <TextField
              label="Why can't you use public transport?"
              multiline
              value={p.vehicleJustification}
              onChange={(v) => set((p) => void (p.vehicleJustification = v))}
              hint={
                zh
                  ? "Accepted reasons (tick on the form): no public transport, more than 1 hour saved per day, employer requires it, illness or disability."
                  : "Accepted reasons: no public transport, disability, stop far away, many changes, vehicle needed for work. Saving time is not enough (IG p. 20)."
              }
            />
          )}
          <Grid>
            <SelectField<MealsMode>
              label="Lunch on working days"
              code={c("150")}
              value={p.meals}
              onChange={(v) => set((p) => void (p.meals = v))}
              options={[
                { value: "none", label: "At home / no extra cost" },
                { value: "outside", label: zh ? "Away from home (CHF 15/day, max 3,200)" : "Away from home (CHF 3,200/yr)" },
                { value: "canteen", label: zh ? "Canteen or employer subsidy (CHF 7.50/day, max 1,600)" : "Employer canteen or subsidy (CHF 1,600/yr)" },
                { value: "shift", label: zh ? "Shift or night work (CHF 15/day, max 3,200)" : "Shift or night work (CHF 3,200/yr)" },
              ]}
            />
            <MoneyField
              label="Other professional expenses – actual"
              code={c("160")}
              value={p.otherProfessionalExpensesActual}
              onChange={(v) => set((p) => void (p.otherProfessionalExpensesActual = v))}
              hint="Leave 0 to use the flat rate (3% of salary, CHF 2,000–4,000). Only enter actual costs if higher and documented."
            />
          </Grid>
        </>
      )}

      <h4>Pension savings</h4>
      <Toggle
        label="Member of a pension fund (2nd pillar / LPP)"
        checked={p.hasPensionFund}
        onChange={(v) => set((p) => void (p.hasPensionFund = v))}
        hint={p.hasPensionFund ? `3a maximum: ${chf(R.pillar3a.withPensionFund)}.` : `3a maximum: 20% of net earned income, up to ${chf(R.pillar3a.withoutPensionFundMax)}.`}
      />
      <Grid>
        <MoneyField label="Paid into pillar 3a in 2025" code={c("310")} value={p.pillar3a} onChange={(v) => set((p) => void (p.pillar3a = v))} />
        <MoneyField
          label="Pension fund buy-back (not in box 10.2)"
          code={c("320")}
          value={p.lppBuyback}
          onChange={(v) => set((p) => void (p.lppBuyback = v))}
        />
        <MoneyField
          label="Loss-of-earnings insurance premiums"
          code={c("340")}
          value={p.lossOfEarningsPremiums}
          onChange={(v) => set((p) => void (p.lossOfEarningsPremiums = v))}
          hint="Withheld from salary for daily-allowance insurance."
        />
      </Grid>

      {t.training && (
        <MoneyField
          label="Continuing education costs you paid"
          code={c("618")}
          value={p.trainingCosts}
          onChange={(v) => set((p) => void (p.trainingCosts = v))}
          hint={`Not a first secondary-level diploma; not hobbies. Max CHF ${zh ? "12,400" : "12,000"} (federal 13,000).`}
        />
      )}

      {(t.selfEmployment || p.business) && (
        <>
          <h4>Self-employed activity</h4>
          <BusinessForm data={data} index={i} update={update} />
        </>
      )}
      {t.unemployment && (
        <>
          <h4>Allowances</h4>
          <Grid>
            <MoneyField label="Unemployment / military (APG)" code={c("200")} value={p.unemploymentAndApg} onChange={(v) => set((p) => void (p.unemploymentAndApg = v))} />
            <MoneyField label="Daily allowances (sickness, accident, AI)" code={c("210")} value={p.dailyAllowances} onChange={(v) => set((p) => void (p.dailyAllowances = v))} />
          </Grid>
        </>
      )}
      {t.pensions && (
        <>
          <h4>Pensions received</h4>
          <Grid>
            <MoneyField label="AVS / AI" code={c("240")} value={p.pensionAvsAi} onChange={(v) => set((p) => void (p.pensionAvsAi = v))} />
            <MoneyField label="Pension fund (2nd pillar)" code={c("250")} value={p.pensionLpp} onChange={(v) => set((p) => void (p.pensionLpp = v))} />
            <MoneyField label="Pillar 3a pension" code={c("260")} value={p.pension3a} onChange={(v) => set((p) => void (p.pension3a = v))} />
            <MoneyField label="Other (3b, LAA/SUVA, annuities)" code={c("270")} value={p.pensionOther} onChange={(v) => set((p) => void (p.pensionOther = v))} />
          </Grid>
        </>
      )}
    </Card>
  );
}

export function Details({ data, update }: Props) {
  const t = data.topics;
  const married = data.civilStatus === "married";
  const zh = data.canton === "ZH";
  const c = (code: string) => codeFor(data, code);

  return (
    <>
      <div className="page-intro">
        <h2>Your numbers</h2>
        <p className="muted">Enter the amounts from your documents, or add them from the "Read documents" step. Everything is saved in this browser as you type.</p>
      </div>

      {data.persons.slice(0, married ? 2 : 1).map((_, i) => (
        <PersonCard key={i} data={data} update={update} i={i} />
      ))}

      <Card title="Health insurance" subtitle="Premiums for the whole household (basic + supplementary, accident, life insurance).">
        <Grid>
          <MoneyField label="Premiums paid in 2025" code={c("300")} value={data.healthPremiums} onChange={(v) => update((d) => void (d.healthPremiums = v))} />
          <MoneyField
            label="Premium subsidies received"
            code={c("300")}
            value={data.premiumSubsidies}
            onChange={(v) => update((d) => void (d.premiumSubsidies = v))}
            hint="Subsides LAMal. Must be declared even if 0."
          />
        </Grid>
      </Card>

      {t.renting && !zh && (
        <Card title="Your home (renting)">
          <MoneyField
            label="Annual rent without charges"
            code="660"
            value={data.rentPaidNet}
            onChange={(v) => update((d) => void (d.rentPaidNet = v))}
            hint="For the housing deduction. It only helps if rent is high relative to income."
          />
        </Card>
      )}

      {(t.alimony || data.otherIncome > 0) && (
        <Card title="Other income and alimony">
          <Grid>
            <MoneyField label="Other income" code={c("195")} value={data.otherIncome} onChange={(v) => update((d) => void (d.otherIncome = v))} hint="Sub-letting, royalties, etc." />
            {t.alimony && (
              <>
                <MoneyField label="Alimony received" code={c("280")} value={data.alimonyReceived} onChange={(v) => update((d) => void (d.alimonyReceived = v))} />
                <MoneyField label="Alimony paid" code={c("630")} value={data.alimonyPaid} onChange={(v) => update((d) => void (d.alimonyPaid = v))} />
              </>
            )}
          </Grid>
        </Card>
      )}

      <Card
        title="Bank and postal accounts"
        subtitle={`Balance on 31.12.2025 and gross interest for 2025 (${zh ? "Wertschriftenverzeichnis" : "code 410"}). Include savings, current, rent-deposit and children's accounts.`}
        actions={
          <button className="btn" onClick={() => update((d) => void d.bankAccounts.push(newAccount()))}>
            + Add account
          </button>
        }
      >
        {data.bankAccounts.length === 0 && <p className="muted">No accounts yet.</p>}
        {data.bankAccounts.map((a, k) => (
          <div className="row-item" key={a.id}>
            <Grid>
              <TextField label="Bank" value={a.bank} placeholder="e.g. CH UBS" onChange={(v) => update((d) => void (d.bankAccounts[k].bank = v))} />
              <MoneyField label="Balance 31.12.2025" value={a.balance} onChange={(v) => update((d) => void (d.bankAccounts[k].balance = v))} />
              <MoneyField label="Gross interest 2025" value={a.interest} onChange={(v) => update((d) => void (d.bankAccounts[k].interest = v))} />
            </Grid>
            <Toggle
              label="35% Swiss withholding tax was deducted"
              checked={a.withholdingTax}
              onChange={(v) => update((d) => void (d.bankAccounts[k].withholdingTax = v))}
              hint="Usually only when yearly interest exceeds CHF 200. You get it back by declaring it."
            />
            <button className="link danger" onClick={() => update((d) => void d.bankAccounts.splice(k, 1))}>
              Remove
            </button>
          </div>
        ))}
      </Card>

      {t.securities && (
        <Card
          title="Securities"
          subtitle="One entry per bank tax statement (relevé fiscal), or per security if you have no statement."
          actions={
            <button className="btn" onClick={() => update((d) => void d.securities.push(newSecurity()))}>
              + Add
            </button>
          }
        >
          {data.securities.map((s, k) => (
            <div className="row-item" key={s.id}>
              <Grid>
                <TextField label="Bank / security" value={s.description} onChange={(v) => update((d) => void (d.securities[k].description = v))} />
                <MoneyField label="Tax value 31.12.2025" value={s.taxValue} onChange={(v) => update((d) => void (d.securities[k].taxValue = v))} />
                <MoneyField
                  label="Income with Swiss withholding (A)"
                  value={s.incomeWithWithholding}
                  onChange={(v) => update((d) => void (d.securities[k].incomeWithWithholding = v))}
                />
                <MoneyField
                  label="Income without Swiss withholding (B)"
                  value={s.incomeWithoutWithholding}
                  onChange={(v) => update((d) => void (d.securities[k].incomeWithoutWithholding = v))}
                />
              </Grid>
              <Toggle
                label="Held with a bank or broker (custody fees flat rate applies)"
                checked={s.managedByThirdParty}
                onChange={(v) => update((d) => void (d.securities[k].managedByThirdParty = v))}
              />
              <button className="link danger" onClick={() => update((d) => void d.securities.splice(k, 1))}>
                Remove
              </button>
            </div>
          ))}
          <MoneyField
            label="Actual custody fees (optional)"
            code={c("490")}
            value={data.securitiesAdminFeesActual}
            onChange={(v) => update((d) => void (d.securitiesAdminFeesActual = v))}
            hint={`Leave 0 for the ${zh ? "3‰ flat rate (max CHF 6,000)" : "1.5‰ flat rate"}. Trading commissions and advice fees are not deductible.`}
          />
        </Card>
      )}

      <Card title="Other assets" subtitle="Values on 31.12.2025.">
        <Grid>
          {t.crypto && <MoneyField label="Cash, gold, crypto" code={c("420")} value={data.cryptoAndCash} onChange={(v) => update((d) => void (d.cryptoAndCash = v))} />}
          <MoneyField
            label="Cars, collections, jewellery"
            code={c("430")}
            value={data.vehiclesAndValuables}
            onChange={(v) => update((d) => void (d.vehiclesAndValuables = v))}
            hint="Market value."
          />
          <MoneyField
            label="Life insurance surrender value"
            code={c("435")}
            value={data.lifeInsuranceSurrenderValue}
            onChange={(v) => update((d) => void (d.lifeInsuranceSurrenderValue = v))}
            hint="Not 2nd pillar or 3a."
          />
        </Grid>
      </Card>

      {t.property && (
        <Card
          title="Property"
          subtitle={zh ? "Used for the Eigenmietwert, maintenance deduction and wealth (Liegenschaftenverzeichnis)." : "Used for the rental value (valeur locative), maintenance deduction and wealth."}
          actions={
            <button className="btn" onClick={() => update((d) => void d.properties.push(newProperty(d.commune)))}>
              + Add property
            </button>
          }
        >
          {data.properties.map((p, k) => {
            const setP = (fn: (p: TaxData["properties"][number]) => void) => update((d) => fn(d.properties[k]));
            const common = (
              <>
                <MoneyField
                  label="Year built / heavily renovated"
                  unit=""
                  value={p.constructionYear}
                  onChange={(v) => setP((p) => void (p.constructionYear = Math.round(v)))}
                  hint={zh ? "Used for the federal maintenance flat rate (10% up to 10 years old, else 20%)." : undefined}
                />
                <MoneyField label="Your share" unit="" step={0.25} value={p.ownershipShare} onChange={(v) => setP((p) => void (p.ownershipShare = v))} hint="1 = whole, 0.5 = half. Spouses' shares add up." />
                <MoneyField label="Months for own use in 2025" unit="months" value={p.monthsOwnUse} onChange={(v) => setP((p) => void (p.monthsOwnUse = v))} />
                <MoneyField label="Rent received from tenants" code={c("500")} value={p.rentalIncome} onChange={(v) => setP((p) => void (p.rentalIncome = v))} />
                <MoneyField
                  label="Actual maintenance costs (optional)"
                  code={c("540")}
                  value={p.maintenanceActual}
                  onChange={(v) => setP((p) => void (p.maintenanceActual = v))}
                  hint={`Leave 0 for the flat rate${zh ? " (20%)" : ""}. Improvements that add value don't count.`}
                />
              </>
            );
            return (
              <div className="row-item" key={p.id}>
                <Grid>
                  <TextField label="Description" value={p.description} placeholder={zh ? "e.g. Flat in Zürich" : "e.g. Flat in Lausanne"} onChange={(v) => setP((p) => void (p.description = v))} />
                  <TextField label="Commune" list="communes" value={p.commune} onChange={(v) => setP((p) => void (p.commune = v))} />
                  {zh ? (
                    <>
                      <MoneyField
                        label="Eigenmietwert (annual)"
                        value={p.rentalValueOverride}
                        onChange={(v) => setP((p) => void (p.rentalValueOverride = v))}
                        hint="From your property valuation (Liegenschaftenbewertung) or last tax assessment. Whole property; your share is applied."
                      />
                      <MoneyField
                        label="Tax value (Steuerwert)"
                        value={p.taxEstimate}
                        onChange={(v) => setP((p) => void (p.taxEstimate = v))}
                        hint="From the same valuation. Whole property; your share is applied."
                      />
                      {common}
                    </>
                  ) : (
                    <>
                      <MoneyField label="Living area" unit="m²" value={p.surfaceM2} onChange={(v) => setP((p) => void (p.surfaceM2 = v))} hint="Wall to wall; no balconies, cellars, garages." />
                      <MoneyField label="Tax estimate (estimation fiscale)" value={p.taxEstimate} onChange={(v) => setP((p) => void (p.taxEstimate = v))} hint="Whole property; your share is applied." />
                      {common}
                      <MoneyField
                        label="Rental value override (optional)"
                        value={p.rentalValueOverride}
                        onChange={(v) => setP((p) => void (p.rentalValueOverride = v))}
                        hint="Cantonal (65%) annual value from your last tax decision, if you prefer it."
                      />
                    </>
                  )}
                </Grid>
                {!zh && (
                  <div className="inline-toggles">
                    <Toggle label="Detached villa (villa individuelle)" checked={p.detachedVilla} onChange={(v) => setP((p) => void (p.detachedVilla = v))} />
                    <Toggle label="Main residence" checked={p.mainResidence} onChange={(v) => setP((p) => void (p.mainResidence = v))} />
                  </div>
                )}
                {!zh && p.commune && !findCommuneInfo("VD", p.commune) && <Callout tone="warn">Commune not in the Vaud list: coefficient 1.00 is used.</Callout>}
                {zh && p.monthsOwnUse > 0 && !p.rentalValueOverride && <Callout tone="warn">Enter the Eigenmietwert — Zurich sets it per property, so it can't be computed here.</Callout>}
                {TAX_YEAR - p.constructionYear < 0 && <Callout tone="warn">Construction year is in the future.</Callout>}
                <button className="link danger" onClick={() => update((d) => void d.properties.splice(k, 1))}>
                  Remove property
                </button>
              </div>
            );
          })}
        </Card>
      )}

      {t.debts && (
        <Card
          title="Mortgage and loans"
          subtitle={`Interest paid in 2025 and balance on 31.12.2025 (${zh ? "Schuldenverzeichnis, Ziffern 12 / 34" : "codes 610/615"}). Not leasing.`}
          actions={
            <button className="btn" onClick={() => update((d) => void d.debts.push(newDebt()))}>
              + Add debt
            </button>
          }
        >
          {data.debts.map((x, k) => (
            <div className="row-item" key={x.id}>
              <Grid>
                <TextField label="Creditor (name, address)" value={x.creditor} onChange={(v) => update((d) => void (d.debts[k].creditor = v))} />
                <MoneyField label="Balance 31.12.2025" value={x.balance} onChange={(v) => update((d) => void (d.debts[k].balance = v))} />
                <MoneyField label="Interest paid 2025" value={x.interest} onChange={(v) => update((d) => void (d.debts[k].interest = v))} />
              </Grid>
              <button className="link danger" onClick={() => update((d) => void d.debts.splice(k, 1))}>
                Remove
              </button>
            </div>
          ))}
        </Card>
      )}

      {(t.childcare || t.medical || t.donations || t.dependents) && (
        <Card title="Other deductions">
          {t.childcare &&
            data.children.map((child, k) => (
              <MoneyField
                key={child.id}
                label={`Childcare costs – ${child.firstName || `child ${k + 1}`}`}
                code={c("670")}
                value={child.childcareCosts}
                onChange={(v) => update((d) => void (d.children[k].childcareCosts = v))}
                hint="Third-party care while you work, excluding meals. Child under 14."
              />
            ))}
          {t.childcare && data.children.length === 0 && <p className="muted">Add your children under "Your situation" first.</p>}
          {t.childcare && data.children.length > 0 && (
            <Toggle
              label="A parent is in training or unable to work (instead of working)"
              checked={data.childcareTrainingOrIncapacity}
              onChange={(v) => update((d) => void (d.childcareTrainingOrIncapacity = v))}
              hint="Childcare is deductible when both parents work, or when the one who doesn't is in training or unable to work (IG p. 44)."
            />
          )}
          <Grid>
            {t.medical && (
              <>
                <MoneyField
                  label="Medical & dental costs paid yourself"
                  code={c("710")}
                  value={data.medicalCosts}
                  onChange={(v) => update((d) => void (d.medicalCosts = v))}
                  hint="After insurance reimbursements, incl. franchise and quote-part. Only the part above 5% of income counts."
                />
                <MoneyField label="Disability-related costs" code={c("710")} value={data.disabilityCosts} onChange={(v) => update((d) => void (d.disabilityCosts = v))} />
              </>
            )}
            {t.donations && (
              <>
                <MoneyField label="Donations to charities" code={c("720")} value={data.donations} onChange={(v) => update((d) => void (d.donations = v))} hint="Swiss tax-exempt organisations; not churches." />
                <MoneyField label="Donations to political parties" code={c("620")} value={data.politicalDonations} onChange={(v) => update((d) => void (d.politicalDonations = v))} />
              </>
            )}
            {t.dependents && (
              <MoneyField
                label="Other dependent persons"
                unit="persons"
                code={c("680")}
                value={data.dependents}
                onChange={(v) => update((d) => void (d.dependents = Math.max(0, Math.round(v))))}
                hint={`Not spouse, children or partner; you pay them at least CHF ${zh ? "2,800" : "3,400"}/year.`}
              />
            )}
          </Grid>
        </Card>
      )}
    </>
  );
}
