import { buildChecklist } from "../../shared/checklist";
import type { TaxData } from "../../shared/types";
import { Callout, Card } from "../components/Fields";
import type { Update } from "../store";

export function Checklist({ data, update, goTo }: { data: TaxData; update: Update; goTo: (step: string) => void }) {
  const items = buildChecklist(data);
  const done = items.filter((i) => data.checklistDone[i.id]).length;

  return (
    <>
      <div className="page-intro">
        <h2>Documents to gather</h2>
        <p className="muted">Built from your answers and the data you've entered. Tick each one off as you collect it.</p>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={done} aria-valuemax={items.length}>
        <div style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        <span>
          {done} / {items.length} collected
        </span>
      </div>
      <Card title="Checklist" subtitle={<>Items marked <span className="badge">attach</span> must be sent with the return (IG p. 15). Keep everything else in case the tax office asks.</>}>
        <ul className="checklist">
          {items.map((i) => (
            <li key={i.id} className={data.checklistDone[i.id] ? "done" : ""}>
              <label>
                <input type="checkbox" checked={!!data.checklistDone[i.id]} onChange={(e) => update((d) => void (d.checklistDone[i.id] = e.target.checked))} />
                <span>
                  <strong>{i.title}</strong> {i.mandatory && <span className="badge">attach</span>}
                  <small>{i.why}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>
      <Callout>
        The list grows as you fill in details (each employer, bank account and property adds its own document). Once you have a document, the{" "}
        <button className="link" onClick={() => goTo("documents")}>
          Read documents
        </button>{" "}
        step can extract the amounts for you.
      </Callout>
    </>
  );
}
