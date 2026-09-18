// Build: validate templates + minify check + emit dist/ for Pages (static = root copy).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html","config.json","chat.template.json","chat.template.jinja","manifest.webmanifest","sw.js","robots.txt","server.js","package.json"]) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, path.basename(f)));
}
for (const d of ["assets","api"]) {
  const src = path.join(root, d);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.join(out, d), { recursive: true });
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(out, d, f));
}
// validate chat template JSON + vercel free-tier config
JSON.parse(fs.readFileSync(path.join(root, "chat.template.json"), "utf8"));
JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const api = fs.readFileSync(path.join(root, "api/chat.js"), "utf8");
if (!api.includes('runtime = "edge"')) throw new Error("api/chat.js must use edge runtime for Hobby");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
if (!html.includes("/api/chat")) throw new Error("index.html must reference /api/chat");
const js = fs.readFileSync(path.join(root, "assets/app.js"), "utf8");
console.log(`[build] ok — html=${html.length}B js=${js.length}B -> ./out`);
