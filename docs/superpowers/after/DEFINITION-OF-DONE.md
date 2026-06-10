# Nikxius Premium UI/UX — Definition of Done (spec §8) — before/after

Plan: `docs/superpowers/plans/2026-06-06-nikxius-premium-uiux.md` (75 tasks across §F/§P/§B/§R/§H).
Verified 2026-06-10 on branch `feat/nikxius-premium-uiux`. Dev stack: api-server :4000 + FE :21793 (vite
proxy), seeded `workforce_os` Postgres. Screenshots via headless Chrome (playwright-core, `channel:'chrome'`)
because the Playwright MCP server was unavailable this session.

| DoD item (§8) | Before | After | Evidence |
|---|---|---|---|
| Warm paper/ink/rust/ember palette applied across all routes | ☐ | ☑ | `after/*-light.png` (12) vs `baseline/before-*-light.png`; F1 resurrected ~736 dead utilities |
| Dark mode renders on all 12 routes | ☐ | ☑* | `after/*-dark.png` (12) — *functional & readable (sidebar/cards/text dark-coherent); page-container `bg-paper-50` stays light by the foundation's deliberate pin (documented gap). App defaults to light. |
| Elevate hover/active overlays on buttons & badges | ☐ | ☑ | F2 `.hover-elevate`/`.active-elevate-2` in bundle; topbar Search uses them |
| Warm ink-tinted shadow scale (no gray box-shadows) | ☐ | ☑ | F3 `shadow-sm` → `#221d1b14` (hsl(20 12% 12%)); `after/01-today-light.png` raised KPI cards |
| Motion (fade/slide/stagger/countup) on entry | ☐ | ☑ | normal-motion CountUp mid-count (104→128) at 350ms; staggered lists across routes |
| prefers-reduced-motion collapses all motion | ☐ | ☑ | `after/h5-reduced-motion-today.png`; reduced shows final 128 immediately & stable |
| Empty/Error/ErrorBoundary states wired | ☐ | ☑ | §P primitives; every route's R-*-states task; ErrorBoundary at app root w/ QueryErrorReset |
| Brand = "Nikxius" (chrome) | ☐ | ☑ | Wordmark + favicon + `<title>Nikxius`; on-brand 404. Live tenant name "Mynoted" via API; user "Nikhil Sood" from identity layer (Phase-2 → Clerk); one Settings sample-signature placeholder (allowed sample data) |
| All `dangerouslySetInnerHTML` go through `sanitizeHtml` | ☐ | ☑ | 4/4 content sites wrapped (ApprovalCard, both ConversationThread, ArtifactDetail); `chart.tsx` = shadcn static CSS, correctly excluded |
| A11y: SVGs labeled, clickable rows keyboard-operable, DS focus rings | ☐ | ☑ | H4: ScoreRing/SparklineChart `role=img`+`aria-label`; conv row `role=button`+keyboard; Settings/ApprovalCard focus rings + aria-labels |
| No dead components (TimelineTree removed) | ☐ | ☑ | H1: `git rm` + `grep TimelineTree src/` → clean |
| Single source of truth for sentiment colors (SentimentBadge) | ☐ | ☑ | H2: inline map deleted; `<SentimentBadge dense>` typed to `ReplyIntelligenceSentiment` |
| Every color utility resolves to a defined `--color-*` token | ☐ | ☑ | H3: dead `--color-*-border` family fixed; `text-rust-400` straggler → `rust-500`; build clean |
| typecheck green | ☐ | ☑ | `pnpm run typecheck` exit 0 |
| build green | ☐ | ☑ | `PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run build` exit 0; full monorepo build exit 0; 20 vitest tests pass |

## Bonus fixes beyond the plan (surfaced by adversarial review)
- **`/settings` route 404** — bare `/settings` matched no route (only `/settings/*`), so the nav link rendered the 404 page. Fixed in P2 (added `<Route path="/settings">`).
- **Dark-mode contrast** — sidebar nav + Shell identity labels were dark-on-dark; fixed with surgical `dark:` variants (light mode byte-identical).
- **`enableSystem` interim-disabled** so a dark-OS visitor doesn't first-load into the not-yet-pixel-coherent dark state (re-enable once page backgrounds are dark-aware).

## Known limitation (tracked)
- **Dark-mode page backgrounds**: pages use literal `bg-paper-50` containers and the foundation deliberately pins
  `--paper-50` light in `.dark` (so `text-paper-50` stays light). Net: in dark mode the sidebar, cards, and text
  are dark-coherent, but the page/topbar container stays light. The app defaults to light mode. A holistic fix =
  migrate page-container `bg-paper-50` → semantic `bg-background`; out of the planned scope (a foundation design
  decision), recommended as a fast-follow.
