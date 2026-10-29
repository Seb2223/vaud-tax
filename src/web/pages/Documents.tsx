import { useRef, useState } from "react";
import type { Extraction } from "../../shared/aiSchemas";
import { applyExtraction, describeApply, needsChild, needsPerson, needsProperty, valuesOf } from "../../shared/apply";
import type { TaxData } from "../../shared/types";
import { extract } from "../api";
import { Callout, Card } from "../components/Fields";
import type { Update } from "../store";

interface Job {
  id: string;
  file: File;
  status: "reading" | "done" | "error" | "applied";
  error?: string;
  result?: Extraction;
  /** Values per extracted row (user-editable); summed by key when applied. */
  rows?: number[];
  personIndex: number;
  childId?: string;
  propertyId?: string;
}

const TYPE_LABELS: Record<Extraction["documentType"], string> = {
  salary_certificate: "Salary certificate",
  pillar3a_certificate: "Pillar 3a certificate",
  lpp_buyback_certificate: "Pension fund buy-back",
  bank_statement: "Bank statement",
  securities_tax_statement: "Securities tax statement",
  health_insurance_premiums: "Health insurance premiums",
  premium_subsidy_decision: "Premium subsidy",
  childcare_invoice: "Childcare invoice",
  mortgage_or_loan_statement: "Mortgage / loan statement",
  property_tax_estimate: "Property tax estimate",
  pension_certificate: "Pension certificate",
  unemployment_or_daily_allowance: "Unemployment / daily allowances",
  donation_receipt: "Donation receipt",
  medical_invoice: "Medical invoice",
  training_invoice: "Training invoice",
  other: "Other document",
};

export function Documents({ data, update, aiReady }: { data: TaxData; update: Update; aiReady: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const persons = data.civilStatus === "married" ? data.persons.slice(0, 2) : data.persons.slice(0, 1);

  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  async function add(files: FileList | null) {
    if (!files) return;
    const fresh = [...files].map((file) => ({ id: crypto.randomUUID(), file, status: "reading" as const, personIndex: 0 }));
    setJobs((js) => [...fresh, ...js]);
    // One at a time keeps API usage predictable.
    for (const j of fresh) {
      try {
        const result = await extract(j.file, "");
        const who = result.personName.toLowerCase();
        const personIndex = Math.max(0, persons.findIndex((p) => p.firstName && who.includes(p.firstName.toLowerCase())));
        patch(j.id, { status: "done", result, rows: result.fields.map((f) => f.value), personIndex, childId: data.children[0]?.id, propertyId: data.properties[0]?.id });
      } catch (e) {
        patch(j.id, { status: "error", error: (e as Error).message });
      }
    }
  }

  return (
    <>
      <div className="page-intro">
        <h2>Read documents with AI</h2>
        <p className="muted">
          Upload a salary certificate, bank or 3a statement, insurance premium summary and so on. Claude reads the amounts; you check each one before it's
          added to your data.
        </p>
      </div>
      {!aiReady && <Callout tone="warn">The AI isn't configured on the server yet (no API key). You can still enter everything by hand under "Your numbers".</Callout>}
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      >
        <strong>Drop PDFs or photos here</strong>
        <span className="muted">or click to choose files · PDF, JPEG, PNG, WebP · max 20 MB</span>
        <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      <p className="hint privacy">
        Privacy: the file goes from your browser to this server and on to Anthropic's API to be read. Neither this app nor the server keeps a copy.
      </p>

      {jobs.map((j) => (
        <Card
          key={j.id}
          title={
            <>
              {j.result ? TYPE_LABELS[j.result.documentType] : j.file.name}
              {j.status === "applied" && <span className="badge ok">added</span>}
            </>
          }
          subtitle={j.result ? `${j.file.name}${j.result.issuer ? ` · ${j.result.issuer}` : ""}${j.result.personName ? ` · ${j.result.personName}` : ""}` : undefined}
        >
          {j.status === "reading" && <p className="muted pulse">Reading…</p>}
          {j.status === "error" && <Callout tone="error">{j.error}</Callout>}
          {j.result && j.rows && (
            <>
              {j.result.taxYear && j.result.taxYear !== 2025 && <Callout tone="warn">This document is for {j.result.taxYear}, not 2025.</Callout>}
              {j.result.warnings.map((w, i) => (
                <Callout key={i} tone="warn">
                  {w}
                </Callout>
              ))}
              <table className="table">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>From the document</th>
                    <th className="num">CHF</th>
                  </tr>
                </thead>
                <tbody>
                  {j.result.fields.map((f, i) => (
                    <tr key={i}>
                      <td>{f.label}</td>
                      <td className="muted small">{f.sourceText}</td>
                      <td className="num">
                        <input
                          className="cell-input"
                          inputMode="decimal"
                          defaultValue={f.value}
                          disabled={j.status === "applied"}
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(/['\s]/g, ""));
                            if (Number.isFinite(n)) patch(j.id, { rows: j.rows!.map((r, k) => (k === i ? n : r)) });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                  {(j.result.freeTransportBoxF || j.result.canteenBoxG) && (
                    <tr>
                      <td colSpan={3} className="small">
                        {j.result.freeTransportBoxF && "Box F ticked (free transport). "}
                        {j.result.canteenBoxG && "Box G ticked (canteen / meal subsidy)."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {j.status !== "applied" && (
                <div className="apply-row">
                  <p className="small muted">{describeApply(j.result)}</p>
                  {needsPerson(j.result) && persons.length > 1 && (
                    <select value={j.personIndex} onChange={(e) => patch(j.id, { personIndex: Number(e.target.value) })}>
                      {persons.map((p, i) => (
                        <option key={i} value={i}>
                          {p.firstName || `Person ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                  {needsChild(j.result) && (
                    <select value={j.childId} onChange={(e) => patch(j.id, { childId: e.target.value })}>
                      {data.children.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.firstName || "Child"}
                        </option>
                      ))}
                    </select>
                  )}
                  {needsProperty(j.result) && (
                    <select value={j.propertyId} onChange={(e) => patch(j.id, { propertyId: e.target.value })}>
                      {data.properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.description || p.commune}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className="btn primary"
                    disabled={
                      j.result.documentType === "other" ||
                      (needsChild(j.result) && data.children.length === 0) ||
                      (needsProperty(j.result) && data.properties.length === 0)
                    }
                    onClick={() => {
                      update((d) => applyExtraction(d, j.result!, valuesOf(j.result!, j.rows), { personIndex: j.personIndex, childId: j.childId, propertyId: j.propertyId }));
                      patch(j.id, { status: "applied" });
                    }}
                  >
                    Add to my data
                  </button>
                </div>
              )}
              {j.status === "applied" && <p className="small muted">Added — you can review or adjust it under "Your numbers".</p>}
            </>
          )}
        </Card>
      ))}
    </>
  );
}
