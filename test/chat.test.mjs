import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("brand is AURA screening assistant", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /AURA/);
  assert.match(html, /Start screening/);
  const tpl = JSON.parse(fs.readFileSync(new URL("../chat.template.json", import.meta.url), "utf8"));
  assert.match(tpl.system, /AURA/);
});

test("chat template is short (low tokens)", () => {
  const t = JSON.parse(fs.readFileSync(new URL("../chat.template.json", import.meta.url), "utf8"));
  assert.ok(t.system.length > 10 && t.system.length < 2000, "system prompt must stay short");
});

test("frontend calls /api/chat with streaming + stop + cache", () => {
  const js = fs.readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(js, /text\/event-stream/);
  assert.match(js, /AbortController/);
  assert.match(js, /localStorage/);
  assert.match(js, /system: SYSTEM/); // fixed prompt rides in `system` field
  assert.match(html, /\/api\/chat/);
  assert.match(html, /data-theme/);
  assert.doesNotMatch(html, /promptInput/); // prompt editor removed
});

test("session runner + reset wiring present", () => {
  const js = fs.readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(js, /startSession/);
  assert.match(js, /resetSession/);
  assert.match(js, /data-retry/);
  assert.match(js, /never repeat/); // protocol: no repeated items
  assert.match(js, /never refuse a benign/); // protocol: no false refusals
  assert.match(js, /turns\.slice\(0, 4\)/); // intake anchor against context loss
  assert.match(js, /60_000/); // client cap fits reasoning models
  assert.match(html, /sessResetBtn/);
  assert.match(html, /sessBadge/);
  assert.match(html, /data-session/);
});

test("backend proxy accepts system prompt (capped, no secrets)", () => {
  const srv = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(srv, /body\.system/);
  assert.match(srv, /MAX_SYSTEM/);
  assert.match(srv, /DEFAULT_SYSTEM/);
  assert.match(srv, /v1\/chat\/completions/);
  assert.match(srv, /x-cache/); // LRU cache header
  assert.doesNotMatch(srv, /nvapi-/);
});

test("no Vercel leftovers (Pages-only hosting)", () => {
  assert.ok(!fs.existsSync(new URL("../vercel.json", import.meta.url)), "vercel.json removed");
  assert.ok(!fs.existsSync(new URL("../api/chat.js", import.meta.url)), "Edge function removed");
  const js = fs.readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /Vercel URL/);
});

test("worker serves UI + API (Cloudflare single deploy)", () => {
  const wr = JSON.parse(fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(wr.main, "worker.js");
  assert.equal(wr.assets.directory, "./out");
  const wk = fs.readFileSync(new URL("../worker.js", import.meta.url), "utf8");
  assert.match(wk, /env\.ASSETS/);
  assert.match(wk, /\/api\/chat/);
  assert.match(wk, /90_000/); // upstream cap fits reasoning models
});
