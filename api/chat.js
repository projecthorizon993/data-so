export const runtime = "edge";
export const preferredRegion = "iad1";
export const maxDuration = 30;

// POST /api/chat -> NIM /v1/chat/completions
// Free-tier notes: Edge = fast cold start, no Node deps, 25s upstream cap
// (under the 30s Hobby limit), tiny payloads, no persistent server state.
// Identical-prompt caching lives on the client (localStorage LRU); here we
// only stream through and add safe headers.

const ALLOW = "*";
const cors = {
  "access-control-allow-origin": ALLOW,
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "86400",
};

const enc = new TextEncoder();
const sse = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return Response.json({ error: "not found" }, { status: 404, headers: cors });
  }

  const NIM_URL = process.env.NIM_API_URL || "";
  const NIM_KEY = process.env.NIM_API_KEY || "";
  const NIM_MODEL = process.env.NIM_MODEL || "meta/llama-3.1-8b-instruct";
  if (!NIM_URL) {
    return Response.json(
      { error: "misconfigured", detail: "Set NIM_API_URL (+ NIM_API_KEY) in Vercel env." },
      { status: 500, headers: cors }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400, headers: cors });
  }

  // ---- strict validation: keeps Hobby bandwidth + GPU cost down ----
  const raw = Array.isArray(body.messages) ? body.messages.slice(-13) : [];
  if (!raw.length) return Response.json({ error: "no_messages" }, { status: 400, headers: cors });
  const messages = [];
  for (const m of raw) {
    const role = m?.role === "assistant" ? "assistant" : m?.role === "system" ? "system" : "user";
    const content = String(m?.content ?? "").slice(0, 4000);
    if (!content.trim()) continue;
    messages.push({ role, content });
  }
  if (!messages.length) return Response.json({ error: "empty_messages" }, { status: 400, headers: cors });

  const model = String(body.model || NIM_MODEL).slice(0, 120);
  const stream = body.stream !== false;
  // Free-tier token guard: small default, hard cap 512 output.
  const max_tokens = Math.max(32, Math.min(Number(body.max_tokens) || 256, 512));

  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort("upstream_timeout"), 25_000);
  let up;
  try {
    up = await fetch(NIM_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        accept: stream ? "text/event-stream" : "application/json",
        ...(NIM_KEY ? { authorization: `Bearer ${NIM_KEY}` } : {}),
      },
      body: JSON.stringify({ model, messages, stream, max_tokens, temperature: 0.6 }),
    });
  } catch (e) {
    clearTimeout(killer);
    const timeout = String(e?.message || e).includes("abort") || e === "upstream_timeout";
    return Response.json(
      { error: timeout ? "upstream_timeout" : "upstream_failed", detail: "NIM host unreachable. Check NIM_API_URL." },
      { status: timeout ? 504 : 502, headers: cors }
    );
  }
  clearTimeout(killer);

  if (!up.ok) {
    const detail = (await up.text().catch(() => "")).slice(0, 500);
    return Response.json({ error: "nim_error", status: up.status, detail }, { status: up.status >= 500 ? 502 : up.status, headers: cors });
  }
  if (!stream || !up.body) {
    const txt = await up.text();
    return new Response(txt, {
      status: 200,
      headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  // Stream passthrough (no buffering = lowest TTFB + lowest memory on Hobby).
  const passthrough = new ReadableStream({
    async start(c) {
      const reader = up.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          c.enqueue(value);
        }
      } catch {
        c.enqueue(sse({ choices: [{ delta: { content: "\n\n⚠️ Stream interrupted — partial reply above." } }] }));
      } finally {
        try { c.enqueue(enc.encode("data: [DONE]\n\n")); } catch {}
        c.close();
      }
    },
    cancel() { try { readerCancel(up); } catch {} },
  });
  return new Response(passthrough, {
    status: 200,
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      "x-vercel-cache": "BYPASS",
    },
  });
}

function readerCancel(up) {
  try { up.body?.cancel?.(); } catch {}
}
