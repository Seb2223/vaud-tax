import type { ChatMessage, DeductionSuggestion, Extraction, Review } from "../shared/aiSchemas";
import type { TaxData } from "../shared/types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(res.ok ? "Unexpected response from the server." : `Server error ${res.status}.`);
  }
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Server error ${res.status}.`);
  return json as T;
}

export interface Health {
  ok: boolean;
  model: string;
  aiConfigured: boolean;
  accessVerified: boolean;
}

export const health = () => fetch("/api/health").then((r) => parse<Health>(r));

export async function extract(file: File, hint: string): Promise<Extraction> {
  const form = new FormData();
  form.append("file", file);
  form.append("hint", hint);
  return parse<Extraction>(await fetch("/api/ai/extract", { method: "POST", body: form }));
}

export const findDeductions = (data: TaxData) => post<{ suggestions: DeductionSuggestion[] }>("/api/ai/deductions", { data }).then((r) => r.suggestions);

export const review = (data: TaxData) => post<Review>("/api/ai/review", { data });

/** Streams the assistant's answer; calls onText with each chunk. */
export async function chat(data: TaxData, messages: ChatMessage[], onText: (t: string) => void, signal?: AbortSignal) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data, messages }),
    signal,
  });
  if (!res.ok || !res.body) return parse(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1];
      const payload = /^data: (.*)$/m.exec(raw)?.[1] ?? "";
      if (event === "text") onText(JSON.parse(payload));
      if (event === "error") throw new Error(JSON.parse(payload));
    }
  }
}
