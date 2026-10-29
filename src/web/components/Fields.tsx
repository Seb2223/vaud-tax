import { type ReactNode, useEffect, useId, useState } from "react";

interface Base {
  label: string;
  hint?: ReactNode;
  code?: string;
}

function Label({ id, label, code }: { id: string; label: string; code?: string }) {
  return (
    <label htmlFor={id} className="field-label">
      {label}
      {code && <span className="code-chip">{code}</span>}
    </label>
  );
}

export function MoneyField({ label, hint, code, value, onChange, unit = "CHF", min, step }: Base & {
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  step?: number;
}) {
  const id = useId();
  const [text, setText] = useState(value ? String(value) : "");
  // Keep the text in sync when the value changes from outside (e.g. an AI import).
  useEffect(() => {
    if ((Number(text.replace(/['\s]/g, "").replace(",", ".")) || 0) !== value) setText(value ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="field">
      <Label id={id} label={label} code={code} />
      <div className="input-unit">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          placeholder="0"
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(/['\s]/g, "").replace(",", "."));
            if (Number.isFinite(n)) onChange(min !== undefined ? Math.max(min, n) : n);
          }}
          step={step}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function TextField({ label, hint, value, onChange, placeholder, multiline, list }: Base & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  list?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <Label id={id} label={label} />
      {multiline ? (
        <textarea id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <input id={id} value={value} placeholder={placeholder} list={list} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function SelectField<T extends string>({ label, hint, code, value, onChange, options }: Base & {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const id = useId();
  return (
    <div className="field">
      <Label id={id} label={label} code={code} />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }: Base & { checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="field toggle-field">
      <label htmlFor={id} className="toggle">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Choice<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <fieldset className="choice">
      <legend className="field-label">{label}</legend>
      <div className="choice-options">
        {options.map((o) => (
          <button type="button" key={o.value} className={`choice-btn ${value === o.value ? "on" : ""}`} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            <strong>{o.label}</strong>
            {o.hint && <span>{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Card({ title, subtitle, children, actions }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export const Grid = ({ children }: { children: ReactNode }) => <div className="grid">{children}</div>;

export function Callout({ tone = "info", children }: { tone?: "info" | "warn" | "ok" | "error"; children: ReactNode }) {
  return <div className={`callout ${tone}`}>{children}</div>;
}
