# Chat Bot Website Plan

## Goals
- Fast, Git‑centric chat bot using NVIDIA NIM as the LLM backend.
- Static frontend hosted on GitHub Pages (or Next.js on Vercel).
- Minimal latency, cheap hosting, easy CI/CD.

## Architecture Overview
```
Frontend (Static)  -->  NIM API (Docker)  -->  GPU host (RunPod/Lambda/self‑host)
```

### Layers
| Layer | Recommendation |
|---|---|
| **Frontend** | React / Next.js / Svelte (or vanilla HTML/JS). Chat UI ships with a fixed chat template (system prompt). |
| **Backend / LLM** | NIM container exposing `/v1/chat/completions`‑style HTTP API. Deploy as a Docker image on GHCR or a cheap GPU VM. Frontend calls `fetch('/api/chat', {...})`. |
| **Static hosting** | **GitHub Pages** for pure static site. If server‑side routes are needed, use **Next.js on Vercel** or **Cloudflare Pages** – both Git‑centric and CDN‑fast. |
| **CI/CD** | GitHub Actions: <br>• `build` → static assets → `gh-pages` branch (or Vercel auto‑deploy). <br>• `docker build` + push NIM image to GHCR on model update. <br>• Trigger on `main` push. |

## Performance Tips
1. **Chat template** – a `.jinja` (or JSON) file that defines the system prompt and turn format. The model only receives the user message + short fixed prefix → lower token count → faster responses.
2. **Context length** – set `NIM_MAX_MODEL_LEN` just enough for your use‑case (e.g., 512‑1024 tokens). Reduces latency & cost.
3. **Response caching** – tiny LRU map or Cloudflare KV for identical user prompts.
4. **Connection reuse** – keep `fetch` endpoint persistent or use `axios` with keep‑alive.
5. **Edge rendering** – ISR (incremental static regeneration) in Next.js so the chat UI is pre‑rendered and instantly served from CDN.

## Minimal Repo Structure
```
/ (root)
  ├─ index.html / pages/          # UI (React/Next)
  ├─ chat.template                # Jinja/JSON system prompt
  └─ .github/
      └─ workflows/
          └─ ci.yml               # build + deploy + NIM image push
```

## GitHub Actions Example (build + Pages)
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Frontend build (Next/React)
      - name: Install deps & build
        run: |
          npm ci
          npm run build   # outputs to ./out or ./next dist

      # (Optional) NIM image push
      - name: Login to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      - name: Build & push NIM container
        run: |
          docker build -t ghcr.io/${{ github.repository }}/chat‑nim:latest .
          docker push ghcr.io/${{ github.repository }}/chat‑nim:latest

      # Deploy to GitHub Pages
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./out   # or ./next/out
```

## Getting Started Checklist
1. **Choose a NIM profile** – `docker run --rm ... list-model-profiles`; pick one or set `NIM_MODEL_PROFILE`.
2. **Create `chat.template`** – a Jinja file with system prompt, user/assistant message format, any custom instructions.
3. **Set environment variables** when running NIM:
   - `NIM_CHAT_TEMPLATE` → path to template (or mount it and reference by bare filename).
   - `NIM_MAX_MODEL_LEN` → desired token limit.
   - `NIM_ENABLE_PROMPT_LOGPROBS=1` if you need log‑probability context.
   - `NIM_TOOL_CALL_PARSER` + `NIM_TOOL_PARSER_PLUGIN` for tool‑calling / structured output.
4. **Deploy the API** – push the Dockerfile to the repo, build & push to GHCR, or launch a GPU VM and run the container there.
5. **Frontend** – implement a simple `POST /api/chat` call that sends `{message: userInput, template: chatTemplate}`.
6. **CI** – verify GitHub Actions builds the UI and pushes the NIM image on every `main` push.
7. **Test** – open the GitHub Pages URL, send a message, verify the model replies with the intended system prompt and style.

## Cost‑Effective Fast Path
- Use an **NVIDIA free‑tier NIM** or self‑host a small 7B‑13B model on a single GPU VM (RunPod, Lambda Labs).
- Scale to 0 when idle (if the provider supports GPU auto‑scale / serverless).
- Keep the prompt short and context length tuned → low latency & cost.

---

*Feel free to copy this markdown into `CHAT_BOT_PLAN.md` and hand it off to the coding agent.*