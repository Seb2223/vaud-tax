import { useEffect, useMemo, useRef, useState } from "react";
import { CANTONS, communesFor, compute } from "../shared/calc";
import { emptyData } from "../shared/defaults";
import { chf } from "../shared/money";
import { health, type Health } from "./api";
import { Callout } from "./components/Fields";
import { decryptJson, encryptJson, isEncrypted } from "./crypto";
import { Assistant } from "./pages/Assistant";
import { Checklist } from "./pages/Checklist";
import { Details } from "./pages/Details";
import { Documents } from "./pages/Documents";
import { Estimate } from "./pages/Estimate";
import { Guide } from "./pages/Guide";
import { Situation } from "./pages/Situation";
import { downloadJson, usePref, useTaxData } from "./store";

const STEPS = [
  { id: "situation", label: "Your situation" },
  { id: "checklist", label: "Documents to gather" },
  { id: "documents", label: "Read documents", ai: true },
  { id: "details", label: "Your numbers" },
  { id: "guide", label: "Filling guide" },
  { id: "estimate", label: "Tax estimate" },
  { id: "assistant", label: "AI assistant", ai: true },
] as const;
type StepId = (typeof STEPS)[number]["id"];

function DataPanel({ onExport, onImport, onReset }: { onExport: (pw: string) => Promise<void>; onImport: (f: File, pw: string) => Promise<void>; onReset: () => void }) {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="data-panel">
      <h4>Your data</h4>
      <p className="small muted">Stored only in this browser. Export a file to keep a backup and to start next year's return from it.</p>
      <input type="password" placeholder="Password (optional)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      <div className="data-buttons">
        <button
          className="btn"
          onClick={async () => {
            try {
              await onExport(pw);
              setMsg({ tone: "ok", text: pw ? "Encrypted file downloaded." : "File downloaded (not encrypted)." });
            } catch (err) {
              setMsg({ tone: "error", text: `Export failed: ${(err as Error).message}` });
            }
          }}
        >
          Export
        </button>
        <button className="btn" onClick={() => file.current?.click()}>
          Import
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            await onImport(f, pw);
            setMsg({ tone: "ok", text: "Imported." });
          } catch (err) {
            setMsg({ tone: "error", text: (err as Error).message });
          }
        }}
      />
      {msg && <p className={`small ${msg.tone === "error" ? "error-text" : "ok-text"}`}>{msg.text}</p>}
      <button className="link danger small" onClick={onReset}>
        Erase all data in this browser
      </button>
    </div>
  );
}

export function App() {
  const { data, update, replace, saveError } = useTaxData();
  const [step, setStep] = usePref<StepId>("step", "situation");
  const [status, setStatus] = useState<Health | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const result = useMemo(() => compute(data), [data]);
  const communes = useMemo(() => communesFor(data.canton), [data.canton]);
  const canton = CANTONS[data.canton];
  const aiReady = !!status?.aiConfigured;

  useEffect(() => {
    health()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollTo, which React would treat as a cleanup function.
    window.scrollTo({ top: 0 });
  }, [step]);

  const goTo = (s: string) => {
    setStep(s as StepId);
    setNavOpen(false);
  };
  const idx = STEPS.findIndex((s) => s.id === step);

  async function importFile(f: File, pw: string) {
    let parsed: unknown = JSON.parse(await f.text());
    if (isEncrypted(parsed)) {
      if (!pw) throw new Error("This file is encrypted: type its password in the box first.");
      parsed = await decryptJson(parsed, pw);
    }
    const imported = parsed as { taxYear?: number };
    if (!confirm(`Replace the data in this browser with "${f.name}"${imported.taxYear ? ` (tax year ${imported.taxYear})` : ""}?`)) return;
    replace(parsed as typeof data);
  }

  return (
    <div className="app" data-canton={data.canton}>
      <header className="topbar">
        <button className="menu-btn" aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
          ☰
        </button>
        <div className="brand">
          <span className="logo" aria-hidden>
            {data.canton}
          </span>
          <div>
            <strong>Tax helper 2025</strong>
            <span className="muted small">
              {data.canton === "ZH" ? "Kanton Zürich" : "Canton de Vaud"} · {canton.software}
            </span>
          </div>
        </div>
        <div className="topbar-total" title="Estimated total tax (cantonal, communal, federal)">
          <span className="muted small">Estimate</span>
          <strong>{chf(result.estimate.total)}</strong>
        </div>
      </header>

      <div className="layout">
        <nav className={`sidebar ${navOpen ? "open" : ""}`}>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button className={s.id === step ? "active" : ""} onClick={() => goTo(s.id)}>
                  <span className="step-num">{i + 1}</span>
                  {s.label}
                  {"ai" in s && <span className="ai-tag">AI</span>}
                </button>
              </li>
            ))}
          </ol>
          <DataPanel
            onExport={async (pw) => {
              const name = `vaud-tax-${data.taxYear}${pw ? "-encrypted" : ""}.json`;
              downloadJson(pw ? await encryptJson(data, pw) : data, name);
            }}
            onImport={importFile}
            onReset={() => confirm("Erase everything stored in this browser? Export a backup first if you need it.") && replace(emptyData())}
          />
          <p className="small muted status">
            {status ? (
              <>
                AI: {status.aiConfigured ? <span className="ok-text">ready</span> : <span className="error-text">no API key</span>} · {status.model}
              </>
            ) : (
              "Server not reachable"
            )}
          </p>
        </nav>

        <main className="content">
          {saveError && <Callout tone="error">This browser is blocking local storage, so your entries won't survive a reload. Export them regularly.</Callout>}
          {step === "situation" && <Situation data={data} update={update} />}
          {step === "checklist" && <Checklist data={data} update={update} goTo={goTo} />}
          {step === "documents" && <Documents data={data} update={update} aiReady={aiReady} />}
          {step === "details" && <Details data={data} update={update} />}
          {step === "guide" && <Guide result={result} canton={data.canton} />}
          {step === "estimate" && <Estimate data={data} result={result} />}
          {step === "assistant" && <Assistant data={data} aiReady={aiReady} />}

          <div className="pager no-print">
            {idx > 0 && (
              <button className="btn" onClick={() => goTo(STEPS[idx - 1].id)}>
                ← {STEPS[idx - 1].label}
              </button>
            )}
            <span />
            {idx < STEPS.length - 1 && (
              <button className="btn primary" onClick={() => goTo(STEPS[idx + 1].id)}>
                {STEPS[idx + 1].label} →
              </button>
            )}
          </div>
        </main>
      </div>

      <datalist id="communes">
        {communes.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
    </div>
  );
}
