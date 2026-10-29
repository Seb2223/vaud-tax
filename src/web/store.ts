import { useCallback, useEffect, useState } from "react";
import { emptyData, normalize } from "../shared/defaults";
import type { TaxData } from "../shared/types";

const KEY = "vaud-tax-2025";

function load(): TaxData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    // Storage blocked or corrupted: start empty.
  }
  return emptyData();
}

export type Update = (fn: (d: TaxData) => void) => void;

/** Household data kept in this browser only; every change is saved immediately. */
export function useTaxData() {
  const [data, setData] = useState<TaxData>(load);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [data]);

  /** Mutate a draft copy; the copy replaces the state. */
  const update: Update = useCallback((fn) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const replace = useCallback((d: TaxData) => setData(normalize(d)), []);
  return { data, update, replace, saveError };
}

/** Remembered UI preferences (current step, etc.). */
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`vaud-tax-pref-${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(`vaud-tax-pref-${key}`, JSON.stringify(nv));
      } catch {
        // ignore
      }
    },
    [key],
  );
  return [v, set];
}

export function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
