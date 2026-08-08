<p align="center">
  <img src="../../docs/assets/logo.png" width="140" alt="weavo" />
</p>

Collaborative text editing demo using `@weavo/client`.

Each session uses a room ID stored in the browser — no query params in the URL. Generate a room, copy the ID, and others paste it under **Join**.

## Run locally

```bash
# Terminal 1 — Weavo server (port 8080)
bun run dev --filter=weavo-server

# Terminal 2 — demo app (port 3000)
bun run dev --filter=demo
```

Open [http://localhost:3000](http://localhost:3000). Copy the room ID and open Join in another tab to sync edits.

### Phone on the same Wi‑Fi

Next.js prints a **Network** URL (e.g. `http://192.168.1.4:3000`). Open that on your phone. The demo auto-connects the WebSocket to the same host on port `8080` — leave `NEXT_PUBLIC_WEAVO_WS_URL` unset (or pointing at localhost) so LAN rewrite works.

## Deploy to GitHub Pages

The demo and docs are a combined static Next.js export deployed via [`.github/workflows/nextjs.yml`](../../.github/workflows/nextjs.yml) on `demo@*` / `docs@*` tags.

**Live URLs:**

- Demo: [https://soham0w0sarkar.github.io/Weavo/](https://soham0w0sarkar.github.io/Weavo/)
- Docs: [https://soham0w0sarkar.github.io/Weavo/docs/](https://soham0w0sarkar.github.io/Weavo/docs/)

### One-time setup

1. On GitHub: **Settings → Pages → Build and deployment → Source** → **GitHub Actions**.
2. Allow tag patterns `demo@*` and `docs@*` on the **github-pages** environment (Settings → Environments → github-pages → Deployment branches and tags).
3. (Recommended) Add repository secret **`WEAVO_WS_URL`** with your public WebSocket base URL, e.g. `wss://weavo-ktd9.onrender.com` (no `?room=` — the app adds that per session). `http://` and `ws://` are auto-upgraded to HTTPS/WSS on the live site. Without this secret, the site defaults to `ws://localhost:8080`, which only works locally.
4. Deploy `apps/weavo-server` separately (Railway, Fly.io, Render, etc.) for live collaboration on the hosted demo.

### Deploy

```bash
bun run tag-demo 0.1.6
# or, after a docs-only change:
bun run tag-docs 0.1.0
```

Either tag rebuilds **both** apps so the Pages site stays consistent. You can also run **Deploy Weavo to GitHub Pages** from the Actions tab.

### Local Pages build

```bash
NEXT_PUBLIC_BASE_PATH=/Weavo \
  NEXT_PUBLIC_WEAVO_WS_URL=wss://your-weavo.example.com \
  bun run build:pages
```

Static files are written to `.pages/` (demo at the root, docs under `.pages/docs/`).

## Deploy to Vercel (optional)

See `vercel.json`. Set root directory to `apps/demo` and `NEXT_PUBLIC_WEAVO_WS_URL` to your Weavo server. You still need a separate WebSocket host.

## Environment

| Variable                   | Default               | Notes                                                                                                                 |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_WEAVO_WS_URL` | unset → LAN-aware default | Weavo WebSocket **base** URL (room UUID appended client-side). Unset locally so phones on Wi‑Fi use the page host. Set `WEAVO_WS_URL` secret in GitHub Actions for Pages. |
| `NEXT_STATIC_EXPORT`       | unset                 | Set to `1` for GitHub Pages static export (set by `scripts/build-pages.sh`) |
| `NEXT_PUBLIC_BASE_PATH`    | `""`                  | Repo root on Pages (`/Weavo`). Docs use `${BASE}/docs`. |
| `PORT` (weavo-server)      | `8080`                | Weavo server only                                                                                                     |

GitHub Pages hosts the static UI only. The Weavo server must run elsewhere for sync to work in production.
