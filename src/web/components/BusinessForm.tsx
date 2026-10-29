import { computeBusiness } from "../../shared/business";
import { childrenWithPart } from "../../shared/calc";
import { newAsset, newBusiness } from "../../shared/defaults";
import { chf } from "../../shared/money";
import { ASSET_CATEGORIES, type AssetCategory, type Business, EXPENSE_CATEGORIES, type ExpenseCategory, type TaxData } from "../../shared/types";
import type { Update } from "../store";
import { Callout, Choice, Grid, MoneyField, SelectField, TextField, Toggle } from "./Fields";

/** Self-employed activity of one person, with a live summary of what goes on the return. */
export function BusinessForm({ data, index, update }: { data: TaxData; index: number; update: Update }) {
  const p = data.persons[index];
  const set = (fn: (b: Business) => void) =>
    update((d) => {
      const biz = d.persons[index].business;
      if (biz) fn(biz);
    });
  const zh = data.canton === "ZH";
  if (!p.business)
    return (
      <div className="row-item">
        <p className="muted small">Add your activity to compute the profit, the private shares, depreciation and an estimate of your own AVS contributions.</p>
        <button className="btn" onClick={() =>
            update((d) => {
              const person = d.persons[index];
              person.business = newBusiness();
              // Typical for the self-employed: no pension fund, so the large pillar 3a applies.
              if (!person.employments.length) person.hasPensionFund = false;
            })
          }>
          + Add a self-employed activity
        </button>
      </div>
    );

  const b = p.business;
  const adults = data.civilStatus === "married" ? 2 : 1;
  const r = computeBusiness(b, data.canton, { adults, children: childrenWithPart(data).length });
  const avsCode = zh ? "16.1" : "180";

  return (
    <div className="row-item business">
      <Grid>
        <TextField label="Business name" value={b.name} onChange={(v) => set((b) => void (b.name = v))} />
        <TextField label="Activity" value={b.activity} placeholder="e.g. graphic design, plumbing" onChange={(v) => set((b) => void (b.activity = v))} />
      </Grid>
      <Choice<Business["mode"]>
        label="How do you track your numbers?"
        value={b.mode}
        onChange={(v) => set((b) => void (b.mode = v))}
        options={[
          { value: "records", label: "Receipts & expenses", hint: "Simplified records — enter the totals here (turnover under CHF 500,000)" },
          { value: "accounts", label: "Full accounts", hint: "Balance sheet & income statement from your accountant" },
        ]}
      />
      <MoneyField
        label={zh ? "Turnover (Bruttoumsatz)" : "Turnover (chiffre d'affaires)"}
        value={b.revenue}
        onChange={(v) => set((b) => void (b.revenue = v))}
        hint="All invoiced or cashed receipts of the year, before expenses (excl. VAT if you're registered)."
      />

      {b.mode === "records" ? (
        <>
          <h5>Business expenses 2025</h5>
          <p className="hint">Don't include your own AVS, your own pension or 3a, private insurance, taxes, or the purchase of equipment (that's depreciated below).</p>
          <Grid>
            {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((k) => (
              <MoneyField key={k} label={EXPENSE_CATEGORIES[k]} value={b.expenses[k] ?? 0} onChange={(v) => set((b) => void (b.expenses[k] = v))} />
            ))}
          </Grid>
          <h5>Equipment & depreciation</h5>
          <p className="hint">Maximum official rates on the remaining book value (halve them if you depreciate on the purchase price). Keep a list with purchase year and price.</p>
          {b.assets.map((a, k) => {
            const dep = r.assets[k];
            return (
              <div className="asset" key={a.id}>
                <Grid>
                  <TextField label="Item" value={a.description} onChange={(v) => set((b) => void (b.assets[k].description = v))} />
                  <SelectField<AssetCategory>
                    label="Category"
                    value={a.category}
                    onChange={(v) => set((b) => void (b.assets[k].category = v))}
                    options={(Object.keys(ASSET_CATEGORIES) as AssetCategory[]).map((c) => ({ value: c, label: `${ASSET_CATEGORIES[c].label} (${ASSET_CATEGORIES[c].rate * 100}%)` }))}
                  />
                  <MoneyField label="Book value on 1.1.2025" value={a.bookValueStart} onChange={(v) => set((b) => void (b.assets[k].bookValueStart = v))} />
                  <MoneyField label="Bought in 2025" value={a.additions} onChange={(v) => set((b) => void (b.assets[k].additions = v))} />
                  <MoneyField
                    label="Depreciation booked"
                    value={a.depreciation}
                    onChange={(v) => set((b) => void (b.assets[k].depreciation = v))}
                    hint={`Leave 0 to use the maximum: ${chf(dep?.max ?? 0)}.`}
                  />
                </Grid>
                {dep?.tooHigh && <Callout tone="warn">Above the official maximum of {chf(dep.max)}.</Callout>}
                <button className="link danger" onClick={() => set((b) => void b.assets.splice(k, 1))}>
                  Remove item
                </button>
              </div>
            );
          })}
          <button className="btn" onClick={() => set((b) => void b.assets.push(newAsset()))}>
            + Add equipment
          </button>
        </>
      ) : (
        <>
          <MoneyField
            label="Net profit (or loss) per your income statement"
            value={b.netProfit}
            onChange={(v) => set((b) => void (b.netProfit = v))}
            hint="Use a minus sign for a loss."
          />
          <Toggle
            label="My own AVS and pension contributions are booked as expenses in that profit"
            checked={b.ownContributionsBooked}
            onChange={(v) => set((b) => void (b.ownContributionsBooked = v))}
            hint="They're added back and then deducted the right way (half of the pension is private, AVS goes where the canton wants it)."
          />
        </>
      )}

      <h5>Private use</h5>
      <Grid>
        <MoneyField
          label="Purchase price of a business car also used privately"
          value={b.carPurchasePrice}
          onChange={(v) => set((b) => void (b.carPurchasePrice = v))}
          hint="Excl. VAT. Private share 0.9% per month (min CHF 150/month). Leave 0 if your accounts already credit it."
        />
        {b.carPurchasePrice > 0 && (
          <MoneyField label="Months with the car in 2025" unit="months" value={b.carMonths} onChange={(v) => set((b) => void (b.carMonths = Math.round(v)))} />
        )}
        <MoneyField
          label="Other private shares / withdrawals in kind"
          value={b.otherPrivateShare}
          onChange={(v) => set((b) => void (b.otherPrivateShare = v))}
          hint="Goods taken for yourself, private part of rent or phone, if booked as business costs."
        />
      </Grid>
      {!zh && (
        <Toggle
          label="Household electricity, heating, phone or TV were booked as business costs"
          checked={b.householdCostsBooked}
          onChange={(v) => set((b) => void (b.householdCostsBooked = v))}
          hint="Vaud flat-rate private share: CHF 3,540 for one adult, + 900 per extra adult, + 600 per child."
        />
      )}

      <h5>Your own social insurance</h5>
      <Grid>
        <MoneyField
          label="Own AVS/AI/APG contributions for 2025"
          code={avsCode}
          value={b.avsContributions}
          onChange={(v) => set((b) => void (b.avsContributions = v))}
          hint={`From your caisse's decision. Leave 0 to use the estimate: ${chf(Math.round(r.avsEstimate.amount))}.`}
        />
        <MoneyField
          label="Own 2nd-pillar contributions"
          code={zh ? "16.1" : "330"}
          value={b.ownPension}
          onChange={(v) => set((b) => void (b.ownPension = v))}
          hint="Ordinary contributions; half is a business expense, half a private deduction. Buy-backs go under pension buy-backs."
        />
        <MoneyField
          label="Own daily-allowance insurance premiums"
          value={b.dailyAllowanceInsurance}
          onChange={(v) => set((b) => void (b.dailyAllowanceInsurance = v))}
          hint={zh ? "Deducted with insurance premiums (Ziffer 15)." : "Half is a business expense, half goes with insurance premiums (code 300)."}
        />
      </Grid>

      <h5>Wealth & past losses</h5>
      <Grid>
        <MoneyField
          label="Equity in the business on 31.12.2025"
          code={zh ? "32" : "465"}
          value={b.equityCapital}
          onChange={(v) => set((b) => void (b.equityCapital = v))}
          hint="Business assets (stock, receivables, equipment at book value) minus business debts. 1% of it reduces your AVS income."
        />
        <MoneyField
          label="Losses of the last 7 years not yet offset"
          code={zh ? "2.1" : "186"}
          value={b.lossCarryForward}
          onChange={(v) => set((b) => void (b.lossCarryForward = v))}
        />
      </Grid>

      <table className="table summary">
        <tbody>
          {b.mode === "records" ? (
            <>
              <tr>
                <td>Turnover − expenses − depreciation</td>
                <td className="num">{chf(r.revenue - r.expenses - r.depreciation)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td>Profit per accounts{b.ownContributionsBooked ? " + own contributions added back" : ""}</td>
              <td className="num">{chf(r.grossProfit - r.privateShares)}</td>
            </tr>
          )}
          {r.privateShares > 0 && (
            <tr>
              <td>+ private shares</td>
              <td className="num">{chf(r.privateShares)}</td>
            </tr>
          )}
          {r.pensionBusiness + r.dailyAllowanceBusiness > 0 && (
            <tr>
              <td>− business half of own pension{r.dailyAllowanceBusiness ? " and daily-allowance insurance" : ""}</td>
              <td className="num">{chf(r.pensionBusiness + r.dailyAllowanceBusiness)}</td>
            </tr>
          )}
          <tr>
            <td>
              Own AVS/AI/APG {r.avsIsEstimate ? "(estimate)" : ""}
              <div className="muted small">
                {r.avsBase ? `${(r.avsEstimate.rate * 100).toFixed(3)}% of ${chf(r.avsBase)}` : "minimum contribution"}
                {zh ? " — deducted under Ziffer 16.1" : ""}
              </div>
            </td>
            <td className="num">{chf(r.avs)}</td>
          </tr>
          <tr className="strong">
            <td>{zh ? "Self-employment income, Ziffer 2.1" : "Self-employment income, code 180"}</td>
            <td className="num">{chf(r.declared)}</td>
          </tr>
        </tbody>
      </table>
      {r.needsFullAccounts && b.mode === "records" && <Callout tone="warn">With a turnover of CHF 500,000 or more, full accounts are mandatory.</Callout>}
      {!p.hasPensionFund && (
        <p className="hint">
          Without a pension fund you can pay up to 20% of this net income (after AVS) into pillar 3a, max CHF 36,288 — set it under “Pension savings”.
        </p>
      )}
      <button className="link danger" onClick={() => confirm("Remove this activity and its numbers?") && update((d) => void (d.persons[index].business = null))}>
        Remove this activity
      </button>
    </div>
  );
}

