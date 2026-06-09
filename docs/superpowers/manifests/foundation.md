# §F Foundation — Execution Manifest

> Load-bearing notes captured during F0 baseline (2026-06-09). Later tasks/agents must read this.

## Canonical verification gates (USE THESE EXACTLY)

- **Typecheck:** `cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck` → exit 0 (green at baseline).
- **Build:** `cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm run build` → exit 0 (green at baseline).
  - ⚠️ **Bare `pnpm run build` (no env) FAILS** — only because `artifacts/mockup-sandbox/vite.config.ts`
    throws when `PORT` is unset (and warns on Node 20.12 < Vite 20.19). This is **pre-existing, not a
    regression**. Always pass `PORT=21792 BASE_PATH=/`. The target package
    `pnpm --filter @workspace/workforce-os run build` is also green on its own.
- **Test:** (added in F0b) `pnpm --filter @workspace/workforce-os run test`.

## Environment (live dev stack)

- **DB:** local Postgres `workforce_os` was **already provisioned and seeded** — took the real-data path,
  not the no-DB fallback. Row counts: orgs=1, leads=128, outreach_artifacts=60, conversations=24,
  graph_runs=8, users=1. Connection: `postgres://nikhil@localhost:5432/workforce_os`.
- **api-server:** runs standalone on `:4000` — `DATABASE_URL=postgres://nikhil@localhost:5432/workforce_os
  PORT=4000 node artifacts/api-server/dist/index.mjs` (routes under `/api`, CORS open). Does NOT serve the
  FE statics.
- **FE↔API wiring:** the FE's generated client (`@workspace/api-client-react`) never calls `setBaseUrl`, so
  it issues **relative** `/api/*` requests. There is no built-in proxy. Added a **dev-only vite proxy**
  (`/api` → `API_PROXY_TARGET ?? http://localhost:4000`), gated on `REPL_ID === undefined` so Replit/prod
  (same-origin `/api`) is untouched. Committed as a `chore` (not part of F0).
- **Canonical local dev:**
  - Terminal A: `DATABASE_URL=postgres://nikhil@localhost:5432/workforce_os PORT=4000 node artifacts/api-server/dist/index.mjs`
  - Terminal B: `PORT=21793 BASE_PATH=/ API_PROXY_TARGET=http://localhost:4000 pnpm --filter @workspace/workforce-os run dev`
    (the plan's `PORT=21792` slot was occupied by a pre-existing dev server this session; 21793 is equivalent).

## Baseline screenshots

- **Playwright MCP was NOT connected this session.** Fallback: **headless Chrome** —
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu
  --hide-scrollbars --window-size=1440,2200 --virtual-time-budget=9000 --screenshot=<out> <url>`.
  This is the tool to reuse for every later "visual verification (light + dark)" step until/unless
  Playwright MCP comes back. Dark shots: navigate, then capture with the theme toggled (post-F5).
- 12 light-mode baselines in `docs/superpowers/baseline/` (named `before-<route>-light.png`):
  today, pipeline, leaddetail, outbound, artifactdetail, conversations, convothread, runs, rundetail,
  agents, settings, notfound. All light (no theme provider exists pre-F5).
- Detail-route IDs used: lead_006, art_001, conv_001, run_001.

## Status

- F0 ✅ (baselines + env verified). Remaining: F0b, F1, F2, F3, F4, F5.
