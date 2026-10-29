import { useRef, useState } from "react";
import type { ChatMessage, DeductionSuggestion, Review } from "../../shared/aiSchemas";
import { CANTONS } from "../../shared/calc";
import { chf } from "../../shared/money";
import type { TaxData } from "../../shared/types";
import { chat, findDeductions, review } from "../api";
import { Callout, Card } from "../components/Fields";
import { Markdown } from "../components/Markdown";

const suggested = (software: string) => [
  `Where exactly do I enter my pillar 3a in ${software}?`,
  "Is the flat rate or actual costs better for my professional expenses?",
  "Which documents do I have to attach?",
  "Why is my federal taxable income different from the cantonal one?",
];

export function Assistant({ data, aiReady }: { data: TaxData; aiReady: boolean }) {
  const [suggestions, setSuggestions] = useState<DeductionSuggestion[] | null>(null);
  const [reviewResult, setReviewResult] = useState<Review | null>(null);
  const [busy, setBusy] = useState<"deductions" | "review" | "chat" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const abort = useRef<AbortController | null>(null);

  async function run<T>(kind: "deductions" | "review", fn: () => Promise<T>, done: (r: T) => void) {
    setBusy(kind);
    setError(null);
    try {
      done(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy("chat");
    setError(null);
    abort.current = new AbortController();
    try {
      await chat(
        data,
        history,
        (t) =>
          setMessages((ms) => {
            const copy = [...ms];
            copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + t };
            return copy;
          }),
        abort.current.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
      setMessages((ms) => (ms[ms.length - 1]?.content ? ms : ms.slice(0, -2)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="page-intro">
        <h2>AI assistant</h2>
        <p className="muted">
          Claude works from the official 2025 {CANTONS[data.canton].name} instructions and from your data. The amounts in the filling guide come from fixed rules; the AI only
          suggests, explains and checks.
        </p>
        <p className="hint privacy">Privacy: your household data is sent through this server to Anthropic's API for each request. Nothing is stored on the server.</p>
      </div>
      {!aiReady && <Callout tone="warn">The AI isn't configured on the server yet (ANTHROPIC_API_KEY missing).</Callout>}
      {error && <Callout tone="error">{error}</Callout>}

      <Card
        title="Find deductions"
        subtitle="Looks for deductions you may be missing or under-claiming."
        actions={
          <button className="btn primary" disabled={!aiReady || !!busy} onClick={() => run("deductions", () => findDeductions(data), setSuggestions)}>
            {busy === "deductions" ? "Looking…" : suggestions ? "Look again" : "Find deductions"}
          </button>
        }
      >
        {busy === "deductions" && <p className="muted pulse">Checking your situation against the 2025 rules… this can take a minute.</p>}
        {suggestions?.length === 0 && <Callout tone="ok">No missing deductions found.</Callout>}
        {suggestions?.map((s, i) => (
          <div className="suggestion" key={i}>
            <div className="suggestion-head">
              <span className="code-chip">{s.code}</span>
              <strong>{s.title}</strong>
              {s.estimatedAmountChf !== null && <span className="amount deduction">≈ {chf(s.estimatedAmountChf)}</span>}
              <span className={`badge conf-${s.confidence}`}>{s.confidence} confidence</span>
            </div>
            <p className="small">{s.reasoning}</p>
            <p className="source">Rule: {s.officialRule}</p>
            {s.questionForUser && <Callout>To confirm: {s.questionForUser}</Callout>}
            {s.validation && <Callout tone="warn">{s.validation}</Callout>}
          </div>
        ))}
      </Card>

      <Card
        title="Final review"
        subtitle="Checks for mistakes and missing items before you file."
        actions={
          <button className="btn primary" disabled={!aiReady || !!busy} onClick={() => run("review", () => review(data), setReviewResult)}>
            {busy === "review" ? "Reviewing…" : reviewResult ? "Review again" : "Review my return"}
          </button>
        }
      >
        {busy === "review" && <p className="muted pulse">Reviewing… this can take a minute.</p>}
        {reviewResult && (
          <>
            <p>{reviewResult.summary}</p>
            {reviewResult.issues.length === 0 && <Callout tone="ok">No issues found.</Callout>}
            {reviewResult.issues.map((x, i) => (
              <div className={`issue ${x.severity}`} key={i}>
                <span className={`badge sev-${x.severity}`}>{x.severity}</span>
                {x.code && <span className="code-chip">{x.code}</span>}
                <div>
                  <strong>{x.message}</strong>
                  <p className="small">{x.suggestion}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </Card>

      <Card
        title="Ask a question"
        subtitle={data.canton === "ZH" ? "Answers cite the official Wegleitung 2025." : "Answers cite the official instructions (IG = instructions générales, IC = propriété immobilière)."}
      >
        <div className="chat" aria-live="polite">
          {messages.length === 0 && (
            <div className="suggested">
              {suggested(CANTONS[data.canton].software).map((q) => (
                <button key={q} className="chip" disabled={!aiReady || !!busy} onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" ? m.content ? <Markdown text={m.content} /> : <span className="muted pulse">Thinking…</span> : m.content}
            </div>
          ))}
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <textarea
            value={draft}
            placeholder="Ask about your return…"
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(draft);
              }
            }}
          />
          {busy === "chat" ? (
            <button type="button" className="btn" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="btn primary" disabled={!aiReady || !draft.trim()}>
              Send
            </button>
          )}
        </form>
        {messages.length > 0 && !busy && (
          <button className="link" onClick={() => setMessages([])}>
            Clear conversation
          </button>
        )}
      </Card>
    </>
  );
}
