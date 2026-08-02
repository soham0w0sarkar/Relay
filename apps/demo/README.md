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

Open [http://localhost:3000](http://localhost:3000). Copy the room link and open it in another tab to sync edits.

## Deploy to GitHub Pages

The demo is a static Next.js export deployed from `main` via [`.github/workflows/nextjs.yml`](../../.github/workflows/nextjs.yml).

**Live URL:** [https://soham0w0sarkar.github.io/Weavo/](https://soham0w0sarkar.github.io/Weavo/)

### One-time setup

1. On GitHub: **Settings → Pages → Build and deployment → Source** → **GitHub Actions**.
2. (Recommended) Add repository secret **`WEAVO_WS_URL`** with your public WebSocket base URL, e.g. `wss://weavo-ktd9.onrender.com` (no `?room=` — the app adds that per session). `http://` and `ws://` are auto-upgraded to HTTPS/WSS on the live site. Without this secret, the site defaults to `ws://localhost:8080`, which only works locally.
3. Deploy `apps/weavo-server` separately (Railway, Fly.io, Render, etc.) for live collaboration on the hosted demo.

### Deploy

Push to `main`, or run **Deploy Weavo demo to GitHub Pages** from the Actions tab.

### Local Pages build

```bash
NEXT_STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/Weavo \
  NEXT_PUBLIC_WEAVO_WS_URL=wss://your-weavo.example.com \
  bun run build:pages
```

Static files are written to `apps/demo/out/`.

## Deploy to Vercel (optional)

See `vercel.json`. Set root directory to `apps/demo` and `NEXT_PUBLIC_WEAVO_WS_URL` to your Weavo server. You still need a separate WebSocket host.

## Environment

| Variable                   | Default               | Notes                                                                                                                 |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_WEAVO_WS_URL` | `ws://localhost:8080` | Weavo WebSocket **base** URL (room UUID appended client-side). Set `WEAVO_WS_URL` secret in GitHub Actions for Pages. |
| `NEXT_STATIC_EXPORT`       | unset                 | Set to `1` for GitHub Pages static export                                                                             |
| `NEXT_PUBLIC_BASE_PATH`    | `""`                  | Set to `/Weavo` for this repo on GitHub Pages (`/${{ repository.name }}` in CI)                                       |
| `PORT` (weavo-server)      | `8080`                | Weavo server only                                                                                                     |

GitHub Pages hosts the static UI only. The Weavo server must run elsewhere for sync to work in production.
