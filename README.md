# AURA — Campus Screening Assistant

Static chat UI + deterministic scoring + Google Sheets export, backed by NVIDIA NIM.
Built for a supervised campus screening pilot (Asia University Hanoi).

## How it works

```
Browser (chat UI, history, scoring) → /api/chat → NIM model → reply
Browser (⬆ Export) → Apps Script /exec → Google Sheet `results`
```

- **Prompt**: fixed system prompt from `chat.template.json` (agent-authored per `PROMPT_RULES.md`).
- **Items**: `items.json` — 15 cognitive + 17 mental-state items, static config, no code changes to edit wording.
- **Session**: ▶ Start builds a Block D run (~25 items, safety mid-block); the model presents each item verbatim; replies link to exact item IDs.
- **Scoring** (`assets/score.js`): deterministic, in-browser. Crisis (safety ≥ Often or crisis words) always applies; numeric tiers need counselor thresholds (currently `null` → `pending-thresholds`, never invented).
- **Export** (`assets/export.js`): student ID is SHA-256 hashed (salt in `config.json`), payload posted to the Apps Script URL. Nothing leaves the browser before Export.

## Run it

| Mode | Command / step |
|---|---|
| Local | Set `.env` (`NIM_API_URL`, `NIM_API_KEY`, `NIM_MODEL`), then `node server.js` → `http://localhost:3000` |
| Cloudflare (prod) | `worker.js` serves UI + API in one deploy (`wrangler.jsonc`); set `NIM_API_URL` / `NIM_MODEL` vars + `NIM_API_KEY` secret |
| Codespaces | Open a codespace (`.devcontainer/`), add repo secrets, `node server.js`, forward port 3000 Public |
| GitHub Pages | Static UI only — set `config.json → apiEndpoint` to a live backend URL |

## Connect the spreadsheet

1. New Google Sheet → Extensions → Apps Script → paste `sheets/Code.gs` → Save.
2. Deploy → New deployment → Web app (Execute as **Me**, access **Anyone**) → copy `/exec` URL.
3. Put it in `config.json → sheetsEndpoint` (+ change `idSalt`) → push.
4. If the `results` tab predates new columns, delete it once so headers regenerate.

## Checks

- `npm test` — 14 tests (prompt rules, session builder, scorer, export shape, deploy wiring).
- `npm run build` — validates templates + bank, emits `./out` (Pages artifact) with `.nojekyll` + `404.html`.

## Before pilot launch

- Counselor signs thresholds in `items.json` (currently pending review after 12-student pilot).
- Confirm real crisis contacts in app materials (never hardcode hotlines in prompts).
- Rotate any API key that was ever pasted in chat; keys live only in `.env` / host secrets, never in git.
