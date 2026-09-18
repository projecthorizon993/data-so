// Build: validate templates + minify check + emit dist/ for Pages (static = root copy).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html","config.json","chat.template.json","items.json","chat.template.jinja","manifest.webmanifest","sw.js","robots.txt"]) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, path.basename(f)));
}
for (const d of ["assets","api","sheets"]) {
  const src = path.join(root, d);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.join(out, d), { recursive: true });
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(out, d, f));
}
// validate chat template JSON + item bank + backend proxy
JSON.parse(fs.readFileSync(path.join(root, "chat.template.json"), "utf8"));
const bank = JSON.parse(fs.readFileSync(path.join(root, "items.json"), "utf8"));
if (!Array.isArray(bank.items) || bank.items.length < 10) throw new Error("items.json must contain item bank");
const srv = fs.readFileSync(path.join(root, "server.js"), "utf8");
if (!srv.includes("v1/chat/completions")) throw new Error("server.js must proxy NIM completions endpoint");
if (!srv.includes("resolveSystem")) throw new Error("server.js must resolve the fixed system prompt");
const wr = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
if (wr.main !== "worker.js" || wr.assets?.directory !== "./out") throw new Error("wrangler.jsonc must use worker.js + ./out assets");
const wk = fs.readFileSync(path.join(root, "worker.js"), "utf8");
if (!wk.includes("env.ASSETS")) throw new Error("worker.js must fall through to static assets");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (!html.includes("/api/chat")) throw new Error("index.html must reference /api/chat");
const js = fs.readFileSync(path.join(root, "assets/app.js"), "utf8");
// Pages hardening: disable Jekyll (keeps _files + dotfiles), SPA fallback
fs.writeFileSync(path.join(out, ".nojekyll"), "");
fs.copyFileSync(path.join(out, "index.html"), path.join(out, "404.html"));
console.log(`[build] ok — html=${html.length}B js=${js.length}B -> ./out`);
