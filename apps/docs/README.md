# Weavo Docs

Product docs UI for Weavo — getting started, architecture, packages, presence & leave.

## Run locally

```bash
# from repo root
bun run dev --filter=docs
```

Open [http://localhost:3001](http://localhost:3001).

## Deploy to GitHub Pages

Docs ship next to the demo on the same GitHub Pages site:

- Demo: [https://soham0w0sarkar.github.io/Weavo/](https://soham0w0sarkar.github.io/Weavo/)
- Docs: [https://soham0w0sarkar.github.io/Weavo/docs/](https://soham0w0sarkar.github.io/Weavo/docs/)

Deploy is driven by [`.github/workflows/nextjs.yml`](../../.github/workflows/nextjs.yml) on `docs@*` (or `demo@*`) tags.

### One-time setup

1. On GitHub: **Settings → Pages → Build and deployment → Source** → **GitHub Actions**.
2. Allow tag patterns `demo@*` and `docs@*` on the **github-pages** environment (Settings → Environments → github-pages → Deployment branches and tags).

### Deploy

Bump `apps/docs/package.json` version if needed, then:

```bash
bun run tag-docs 0.1.0
```

Or run **Deploy Weavo to GitHub Pages** from the Actions tab.

### Local Pages build

```bash
NEXT_PUBLIC_BASE_PATH=/Weavo bun run build:pages
```

Static files land in `.pages/` — demo at the root, docs under `.pages/docs/`.
