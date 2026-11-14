// Chat API for rksasikumar.com.
//
// The browser widget POSTs the conversation to /chat. This Worker holds the Anthropic API key
// (a Cloudflare secret, never sent to the browser), adds the assistant's instructions and the
// website knowledge (read live from rksasikumar.com/chat-knowledge.txt, which the site build
// publishes), and streams Claude's answer back as server-sent events:
//   data: {"t": "text delta"}   ...   data: {"done": true}   (or data: {"error": "message"})

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompt.js";

// Defaults, so the Worker runs with only the ANTHROPIC_API_KEY secret set. Any of these can be
// overridden with a variable of the same name in the Worker's settings.
const DEFAULTS = {
  MODEL: "claude-opus-5-5",      // claude-haiku-5-5 costs about 40x less
  EFFORT: "low",                 // short Q&A: low effort keeps answers quick and cheap
  ALLOWED_ORIGINS: "https://rksasikumar.com,https://www.rksasikumar.com",
  KNOWLEDGE_URL: "https://rksasikumar.com/chat-knowledge.txt",
};
const setting = (env, name) => (env[name] || DEFAULTS[name]);

const MAX_MESSAGES = 16;     // conversation turns kept per request (user + assistant)
const MAX_CHARS = 1500;      // longest message a visitor may send
const PER_MINUTE = 10;       // messages per visitor per minute
// Models that support server-side refusal fallbacks. Others (for example claude-haiku-5-5) run without them.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"]);

const FRIENDLY = {
  busy: "I'm getting a lot of questions right now. Please try again in a minute, or contact Rama directly at rk@rksasikumar.com.",
  unavailable: "The assistant is unavailable at the moment. Please contact Rama directly at rk@rksasikumar.com.",
  refusal: "Sorry, I can't help with that one. I'm happy to answer questions about Rama's experience, projects or how to contact him.",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    if (url.pathname === "/health") return json({ ok: true, model: modelOf(env) }, 200, cors);
    if (url.pathname !== "/chat" || request.method !== "POST") return json({ error: "Not found" }, 404, cors);
    if (!cors) return json({ error: "This assistant only answers on rksasikumar.com." }, 403, null);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const allowed = env.CHAT_LIMITER ? (await env.CHAT_LIMITER.limit({ key: ip })).success : allowLocally(ip);
    if (!allowed) return json({ error: FRIENDLY.busy }, 429, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400, cors); }
    const messages = cleanMessages(body && body.messages);
    if (!messages) return json({ error: "Invalid request." }, 400, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: FRIENDLY.unavailable }, 503, cors);
    let knowledge;
    try { knowledge = await getKnowledge(env); }
    catch (err) { console.error("knowledge error", err && err.message); return json({ error: FRIENDLY.unavailable }, 503, cors); }

    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      baseURL: env.ANTHROPIC_BASE_URL || undefined, // only set for local testing
      maxRetries: 1,
    });
    const model = modelOf(env);
    const params = {
      model,
      max_tokens: 4000,
      output_config: { effort: setting(env, "EFFORT") },
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        { type: "text", text: knowledge, cache_control: { type: "ephemeral" } }, // cached across visitors
      ],
      messages,
    };
    if (FALLBACK_MODELS.has(model)) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const send = data => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

    ctx.waitUntil((async () => {
      try {
        const stream = client.beta.messages.stream(params);
        stream.on("text", delta => { send({ t: delta }); });
        const message = await stream.finalMessage();
        if (message.stop_reason === "refusal") send({ t: (message.content.some(b => b.type === "text" && b.text) ? "\n\n" : "") + FRIENDLY.refusal });
        const u = message.usage || {};
        console.log(JSON.stringify({ model: message.model, stop: message.stop_reason, input: u.input_tokens, cache_read: u.cache_read_input_tokens, cache_write: u.cache_creation_input_tokens, output: u.output_tokens }));
        await send({ done: true });
      } catch (err) {
        console.error("chat error", errorSummary(err));
        await send({ error: friendlyError(err) });
      } finally {
        try { await writer.close(); } catch {}
      }
    })());

    return new Response(readable, {
      headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
    });
  },
};

function modelOf(env) {
  return setting(env, "MODEL");
}

// Website knowledge, fetched from the live site and kept for 5 minutes. The same text on every
// request keeps the prompt cache warm; a site update reaches the assistant within minutes.
let knowledgeCache = { text: "", at: 0 };
async function getKnowledge(env) {
  if (knowledgeCache.text && Date.now() - knowledgeCache.at < 5 * 60 * 1000) return knowledgeCache.text;
  try {
    const res = await fetch(setting(env, "KNOWLEDGE_URL"), { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) throw new Error(`knowledge fetch failed: ${res.status}`);
    const text = (await res.text()).trim().slice(0, 200000);
    if (!text) throw new Error("knowledge is empty");
    knowledgeCache = { text, at: Date.now() };
  } catch (err) {
    if (!knowledgeCache.text) throw err; // nothing to fall back on
    console.error("using previous knowledge:", err.message);
  }
  return knowledgeCache.text;
}

// Per-visitor limit when no Cloudflare rate-limit binding is configured. It counts within one
// Worker instance, so it's approximate; the Anthropic spend limit is the hard cap.
const hits = new Map();
function allowLocally(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (recent.length >= PER_MINUTE) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = setting(env, "ALLOWED_ORIGINS").split(",").map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// Accept only a plain alternating user/assistant text conversation that ends with the visitor.
function cleanMessages(input) {
  if (!Array.isArray(input) || input.length === 0) return null;
  let list = input.slice(-MAX_MESSAGES);
  while (list.length && list[0].role !== "user") list = list.slice(1);
  if (!list.length) return null;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== expected || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, m.role === "user" ? MAX_CHARS : 4000);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  return out[out.length - 1].role === "user" ? out : null;
}

function friendlyError(err) {
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.OverloadedError) return FRIENDLY.busy;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return FRIENDLY.unavailable;
  if (err instanceof Anthropic.APIConnectionError) return FRIENDLY.busy;
  if (err instanceof Anthropic.APIError) return FRIENDLY.unavailable;
  return FRIENDLY.unavailable;
}

function errorSummary(err) {
  if (err instanceof Anthropic.APIError) return { status: err.status, name: err.name, message: err.message };
  return { name: err && err.name, message: err && err.message };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { ...(cors || {}), "Content-Type": "application/json" } });
}
