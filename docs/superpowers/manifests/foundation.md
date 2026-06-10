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

## Dark-mode known gap (carried into the route sweep)

F5 mounts `next-themes` (class strategy) + a topbar `ThemeToggle`; `.dark` toggles correctly and
dark tokens resolve. Verified light+dark in `docs/superpowers/after-foundation/`.

- **Fixed in F5:** inactive sidebar nav text was `text-ink-700` (unreadable on the dark sidebar) →
  added a surgical `dark:text-ink-300 dark:hover:text-paper-50` variant (light mode byte-identical).
- **Known residual gap (NOT a regression):** pages/chrome use *literal* `bg-paper-50/100` surfaces and
  per F1 `--paper-50` is intentionally pinned light in `.dark` (so `text-paper-50` stays light). Net
  effect: in dark mode the sidebar + `bg-card` cards go dark, but the **topbar and page content areas
  stay light**, and a few `text-ink-900` labels in the Shell header/footer (workspace title, user name)
  are low-contrast. These are legacy literal surfaces. **Resolution path:** each route's
  `R-*` "visual verification (light + dark)" step makes its own surfaces dark-coherent; the Shell
  header/footer labels get rewritten by B3 (identity layer) — apply `dark:` text variants there.
  Until then dark mode is *functional and readable*, not yet pixel-coherent.
- **Screenshot tool for all later light+dark steps:** `node /tmp/wos-shot/shot.mjs <url> <out> <light|dark>`
  (playwright-core via installed Chrome `channel:'chrome'`; seeds `localStorage.theme` pre-hydration).

## Foundation review (2026-06-09) — 4 lenses, ALL PASSED ✅

Adversarial review (spec-compliance / token-correctness / regression / dark-mode). Verdict: foundation is
verbatim-correct, all gates green, 736 dead utilities confirmed resurrected, no §F regression. Dispositions:

- **F3 spec-grep is unsatisfiable (doc nit):** Tailwind v4 hex-folds `hsl(20 12% 12% / a)` → `#221d1b{aa}`
  in the bundle, so the plan's `grep "20 12%"` never matches. Verify warm shadows with
  `grep -o "\.shadow-sm{[^}]*}" dist/public/assets/*.css` and confirm `#221d1b` appears. (Impl correct.)
- **`enableSystem` interim-disabled (APPLIED):** review flagged that `enableSystem` + dark-OS = first-load
  into the not-yet-coherent dark state. Set `enableSystem={false}` in ThemeProvider until §H. Toggle still works.
- **DEFERRED → P2 (next):** route `/settings/*` does NOT match bare `/settings`, so the Settings nav link
  renders the 404 page (baseline `before-settings-light.png` is the 404 page). P2 rewrites the Router — fix
  there by adding `<Route path="/settings" component={Settings} />` alongside `<Route path="/settings/*" .../>`.
  The Settings component itself already defaults bare `/settings` → `org` tab.
- **DEFERRED → §H (H3 token audit):** pre-existing dead `--color-*-border` family — `@theme` declares
  `--color-primary-border: var(--primary-border)` (+ secondary/muted/accent/destructive/sidebar-primary/
  sidebar-accent) but the raw `--*-border` vars are never defined in `:root`/`.dark`, so `border-primary-border`
  (button.tsx) resolves empty. Pre-existing, NOT a §F regression; subtle (rust-fill buttons). H3 should add the
  7 raw defs (e.g. `--primary-border: var(--rust-600)`, `--secondary-border: var(--paper-300)`, etc.).
- **DEFERRED → route sweep / B5:** `not-found.tsx` uses hardcoded `text-gray-900` on `bg-card` → dark-on-dark
  in dark mode; outer `bg-gray-50` stays light. B5 rebuilds the 404 on-brand; ensure dark-aware tokens.

## Status

- §F Foundation COMPLETE ✅ — F0, F0b, F1, F2, F3, F4, F5 all landed, committed, build+typecheck green,
  independently reviewed (4/4 lenses pass). Next: §P Primitives (P1–P6).
