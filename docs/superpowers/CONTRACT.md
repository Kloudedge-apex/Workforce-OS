# Route-sweep CONTRACT — primitives & tokens available to every route agent

The §F Foundation, §P Primitives, and §B Brand sections are COMPLETE and committed. Every route
task composes from these. Import paths and symbol names are FIXED — use them verbatim.

## Motion (framer-motion, reduced-motion-safe)
- `import { fadeIn, fadeSlideUp, staggerContainer, staggerItem, cardEnter, springHover, useReducedMotionSafe } from "@/lib/motion";`
- `import { PageTransition } from "@/components/motion/PageTransition";` (already wired at the router; do NOT re-wrap pages)
- `import { Stagger, StaggerItem } from "@/components/motion/Stagger";` — Stagger = container, StaggerItem = child
- `import { CountUp } from "@/components/motion/CountUp";` — `<CountUp value={n} decimals? suffix? duration? className? />`; pure `formatValue` is also exported
- ALWAYS gate bespoke animation behind `useReducedMotionSafe()` (the motion components already do this internally).

## State primitives
- `import { EmptyState } from "@/components/states/EmptyState";` — `{ icon: LucideIcon, title, description, action?, className? }`
- `import { ErrorState } from "@/components/states/ErrorState";` — `{ title?, description?, onRetry?, className? }` (fixed AlertTriangle icon)
- `import { ErrorBoundary } from "@/components/states/ErrorBoundary";` — class boundary; pair with `QueryErrorResetBoundary` for per-query reset (already mounted at app root)

## Security
- `import { sanitizeHtml } from "@/lib/sanitize";` — wrap EVERY `dangerouslySetInnerHTML={{ __html: sanitizeHtml(x) }}`

## Brand / identity
- `import { Logo, Wordmark } from "@/components/brand/Logo";`
- `import { IntegrationLogo } from "@/components/brand/IntegrationLogo";`
- `import { useWorkspace, useCurrentUser } from "@/lib/workspace";`

## Tokens (Tailwind v4, all live in index.css)
- Palette: `paper-50/100/200/300/400`, `ink-0/300/400/500/600/700/800/900`, `rust-50/100/200/300/500/600/700/800/900`, `ember-300/400/500`, `signal-positive/info/critical`. Use as `bg-*`, `text-*`, `border-*`, `fill-*`, `stroke-*`.
- Warm shadows: `shadow-xs/sm/md/lg` (ink-tinted). Depth convention: structure=borders, objects=`shadow-sm`→`shadow-md` on hover, floating layers=`shadow-md`/`shadow-lg`.
- Elevate: `.hover-elevate` / `.active-elevate-2` (button/badge already use them).
- Surfaces: prefer `bg-ink-0` (white) for raised cards so the warm shadow reads.

## Dark mode (KNOWN GAP — read docs/superpowers/manifests/foundation.md)
- `.dark` is class-based (next-themes). The full palette has `.dark` overrides BUT `--paper-50` is intentionally
  pinned light (so `text-paper-50` stays light). Net: literal `bg-paper-50/100` surfaces and `text-ink-900` labels
  may be light/low-contrast in dark mode.
- Each route's "visual verification (light + dark)" step MUST make its own surfaces dark-coherent. The reliable
  pattern: add `dark:` variants where a literal light surface or dark text would otherwise break (e.g.
  `text-ink-900 dark:text-paper-50`, or switch a chrome surface to the semantic `bg-background`/`bg-card`).
  Keep LIGHT mode byte-identical.

## Verification gates (USE EXACTLY)
- Typecheck: `cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck` → exit 0
- Build: `cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run build` → exit 0
  (bare `pnpm run build` fails only on pre-existing mockup-sandbox; ignore that)
- Tests (if a task adds one): `cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run test`
- Do NOT start a dev server or take screenshots — the controller owns visual QA in light + dark.

## Discipline
- Commit after EVERY task with the section's conventional-commit message + the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Leave the tree GREEN: never commit a state where typecheck fails. If you cannot make a task green, `git checkout -- <files>` to revert that task and report it; do not break the tree for the next agent.
- Follow the section spec's code blocks faithfully; match the surrounding code's style.
