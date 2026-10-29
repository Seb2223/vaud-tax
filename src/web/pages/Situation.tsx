import { CANTONS, findCommuneInfo, TAX_YEAR } from "../../shared/calc";
import { newChild, newPerson } from "../../shared/defaults";
import { type Canton, type Confession, type TaxData, type Topic, TOPICS } from "../../shared/types";
import { Callout, Card, Choice, Grid, MoneyField, SelectField, TextField, Toggle } from "../components/Fields";
import type { Update } from "../store";

const CONFESSIONS: { value: Confession; label: string }[] = [
  { value: "none", label: "None / other (no church tax)" },
  { value: "reformed", label: "Reformed (evangelisch-reformiert)" },
  { value: "catholic", label: "Roman Catholic (römisch-katholisch)" },
  { value: "christCatholic", label: "Christ Catholic (christkatholisch)" },
];

export function Situation({ data, update }: { data: TaxData; update: Update }) {
  const zh = data.canton === "ZH";
  const commune = findCommuneInfo(data.canton, data.commune);
  const married = data.civilStatus === "married";
  const canton = CANTONS[data.canton];

  return (
    <>
      <div className="page-intro">
        <h2>Your situation</h2>
        <p className="muted">Answer these first. They decide which parts of the return apply to you and what the checklist asks for.</p>
      </div>

      <Card title="Canton" subtitle="Where you lived on 31 December 2025 — that canton taxes the whole year.">
        <Choice<Canton>
          label="Canton of residence"
          value={data.canton}
          onChange={(v) =>
            update((d) => {
              if (d.canton === v) return;
              d.canton = v;
              d.commune = CANTONS[v].capital;
              d.communalRate = CANTONS[v].capitalRate;
            })
          }
          options={[
            { value: "VD", label: "Vaud", hint: "VaudTax · French labels" },
            { value: "ZH", label: "Zurich", hint: "ZHprivateTax · German labels" },
          ]}
        />
      </Card>

      <Card title="Commune" subtitle={`Your commune on 31 December 2025 sets the communal tax rate${zh ? " and the church tax rates" : ""}.`}>
        <Grid>
          <TextField
            label="Commune"
            value={data.commune}
            list="communes"
            placeholder="Start typing…"
            onChange={(v) =>
              update((d) => {
                d.commune = v;
                const c = findCommuneInfo(d.canton, v);
                if (c) d.communalRate = c.rate;
              })
            }
          />
          <MoneyField
            label="Communal tax rate"
            unit="%"
            value={data.communalRate}
            onChange={(v) => update((d) => void (d.communalRate = v))}
            hint={zh ? "Gemeindesteuerfuss without church tax." : "% of the cantonal base tax (coefficient communal)."}
          />
        </Grid>
        {commune?.note && <Callout tone="warn">{commune.note}</Callout>}
        {commune &&
          !commune.note &&
          (commune.confirmed ? (
            <Callout tone="ok">
              {commune.name}: {commune.rate}% — {zh ? "official 2025 rate (Amt für Statistik und Daten, Kanton Zürich)." : "adopted before 2025 and still in force, so it applies to 2025."}
            </Callout>
          ) : (
            <Callout tone="warn">
              {commune.name}: {commune.rate}% is the <strong>2026</strong> rate (the official 2025 table is no longer published). If {commune.name} changed its
              rate, your 2025 tax bill or last acompte shows the 2025 coefficient — enter it above.
            </Callout>
          ))}
        {!commune && data.commune && <Callout tone="warn">Commune not found in the {canton.name} list. Enter the communal rate by hand.</Callout>}
      </Card>

      <Card title="Household">
        <Choice
          label="Civil status on 31.12.2025"
          value={data.civilStatus}
          onChange={(v) =>
            update((d) => {
              d.civilStatus = v;
              if (v === "married" && d.persons.length < 2) d.persons.push(newPerson());
            })
          }
          options={[
            { value: "single", label: "Single / divorced / widowed / separated", hint: "One return per person" },
            { value: "married", label: "Married or registered partnership", hint: "One joint return for both" },
          ]}
        />
        <Grid>
          {data.persons.slice(0, married ? 2 : 1).map((p, i) => (
            <TextField
              key={i}
              label={married ? `First name – ${i === 0 ? (zh ? "Person 1" : "taxpayer 1 (contribuable 1)") : zh ? "Person 2" : "taxpayer 2 (contribuable 2)"}` : "Your first name"}
              value={p.firstName}
              onChange={(v) => update((d) => void (d.persons[i].firstName = v))}
            />
          ))}
        </Grid>
        {zh && (
          <Grid>
            {data.persons.slice(0, married ? 2 : 1).map((p, i) => (
              <SelectField<Confession>
                key={i}
                label={`Church membership${married ? ` – ${p.firstName || `Person ${i + 1}`}` : ""}`}
                value={p.confession}
                onChange={(v) => update((d) => void (d.persons[i].confession = v))}
                options={CONFESSIONS}
                hint="Members of a recognised church pay church tax in Zurich (Konfession on page 1 of the return)."
              />
            ))}
          </Grid>
        )}
        {married && !zh && <p className="hint">Keep the same order as on page 1 of your return: data of taxpayer 1 must never go under taxpayer 2 (IG p. 12).</p>}
      </Card>

      <Card
        title="Children"
        subtitle={`Minor children (born ${TAX_YEAR - 17}–${TAX_YEAR}) and adult children in apprenticeship or studies whom you support.`}
        actions={
          <button className="btn" onClick={() => update((d) => void d.children.push(newChild()))}>
            + Add child
          </button>
        }
      >
        {data.children.length === 0 && <p className="muted">No children declared.</p>}
        {data.children.map((c, i) => (
          <div className="row-item" key={c.id}>
            <Grid>
              <TextField label="First name" value={c.firstName} onChange={(v) => update((d) => void (d.children[i].firstName = v))} />
              <MoneyField label="Year of birth" unit="" value={c.birthYear} onChange={(v) => update((d) => void (d.children[i].birthYear = Math.round(v)))} />
            </Grid>
            {c.birthYear < TAX_YEAR - 17 && (
              <Toggle
                label="In apprenticeship or studies, and I pay for their upkeep"
                checked={c.inEducation}
                onChange={(v) => update((d) => void (d.children[i].inEducation = v))}
              />
            )}
            <button className="link danger" onClick={() => update((d) => void d.children.splice(i, 1))}>
              Remove
            </button>
          </div>
        ))}
        {!married && data.children.length > 0 && (
          <Toggle
            label={zh ? "My child(ren) live with me and I pay most of their upkeep" : "I run an independent household alone with my child(ren)"}
            checked={data.singleParentHousehold}
            onChange={(v) => update((d) => void (d.singleParentHousehold = v))}
            hint={
              zh
                ? "Gives the lower married tariff (Verheiratetentarif) for income and wealth tax (§ 35/47 StG)."
                : "Gives the 1.3 family share. Answer no if you live with a partner (concubinage), even unmarried (IG p. 10)."
            }
          />
        )}
      </Card>

      <Card title="What applies to you in 2025?" subtitle="Tick everything that's relevant. You can change this later.">
        <div className="topics">
          {(Object.keys(TOPICS) as Topic[])
            .filter((t) => !(zh && t === "renting"))
            .map((t) => (
              <label key={t} className={`topic ${data.topics[t] ? "on" : ""}`}>
                <input type="checkbox" checked={!!data.topics[t]} onChange={(e) => update((d) => void (d.topics[t] = e.target.checked))} />
                <span>
                  <strong>{TOPICS[t].label}</strong>
                  <small>{TOPICS[t].hint}</small>
                </span>
              </label>
            ))}
        </div>
      </Card>
    </>
  );
}
