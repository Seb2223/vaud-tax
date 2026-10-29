import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { ChatMessage } from "../shared/aiSchemas";
import { AiError, chat, extractDocument, findDeductions, MODEL, reviewReturn } from "./ai";

const PORT = Number(process.env.PORT ?? 6969);
const STATIC_DIR = process.env.STATIC_DIR ?? "dist/web";
const MAX_UPLOAD_MB = 20;
const AI_REQUESTS_PER_HOUR = Number(process.env.AI_REQUESTS_PER_HOUR ?? 120);

const app = new Hono();

// Access log without request bodies — tax data never reaches the logs.
app.use(async (c, next) => {
  const start = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
});

// Defence in depth behind Cloudflare Access: if configured, every API call must
// carry a valid Access JWT, so the API can't be used by bypassing the tunnel.
const team = process.env.CF_ACCESS_TEAM_DOMAIN;
const aud = process.env.CF_ACCESS_AUD;
if (team && aud) {
  const jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
  const verifyAccess: MiddlewareHandler = async (c, next) => {
    const token = c.req.header("cf-access-jwt-assertion");
    if (!token) return c.json({ error: "Missing Cloudflare Access token." }, 401);
    try {
      await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
    } catch {
      return c.json({ error: "Invalid Cloudflare Access token." }, 401);
    }
    await next();
  };
  app.use("/api/*", verifyAccess);
  console.log(`Cloudflare Access verification enabled for ${team}`);
} else {
  console.warn("CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not set: API calls are not verified against Cloudflare Access.");
}

// Simple spend guard for the paid AI endpoints.
const hits: number[] = [];
const rateLimit: MiddlewareHandler = async (c, next) => {
  const now = Date.now();
  while (hits.length && hits[0] < now - 3600_000) hits.shift();
  if (hits.length >= AI_REQUESTS_PER_HOUR) return c.json({ error: `AI limit of ${AI_REQUESTS_PER_HOUR} requests per hour reached.` }, 429);
  hits.push(now);
  await next();
};
app.use("/api/ai/*", rateLimit);

app.onError((err, c) => {
  if (err instanceof AiError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: "Unexpected server error." }, 500);
});

app.get("/api/health", (c) =>
  c.json({ ok: true, model: MODEL, aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY), accessVerified: Boolean(team && aud) }),
);

const ACCEPTED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

app.post("/api/ai/extract", bodyLimit({ maxSize: MAX_UPLOAD_MB * 1024 * 1024 }), async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "No file uploaded." }, 400);
  if (!ACCEPTED.has(file.type)) return c.json({ error: "Upload a PDF or an image (JPEG, PNG, WebP)." }, 415);
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const hint = String(form.get("hint") ?? "").slice(0, 200);
  return c.json(await extractDocument({ data, mediaType: file.type, name: file.name }, hint));
});

const jsonLimit = bodyLimit({ maxSize: 2 * 1024 * 1024 });

app.post("/api/ai/deductions", jsonLimit, async (c) => {
  const { data } = await c.req.json();
  return c.json({ suggestions: await findDeductions(data) });
});

app.post("/api/ai/review", jsonLimit, async (c) => {
  const { data } = await c.req.json();
  return c.json(await reviewReturn(data));
});

app.post("/api/ai/chat", jsonLimit, async (c) => {
  const { data, messages } = (await c.req.json()) as { data: unknown; messages: ChatMessage[] };
  const chunks = chat(data, Array.isArray(messages) ? messages : []);
  return streamSSE(c, async (stream) => {
    try {
      for await (const text of chunks) await stream.writeSSE({ event: "text", data: JSON.stringify(text) });
      await stream.writeSSE({ event: "done", data: "{}" });
    } catch (err) {
      const message = err instanceof AiError ? err.message : "Unexpected server error.";
      if (!(err instanceof AiError)) console.error(err);
      await stream.writeSSE({ event: "error", data: JSON.stringify(message) });
    }
  });
});

app.use("/*", serveStatic({ root: STATIC_DIR }));
app.get("*", serveStatic({ path: `${STATIC_DIR}/index.html` }));

serve({ fetch: app.fetch, port: PORT, hostname: process.env.HOST ?? "0.0.0.0" }, (info) =>
  console.log(`Vaud tax helper listening on http://${info.address}:${info.port} (model ${MODEL})`),
);
