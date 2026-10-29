import { useMemo, useState } from "react";
import { type CalcResult, CANTONS } from "../../shared/calc";
import { chf } from "../../shared/money";
import type { Canton, GuideLine } from "../../shared/types";
import { Callout } from "../components/Fields";

const codeNum = (c: string) => Number(c.split("-")[0]);
const AUTO = "Calculated automatically — just check the result";

function groupLines(lines: GuideLine[]) {
  const groups = new Map<string, GuideLine[]>();
  for (const l of [...lines].sort((a, b) => codeNum(a.code) - codeNum(b.code))) {
    const key = l.path[0]?.startsWith("(") || l.path.length === 0 ? AUTO : l.path[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }
  // Put the "calculated automatically" group last.
  return [...groups.entries()].sort(([a], [b]) => (a === AUTO ? 1 : 0) - (b === AUTO ? 1 : 0));
}

export function Guide({ result, canton }: { result: CalcResult; canton: Canton }) {
  const { software, lang } = CANTONS[canton];
  const groups = useMemo(() => groupLines(result.lines), [result.lines]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  if (result.lines.length === 0)
    return (
      <>
        <div className="page-intro">
          <h2>Filling guide</h2>
        </div>
        <Callout>Nothing to show yet. Fill in "Your situation" and "Your numbers" first.</Callout>
      </>
    );

  return (
    <>
      <div className="page-intro">
        <h2>Filling guide for {software} 2025</h2>
        <p className="muted">
          Open {software} next to this page and work through it {canton === "ZH" ? "form by form" : "section by section"}. Each entry shows where to go, the{" "}
          {canton === "ZH" ? "Ziffer" : "code"}, and what to enter. Amounts marked <span className="badge ifd">federal</span> are different for the federal
          tax{canton === "ZH" ? " — enter them in the Bundessteuer column" : ` — ${software} handles that itself; they're shown so you can check the result`}.
        </p>
        <button className="btn no-print" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>

      {result.notes.map((n, i) => (
        <Callout key={i}>{n}</Callout>
      ))}

      {groups.map(([section, lines]) => (
        <section className="guide-section" key={section}>
          <h3 className="guide-section-title">{section}</h3>
          {lines.map((l, i) => {
            const id = `${l.code}-${l.title}-${i}`;
            return (
              <article className={`guide-line ${checked[id] ? "checked" : ""}`} key={id}>
                <label className="guide-check no-print" title="Mark as entered">
                  <input type="checkbox" checked={!!checked[id]} onChange={(e) => setChecked((c) => ({ ...c, [id]: e.target.checked }))} />
                </label>
                <div className="guide-code">{l.code.split("-")[0]}</div>
                <div className="guide-body">
                  <div className="guide-head">
                    <div>
                      <strong>{l.title}</strong>
                      {l.person && <span className="muted"> · {l.person}</span>}
                      <div className="official" lang={lang}>
                        {lang === "fr" ? `« ${l.officialLabel} »` : `„${l.officialLabel}“`}
                      </div>
                    </div>
                    <div className="guide-amount">
                      {l.kind === "info" && l.code === "810" ? (
                        <span className="amount">{l.icc}</span>
                      ) : (
                        <span className={`amount ${l.kind}`}>
                          {l.kind === "deduction" || l.kind === "debt" ? "− " : ""}
                          {chf(l.icc)}
                        </span>
                      )}
                      {l.ifd !== undefined && l.ifd !== l.icc && <span className="badge ifd">federal {chf(l.ifd)}</span>}
                    </div>
                  </div>
                  {l.path.length > 1 && (
                    <ol className="crumbs" lang={lang}>
                      {l.path.map((p, k) => (
                        <li key={k}>{p}</li>
                      ))}
                    </ol>
                  )}
                  <p className="small">{l.explanation}</p>
                  {l.warnings?.map((w, k) => (
                    <Callout tone="warn" key={k}>
                      {w}
                    </Callout>
                  ))}
                  <p className="source">Source: {l.source}</p>
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}
