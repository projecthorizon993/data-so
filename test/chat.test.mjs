import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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
  assert.match(html, /\/api\/chat/);
  assert.match(html, /data-theme/);
});

test("edge api fits Vercel free tier", () => {
  const s = fs.readFileSync(new URL("../api/chat.js", import.meta.url), "utf8");
  assert.match(s, /runtime.*edge/);
  assert.match(s, /maxDuration/);
  assert.match(s, /25_000/); // upstream cap under Hobby limit
  assert.match(s, /max_tokens/);
  assert.doesNotMatch(s, /node:/);
});

test("vercel.json is free-tier clean (no legacy builds/routes)", () => {
  const v = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(!v.builds && !v.routes, "avoid legacy builds/routes on Hobby");
  assert.ok(v.functions?.["api/chat.js"]?.maxDuration <= 30);
  assert.ok(Array.isArray(v.headers) && v.headers.length >= 3);
});
