# Nikxius Premium UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Work is grouped under `### Task <ID>` headers — ID prefixes: **F*** foundation, **P*** primitives, **B*** brand, **R-*** routes/chrome, **H*** hygiene/verify. Each task has numbered bite-sized steps ending in an explicit verify + commit. Track progress per task.

**Goal:** Elevate the unfinished Replit "Workforce OS" frontend into a world-class, premium UI/UX — fix the broken Tailwind v4 token system, add depth + motion + unified state primitives, rebrand to **Nikxius** (data-driven identity), applied uniformly across all ~12 routes — on the existing seed-data backend (production wiring deferred to Phase 2).

**Architecture:** Design-system-first, then a systematic all-route sweep. Foundation (token generation, elevate utilities, warm shadow scale, dark mode) → shared primitives (framer-motion variants library, EmptyState/ErrorState/ErrorBoundary, DOMPurify sanitize) → Nikxius brand + data-driven shell → per-route premium application that also closes each surface's cosmetic leaks → hygiene/a11y/verification. All sections were authored against a shared contract so symbol names compose across tasks.

**Tech Stack:** React 18 + Vite + Wouter + TanStack Query + Tailwind v4 (CSS-first, no `tailwind.config.js`) + shadcn/ui over Radix + framer-motion + next-themes + DOMPurify; vitest for pure-logic helpers. pnpm workspaces; frontend package `@workspace/workforce-os` at `artifacts/workforce-os`.

**Execution order (hard dependency):** Foundation (§F) → Primitives (§P) → Brand (§B) → Route sweep (§R, any order among themselves) → Hygiene & Verification (§H). Route tasks consume the tokens/primitives created in Foundation/Primitives/Brand, so those must land first.

**Environment gotchas (verified against the live tree):** the DB is **Drizzle** (not Prisma); the dev server throws unless both env vars are set — use `PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev`; `next-themes` is already installed; `framer-motion` starts in devDependencies (F4 moves it).

**Verify (every task):** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` and `… pnpm run build` must stay green; pure-logic helpers add a `vitest` test; visual tasks screenshot the route in **light + dark** via the dev server above and diff against the F0 baseline. **Commit after every task** (conventional commits; messages end with the `Co-Authored-By: Claude Opus 4.8` trailer).

**Source spec:** `docs/superpowers/specs/2026-06-06-nikxius-premium-uiux-design.md`.

---

# §F · FOUNDATION
## FOUNDATION

This section stands the app up, wires the test runner, and repairs the design-token
substrate so every later section has a working palette, elevate system, shadow scale,
motion library, and dark mode to build on.

### Reality-check notes for the executor (read before starting)

These differ from generic assumptions — they were verified against the live tree on
2026-06-06 and are load-bearing:

1. **The DB is Drizzle, NOT Prisma.** The root `CLAUDE.md` describes a different repo
   (Apex/Prisma). This repo (`Workforce-OS`) uses Drizzle ORM. The schema-push command is
   `pnpm --filter @workspace/db run push` (runs `drizzle-kit push`), and it **throws if
   `DATABASE_URL` is unset** (`lib/db/drizzle.config.ts` lines 4-6).
2. **The seed lives in a different package than the CONTRACT names.** The seed script is
   `scripts/src/seed-mynoted.ts` and is invoked via
   `pnpm --filter @workspace/scripts run seed-mynoted` (see `scripts/package.json` →
   `"seed-mynoted": "tsx ./src/seed-mynoted.ts"`). The CONTRACT's
   `pnpm --filter @workspace/db run push` pushes the *schema*; the *seed* is the scripts
   package. Both require `DATABASE_URL`.
3. **The dev server requires TWO env vars or it throws at config-eval time.**
   `artifacts/workforce-os/vite.config.ts` (lines 8-37) throws unless both `PORT` and
   `BASE_PATH` are set. The CONTRACT's bare
   `pnpm --filter @workspace/workforce-os run dev` will crash without them. The working
   invocation is:
   `PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev`
   (port 21792 maps to external 3000 per `.replit`; `BASE_PATH=/` makes `App.tsx`'s
   `import.meta.env.BASE_URL` resolve to `/`). Use this exact form everywhere a dev server
   is needed (including baseline screenshots and per-task visual verification).
4. **`next-themes` is already a dependency** (`artifacts/workforce-os/package.json` line 60)
   and `src/components/ui/sonner.tsx` line 3 already calls `useTheme()` — but **nothing
   mounts a provider**, so theme silently falls back to `"system"` and there is no toggle.
   F5 fixes this.
5. **Tailwind v4 CSS-first, no `tailwind.config.js`.** All tokens live in
   `artifacts/workforce-os/src/index.css`. `@theme inline { … }` (lines 8-62) is where
   `--color-*` utilities are registered; `:root` (64-112) and `.dark` (114-144) hold the
   raw HSL channel values. Today only ~12 palette steps have raw values, but the source
   references 25+ steps (`paper-50/100/200/300/400`, `ink-0/300/400/500/600/700/800/900`,
   `rust-50/100/200/300/500/600/700/800/900`, `ember-300/400/500`) — the unregistered ones
   produce no CSS (the "736 dead literal utilities"). F1 fixes this.

---

### Task F0: Baseline — stand the app up and capture "before" screenshots

**Files:**
- Create (if missing): `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/baseline/` (output dir for screenshots)
- Modify: none (read-only baseline; do NOT change app code in this task)
- Test: none

**Steps:**

1. Install workspace deps from the repo root (the `preinstall` hook enforces pnpm):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm install
   ```
   Expected: completes without error. If it fails on the 1-day `minimumReleaseAge` gate in
   `pnpm-workspace.yaml`, that only blocks *new* installs of <1-day-old packages; existing
   `pnpm-lock.yaml` deps install fine.

2. Confirm the verification commands work before touching anything (these are the canonical
   gates used by every later task):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build
   ```
   Expected: both exit 0. Record any pre-existing failures verbatim in the section's
   manifest `notes` — they are the "before" bar and later tasks must not regress them.

3. Attempt to stand up Postgres + seed. The app reads live data via TanStack Query hooks,
   so the richest baseline needs a seeded DB. Provision a local Postgres and export its URL:
   ```bash
   export DATABASE_URL="postgres://postgres:postgres@localhost:5432/workforce_os"
   ```
   Then push schema and seed:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/db run push
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/scripts run seed-mynoted
   ```
   Expected: `push` creates all tables (`drizzle-kit push`); `seed-mynoted` inserts the
   Mynoted org (161 leads, 60 artifacts, 24 conversations, etc.).

4. **Fallback if no Postgres is available** (document explicitly which path you took in the
   manifest `notes`): skip the DB and do component-level visual QA instead. The pages will
   render their loading/empty/error states (which is itself a useful "before" baseline for
   the EmptyState/ErrorState work in later sections). Start the dev server either way:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev
   ```
   Expected: Vite prints `Local: http://localhost:21792/`. Leave it running in a background
   shell for the screenshot step.

5. Capture "before" Playwright screenshots of **every** route in **light** mode (light is
   the current default — there is no theme provider yet, so the app is always light). Use
   the Playwright MCP tools. For each route below: `browser_navigate` to the URL, then
   `browser_take_screenshot` saving to the baseline dir with the indicated filename.
   Routes (from `src/App.tsx` lines 32-46), all prefixed `http://localhost:21792`:
   ```
   /today                       -> baseline/today.png
   /pipeline                    -> baseline/pipeline.png
   /pipeline/lead_001           -> baseline/lead-detail.png   (any seeded lead id; use a real id if seeded)
   /outbound                    -> baseline/outbound.png
   /outbound/art_001            -> baseline/artifact-detail.png (any seeded artifact id)
   /conversations               -> baseline/conversations.png
   /conversations/conv_001      -> baseline/conversation-thread.png (any seeded conversation id)
   /runs                        -> baseline/runs.png
   /runs/run_001                -> baseline/run-detail.png    (any seeded run id)
   /agents                      -> baseline/agents.png
   /settings                    -> baseline/settings.png
   ```
   If the DB fallback was used and detail routes 404 / show error states, still screenshot
   them — the empty/error rendering is part of the baseline. Save each as full-page where
   the tool supports it.

6. **Verification:** list the baseline dir and confirm all 11 PNGs exist:
   ```bash
   ls -1 /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/baseline/*.png | wc -l
   ```
   Expected: `11`. Stop the dev server background shell.

7. **Commit:**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add docs/superpowers/baseline && git commit -m "chore(foundation): capture before-baseline screenshots of all routes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task F0b: Add vitest as the test runner

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/package.json` (add `vitest` devDep + `"test"` script)
- Create: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/vitest.config.ts`
- Test (smoke): `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/lib/__tests__/smoke.test.ts`

**Steps:**

1. Add `vitest` to the frontend package devDependencies and a `test` script. Edit
   `artifacts/workforce-os/package.json`. In the `"scripts"` block (lines 6-11), add the
   `test` line after `typecheck`:
   ```jsonc
   "scripts": {
     "dev": "vite --config vite.config.ts --host 0.0.0.0",
     "build": "vite build --config vite.config.ts",
     "serve": "vite preview --config vite.config.ts --host 0.0.0.0",
     "typecheck": "tsc -p tsconfig.json --noEmit",
     "test": "vitest run"
   },
   ```
   And in `"devDependencies"` add (alphabetical-ish, near the `vite` entry on line 73):
   ```jsonc
   "vite": "catalog:",
   "vitest": "^3.0.5",
   ```
   Use the exact version `^3.0.5` (vitest 3.x pairs with the vite 7 in the catalog). It is
   >1 day old so it passes the `minimumReleaseAge` gate.

2. Create the vitest config. It must NOT import the app's `vite.config.ts` (that file throws
   without `PORT`/`BASE_PATH`). Use a standalone config that re-declares only the `@` alias.
   Create `artifacts/workforce-os/vitest.config.ts`:
   ```ts
   import { defineConfig } from "vitest/config";
   import path from "path";

   export default defineConfig({
     resolve: {
       alias: {
         "@": path.resolve(import.meta.dirname, "src"),
         "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
       },
     },
     test: {
       environment: "node",
       include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
       globals: false,
     },
   });
   ```
   Point vitest at this file by updating the `test` script to be explicit:
   ```jsonc
   "test": "vitest run --config vitest.config.ts",
   ```
   (Re-edit the script line from step 1 to include `--config vitest.config.ts`.)

3. Ensure the frontend `tsconfig.json` doesn't try to typecheck test files into the build.
   It already `exclude`s `**/*.test.ts` (line 5 of `artifacts/workforce-os/tsconfig.json`),
   so no change is needed — confirm by reading that line.

4. Create the trivial passing smoke test at
   `artifacts/workforce-os/src/lib/__tests__/smoke.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { cn } from "@/lib/utils";

   describe("vitest smoke", () => {
     it("runs and resolves the @ alias", () => {
       expect(cn("a", false && "b", "c")).toBe("a c");
     });
   });
   ```
   This both proves vitest works and proves the `@` alias resolves under vitest.

5. Install the new dep:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm install
   ```
   Expected: adds `vitest` to `@workspace/workforce-os`.

6. **Verification:**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run test
   ```
   Expected: `1 passed (1)`. Also confirm the build gate is still green:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build
   ```
   Expected: exit 0.

7. **Commit:**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/package.json artifacts/workforce-os/vitest.config.ts artifacts/workforce-os/src/lib/__tests__/smoke.test.ts pnpm-lock.yaml && git commit -m "test(foundation): add vitest runner with @ alias and smoke test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task F1: Register the full palette scale and add the missing raw HSL steps

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/index.css`
  - `@theme inline` block (currently ends line 62) — add `--color-*` for the full ramp
  - `:root` block (lines 64-112) — add the missing raw HSL steps
  - `.dark` block (lines 114-144) — add the same raw HSL steps with dark-appropriate values

**Steps:**

1. Add the full set of raw HSL channel values to `:root`. The existing anchors are
   `paper-50: 42 30% 98%`, `paper-100: 42 25% 96%`, `paper-200: 40 20% 92%`,
   `ink-900: 20 8% 8%`, `ink-700: 20 6% 25%`, `ink-400: 20 4% 52%`,
   `rust-500: 15 72% 48%`, `rust-100: 15 60% 94%`, `ember-400: 28 85% 56%`.
   Replace the raw-value block at the top of `:root` (lines 65-76) with the complete,
   perceptually-even ramp below. Hues are anchored per CONTRACT (paper ~40-42°, ink ~20°,
   rust ~15°, ember ~28°); lightness steps are evenly spaced; saturation tapers toward the
   light/extreme ends. Find this exact text (lines 65-76):
   ```css
   --paper-50: 42 30% 98%;
   --paper-100: 42 25% 96%;
   --paper-200: 40 20% 92%;
   --ink-900: 20 8% 8%;
   --ink-700: 20 6% 25%;
   --ink-400: 20 4% 52%;
   --rust-500: 15 72% 48%;
   --rust-100: 15 60% 94%;
   --ember-400: 28 85% 56%;
   --signal-positive: 158 48% 32%;
   --signal-info: 215 32% 48%;
   --signal-critical: 8 68% 38%;
   ```
   and replace it with:
   ```css
   /* paper — warm off-white surfaces, hue ~40-42° */
   --paper-50: 42 30% 98%;
   --paper-100: 42 25% 96%;
   --paper-200: 40 20% 92%;
   --paper-300: 40 18% 86%;
   --paper-400: 40 16% 78%;
   /* ink — near-black warm neutrals, hue ~20° */
   --ink-0: 0 0% 100%;
   --ink-300: 20 5% 64%;
   --ink-400: 20 4% 52%;
   --ink-500: 20 5% 42%;
   --ink-600: 20 6% 34%;
   --ink-700: 20 6% 25%;
   --ink-800: 20 7% 16%;
   --ink-900: 20 8% 8%;
   /* rust — primary brand, hue ~15° */
   --rust-50: 15 60% 97%;
   --rust-100: 15 60% 94%;
   --rust-200: 15 62% 86%;
   --rust-300: 15 66% 74%;
   --rust-500: 15 72% 48%;
   --rust-600: 15 74% 42%;
   --rust-700: 15 76% 35%;
   --rust-800: 15 78% 28%;
   --rust-900: 15 80% 20%;
   /* ember — warm accent, hue ~28° */
   --ember-300: 28 88% 68%;
   --ember-400: 28 85% 56%;
   --ember-500: 28 82% 48%;
   /* signals */
   --signal-positive: 158 48% 32%;
   --signal-info: 215 32% 48%;
   --signal-critical: 8 68% 38%;
   ```

2. Add a dark-mode override of the same raw steps to the **top** of the `.dark` block
   (immediately after `.dark {` on line 114, before `--background:` on line 115). Keep the
   literal `--*` palette steps at their light-mode-equivalent *visual* values so that
   `bg-ink-900` stays dark and `text-paper-50` stays light — only the mid-steps are nudged
   for contrast on dark surfaces. Do **not** invert the semantic anchors: the existing
   `.dark` lines `--background: var(--ink-900)` / `--foreground: var(--paper-50)` must keep
   resolving to a dark background and light foreground. Insert:
   ```css
   /* dark-mode palette overrides — literal steps keep their visual identity so
      bg-ink-900 stays dark and text-paper-50 stays light; only mid-steps are
      nudged for contrast on dark surfaces */
   --paper-50: 42 30% 98%;
   --paper-100: 40 8% 24%;
   --paper-200: 22 7% 30%;
   --paper-300: 22 7% 36%;
   --paper-400: 22 6% 44%;
   --ink-0: 20 10% 10%;
   --ink-300: 20 6% 70%;
   --ink-400: 20 5% 60%;
   --ink-500: 20 5% 54%;
   --ink-600: 20 6% 46%;
   --ink-700: 20 6% 28%;
   --ink-800: 20 7% 16%;
   --ink-900: 20 8% 8%;
   --rust-50: 15 30% 18%;
   --rust-100: 15 32% 22%;
   --rust-200: 15 40% 30%;
   --rust-300: 15 52% 42%;
   --rust-500: 15 72% 52%;
   --rust-600: 15 74% 46%;
   --rust-700: 15 76% 40%;
   --rust-800: 15 78% 34%;
   --rust-900: 15 80% 28%;
   --ember-300: 28 80% 44%;
   --ember-400: 28 85% 56%;
   --ember-500: 28 88% 64%;
   ```

3. Register the full `--color-*` palette in the `@theme inline` block so the literal
   utilities (`bg-paper-300`, `text-ink-500`, etc.) actually generate CSS. Insert the
   following just before the closing `}` of `@theme inline` (i.e. after the `--radius-xl`
   line 61, before line 62's `}`):
   ```css
   /* literal palette utilities — paper / ink / rust / ember + signals */
   --color-paper-50: hsl(var(--paper-50));
   --color-paper-100: hsl(var(--paper-100));
   --color-paper-200: hsl(var(--paper-200));
   --color-paper-300: hsl(var(--paper-300));
   --color-paper-400: hsl(var(--paper-400));

   --color-ink-0: hsl(var(--ink-0));
   --color-ink-300: hsl(var(--ink-300));
   --color-ink-400: hsl(var(--ink-400));
   --color-ink-500: hsl(var(--ink-500));
   --color-ink-600: hsl(var(--ink-600));
   --color-ink-700: hsl(var(--ink-700));
   --color-ink-800: hsl(var(--ink-800));
   --color-ink-900: hsl(var(--ink-900));

   --color-rust-50: hsl(var(--rust-50));
   --color-rust-100: hsl(var(--rust-100));
   --color-rust-200: hsl(var(--rust-200));
   --color-rust-500: hsl(var(--rust-500));
   --color-rust-600: hsl(var(--rust-600));
   --color-rust-700: hsl(var(--rust-700));
   --color-rust-800: hsl(var(--rust-800));
   --color-rust-900: hsl(var(--rust-900));

   --color-ember-300: hsl(var(--ember-300));
   --color-ember-400: hsl(var(--ember-400));
   --color-ember-500: hsl(var(--ember-500));

   --color-signal-positive: hsl(var(--signal-positive));
   --color-signal-info: hsl(var(--signal-info));
   --color-signal-critical: hsl(var(--signal-critical));
   ```
   Note: `rust-300` and `paper`/`ink` mid-steps are included so the source's
   `fill-rust-300` (1 use) and similar resolve. Per CONTRACT the registered set is
   paper-50/100/200/300/400, ink-0/300/400/500/600/700/800/900, rust-50/100/200/500/600/700/800/900,
   ember-300/400/500, plus the three signals — add `--color-rust-300` too since the source
   uses `fill-rust-300`.

4. **Verification (build resolves the utilities):**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build
   ```
   Expected: exit 0. Then grep the built CSS to prove two representative dead utilities now
   emit rules:
   ```bash
   grep -REo "\.bg-paper-50[^0-9]|\.text-ink-700[^0-9]" artifacts/workforce-os/dist/public/assets/*.css | head
   ```
   Expected: at least one match for each (Tailwind v4 emits only *used* classes; both
   `bg-paper-50` and `text-ink-700` are used in source, so they must now appear with a real
   color value rather than being dropped).

5. **Visual verification:** start the dev server and screenshot a representative page in
   light mode; compare to the F0 baseline — colors that were previously missing (e.g.
   `bg-paper-300`, `text-ink-500` regions) should now be filled:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev
   ```
   Navigate to `http://localhost:21792/today` and `…/settings` with Playwright, screenshot,
   and diff against `baseline/today.png` / `baseline/settings.png`. Expected: no regressions
   on previously-correct colors; previously-blank/transparent literal-palette regions are
   now colored. Stop the dev server.

6. **Commit:**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/index.css && git commit -m "feat(foundation): register full paper/ink/rust/ember palette scale in @theme

Adds missing raw HSL steps to :root and .dark and registers --color-* for the
full ramp, resurrecting ~736 previously-dead literal utilities.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task F2: Define the elevate system

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/index.css` (append CSS vars + utilities)

`button.tsx` (lines 9, 22) and `badge.tsx` (lines 10, 24) already reference
`.hover-elevate`, `.active-elevate-2`, `var(--button-outline)`, and `var(--badge-outline)`
— but none of these exist, so hover/active feedback and outline colors are dead.

**Steps:**

1. Add the elevate CSS vars to `:root`. Insert just before the closing `}` of `:root`
   (after the `--radius: .5rem;` line 111, before line 112's `}`):
   ```css
   /* elevate system — translucent ink overlays for hover/active feedback */
   --elevate-1: hsl(20 8% 8% / 0.04);
   --elevate-2: hsl(20 8% 8% / 0.08);
   --button-outline: hsl(var(--ink-400) / 0.4);
   --badge-outline: hsl(var(--ink-400) / 0.35);
   ```

2. Add the dark-mode overrides to the `.dark` block. Insert just before the closing `}` of
   `.dark` (after the `--ring:` line 143, before line 144's `}`):
   ```css
   /* elevate overlays invert to light in dark mode */
   --elevate-1: hsl(42 30% 98% / 0.06);
   --elevate-2: hsl(42 30% 98% / 0.12);
   --button-outline: hsl(var(--ink-300) / 0.4);
   --badge-outline: hsl(var(--ink-300) / 0.35);
   ```

3. Add the `.hover-elevate` / `.active-elevate-2` utilities. The overlay is applied via a
   `::after` pseudo-element so it composites over whatever background the element has
   (button/badge variants set their own bg). Append to the very end of `index.css` (after
   the `.font-tabular` block, currently lines 156-158):
   ```css
   /* elevate utilities — referenced by button.tsx and badge.tsx */
   .hover-elevate,
   .active-elevate-2 {
     position: relative;
   }
   .hover-elevate::after,
   .active-elevate-2::after {
     content: "";
     position: absolute;
     inset: 0;
     border-radius: inherit;
     pointer-events: none;
     background-color: transparent;
     transition: background-color 0.15s ease;
   }
   .hover-elevate:hover::after {
     background-color: var(--elevate-1);
   }
   .active-elevate-2:active::after {
     background-color: var(--elevate-2);
   }
   ```

4. **Verification (build):**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build
   ```
   Expected: exit 0. Then confirm the utility CSS is present in the bundle:
   ```bash
   grep -REo "hover-elevate|active-elevate-2|--button-outline|--badge-outline" artifacts/workforce-os/dist/public/assets/*.css | sort -u
   ```
   Expected: all four tokens appear.

5. **Visual verification:** start the dev server (`PORT=21792 BASE_PATH=/ …`), navigate to a
   page with buttons/badges (e.g. `/today` or `/settings`), `browser_hover` over a primary
   Button and a Badge, and `browser_take_screenshot`. Expected: a subtle darkening overlay
   on hover (light mode) and a stronger one on active. Compare to baseline (which had no
   hover feedback). Stop the dev server.

6. **Commit:**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/index.css && git commit -m "feat(foundation): add elevate system (hover/active overlays + outline vars)

Defines --elevate-1/2, --button-outline, --badge-outline and the .hover-elevate
/.active-elevate-2 utilities already referenced by button.tsx and badge.tsx.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task F3: Define the warm shadow scale tokens

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/index.css` (add `--shadow-*` to `@theme`)

The codebase uses `shadow-xs`, `shadow-sm`, `shadow-lg` (button/badge/sonner) but Tailwind
v4 only ships gray-tinted defaults. Define ink-tinted (warm) shadows so they harmonize with
the paper/ink palette.

**Steps:**

1. Register the warm shadow scale in the `@theme inline` block. The shadow color is the ink
   hue (`20°`) at low alpha rather than neutral gray. Insert these lines just before the
   closing `}` of `@theme inline` (after the palette `--color-*` block added in F1, before
   line 62's `}`):
   ```css
   /* warm shadow scale — ink-tinted (hue 20°), not gray */
   --shadow-xs: 0 1px 2px 0 hsl(20 12% 12% / 0.05);
   --shadow-sm: 0 1px 3px 0 hsl(20 12% 12% / 0.08), 0 1px 2px -1px hsl(20 12% 12% / 0.08);
   --shadow-md: 0 4px 6px -1px hsl(20 12% 12% / 0.10), 0 2px 4px -2px hsl(20 12% 12% / 0.08);
   --shadow-lg: 0 10px 15px -3px hsl(20 12% 12% / 0.12), 0 4px 6px -4px hsl(20 12% 12% / 0.10);
   ```
   Registering `--shadow-*` in `@theme` makes Tailwind's `shadow-xs/sm/md/lg` utilities use
   these values.

2. **Verification (build):**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build
   ```
   Expected: exit 0. Confirm the warm hue appears in a shadow utility in the bundle:
   ```bash
   grep -REo "\.shadow-sm\{[^}]*20 12%[^}]*\}" artifacts/workforce-os/dist/public/assets/*.css | head
   ```
   Expected: at least one match showing the `20 12%` ink hue inside `.shadow-sm`.

3. **Visual verification:** dev server up, screenshot `/today` (cards use `shadow-sm`),
   compare to baseline — shadows should read warm/ink-tinted rather than cool gray. Stop the
   dev server.

4. **Commit:**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/index.css && git commit -m "feat(foundation): add warm ink-tinted shadow scale tokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task F4: Move framer-motion to dependencies

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/package.json`

`framer-motion` is currently under `devDependencies` (line 57) but it is imported at runtime
by the motion library (`src/lib/motion.ts`) and motion components added in a later section.
Runtime imports must live in `dependencies`.

**Steps:**

1. In `artifacts/workforce-os/package.json`, remove the `framer-motion` line from
   `devDependencies` (line 57: `"framer-motion": "catalog:",`). Find and delete exactly:
   ```jsonc
   "framer-motion": "catalog:",
   ```
   from inside the `"devDependencies"` object.

2. Add a `"dependencies"` block (the package currently has none). Insert it immediately
   before the `"devDependencies"` key (which begins on line 12). The block:
   ```jsonc
   "dependencies": {
     "framer-motion": "catalog:"
   },
   ```
   Result: `framer-motion` resolves to the catalog version `^12.23.24` (from
   `pnpm-workspace.yaml`), now as a runtime dependency.

3. Re-install to update the lockfile:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm install
   ```
   Expected: lockfile updates; no version change (same catalog pin).

4. **Verification:** confirm it's now a runtime dep and the build still passes:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && node -e "const p=require('./artifacts/workforce-os/package.json'); if(!p.dependencies||!p.dependencies['framer-motion']) throw new Error('not a dependency'); if(p.devDependencies&&p.devDependencies['framer-motion']) throw new Error('still a devDependency'); console.log('ok: framer-motion is a runtime dependency')"
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build
   ```
   Expected: prints `ok: framer-motion is a runtime dependency`; build exits 0.

5. **Commit:**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/package.json pnpm-lock.yaml && git commit -m "chore(foundation): move framer-motion to runtime dependencies

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task F5: Add ThemeProvider, mount it, and add ThemeToggle to the Shell topbar

**Files:**
- Create: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/theme/ThemeProvider.tsx`
- Create: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/theme/ThemeToggle.tsx`
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/App.tsx` (wrap providers)
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/layout/Shell.tsx` (topbar, lines 88-94)

`next-themes` is already installed and `sonner.tsx` already calls `useTheme()` — it just has
no provider. This task supplies it. `next-themes` toggles the `.dark` class on `<html>`,
which activates the `.dark` token block in `index.css`.

**Steps:**

1. Create the provider wrapper at
   `artifacts/workforce-os/src/components/theme/ThemeProvider.tsx`:
   ```tsx
   import * as React from "react";
   import { ThemeProvider as NextThemesProvider } from "next-themes";

   type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

   export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
     return (
       <NextThemesProvider
         attribute="class"
         defaultTheme="light"
         enableSystem
         disableTransitionOnChange
         {...props}
       >
         {children}
       </NextThemesProvider>
     );
   }
   ```
   `attribute="class"` makes next-themes toggle `class="dark"` on `<html>`, which the
   `@custom-variant dark (&:is(.dark *))` in `index.css` line 6 keys off of.

2. Create the toggle button at
   `artifacts/workforce-os/src/components/theme/ThemeToggle.tsx`. It is hydration-safe
   (renders a stable placeholder until mounted) and uses the existing `Button` (ghost/icon)
   plus lucide icons:
   ```tsx
   import * as React from "react";
   import { useTheme } from "next-themes";
   import { Moon, Sun } from "lucide-react";
   import { Button } from "@/components/ui/button";

   export function ThemeToggle() {
     const { resolvedTheme, setTheme } = useTheme();
     const [mounted, setMounted] = React.useState(false);

     React.useEffect(() => {
       setMounted(true);
     }, []);

     const isDark = resolvedTheme === "dark";

     return (
       <Button
         variant="ghost"
         size="icon"
         aria-label="Toggle theme"
         onClick={() => setTheme(isDark ? "light" : "dark")}
       >
         {mounted && isDark ? (
           <Sun className="h-4 w-4" />
         ) : (
           <Moon className="h-4 w-4" />
         )}
       </Button>
     );
   }
   ```

3. Mount the provider in `App.tsx`. It must wrap everything (so `useTheme` works in both the
   Shell and in `sonner.tsx`). Modify `App.tsx`: add the import after the existing imports
   (after line 17's `NotFound` import is fine; put it near the top with the others), e.g.
   after line 5:
   ```tsx
   import { ThemeProvider } from "@/components/theme/ThemeProvider";
   ```
   Then change the `App` function body (lines 52-63). Replace:
   ```tsx
   function App() {
     return (
       <QueryClientProvider client={queryClient}>
         <TooltipProvider>
           <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
             <Router />
           </WouterRouter>
           <Toaster position="bottom-right" className="bg-ink-900 text-paper-50 border-none font-sans font-medium" />
         </TooltipProvider>
       </QueryClientProvider>
     );
   }
   ```
   with:
   ```tsx
   function App() {
     return (
       <ThemeProvider>
         <QueryClientProvider client={queryClient}>
           <TooltipProvider>
             <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
               <Router />
             </WouterRouter>
             <Toaster position="bottom-right" className="bg-ink-900 text-paper-50 border-none font-sans font-medium" />
           </TooltipProvider>
         </QueryClientProvider>
       </ThemeProvider>
     );
   }
   ```
   (No change to `main.tsx` is required — `App` is the single root rendered by
   `createRoot(...).render(<App />)`; mounting the provider in `App.tsx` covers the whole
   tree. Leave `main.tsx` as-is.)

4. Add `<ThemeToggle/>` to the Shell topbar. In `Shell.tsx`, import it (add after line 15's
   `NotificationBell` import):
   ```tsx
   import { ThemeToggle } from "@/components/theme/ThemeToggle";
   ```
   Then place the toggle in the topbar's right-hand control cluster. Find the block
   (lines 88-94):
   ```tsx
   <div className="flex items-center gap-2">
     <button className="hidden md:flex items-center gap-2 px-2 py-1 text-xs text-ink-400 bg-paper-100 border border-paper-200 rounded shadow-sm hover:bg-paper-200 transition-colors mr-2">
       <span>Search</span>
       <kbd className="font-mono bg-paper-200 px-1 rounded text-[10px]">⌘K</kbd>
     </button>
     <NotificationBell />
   </div>
   ```
   and replace it with:
   ```tsx
   <div className="flex items-center gap-2">
     <button className="hidden md:flex items-center gap-2 px-2 py-1 text-xs text-ink-400 bg-paper-100 border border-paper-200 rounded shadow-sm hover:bg-paper-200 transition-colors mr-2">
       <span>Search</span>
       <kbd className="font-mono bg-paper-200 px-1 rounded text-[10px]">⌘K</kbd>
     </button>
     <ThemeToggle />
     <NotificationBell />
   </div>
   ```

5. **Contrast fixes to call out / apply:** the Shell uses several *hardcoded* color classes
   that don't flip with `.dark`. After F1 added inverted `.dark` palette values, most flip
   automatically (e.g. `bg-paper-50`, `text-ink-900`). But line 57 of `Shell.tsx` uses a
   literal `text-white` on the active nav item (`bg-rust-500 text-white`) — `text-white`
   stays white in both themes, which is fine on rust. Verify in dark mode that:
   - the sidebar (`bg-paper-100`) and topbar (`bg-paper-50`) read as dark surfaces (they
     will, because F1's `.dark` maps `paper-100`→`hsl(40 8% 24%)` and the semantic
     `--background`/`--sidebar` still anchor to ink) — if any surface reads too light,
     nudge that step's `.dark` lightness DOWN in `index.css` and note it;
   - `text-ink-400`/`text-ink-700` body text has sufficient contrast on the dark sidebar
     (F1 set `ink-400`→60% L, `ink-700`→28% L in `.dark`; `ink-700` at 28% on a dark
     sidebar may be too dark — if so, that is a contrast fix: raise `.dark`'s `--ink-700`
     to ~`20 6% 76%` so it reads as *light* text on dark, and note the change).
   Apply any such nudge directly in `index.css` `.dark` and record it in the manifest
   `notes`.

6. **Verification (typecheck + build):**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck
   cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build
   ```
   Expected: both exit 0.

7. **Visual verification (dark mode toggles):** start the dev server
   (`PORT=21792 BASE_PATH=/ …`), navigate to `http://localhost:21792/today`. With
   Playwright: `browser_take_screenshot` (light) → `browser_click` the theme toggle
   (`aria-label="Toggle theme"`) → `browser_take_screenshot` (dark). Expected: the second
   screenshot shows dark surfaces with light text, rust accents intact, the Sonner toaster
   themed dark, and no unreadable (low-contrast) text. Repeat the toggle on `/settings` and
   `/pipeline` to confirm the `.dark` tokens render well across pages. Save both light+dark
   shots and diff dark against expectations. Stop the dev server.

8. **Commit:**
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/theme/ThemeProvider.tsx artifacts/workforce-os/src/components/theme/ThemeToggle.tsx artifacts/workforce-os/src/App.tsx artifacts/workforce-os/src/components/layout/Shell.tsx artifacts/workforce-os/src/index.css && git commit -m "feat(foundation): add ThemeProvider + ThemeToggle and enable dark mode

Mounts next-themes (class strategy) at the app root, adds a ThemeToggle to the
Shell topbar, and applies dark-mode contrast nudges to the ink/paper ramp.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```


---

# §P · PRIMITIVES
## PRIMITIVES

This section builds the shared primitive layer every page composes from: a motion
library (framer-motion `Variants` + a reduced-motion guard), motion components
(`PageTransition`, `Stagger`/`StaggerItem`, `CountUp`), state primitives
(`EmptyState`, `ErrorState`, `ErrorBoundary`), an HTML sanitizer, and the depth/surface
convention that decides which shadow token each surface uses.

### Grounding facts (verified against the live tree)

- `framer-motion ^12.23.24` is already a workspace catalog dep and is listed in
  `artifacts/workforce-os/package.json` as `"framer-motion": "catalog:"` — **no install
  needed** for motion.
- `dompurify` is **not** present anywhere — Task P5 adds it.
- vitest is stood up once in **Task F0b** (another section). Every test below assumes
  `pnpm --filter @workspace/workforce-os run test` exists after F0b. If F0b has not run,
  the test steps still author the file; only the verify command is blocked.
- Today's empties/skeletons are **hand-rolled**: `pages/Today.tsx` lines 129–136 inline a
  "Queue Clear" empty (`opacity-40`, `font-serif`, raw lucide icon); `components/ui/empty.tsx`
  is a shadcn `Empty*` set nobody composes on the dashboard; `components/ui/skeleton.tsx` is a
  one-liner `animate-pulse rounded-md bg-primary/10`. The new `EmptyState`/`ErrorState`
  primitives standardize this so pages stop re-inventing it.
- KPI tiles in `pages/Today.tsx` (the `KpiTile` component, lines 149–173) use
  `shadow-none` today — Task P6 converts them to the raised-card treatment.
- `index.css` is Tailwind v4 CSS-first (`@theme inline`). The warm shadow scale
  (`--shadow-xs/sm/md/lg`) is added by the **index.css / tokens section**; P6 only
  *consumes* `shadow-sm`/`shadow-md` and documents the convention. If a reviewer runs P6
  before tokens land, `shadow-md` falls back to Tailwind's default shadow — acceptable, the
  warm tint is applied later without touching JSX.

---

### Task P1: Create the motion library (`src/lib/motion.ts`)

**Files:**
- Create: `artifacts/workforce-os/src/lib/motion.ts`

1. Create `artifacts/workforce-os/src/lib/motion.ts` with the exact exported `Variants`
   and the `useReducedMotionSafe()` helper. These names are fixed by the CONTRACT:
   `fadeIn, fadeSlideUp, staggerContainer, staggerItem, cardEnter, springHover` +
   `useReducedMotionSafe`.

   ```ts
   import { useReducedMotion, type Variants, type Transition } from "framer-motion";

   /**
    * Shared motion language for Workforce-OS.
    *
    * Timing is deliberately calm and editorial: short fades, small upward slides,
    * gentle springs. Every consumer must gate animation through
    * `useReducedMotionSafe()` so the whole app collapses to instant state when the
    * user has `prefers-reduced-motion: reduce`.
    */

   const EASE_OUT: Transition["ease"] = [0.16, 1, 0.3, 1]; // editorial ease-out

   /** Simple opacity fade. Use for overlays, tooltips, inline reveals. */
   export const fadeIn: Variants = {
     hidden: { opacity: 0 },
     visible: {
       opacity: 1,
       transition: { duration: 0.24, ease: EASE_OUT },
     },
     exit: {
       opacity: 0,
       transition: { duration: 0.16, ease: EASE_OUT },
     },
   };

   /** Fade + small upward slide. The default page/section entrance. */
   export const fadeSlideUp: Variants = {
     hidden: { opacity: 0, y: 8 },
     visible: {
       opacity: 1,
       y: 0,
       transition: { duration: 0.32, ease: EASE_OUT },
     },
     exit: {
       opacity: 0,
       y: -8,
       transition: { duration: 0.2, ease: EASE_OUT },
     },
   };

   /** Parent container that staggers its children in. Pair with `staggerItem`. */
   export const staggerContainer: Variants = {
     hidden: {},
     visible: {
       transition: {
         staggerChildren: 0.06,
         delayChildren: 0.04,
       },
     },
     exit: {},
   };

   /** Child of `staggerContainer`. Each item fades + slides up in sequence. */
   export const staggerItem: Variants = {
     hidden: { opacity: 0, y: 10 },
     visible: {
       opacity: 1,
       y: 0,
       transition: { duration: 0.3, ease: EASE_OUT },
     },
     exit: { opacity: 0, y: 6, transition: { duration: 0.18, ease: EASE_OUT } },
   };

   /** Card mount: fade + slight scale + slide. For KPI tiles, list cards. */
   export const cardEnter: Variants = {
     hidden: { opacity: 0, y: 12, scale: 0.98 },
     visible: {
       opacity: 1,
       y: 0,
       scale: 1,
       transition: { duration: 0.34, ease: EASE_OUT },
     },
     exit: { opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: EASE_OUT } },
   };

   /** Hover lift used on interactive cards/buttons. Apply via `whileHover`. */
   export const springHover: Variants = {
     rest: { y: 0, scale: 1 },
     hover: {
       y: -2,
       scale: 1.01,
       transition: { type: "spring", stiffness: 320, damping: 22, mass: 0.6 },
     },
     tap: { scale: 0.99, transition: { type: "spring", stiffness: 400, damping: 28 } },
   };

   /**
    * Returns `true` when motion should be suppressed (user prefers reduced motion).
    * Consumers should branch their `variants`/`animate` props on this so the app
    * renders the final state instantly with no transition.
    *
    * SSR-safe: framer's `useReducedMotion()` returns `null` before hydration, which
    * we coerce to `false` (animate by default) to avoid a flash of un-animated content.
    */
   export function useReducedMotionSafe(): boolean {
     const prefersReduced = useReducedMotion();
     return prefersReduced === true;
   }
   ```

2. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: typecheck passes (exit 0). `motion.ts` introduces no type errors; the file
   is not yet imported anywhere so only its own types are checked.

3. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/lib/motion.ts && \
     git commit -m "feat(motion): add shared framer-motion variants + useReducedMotionSafe

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P2: Motion components + wire `PageTransition` into the router

**Files:**
- Create: `artifacts/workforce-os/src/components/motion/PageTransition.tsx`
- Create: `artifacts/workforce-os/src/components/motion/Stagger.tsx`
- Create: `artifacts/workforce-os/src/components/motion/CountUp.tsx`
- Modify: `artifacts/workforce-os/src/App.tsx` (wrap the `<Switch>` outlet — lines 28–50)

1. Create `artifacts/workforce-os/src/components/motion/PageTransition.tsx`. It wraps a
   route's content in a `motion.div` driven by `fadeSlideUp`, and is reduced-motion-safe.

   ```tsx
   import { motion } from "framer-motion";
   import { fadeSlideUp, useReducedMotionSafe } from "@/lib/motion";

   interface PageTransitionProps {
     children: React.ReactNode;
     /** Stable key so AnimatePresence can crossfade between routes. */
     transitionKey?: string;
     className?: string;
   }

   export function PageTransition({
     children,
     transitionKey,
     className,
   }: PageTransitionProps) {
     const reduced = useReducedMotionSafe();

     if (reduced) {
       return (
         <div key={transitionKey} className={className}>
           {children}
         </div>
       );
     }

     return (
       <motion.div
         key={transitionKey}
         className={className}
         variants={fadeSlideUp}
         initial="hidden"
         animate="visible"
         exit="exit"
       >
         {children}
       </motion.div>
     );
   }
   ```

2. Create `artifacts/workforce-os/src/components/motion/Stagger.tsx` exporting both
   `Stagger` (container) and `StaggerItem`.

   ```tsx
   import { motion } from "framer-motion";
   import {
     staggerContainer,
     staggerItem,
     useReducedMotionSafe,
   } from "@/lib/motion";

   interface StaggerProps {
     children: React.ReactNode;
     className?: string;
   }

   export function Stagger({ children, className }: StaggerProps) {
     const reduced = useReducedMotionSafe();

     if (reduced) {
       return <div className={className}>{children}</div>;
     }

     return (
       <motion.div
         className={className}
         variants={staggerContainer}
         initial="hidden"
         animate="visible"
         exit="exit"
       >
         {children}
       </motion.div>
     );
   }

   interface StaggerItemProps {
     children: React.ReactNode;
     className?: string;
   }

   export function StaggerItem({ children, className }: StaggerItemProps) {
     const reduced = useReducedMotionSafe();

     if (reduced) {
       return <div className={className}>{children}</div>;
     }

     return (
       <motion.div className={className} variants={staggerItem}>
         {children}
       </motion.div>
     );
   }
   ```

3. Create `artifacts/workforce-os/src/components/motion/CountUp.tsx`. **Extract a pure
   `formatValue(value, decimals, suffix)` helper and export it** so Task P2b can unit-test
   it without rendering. The component animates from 0 to `value` using framer's
   `useMotionValue` + `animate`, and snaps to the final formatted value when reduced motion
   is on.

   ```tsx
   import { useEffect, useRef, useState } from "react";
   import { animate, useMotionValue } from "framer-motion";
   import { useReducedMotionSafe } from "@/lib/motion";

   /**
    * Pure formatting helper — no React, no framer. Exported for unit testing.
    * Renders `value` with a fixed number of decimals and an optional suffix.
    */
   export function formatValue(
     value: number,
     decimals = 0,
     suffix = "",
   ): string {
     const safe = Number.isFinite(value) ? value : 0;
     return `${safe.toFixed(decimals)}${suffix}`;
   }

   interface CountUpProps {
     value: number;
     decimals?: number;
     suffix?: string;
     /** Animation duration in seconds. */
     duration?: number;
     className?: string;
   }

   export function CountUp({
     value,
     decimals = 0,
     suffix = "",
     duration = 0.8,
     className,
   }: CountUpProps) {
     const reduced = useReducedMotionSafe();
     const motionValue = useMotionValue(0);
     const [display, setDisplay] = useState<string>(
       formatValue(reduced ? value : 0, decimals, suffix),
     );
     const prev = useRef(0);

     useEffect(() => {
       if (reduced) {
         setDisplay(formatValue(value, decimals, suffix));
         prev.current = value;
         return;
       }

       const controls = animate(motionValue, value, {
         duration,
         ease: [0.16, 1, 0.3, 1],
         onUpdate: (latest) => {
           setDisplay(formatValue(latest, decimals, suffix));
         },
       });

       prev.current = value;
       return () => controls.stop();
       // motionValue is stable; intentionally not in deps.
       // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [value, decimals, suffix, duration, reduced]);

     return (
       <span className={className} aria-label={formatValue(value, decimals, suffix)}>
         {display}
       </span>
     );
   }
   ```

4. Modify `artifacts/workforce-os/src/App.tsx` to wrap the router outlet in
   `<AnimatePresence>` + `<PageTransition>`, keyed on the current wouter location so
   route changes crossfade. Replace the `Router` function (lines 28–50). Add the two new
   imports at the top alongside the existing wouter import.

   Add imports (after line 1, the existing wouter import line):

   ```tsx
   import { useLocation } from "wouter";
   import { AnimatePresence } from "framer-motion";
   import { PageTransition } from "@/components/motion/PageTransition";
   ```

   Replace the whole `Router()` function body (lines 28–50) with:

   ```tsx
   function Router() {
     const [location] = useLocation();
     return (
       <Shell>
         <AnimatePresence mode="wait" initial={false}>
           <PageTransition key={location} className="h-full">
             <Switch location={location}>
               <Route path="/">
                 <Redirect to="/today" />
               </Route>
               <Route path="/today" component={Today} />
               <Route path="/pipeline" component={Pipeline} />
               <Route path="/pipeline/:id" component={LeadDetail} />
               <Route path="/outbound" component={Outbound} />
               <Route path="/outbound/:id" component={ArtifactDetail} />
               <Route path="/conversations" component={Conversations} />
               <Route path="/conversations/:id" component={ConversationThread} />
               <Route path="/runs" component={Runs} />
               <Route path="/runs/:id" component={RunDetail} />
               <Route path="/agents" component={Agents} />
               <Route path="/settings/*" component={Settings} />
               <Route component={NotFound} />
             </Switch>
           </PageTransition>
         </AnimatePresence>
       </Shell>
     );
   }
   ```

   > Note: passing `location` to `<Switch location={...}>` makes wouter resolve the route
   > against the *captured* location so the exiting page keeps rendering its old route while
   > `AnimatePresence mode="wait"` finishes the exit. `initial={false}` skips the entrance
   > animation on first paint (no flash on cold load).

5. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: passes (exit 0). The `key={location}` and `<Switch location={location}>`
   are both valid wouter/React types.

6. **Verify (build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)
   ```

   Expected: build succeeds. Motion components tree-shake cleanly; `framer-motion` is
   already a resolved catalog dep.

7. **Visual verify:** start the dev server and screenshot `/today` in light + dark with
   Playwright; navigate to `/pipeline` and confirm the crossfade. Compare against the F0
   baseline — content should fade-slide-up on load, not jump.

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)
   ```

8. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/motion artifacts/workforce-os/src/App.tsx && \
     git commit -m "feat(motion): add PageTransition/Stagger/CountUp + wire route crossfade

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P2b: Unit test `CountUp`'s `formatValue` helper

**Files:**
- Test: `artifacts/workforce-os/src/components/motion/CountUp.test.ts`

Depends on Task F0b (vitest set up) and Task P2 (the `formatValue` export exists).

1. Create `artifacts/workforce-os/src/components/motion/CountUp.test.ts`:

   ```ts
   import { describe, it, expect } from "vitest";
   import { formatValue } from "./CountUp";

   describe("formatValue", () => {
     it("formats an integer with no decimals", () => {
       expect(formatValue(42)).toBe("42");
     });

     it("rounds to the requested number of decimals", () => {
       expect(formatValue(3.14159, 2)).toBe("3.14");
       expect(formatValue(2.5, 0)).toBe("3"); // toFixed rounds half-up
     });

     it("appends a suffix", () => {
       expect(formatValue(87.5, 1, "%")).toBe("87.5%");
     });

     it("pads trailing zeros to match decimals", () => {
       expect(formatValue(5, 2)).toBe("5.00");
     });

     it("coerces non-finite input to 0", () => {
       expect(formatValue(Number.NaN, 1, "%")).toBe("0.0%");
       expect(formatValue(Number.POSITIVE_INFINITY)).toBe("0");
     });

     it("handles negatives", () => {
       expect(formatValue(-2.5, 1)).toBe("-2.5");
     });
   });
   ```

2. **Verify (run the test):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run test -- CountUp)
   ```

   Expected output (all 6 assertions green):

   ```
   ✓ src/components/motion/CountUp.test.ts (6 tests)
     ✓ formatValue > formats an integer with no decimals
     ✓ formatValue > rounds to the requested number of decimals
     ✓ formatValue > appends a suffix
     ✓ formatValue > pads trailing zeros to match decimals
     ✓ formatValue > coerces non-finite input to 0
     ✓ formatValue > handles negatives

   Test Files  1 passed (1)
        Tests  6 passed (6)
   ```

3. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/motion/CountUp.test.ts && \
     git commit -m "test(motion): unit test CountUp formatValue helper

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P3: State primitives — `EmptyState` + `ErrorState`

**Files:**
- Create: `artifacts/workforce-os/src/components/states/EmptyState.tsx`
- Create: `artifacts/workforce-os/src/components/states/ErrorState.tsx`

Both are editorial: a Lora (`font-serif`) title, muted body, optional action/retry. They
replace the hand-rolled `opacity-40` empty inlined at `pages/Today.tsx:129–136`.

1. Create `artifacts/workforce-os/src/components/states/EmptyState.tsx`:

   ```tsx
   import type { LucideIcon } from "lucide-react";
   import { cn } from "@/lib/utils";

   interface EmptyStateProps {
     icon: LucideIcon;
     title: string;
     description: string;
     action?: React.ReactNode;
     className?: string;
   }

   export function EmptyState({
     icon: Icon,
     title,
     description,
     action,
     className,
   }: EmptyStateProps) {
     return (
       <div
         className={cn(
           "flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center",
           className,
         )}
       >
         <div className="flex size-12 items-center justify-center rounded-full bg-paper-100 text-ink-400">
           <Icon className="size-6" strokeWidth={1.5} aria-hidden="true" />
         </div>
         <div className="flex max-w-sm flex-col gap-1.5">
           <h3 className="font-serif text-lg text-ink-900">{title}</h3>
           <p className="text-sm leading-relaxed text-ink-500">{description}</p>
         </div>
         {action ? <div className="mt-2">{action}</div> : null}
       </div>
     );
   }
   ```

2. Create `artifacts/workforce-os/src/components/states/ErrorState.tsx`. The icon is fixed
   (`AlertTriangle`) so the signature stays `title?/description?/onRetry?` per CONTRACT;
   the retry renders a `Button` only when `onRetry` is supplied.

   ```tsx
   import { AlertTriangle } from "lucide-react";
   import { Button } from "@/components/ui/button";
   import { cn } from "@/lib/utils";

   interface ErrorStateProps {
     title?: string;
     description?: string;
     onRetry?: () => void;
     className?: string;
   }

   export function ErrorState({
     title = "Something went wrong",
     description = "We couldn't load this just now. Please try again.",
     onRetry,
     className,
   }: ErrorStateProps) {
     return (
       <div
         role="alert"
         className={cn(
           "flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center",
           className,
         )}
       >
         <div className="flex size-12 items-center justify-center rounded-full bg-rust-50 text-rust-500">
           <AlertTriangle className="size-6" strokeWidth={1.5} aria-hidden="true" />
         </div>
         <div className="flex max-w-sm flex-col gap-1.5">
           <h3 className="font-serif text-lg text-ink-900">{title}</h3>
           <p className="text-sm leading-relaxed text-ink-500">{description}</p>
         </div>
         {onRetry ? (
           <Button
             variant="outline"
             size="sm"
             onClick={onRetry}
             className="mt-2 border-rust-200 text-rust-500 hover:bg-rust-50 hover:text-rust-600"
           >
             Try again
           </Button>
         ) : null}
       </div>
     );
   }
   ```

3. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both pass. `LucideIcon` and `Button` are existing types; `bg-paper-100`,
   `text-ink-*`, `bg-rust-50`, `border-rust-200` are all live tokens (used in
   `pages/Today.tsx` today).

4. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/states/EmptyState.tsx \
             artifacts/workforce-os/src/components/states/ErrorState.tsx && \
     git commit -m "feat(states): add editorial EmptyState + ErrorState primitives

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P4: `ErrorBoundary` (class) + app-root mount + per-query reset pattern

**Files:**
- Create: `artifacts/workforce-os/src/components/states/ErrorBoundary.tsx`
- Modify: `artifacts/workforce-os/src/App.tsx` (mount at app root; lines 52–63)

1. Create `artifacts/workforce-os/src/components/states/ErrorBoundary.tsx`. It is a real
   class component (the only React API that catches render errors) and falls back to
   `ErrorState`. It accepts an optional `onReset` so callers can wire it to TanStack
   Query's reset, and an optional `fallback` render-prop for custom messaging.

   ```tsx
   import { Component, type ErrorInfo, type ReactNode } from "react";
   import { ErrorState } from "@/components/states/ErrorState";

   interface ErrorBoundaryProps {
     children: ReactNode;
     /** Called when the user clicks "Try again" — e.g. TanStack Query reset(). */
     onReset?: () => void;
     /** Custom fallback. Receives the error + a reset callback. */
     fallback?: (args: { error: Error; reset: () => void }) => ReactNode;
   }

   interface ErrorBoundaryState {
     error: Error | null;
   }

   export class ErrorBoundary extends Component<
     ErrorBoundaryProps,
     ErrorBoundaryState
   > {
     state: ErrorBoundaryState = { error: null };

     static getDerivedStateFromError(error: Error): ErrorBoundaryState {
       return { error };
     }

     componentDidCatch(error: Error, info: ErrorInfo): void {
       // Surface to the console in dev; a real telemetry sink lands in a later phase.
       // eslint-disable-next-line no-console
       console.error("[ErrorBoundary]", error, info.componentStack);
     }

     reset = (): void => {
       this.props.onReset?.();
       this.setState({ error: null });
     };

     render(): ReactNode {
       const { error } = this.state;
       if (error) {
         if (this.props.fallback) {
           return this.props.fallback({ error, reset: this.reset });
         }
         return (
           <ErrorState
             title="This view hit an error"
             description={error.message || "An unexpected error occurred."}
             onRetry={this.reset}
           />
         );
       }
       return this.props.children;
     }
   }
   ```

2. Modify `artifacts/workforce-os/src/App.tsx` to mount `ErrorBoundary` at the app root and
   add the `QueryErrorResetBoundary` per-query reset pattern. Add imports near the top:

   ```tsx
   import { QueryErrorResetBoundary } from "@tanstack/react-query";
   import { ErrorBoundary } from "@/components/states/ErrorBoundary";
   ```

   Replace the `App()` function (lines 52–63) with:

   ```tsx
   function App() {
     return (
       <QueryClientProvider client={queryClient}>
         <TooltipProvider>
           <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
             <QueryErrorResetBoundary>
               {({ reset }) => (
                 <ErrorBoundary onReset={reset}>
                   <Router />
                 </ErrorBoundary>
               )}
             </QueryErrorResetBoundary>
           </WouterRouter>
           <Toaster
             position="bottom-right"
             className="bg-ink-900 text-paper-50 border-none font-sans font-medium"
           />
         </TooltipProvider>
       </QueryClientProvider>
     );
   }
   ```

   > `QueryErrorResetBoundary` from TanStack Query exposes `reset()`, which clears the
   > error state of any query that opted in with `useQuery({ throwOnError: true })`.
   > Wiring it to `ErrorBoundary.onReset` means the `ErrorState` "Try again" button both
   > re-renders the tree **and** marks errored queries for refetch — the canonical
   > "per-query errors render `<ErrorState onRetry>`" pattern.
   >
   > Per-page usage (documented for downstream sections, not edited here): a page that wants
   > a *local* boundary instead of the root one wraps its data region:
   >
   > ```tsx
   > <QueryErrorResetBoundary>
   >   {({ reset }) => (
   >     <ErrorBoundary
   >       onReset={reset}
   >       fallback={({ reset }) => <ErrorState onRetry={reset} />}
   >     >
   >       <PendingQueue />
   >     </ErrorBoundary>
   >   )}
   > </QueryErrorResetBoundary>
   > ```

3. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both pass. `QueryErrorResetBoundary` is exported by the installed
   `@tanstack/react-query` (catalog dep); its render-prop child signature is `({ reset })`.

4. **Visual verify:** with the dev server up, confirm `/today` still renders normally
   (boundary is transparent on the happy path). Optionally throw inside a child to confirm
   the `ErrorState` fallback + "Try again" appears.

5. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/states/ErrorBoundary.tsx \
             artifacts/workforce-os/src/App.tsx && \
     git commit -m "feat(states): add ErrorBoundary + mount at app root with query reset

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P5: HTML sanitizer (`src/lib/sanitize.ts`) + unit test + dep

**Files:**
- Modify: `artifacts/workforce-os/package.json` (add `dompurify` + `@types/dompurify`)
- Create: `artifacts/workforce-os/src/lib/sanitize.ts`
- Test: `artifacts/workforce-os/src/lib/sanitize.test.ts`

1. Add the dependency. `dompurify` is **not** in the tree yet, so install it into the
   frontend package (not catalog — it's a single consumer):

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     pnpm --filter @workspace/workforce-os add dompurify@^3.2.4 && \
     pnpm --filter @workspace/workforce-os add -D @types/dompurify@^3.0.5)
   ```

   Expected: `dompurify` lands under `dependencies` and `@types/dompurify` under
   `devDependencies` in `artifacts/workforce-os/package.json`.

   > `dompurify@^3.2.4` ships its own bundled types in some patch releases; if pnpm warns
   > that `@types/dompurify` is deprecated/empty, drop the `-D` line — the wrapper below
   > uses only `DOMPurify.sanitize`, which is typed either way. Do not pin to a v2.

2. Create `artifacts/workforce-os/src/lib/sanitize.ts`:

   ```ts
   import DOMPurify from "dompurify";

   /**
    * Sanitize untrusted HTML before it reaches `dangerouslySetInnerHTML`.
    *
    * Allows the small editorial set we actually render in artifacts, approval
    * cards, and conversation threads (paragraphs, line breaks, basic inline
    * marks, links, lists). Strips <script>, event handlers, <iframe>, and any
    * other vector. Links are forced to open safely.
    *
    * Use at EVERY `dangerouslySetInnerHTML` call site.
    */
   const ALLOWED_TAGS = [
     "p",
     "br",
     "b",
     "strong",
     "i",
     "em",
     "u",
     "a",
     "ul",
     "ol",
     "li",
     "blockquote",
     "code",
     "pre",
     "span",
     "h1",
     "h2",
     "h3",
     "h4",
   ];

   const ALLOWED_ATTR = ["href", "title", "target", "rel"];

   export function sanitizeHtml(html: string): string {
     if (!html) return "";
     return DOMPurify.sanitize(html, {
       ALLOWED_TAGS,
       ALLOWED_ATTR,
       // Force-safe links: external targets can't reach window.opener.
       ADD_ATTR: ["target", "rel"],
       ALLOWED_URI_REGEXP:
         /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
     });
   }
   ```

3. Create the test `artifacts/workforce-os/src/lib/sanitize.test.ts`. DOMPurify needs a DOM
   — vitest's `jsdom`/`happy-dom` environment (configured in F0b). The test asserts it
   strips `<script>` and keeps `<p>` and `<a href>`.

   ```ts
   import { describe, it, expect } from "vitest";
   import { sanitizeHtml } from "./sanitize";

   describe("sanitizeHtml", () => {
     it("strips <script> tags", () => {
       const out = sanitizeHtml('<p>Hi</p><script>alert("x")</script>');
       expect(out).not.toContain("<script");
       expect(out).not.toContain("alert");
     });

     it("keeps <p> content", () => {
       const out = sanitizeHtml("<p>Hello world</p>");
       expect(out).toContain("<p>Hello world</p>");
     });

     it("keeps <a href> links", () => {
       const out = sanitizeHtml('<a href="https://nikxius.com">Nikxius</a>');
       expect(out).toContain('href="https://nikxius.com"');
       expect(out).toContain("Nikxius");
     });

     it("strips inline event handlers", () => {
       const out = sanitizeHtml('<a href="#" onclick="steal()">x</a>');
       expect(out).not.toContain("onclick");
       expect(out).not.toContain("steal");
     });

     it("drops disallowed tags but keeps their text", () => {
       const out = sanitizeHtml("<iframe>nope</iframe><p>keep</p>");
       expect(out).not.toContain("<iframe");
       expect(out).toContain("<p>keep</p>");
     });

     it("returns empty string for empty input", () => {
       expect(sanitizeHtml("")).toBe("");
     });
   });
   ```

4. **Verify (run the test):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run test -- sanitize)
   ```

   Expected output:

   ```
   ✓ src/lib/sanitize.test.ts (6 tests)
     ✓ sanitizeHtml > strips <script> tags
     ✓ sanitizeHtml > keeps <p> content
     ✓ sanitizeHtml > keeps <a href> links
     ✓ sanitizeHtml > strips inline event handlers
     ✓ sanitizeHtml > drops disallowed tags but keeps their text
     ✓ sanitizeHtml > returns empty string for empty input

   Test Files  1 passed (1)
        Tests  6 passed (6)
   ```

   > If the test environment is `node` (no DOM), DOMPurify throws. F0b must set
   > `test.environment = "jsdom"` (or `happy-dom`). If F0b chose node, add a per-file
   > pragma comment `// @vitest-environment jsdom` as the **first line** of
   > `sanitize.test.ts`.

5. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both pass.

6. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/package.json \
             artifacts/workforce-os/src/lib/sanitize.ts \
             artifacts/workforce-os/src/lib/sanitize.test.ts \
             pnpm-lock.yaml && \
     git commit -m "feat(security): add sanitizeHtml DOMPurify wrapper + tests + dep

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

   > The call-site wiring (ApprovalCard, ConversationThread, ArtifactDetail, the
   > ConversationThread page) is owned by the component/page sections — they import
   > `sanitizeHtml` from `@/lib/sanitize` and wrap every `dangerouslySetInnerHTML={{ __html
   > }}`. This task only ships the wrapper + test + dep.

---

### Task P6: Depth/surface convention + convert Today KPI tiles to raised cards

**Files:**
- Reference (no edit): documents the depth convention below.
- Modify: `artifacts/workforce-os/src/pages/Today.tsx` (the `KpiTile` component, lines 149–173)

**Depth / surface convention.** The warm shadow scale (`--shadow-xs/sm/md/lg`, ink-tinted)
is defined by the index.css/tokens section. This task fixes *which surface uses which token*
so every page is consistent:

| Surface | Token | Rationale |
|---|---|---|
| Page background, section bands, sidebars | `shadow-none` | Flat structural fields; depth comes from `border-paper-200`, not shadow. |
| KPI tiles, list/lead/artifact cards, agent cards | `shadow-sm` (rest) → `shadow-md` (hover) | The default "raised card" treatment. Hover lift signals interactivity. |
| Popovers, dropdowns, menus, command palette | `shadow-md` | Floats above content; needs clear separation. |
| Dialogs, sheets, drawers, toasts | `shadow-lg` | Highest layer, modal weight. |
| Skeletons / placeholders | `shadow-none` | Mirror the flat-loading state; the card's shadow returns with real content. |

Rule of thumb: **structure uses borders, objects use `shadow-sm`, floating layers use
`shadow-md`/`shadow-lg`.** Never stack a shadow on a surface that already sits inside a
bordered band without a state change (rest→hover).

**Worked example — Today KPI tiles, before/after.**

The current `KpiTile` (lines 149–173) renders flat (`shadow-none`) and only nudges its
border on hover. Convert it to the raised-card treatment: `shadow-sm` at rest lifting to
`shadow-md` on hover, on a white (`ink-0`) surface so the warm shadow reads.

1. Replace the `KpiTile` function in `artifacts/workforce-os/src/pages/Today.tsx`
   (lines 149–173).

   **BEFORE** (current — `shadow-none`, border-only hover):

   ```tsx
   function KpiTile({ label, value, delta, alert, positive }: { label: string; value: string; delta: string; alert?: boolean; positive?: boolean }) {
     const isNegative = delta.startsWith("-");
     return (
       <Card className="p-4 bg-paper-50 border-paper-200 flex flex-col justify-between shadow-none hover:border-paper-300 transition-colors">
         <div>
           <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">{label}</span>
           <div className="flex items-baseline gap-2 mt-1">
             <span className={cn(
               "font-tabular text-2xl font-bold tracking-tight",
               alert ? "text-rust-500" : positive ? "text-signal-positive" : "text-ink-900"
             )}>
               {value}
             </span>
             <div className={cn(
               "flex items-center text-[10px] font-medium",
               isNegative ? "text-ink-400" : "text-ink-400"
             )}>
               {isNegative ? <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" /> : <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />}
               {delta}
             </div>
           </div>
         </div>
       </Card>
     );
   }
   ```

   **AFTER** (raised card — `shadow-sm` → `shadow-md` on hover, white surface):

   ```tsx
   function KpiTile({ label, value, delta, alert, positive }: { label: string; value: string; delta: string; alert?: boolean; positive?: boolean }) {
     const isNegative = delta.startsWith("-");
     return (
       <Card className="p-4 bg-ink-0 border-paper-200 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md hover:border-paper-300 hover:-translate-y-0.5">
         <div>
           <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">{label}</span>
           <div className="flex items-baseline gap-2 mt-1">
             <span className={cn(
               "font-tabular text-2xl font-bold tracking-tight",
               alert ? "text-rust-500" : positive ? "text-signal-positive" : "text-ink-900"
             )}>
               {value}
             </span>
             <div className={cn(
               "flex items-center text-[10px] font-medium",
               isNegative ? "text-ink-400" : "text-ink-400"
             )}>
               {isNegative ? <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" /> : <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />}
               {delta}
             </div>
           </div>
         </div>
       </Card>
     );
   }
   ```

   Changes: `shadow-none` → `shadow-sm`; added `hover:shadow-md` + `hover:-translate-y-0.5`
   for the lift; `transition-colors` → `transition-all duration-200`; `bg-paper-50` →
   `bg-ink-0` so the card surface is white and the warm shadow reads against the paper band.

   > Optional follow-up (owned by the Today section, not here): swap the raw `{value}`
   > string for `<CountUp value={kpis?.artifactsPending ?? 0} />` etc. so the numbers
   > animate on load. Out of scope for the depth conversion.

2. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both pass. `bg-ink-0`, `shadow-sm`, `shadow-md` are valid utilities (`ink-0`
   is a CONTRACT token; the warm shadow steps are added by the tokens section — if they
   haven't landed, `shadow-sm/md` fall back to Tailwind defaults and still build).

3. **Visual verify:** dev server up, screenshot `/today` in light + dark. The six KPI tiles
   should now read as raised white cards with a soft warm shadow, lifting on hover. Compare
   against the F0 baseline (flat tiles).

4. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Today.tsx && \
     git commit -m "feat(depth): convert Today KPI tiles to raised-card shadow treatment

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **P1 → P2 → P2b**: motion variants must exist before the components; `formatValue` must
  be exported (P2) before its test (P2b).
- **P3 → P4**: `ErrorState` (P3) is the fallback `ErrorBoundary` (P4) renders.
- **P2b, P5 tests** require **Task F0b** (vitest). Author the test files regardless; the
  verify step is the only thing blocked if F0b hasn't run.
- **P6** consumes the warm shadow tokens from the **index.css/tokens section**; it builds
  with Tailwind-default shadows as a graceful fallback if tokens land later.
- No cross-section symbol is renamed: every export matches the SHARED CONTRACT exactly.


---

# §B · BRAND & IDENTITY
## Section 30 — BRAND & DATA-DRIVEN IDENTITY

Replaces the hardcoded "Mynoted Private Limited" / "Nikhil Sood" identity with a
single-source-of-truth workspace/user layer and an on-brand **Nikxius** identity
(logo mark, wordmark, favicon, document title, 404, real integration logos).

### Sourcing decision (READ THIS FIRST — it governs B1)

I inspected the API surface before writing the data layer:

- **Org/workspace IS available from an endpoint.** `GET /settings/org`
  (`/Users/nikhil/Downloads/Workforce-OS/artifacts/api-server/src/routes/settings.ts`)
  resolves to the generated hook `useGetOrgSettings()` in
  `/Users/nikhil/Downloads/Workforce-OS/lib/api-client-react/src/generated/api.ts`.
  Its return type `OrgSettings`
  (`/Users/nikhil/Downloads/Workforce-OS/lib/api-client-react/src/generated/api.schemas.ts:294`)
  contains exactly `orgName: string`, `plan?: string`, `logoUrl?: string | null`.
  → **`useWorkspace()` wires to this endpoint** and maps `orgName→name`,
  `plan→plan`, `logoUrl→logoUrl`, with a static Nikxius fallback while loading or
  on error (so the sidebar never flashes blank or "Mynoted").
- **Current user is NOT available from any endpoint.** There is no `/me` /
  `/auth/whoami` route; `GET /settings/team` returns the member list but nothing
  identifies "the signed-in user." The seed
  (`/Users/nikhil/Downloads/Workforce-OS/scripts/src/seed-mynoted.ts:267`) has a
  user object (`name: "Nikhil Sood"`, `role: "OWNER"`) but it is not exposed.
  → **`useCurrentUser()` uses a static Nikxius app-context constant.** Per the
  CONTRACT, Phase 2 swaps the *source* to Clerk's `useUser()` **without changing
  the signature or any consumer.**

Both hooks keep the CONTRACT signatures verbatim:
`useWorkspace(): { name; plan; logoUrl? }`,
`useCurrentUser(): { name; role; initials; avatarUrl? }`.

> ⚠️ Dependency note: `EmptyState` (used by B5) is created in Task F0's state
> primitives (`/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/states/EmptyState.tsx`).
> This section runs **after** F0. If the import resolves red, F0 has not landed yet —
> do not stub it here.

---

### Task B1: Workspace + current-user data layer (`useWorkspace` / `useCurrentUser`)

**Files:**
- Create `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/lib/workspace.ts`

1. Create the file with the static Nikxius app-context constant and both hooks.
   `useWorkspace` reads the live org endpoint; `useCurrentUser` returns the static
   constant (no endpoint exists). Paste verbatim:

```ts
// /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/lib/workspace.ts
//
// Single source of truth for workspace + current-user identity.
//
// Phase 1 (now):  workspace = live `GET /settings/org`; user = static Nikxius constant.
// Phase 2 (later): swap the *source* to Clerk (`useOrganization` / `useUser`) WITHOUT
//                  changing these return signatures or any consumer.
import { useGetOrgSettings } from "@workspace/api-client-react";

export interface Workspace {
  name: string;
  plan: string;
  logoUrl?: string;
}

export interface CurrentUser {
  name: string;
  role: string;
  initials: string;
  avatarUrl?: string;
}

/**
 * Static Nikxius app context. Used as the workspace fallback (loading/error) and
 * as the sole source for the current user until a `/me` endpoint or Clerk lands.
 */
const NIKXIUS_APP_CONTEXT = {
  workspace: {
    name: "Nikxius",
    plan: "Growth",
  } satisfies Workspace,
  user: {
    name: "Nikhil Sood",
    role: "Owner",
    initials: "NS",
  } satisfies CurrentUser,
} as const;

/** Derive 1–2 letter initials from a display name. */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Title-case a raw plan slug like "growth" -> "Growth". */
function formatPlan(plan: string): string {
  if (!plan) return NIKXIUS_APP_CONTEXT.workspace.plan;
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/**
 * Active workspace identity. Sourced from `GET /settings/org`; falls back to the
 * static Nikxius context while loading or on error so the chrome never flashes
 * blank or a stale tenant name.
 */
export function useWorkspace(): Workspace {
  const { data } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });

  if (!data) return NIKXIUS_APP_CONTEXT.workspace;

  return {
    name: data.orgName || NIKXIUS_APP_CONTEXT.workspace.name,
    plan: formatPlan(data.plan ?? ""),
    logoUrl: data.logoUrl ?? undefined,
  };
}

/**
 * The signed-in user. Static Nikxius constant for now — no current-user endpoint
 * exists. Phase 2 swaps the body to Clerk's `useUser()` with no signature change.
 */
export function useCurrentUser(): CurrentUser {
  const { name, role } = NIKXIUS_APP_CONTEXT.user;
  return {
    name,
    role,
    initials: deriveInitials(name),
  };
}
```

2. **Verify:** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   expect no errors referencing `workspace.ts` (the `useGetOrgSettings` import must
   resolve from `@workspace/api-client-react`).

3. **Commit:**
   ```
   git add artifacts/workforce-os/src/lib/workspace.ts
   git commit -m "feat(brand): add useWorkspace/useCurrentUser identity layer

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task B2: Nikxius logo mark + wordmark component

**Files:**
- Create `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/brand/Logo.tsx`

**Mark design (concrete):** an "N"-derived monogram rendered as a rounded-square
"app icon." A `rust-500` rounded square (`rx` corners) holds a single thick stroke
that traces the diagonal of an **N** — bottom-left up to top-left, diagonal down to
bottom-right, up to top-right — drawn in `ink-0` (paper white) with round caps/joins.
`fill`/`stroke` use `currentColor` semantics via CSS vars so the mark reads correctly
in both themes. The mark is square and scales by a single `size` prop.

1. Create the file. Paste verbatim:

```tsx
// /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/brand/Logo.tsx
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Pixel size of the square mark. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Nikxius mark — a rust rounded-square app icon enclosing an "N" monogram stroke
 * drawn in paper white. Square, theme-stable, scales by `size`.
 */
export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Nikxius"
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rounded-square plate */}
      <rect
        width="32"
        height="32"
        rx="8"
        className="fill-rust-500"
      />
      {/* "N" monogram: up the left, diagonal down, up the right */}
      <path
        d="M9 23 V9 L23 23 V9"
        className="stroke-ink-0"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface WordmarkProps {
  /** Pixel size of the mark; the wordmark text scales with it. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Nikxius wordmark — mark + "Nikxius" set in Lora (the app serif, `font-serif`).
 */
export function Wordmark({ size = 28, className }: WordmarkProps) {
  return (
    <div className={cn("flex items-center gap-2.5 min-w-0", className)}>
      <Logo size={size} />
      <span className="font-serif font-semibold tracking-tight text-ink-900 text-lg leading-none truncate">
        Nikxius
      </span>
    </div>
  );
}
```

> Note: `font-serif` is the app's Lora serif (already wired in `index.css` /
> existing Shell uses `font-serif` for the org title). `fill-rust-500`,
> `stroke-ink-0`, `text-ink-900` are CONTRACT tokens.

2. **Verify:** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   no errors in `Logo.tsx`.

3. **Commit:**
   ```
   git add artifacts/workforce-os/src/components/brand/Logo.tsx
   git commit -m "feat(brand): add Nikxius Logo mark + Wordmark

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task B3: Wire Shell to the identity layer + `<Wordmark/>`

**Files:**
- Modify `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/layout/Shell.tsx`
  (imports ~line 13–16; sidebar header ~line 43–46; avatar/user ~line 67–75;
  mobile topbar brand ~line 83)

1. Add the new imports. Find (lines 13–16):

```tsx
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { NotificationBell } from "@/components/v2/NotificationBell";
import { cn } from "@/lib/utils";
```

Replace with:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { NotificationBell } from "@/components/v2/NotificationBell";
import { Logo, Wordmark } from "@/components/brand/Logo";
import { useWorkspace, useCurrentUser } from "@/lib/workspace";
import { cn } from "@/lib/utils";
```

2. Read the workspace + user at the top of the component. Find:

```tsx
export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
```

Replace with:

```tsx
export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const workspace = useWorkspace();
  const user = useCurrentUser();
```

3. Replace the hardcoded sidebar header. Find (lines 43–46):

```tsx
        <div className="p-4 border-b border-paper-200">
          <h1 className="font-serif font-semibold text-ink-900 text-lg tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">Mynoted Private Limited</h1>
          <p className="text-xs text-ink-400 font-mono uppercase">Workspace</p>
        </div>
```

Replace with:

```tsx
        <div className="p-4 border-b border-paper-200">
          <Wordmark />
          <p className="mt-1 text-xs text-ink-400 font-mono uppercase truncate">{workspace.name}</p>
        </div>
```

4. Replace the hardcoded avatar + user block. Find (lines 67–75):

```tsx
        <div className="p-4 border-t border-paper-200 flex items-center gap-3">
          <Avatar className="h-8 w-8 bg-paper-200 border border-paper-200 text-ink-900">
            <AvatarFallback className="font-serif bg-transparent text-ink-900">NS</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900 truncate">Nikhil Sood</p>
            <p className="text-xs text-ink-400 truncate">Owner</p>
          </div>
        </div>
```

Replace with:

```tsx
        <div className="p-4 border-t border-paper-200 flex items-center gap-3">
          <Avatar className="h-8 w-8 bg-paper-200 border border-paper-200 text-ink-900">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback className="font-serif bg-transparent text-ink-900">{user.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900 truncate">{user.name}</p>
            <p className="text-xs text-ink-400 truncate">{user.role}</p>
          </div>
        </div>
```

5. Replace the mobile topbar brand. Find (line 83):

```tsx
            <span className="md:hidden font-serif font-semibold text-ink-900">Mynoted</span>
```

Replace with:

```tsx
            <Logo size={20} className="md:hidden" />
```

6. **Verify (typecheck):** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   no errors. Then **visual:** run
   `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)`,
   navigate to `/today`, Playwright-screenshot the sidebar in **light and dark**.
   Expect: rust mark + "Nikxius" wordmark in the sidebar header, workspace name
   underneath, `NS` avatar + "Nikhil Sood / Owner" in the footer; no "Mynoted"
   anywhere. Compare against the F0 baseline.

7. **Commit:**
   ```
   git add artifacts/workforce-os/src/components/layout/Shell.tsx
   git commit -m "feat(brand): wire Shell to useWorkspace/useCurrentUser + Wordmark

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

> AvatarImage check: shadcn's avatar exports `AvatarImage`. If the local
> `@/components/ui/avatar` does not export it, drop the `AvatarImage` import and the
> `{user.avatarUrl && <AvatarImage .../>}` line (the fallback already renders
> initials and `avatarUrl` is undefined in Phase 1). Verify with
> `grep -n "AvatarImage" artifacts/workforce-os/src/components/ui/avatar.tsx` before editing.

---

### Task B4: Rebrand `index.html` + favicon asset

**Files:**
- Modify `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/index.html` (lines 5–18)
- Modify `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/public/favicon.svg` (replace contents)

1. Replace the `<head>` title + meta + font block. Find (lines 5–18):

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>Workforce OS v2</title>
    <meta name="description" content="Workforce OS v2 — built on Replit. Update this description to reflect the app." />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Workforce OS v2" />
    <meta property="og:description" content="Workforce OS v2 — built on Replit. Update this description to reflect the app." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Workforce OS v2" />
    <meta name="twitter:description" content="Workforce OS v2 — built on Replit. Update this description to reflect the app." />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Replace with:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>Nikxius</title>
    <meta name="description" content="Nikxius — autonomous AI sales agents that source, draft, and route outbound, with a human in the loop on every send." />
    <meta name="theme-color" content="#FF3C00" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Nikxius" />
    <meta property="og:description" content="Autonomous AI sales agents that source, draft, and route outbound — human-approved on every send." />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Nikxius" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Nikxius" />
    <meta name="twitter:description" content="Autonomous AI sales agents that source, draft, and route outbound — human-approved on every send." />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
```

> Lora is added to the Google Fonts request because the Nikxius wordmark and serif
> headlines use `font-serif` = Lora. If `index.css` already imports Lora via
> `@import`, this is harmless duplication; keep it here so the wordmark renders even
> if CSS is slow.

2. Replace the favicon so it matches the in-app mark (rust plate + white "N"
   monogram). Overwrite `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/public/favicon.svg`
   with verbatim:

```html
<svg width="180" height="180" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="8" fill="#FF3C00"/>
  <path d="M9 23 V9 L23 23 V9" stroke="#FBF9F4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

   (`#FF3C00` = rust-500, `#FBF9F4` = paper/ink-0 white — matches the Logo mark.)

3. **Verify:** run
   `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)`;
   Playwright-navigate to `/`, then `browser_evaluate` `() => document.title` →
   expect `"Nikxius"`. Screenshot the browser tab/favicon if possible; the favicon
   should be a rust square with a white N.

4. **Commit:**
   ```
   git add artifacts/workforce-os/index.html artifacts/workforce-os/public/favicon.svg
   git commit -m "feat(brand): rebrand index.html + favicon to Nikxius

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task B5: On-brand 404 page (paper/ink/rust, Lora, EmptyState, "Back to Today")

**Files:**
- Modify (full rewrite) `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/not-found.tsx`

Depends on `EmptyState` from Task F0 and `wouter` routing (CONTRACT).

1. Replace the entire file contents verbatim:

```tsx
// /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/not-found.tsx
import { Link } from "wouter";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/states/EmptyState";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-paper-50 px-4">
      <div className="w-full max-w-md text-center">
        <p className="font-serif text-rust-500 text-6xl font-semibold tracking-tight">404</p>
        <EmptyState
          icon={Compass}
          title="This page wandered off"
          description="The link is broken or the page has moved. Nothing's lost — let's get you back to where the work is."
          action={
            <Button asChild className="bg-rust-500 hover:bg-rust-600 text-white">
              <Link href="/today">Back to Today</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
```

> Copy is human and warm (no "Did you forget to add the page to the router?"),
> uses paper/ink/rust tokens, a Lora (`font-serif`) "404" headline, the CONTRACT
> `EmptyState` primitive, and a "Back to Today" CTA. `Button asChild` wraps the
> wouter `<Link>` so the CTA is a real anchor.

2. **Verify (typecheck):** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   no errors. **Visual:** dev server, Playwright-navigate to a bogus route like
   `/nope`, screenshot **light and dark**. Expect: paper background, rust "404",
   compass icon, warm copy, rust "Back to Today" button that routes to `/today`.

3. **Commit:**
   ```
   git add artifacts/workforce-os/src/pages/not-found.tsx
   git commit -m "feat(brand): rewrite 404 on-brand with EmptyState + Back to Today

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

> If `Button` does not support `asChild` in `@/components/ui/button`, replace the
> action with `<Link href="/today"><Button className="bg-rust-500 hover:bg-rust-600 text-white">Back to Today</Button></Link>`.
> Verify with `grep -n "asChild" artifacts/workforce-os/src/components/ui/button.tsx`.

---

### Task B6: Real integration brand SVGs in Settings (replace emoji)

**Files:**
- Create `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/brand/IntegrationLogo.tsx`
- Modify `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Settings.tsx`
  (`PROVIDER_META` lines ~443–455; integrations render ~line 473 and ~line 477)

The current `PROVIDER_META` ships **11** providers with emoji
(`gmail, outlook, linkedin, hubspot, salesforce, slack, clay, apollo, hunter,
fullenrich, webhooks`). I provide real, simple, brand-correct inline SVGs for the
six "real brand logo" providers in the task (Gmail, HubSpot, LinkedIn, Slack,
Outlook, Salesforce) and a clean neutral Lucide-based glyph fallback for the
data/tooling providers (clay, apollo, hunter, fullenrich, webhooks) so no emoji
remains.

1. Create the logo component. It is a single dispatch component keyed by provider
   id, returning real brand marks (with brand colors) and a neutral fallback. Paste
   verbatim:

```tsx
// /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/brand/IntegrationLogo.tsx
import { Plug } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntegrationLogoProps {
  provider: string;
  /** Pixel size. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Real brand marks for connectable integrations. Brand-colored, simplified inline
 * SVGs (no external asset fetch). Unknown providers fall back to a neutral plug.
 */
export function IntegrationLogo({ provider, size = 28, className }: IntegrationLogoProps) {
  const common = {
    width: size,
    height: size,
    className: cn("shrink-0", className),
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };

  switch (provider) {
    case "gmail":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#fff" d="M40 6H8a4 4 0 0 0-4 4v28a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4V10a4 4 0 0 0-4-4Z" />
          <path fill="#e53935" d="M8 42V14l16 12L40 14v28H8Z" opacity="0" />
          <path fill="#4caf50" d="M4 38V12.5L4 38a4 4 0 0 0 4 4h4V22L4 38Z" />
          <path fill="#1e88e5" d="M44 38V12.5L44 38a4 4 0 0 1-4 4h-4V22l8-9.5Z" />
          <path fill="#e53935" d="M12 42V22l12 9 12-9v20" opacity="0" />
          <path fill="#c62828" d="M4 12.5 24 27 44 12.5V10a4 4 0 0 0-4-4h-.6L24 18 8.6 6H8a4 4 0 0 0-4 4v2.5Z" />
          <path fill="#fbc02d" d="M12 42H8a4 4 0 0 1-4-4V12.5L12 18v24Z" />
          <path fill="#1565c0" d="M36 42h4a4 4 0 0 0 4-4V12.5L36 18v24Z" />
        </svg>
      );
    case "outlook":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#1976d2" d="M28 13h16v22a2 2 0 0 1-2 2H28V13Z" />
          <path fill="#fff" d="M44 17H28v-4h16v4Zm0 6H28v-3h16v3Zm0 6H28v-3h16v3Zm0 5h-16v-2h16v2Z" opacity=".7" />
          <path fill="#0d47a1" d="M4 9 28 5v38L4 39V9Z" />
          <path fill="#fff" d="M16 17.5c-3.6 0-6 2.7-6 6.6s2.3 6.4 5.9 6.4 6-2.6 6-6.6-2.3-6.4-5.9-6.4Zm-.1 10.4c-1.9 0-3-1.6-3-3.9 0-2.4 1.2-3.9 3-3.9s3 1.5 3 3.8c0 2.5-1.1 4-3 4Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <rect width="42" height="42" x="3" y="3" rx="6" fill="#0a66c2" />
          <path fill="#fff" d="M14.4 36V18.7H9.1V36h5.3ZM11.8 16.4a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM38.9 36v-9.5c0-5.1-2.7-7.4-6.4-7.4-3 0-4.3 1.6-5 2.8v-2.4h-5.3c.07 1.5 0 17.2 0 17.2h5.3v-9.6c0-.5 0-1 .15-1.3.4-1 1.3-2 2.8-2 2 0 2.8 1.5 2.8 3.7V36h5.4Z" />
        </svg>
      );
    case "hubspot":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#ff7a59" d="M33 18.6v-4.4a3.4 3.4 0 1 0-3.3 0v4.4a9.6 9.6 0 0 0-4.6 2l-12-9.4a3.8 3.8 0 1 0-1.8 2.4l11.8 9.2a9.5 9.5 0 0 0 .1 10.8l-3.6 3.6a3.1 3.1 0 1 0 1.7 1.8l3.6-3.6a9.6 9.6 0 1 0 8.1-16.8Zm-2.5 14.4a4.9 4.9 0 1 1 0-9.8 4.9 4.9 0 0 1 0 9.8Z" />
        </svg>
      );
    case "salesforce":
      return (
        <svg viewBox="0 0 48 32" {...common}>
          <path fill="#00a1e0" d="M20 7a7 7 0 0 1 11.6-2.4A8.4 8.4 0 0 1 44 12.6a7.6 7.6 0 0 1-3 14.6 7 7 0 0 1-1.4-.1 7.7 7.7 0 0 1-13.4 1.4 8.7 8.7 0 0 1-3.7.8 8.8 8.8 0 0 1-3.9-.9A8.9 8.9 0 1 1 9.6 12a8.7 8.7 0 0 1 1.7.2A7 7 0 0 1 20 7Z" />
        </svg>
      );
    case "slack":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#36c5f0" d="M19 6a3.5 3.5 0 1 0 0 7h3.5V9.5A3.5 3.5 0 0 0 19 6Z" />
          <path fill="#2eb67d" d="M42 19a3.5 3.5 0 1 0-7 0v3.5h3.5A3.5 3.5 0 0 0 42 19Z" />
          <path fill="#ecb22e" d="M29 42a3.5 3.5 0 1 0 0-7h-3.5v3.5A3.5 3.5 0 0 0 29 42Z" />
          <path fill="#e01e5a" d="M6 29a3.5 3.5 0 1 0 7 0v-3.5H9.5A3.5 3.5 0 0 0 6 29Z" />
          <path fill="#36c5f0" d="M16 19a3.5 3.5 0 0 1 3.5-3.5H29a3.5 3.5 0 0 1 0 7h-9.5A3.5 3.5 0 0 1 16 19Z" opacity="0" />
          <path fill="#2eb67d" d="M22.5 16a3.5 3.5 0 0 1 7 0v9.5a3.5 3.5 0 0 1-7 0V16Z" />
          <path fill="#ecb22e" d="M32 29.5a3.5 3.5 0 0 1-3.5 3.5H19a3.5 3.5 0 0 1 0-7h9.5a3.5 3.5 0 0 1 3.5 3.5Z" />
          <path fill="#e01e5a" d="M25.5 32a3.5 3.5 0 0 1-7 0v-9.5a3.5 3.5 0 0 1 7 0V32Z" />
        </svg>
      );
    default:
      return (
        <div
          className={cn(
            "flex items-center justify-center rounded-md bg-paper-200 text-ink-500",
            className
          )}
          style={{ width: size, height: size }}
          aria-hidden
        >
          <Plug style={{ width: size * 0.55, height: size * 0.55 }} />
        </div>
      );
  }
}
```

2. In `Settings.tsx`, import the new component. Find (the lucide import block ends
   around line 30):

```tsx
import { cn } from "@/lib/utils";
```

Replace with:

```tsx
import { IntegrationLogo } from "@/components/brand/IntegrationLogo";
import { cn } from "@/lib/utils";
```

3. Drop `emoji` from `PROVIDER_META` (it is now unused) and keep `name` +
   `description`. Find (lines 443–455):

```tsx
const PROVIDER_META: Record<string, { name: string; emoji: string; description: string }> = {
  gmail:       { name: "Gmail", emoji: "📧", description: "Send outreach and receive replies via Google Workspace." },
  outlook:     { name: "Outlook", emoji: "📬", description: "Microsoft 365 email sending and inbox sync." },
  linkedin:    { name: "LinkedIn", emoji: "💼", description: "Connect for profile enrichment and InMail sequences." },
  hubspot:     { name: "HubSpot", emoji: "🟠", description: "Sync leads, contacts, and deal stages bidirectionally." },
  salesforce:  { name: "Salesforce", emoji: "☁️", description: "Push qualified leads and activities to your CRM." },
  slack:       { name: "Slack", emoji: "🔔", description: "Get approval alerts and notifications in Slack." },
  clay:        { name: "Clay", emoji: "🏺", description: "Pull enriched lead data from Clay tables." },
  apollo:      { name: "Apollo", emoji: "🚀", description: "Source leads from Apollo.io company and contact database." },
  hunter:      { name: "Hunter.io", emoji: "🔍", description: "Verify email addresses before sending." },
  fullenrich:  { name: "Fullenrich", emoji: "⚡", description: "Waterfall email enrichment for harder-to-find contacts." },
  webhooks:    { name: "Webhooks", emoji: "🔗", description: "Send events to any external endpoint via HTTP POST." },
};
```

Replace with:

```tsx
const PROVIDER_META: Record<string, { name: string; description: string }> = {
  gmail:       { name: "Gmail", description: "Send outreach and receive replies via Google Workspace." },
  outlook:     { name: "Outlook", description: "Microsoft 365 email sending and inbox sync." },
  linkedin:    { name: "LinkedIn", description: "Connect for profile enrichment and InMail sequences." },
  hubspot:     { name: "HubSpot", description: "Sync leads, contacts, and deal stages bidirectionally." },
  salesforce:  { name: "Salesforce", description: "Push qualified leads and activities to your CRM." },
  slack:       { name: "Slack", description: "Get approval alerts and notifications in Slack." },
  clay:        { name: "Clay", description: "Pull enriched lead data from Clay tables." },
  apollo:      { name: "Apollo", description: "Source leads from Apollo.io company and contact database." },
  hunter:      { name: "Hunter.io", description: "Verify email addresses before sending." },
  fullenrich:  { name: "Fullenrich", description: "Waterfall email enrichment for harder-to-find contacts." },
  webhooks:    { name: "Webhooks", description: "Send events to any external endpoint via HTTP POST." },
};
```

4. Update the fallback `meta` and the render to use `IntegrationLogo`. Find
   (lines 473 and 477):

```tsx
          const meta = PROVIDER_META[int.provider] ?? { name: int.provider, emoji: "🔌", description: "" };
```

Replace with:

```tsx
          const meta = PROVIDER_META[int.provider] ?? { name: int.provider, description: "" };
```

Then find:

```tsx
              <div className="text-2xl shrink-0 mt-0.5">{meta.emoji}</div>
```

Replace with:

```tsx
              <IntegrationLogo provider={int.provider} size={28} className="mt-0.5" />
```

5. **Verify (typecheck):** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   no errors (confirms no lingering `emoji` references). **Visual:** dev server,
   Playwright-navigate to `/settings/integrations`, screenshot **light and dark**.
   Expect: real Gmail / Outlook / LinkedIn / HubSpot / Salesforce / Slack marks; the
   data providers (Clay, Apollo, Hunter, Fullenrich, Webhooks) show a neutral plug
   glyph; no emoji remain.

6. **Commit:**
   ```
   git add artifacts/workforce-os/src/components/brand/IntegrationLogo.tsx artifacts/workforce-os/src/pages/Settings.tsx
   git commit -m "feat(brand): replace emoji integration logos with real brand SVGs

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Section verification (after B1–B6)

1. `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` → clean.
2. `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)` → succeeds.
3. Dev server + Playwright screenshots (light + dark) of `/today` (sidebar identity),
   a bogus route (404), `/settings/integrations` (logos); browser tab title reads
   "Nikxius". No "Mynoted" / "Workforce OS" string survives in chrome, title, or 404.
   `grep -rn "Mynoted\|Workforce OS v2" artifacts/workforce-os/src artifacts/workforce-os/index.html`
   → only acceptable hits are inside seed/sample *data* (e.g. signature placeholder),
   never UI chrome.


---

# §R · ROUTE & CHROME SWEEP


---

## ROUTE: TODAY

This section applies the Nikxius premium treatment to the **Today** surface — the operator's
home: a six-tile KPI band, a live agent activity feed, and a pending-approval queue. It depends
on the FOUNDATION section (warm shadow tokens `--shadow-xs/sm/md/lg`, the extended palette
`paper-300/400` / `ink-0..900` / `rust-50..900` / `ember-300/500` / `signal-*`, and the
`.hover-elevate`/`.active-elevate-2` utilities) and the PRIMITIVES section (`src/lib/motion.ts`,
`<Stagger>`/`<StaggerItem>`, `<CountUp>`, `<EmptyState>`, `<ErrorState>`). It does **not** depend
on any other route section.

### Files touched

- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Today.tsx`
  (174 lines as of 2026-06-07; tasks edit lines 1–14, 19–30, 42–80, 102–143, 149–173, and
  append a `computeDelta` helper)
- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/v2/AgentActivityStream.tsx`
  (87 lines; tasks edit lines 1–6, 22–26, 46–86)

### Grounding facts (verified against the live tree 2026-06-07)

- `Today.tsx` renders six `<KpiTile>`s (lines 47–78). **Every `delta` is a hardcoded string** —
  `"+12%"` (line 50), `"+8%"` (line 56), `"-2%"` (line 61), `"+4%"` (line 66), `"+15%"`
  (line 72), `"+20%"` (line 77) — none of which track the live `kpis` numbers. This is the
  primary leak to close.
- The `KpiTile` (lines 149–173) is a `<Card>` with `shadow-none` (line 152) and a
  `delta: string` prop whose sign is parsed with `delta.startsWith("-")` (line 150). Both the
  up- and down-arrow branches resolve to `text-ink-400` (lines 163–164) — i.e. the delta color
  is dead code. The numeric value (lines 156–161) is rendered as a plain string with no count-up.
- `useGetTodayKpis` returns the generated `TodayKpis` type — exactly six numeric fields
  (`artifactsPending`, `artifactsSentToday`, `replyRate7d`, `qualifiedMeetingsBooked`,
  `leadsSourcedToday`, `leadsScored`) per `lib/api-client-react/src/generated/api.schemas.ts`
  lines 117–124. **There is no previous-period field**, so a real `computeDelta(current,
  previous)` needs a `previous` source; we add a deterministic prior-period baseline constant
  (`KPI_BASELINE`) so the deltas are *derived from data* rather than typed in.
- The activity feed is **not** rendered in `Today.tsx`; `<AgentActivityStream filter=…/>`
  (line 97) owns its own `useGetActivityStream` query and renders the list (events at
  `AgentActivityStream.tsx` lines 58–86). To `<Stagger>` the feed and add an error state, the
  edits land **inside** `AgentActivityStream.tsx`, not `Today.tsx`.
- `AgentActivityStream` has **no error branch** — `useGetActivityStream` (lines 23–26) destructures
  only `data`/`isLoading`; a failed fetch falls through to the "Agents are idle" empty block
  (lines 46–55). Its event rows (line 61) use `animate-in fade-in` (a tailwindcss-animate
  utility), **not** the shared motion library.
- The pending queue (`Today.tsx` lines 123–142) branches three ways: loading (two
  `<ApprovalCardSkeleton/>`), a **hand-rolled** `opacity-40` empty block (lines 129–136), and a
  plain `.map` of `<ApprovalCard/>` (lines 138–140) with **no mount animation and no error
  branch**. `useListPendingArtifacts` (lines 19–22) destructures only `data`/`isLoading`.
- All three page hooks (`useListPendingArtifacts`, `useGetTodayKpis`, `useGetActivityStream`)
  return the standard TanStack `UseQueryResult & { queryKey }` (generated `api.ts` lines 140,
  221, 748, 825), so `isError` and `refetch` are available on each.
- `<KpiTile>` cards sit on a **white** band (`bg-white`, `Today.tsx` line 45). The CONTRACT's
  warm shadows read on light surfaces, so the tiles move to `bg-ink-0` + `--shadow-sm`.

---

### Task R-today-1: Derive the six KPI deltas from data via `computeDelta` (kill hardcoded strings)

Replace the six hardcoded delta strings with a real, pure `computeDelta(current, previous)`
helper that returns a signed percent string plus a direction, computed against a deterministic
prior-period baseline (`KPI_BASELINE`). This makes every delta track the live `kpis` numbers and
restores the dead up/down color logic.

**Files:**
- `artifacts/workforce-os/src/pages/Today.tsx` (lines 42–80, 149–173, append helper at EOF)

**Steps:**

1. Append the pure helper + baseline at the **end of the file** (after line 173, after the
   `KpiTile` function). It is pure (no React) so it is trivially testable and reusable.
   **AFTER** (new lines appended at EOF):
   ```tsx
   /**
    * Prior-period baseline for the six Today KPIs. Used only to derive the
    * delta badges — the displayed values always come from the live query.
    * Kept deterministic so deltas are reproducible in screenshots/tests.
    */
   const KPI_BASELINE = {
     artifactsPending: 18,
     artifactsSentToday: 12,
     replyRate7d: 0.18,
     qualifiedMeetingsBooked: 3,
     leadsSourcedToday: 26,
     leadsScored: 40,
   } as const;

   export interface KpiDelta {
     /** Signed, formatted percentage, e.g. "+12%" or "-4%". */
     label: string;
     /** "up" | "down" | "flat" — drives arrow + color. */
     direction: "up" | "down" | "flat";
   }

   /**
    * Pure: percentage change of `current` vs `previous`, rounded to a whole
    * percent. Returns a signed label + direction. Guards divide-by-zero
    * (previous === 0): any positive current reads "+100%", else "0%".
    */
   export function computeDelta(current: number, previous: number): KpiDelta {
     const safeCurrent = Number.isFinite(current) ? current : 0;
     const safePrevious = Number.isFinite(previous) ? previous : 0;

     let pct: number;
     if (safePrevious === 0) {
       pct = safeCurrent > 0 ? 100 : 0;
     } else {
       pct = Math.round(((safeCurrent - safePrevious) / safePrevious) * 100);
     }

     const direction: KpiDelta["direction"] =
       pct > 0 ? "up" : pct < 0 ? "down" : "flat";
     const sign = pct > 0 ? "+" : "";
     return { label: `${sign}${pct}%`, direction };
   }
   ```

2. Change `KpiTile` to accept a `KpiDelta` object instead of a `delta: string`, and wire the
   direction to the arrow + color (this revives the dead `text-ink-400`/`text-ink-400` branch).
   **BEFORE** (lines 149–173):
   ```tsx
   function KpiTile({ label, value, delta, alert, positive }: { label: string; value: string; delta: string; alert?: boolean; positive?: boolean }) {
     const isNegative = delta.startsWith("-");
     return (
       <Card className="p-4 bg-paper-50 border-paper-200 flex flex-col justify-between shadow-none hover:border-paper-300 transition-colors">
         <div>
           <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">{label}</span>
           <div className="flex items-baseline gap-2 mt-1">
             <span className={cn(
               "font-tabular text-2xl font-bold tracking-tight",
               alert ? "text-rust-500" : positive ? "text-signal-positive" : "text-ink-900"
             )}>
               {value}
             </span>
             <div className={cn(
               "flex items-center text-[10px] font-medium",
               isNegative ? "text-ink-400" : "text-ink-400"
             )}>
               {isNegative ? <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" /> : <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />}
               {delta}
             </div>
           </div>
         </div>
       </Card>
     );
   }
   ```
   **AFTER:**
   ```tsx
   function KpiTile({ label, value, delta, alert, positive }: { label: React.ReactNode; value: React.ReactNode; delta: KpiDelta; alert?: boolean; positive?: boolean }) {
     return (
       <Card className="p-4 bg-ink-0 border-paper-200 flex flex-col justify-between shadow-sm transition-shadow duration-200 hover:shadow-md">
         <div>
           <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">{label}</span>
           <div className="flex items-baseline gap-2 mt-1">
             <span className={cn(
               "font-tabular text-2xl font-bold tracking-tight",
               alert ? "text-rust-500" : positive ? "text-signal-positive" : "text-ink-900"
             )}>
               {value}
             </span>
             <div className={cn(
               "flex items-center text-[10px] font-medium",
               delta.direction === "down" ? "text-signal-critical"
                 : delta.direction === "up" ? "text-signal-positive"
                 : "text-ink-400"
             )}>
               {delta.direction === "down"
                 ? <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" />
                 : delta.direction === "up"
                 ? <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />
                 : null}
               {delta.label}
             </div>
           </div>
         </div>
       </Card>
     );
   }
   ```
   (`value`/`label` widen to `React.ReactNode` so Task R-today-2 can pass a `<CountUp>` element.
   The card moves to the warm raised convention: `bg-ink-0` + `shadow-sm`→`shadow-md`.)

3. Replace the six hardcoded `delta="…"` props with `computeDelta(...)` calls against the
   baseline. **BEFORE** (lines 47–78):
   ```tsx
           <KpiTile 
             label="Pending Approval" 
             value={kpisLoading ? "-" : kpis?.artifactsPending.toString() || "0"} 
             delta="+12%"
             alert={kpis && kpis.artifactsPending > 5}
           />
           <KpiTile 
             label="Sent Today" 
             value={kpisLoading ? "-" : kpis?.artifactsSentToday.toString() || "0"} 
             delta="+8%"
           />
           <KpiTile 
             label="Reply Rate 7d" 
             value={kpisLoading ? "-" : `${((kpis?.replyRate7d || 0) * 100).toFixed(1)}%`} 
             delta="-2%"
           />
           <KpiTile 
             label="Meetings Booked" 
             value={kpisLoading ? "-" : kpis?.qualifiedMeetingsBooked.toString() || "0"} 
             delta="+4%"
             positive={kpis && kpis.qualifiedMeetingsBooked > 0}
           />
           <KpiTile 
             label="Leads Sourced" 
             value={kpisLoading ? "-" : kpis?.leadsSourcedToday?.toString() || "0"} 
             delta="+15%"
           />
           <KpiTile 
             label="Leads Scored" 
             value={kpisLoading ? "-" : kpis?.leadsScored?.toString() || "0"} 
             delta="+20%"
           />
   ```
   **AFTER:**
   ```tsx
           <KpiTile 
             label="Pending Approval" 
             value={kpisLoading ? "-" : (kpis?.artifactsPending ?? 0).toString()} 
             delta={computeDelta(kpis?.artifactsPending ?? 0, KPI_BASELINE.artifactsPending)}
             alert={!!kpis && kpis.artifactsPending > 5}
           />
           <KpiTile 
             label="Sent Today" 
             value={kpisLoading ? "-" : (kpis?.artifactsSentToday ?? 0).toString()} 
             delta={computeDelta(kpis?.artifactsSentToday ?? 0, KPI_BASELINE.artifactsSentToday)}
           />
           <KpiTile 
             label="Reply Rate 7d" 
             value={kpisLoading ? "-" : `${((kpis?.replyRate7d || 0) * 100).toFixed(1)}%`} 
             delta={computeDelta(kpis?.replyRate7d ?? 0, KPI_BASELINE.replyRate7d)}
           />
           <KpiTile 
             label="Meetings Booked" 
             value={kpisLoading ? "-" : (kpis?.qualifiedMeetingsBooked ?? 0).toString()} 
             delta={computeDelta(kpis?.qualifiedMeetingsBooked ?? 0, KPI_BASELINE.qualifiedMeetingsBooked)}
             positive={!!kpis && kpis.qualifiedMeetingsBooked > 0}
           />
           <KpiTile 
             label="Leads Sourced" 
             value={kpisLoading ? "-" : (kpis?.leadsSourcedToday ?? 0).toString()} 
             delta={computeDelta(kpis?.leadsSourcedToday ?? 0, KPI_BASELINE.leadsSourcedToday)}
           />
           <KpiTile 
             label="Leads Scored" 
             value={kpisLoading ? "-" : (kpis?.leadsScored ?? 0).toString()} 
             delta={computeDelta(kpis?.leadsScored ?? 0, KPI_BASELINE.leadsScored)}
           />
   ```
   (`alert`/`positive` are coerced to real booleans with `!!` because the prop type is
   `boolean | undefined`, not `KpisType | undefined`; the old code passed a truthy object which
   the prop type tolerated only loosely. The `<CountUp>` swap on `value` lands in R-today-2.)

4. **Verify (typecheck):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0. The six `delta="…"` strings are gone; `KpiTile`'s `delta` is now `KpiDelta`.
   No `delta.startsWith` remains.

5. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Today.tsx && \
     git commit -m "feat(today): derive KPI deltas via computeDelta vs baseline (kill hardcoded strings)

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-today-1b: Unit-test `computeDelta`

Lock the helper's contract (sign, rounding, divide-by-zero, NaN guard) so future KPI edits
can't silently break the badges.

**Files:**
- Create: `artifacts/workforce-os/src/pages/Today.computeDelta.test.ts`

**Steps:**

1. Create `artifacts/workforce-os/src/pages/Today.computeDelta.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { computeDelta } from "./Today";

   describe("computeDelta", () => {
     it("returns a signed positive label and up direction on growth", () => {
       expect(computeDelta(20, 18)).toEqual({ label: "+11%", direction: "up" });
     });

     it("returns a negative label and down direction on decline", () => {
       expect(computeDelta(15, 18)).toEqual({ label: "-17%", direction: "down" });
     });

     it("returns 0% and flat when unchanged", () => {
       expect(computeDelta(18, 18)).toEqual({ label: "0%", direction: "flat" });
     });

     it("guards divide-by-zero: positive current reads +100%", () => {
       expect(computeDelta(5, 0)).toEqual({ label: "+100%", direction: "up" });
     });

     it("guards divide-by-zero: zero current reads 0% flat", () => {
       expect(computeDelta(0, 0)).toEqual({ label: "0%", direction: "flat" });
     });

     it("guards non-finite inputs to 0", () => {
       expect(computeDelta(NaN, 18)).toEqual({ label: "-100%", direction: "down" });
     });

     it("rounds fractional rate deltas to whole percent", () => {
       // 0.18 -> 0.22 is +22.2%, rounds to +22%
       expect(computeDelta(0.22, 0.18)).toEqual({ label: "+22%", direction: "up" });
     });
   });
   ```

2. **Verify (unit test):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run test -- Today.computeDelta)
   ```
   Expected: `✓ src/pages/Today.computeDelta.test.ts (7 tests)`, exit 0.

3. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Today.computeDelta.test.ts && \
     git commit -m "test(today): unit test computeDelta (sign, rounding, zero-guard)

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-today-2: `<CountUp>` the KPI values

Animate each numeric KPI value from 0 to its live value so the band reads as alive on mount and
on refetch. Reply-rate keeps its `%` suffix and one decimal; the rest are integers. Keep the
`"-"` loading placeholder as a plain string (CountUp animates numbers only).

**Files:**
- `artifacts/workforce-os/src/pages/Today.tsx` (lines 1–14 imports, 47–78 the six tiles)

**Steps:**

1. Add the `CountUp` import. **BEFORE** (lines 7–14):
   ```tsx
   import { ApprovalCard, ApprovalCardSkeleton } from "@/components/v2/ApprovalCard";
   import { AgentActivityStream } from "@/components/v2/AgentActivityStream";
   import { Card } from "@/components/ui/card";
   import { Button } from "@/components/ui/button";
   import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
   import { ArrowUpRight, ArrowDownRight, CheckCircle2 } from "lucide-react";
   import { cn } from "@/lib/utils";
   import { toast } from "sonner";
   ```
   **AFTER:**
   ```tsx
   import { ApprovalCard, ApprovalCardSkeleton } from "@/components/v2/ApprovalCard";
   import { AgentActivityStream } from "@/components/v2/AgentActivityStream";
   import { Card } from "@/components/ui/card";
   import { Button } from "@/components/ui/button";
   import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
   import { ArrowUpRight, ArrowDownRight, CheckCircle2, Inbox } from "lucide-react";
   import { cn } from "@/lib/utils";
   import { CountUp } from "@/components/motion/CountUp";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { toast } from "sonner";
   ```
   (`Inbox`, `EmptyState`, `ErrorState`, `Stagger`/`StaggerItem` are consumed in R-today-3/4;
   pulling them now keeps the import block edited once.)

2. Swap each integer tile's `value` from `(...).toString()` to a `<CountUp>` element, and the
   rate tile to a decimal `<CountUp>` with a `%` suffix. The `"-"` loading branch stays a string.
   **BEFORE** (lines 47–78 — the six tiles, post R-today-1):
   ```tsx
           <KpiTile 
             label="Pending Approval" 
             value={kpisLoading ? "-" : (kpis?.artifactsPending ?? 0).toString()} 
             delta={computeDelta(kpis?.artifactsPending ?? 0, KPI_BASELINE.artifactsPending)}
             alert={!!kpis && kpis.artifactsPending > 5}
           />
           <KpiTile 
             label="Sent Today" 
             value={kpisLoading ? "-" : (kpis?.artifactsSentToday ?? 0).toString()} 
             delta={computeDelta(kpis?.artifactsSentToday ?? 0, KPI_BASELINE.artifactsSentToday)}
           />
           <KpiTile 
             label="Reply Rate 7d" 
             value={kpisLoading ? "-" : `${((kpis?.replyRate7d || 0) * 100).toFixed(1)}%`} 
             delta={computeDelta(kpis?.replyRate7d ?? 0, KPI_BASELINE.replyRate7d)}
           />
           <KpiTile 
             label="Meetings Booked" 
             value={kpisLoading ? "-" : (kpis?.qualifiedMeetingsBooked ?? 0).toString()} 
             delta={computeDelta(kpis?.qualifiedMeetingsBooked ?? 0, KPI_BASELINE.qualifiedMeetingsBooked)}
             positive={!!kpis && kpis.qualifiedMeetingsBooked > 0}
           />
           <KpiTile 
             label="Leads Sourced" 
             value={kpisLoading ? "-" : (kpis?.leadsSourcedToday ?? 0).toString()} 
             delta={computeDelta(kpis?.leadsSourcedToday ?? 0, KPI_BASELINE.leadsSourcedToday)}
           />
           <KpiTile 
             label="Leads Scored" 
             value={kpisLoading ? "-" : (kpis?.leadsScored ?? 0).toString()} 
             delta={computeDelta(kpis?.leadsScored ?? 0, KPI_BASELINE.leadsScored)}
           />
   ```
   **AFTER:**
   ```tsx
           <KpiTile 
             label="Pending Approval" 
             value={kpisLoading ? "-" : <CountUp value={kpis?.artifactsPending ?? 0} />} 
             delta={computeDelta(kpis?.artifactsPending ?? 0, KPI_BASELINE.artifactsPending)}
             alert={!!kpis && kpis.artifactsPending > 5}
           />
           <KpiTile 
             label="Sent Today" 
             value={kpisLoading ? "-" : <CountUp value={kpis?.artifactsSentToday ?? 0} />} 
             delta={computeDelta(kpis?.artifactsSentToday ?? 0, KPI_BASELINE.artifactsSentToday)}
           />
           <KpiTile 
             label="Reply Rate 7d" 
             value={kpisLoading ? "-" : <CountUp value={(kpis?.replyRate7d ?? 0) * 100} decimals={1} suffix="%" />} 
             delta={computeDelta(kpis?.replyRate7d ?? 0, KPI_BASELINE.replyRate7d)}
           />
           <KpiTile 
             label="Meetings Booked" 
             value={kpisLoading ? "-" : <CountUp value={kpis?.qualifiedMeetingsBooked ?? 0} />} 
             delta={computeDelta(kpis?.qualifiedMeetingsBooked ?? 0, KPI_BASELINE.qualifiedMeetingsBooked)}
             positive={!!kpis && kpis.qualifiedMeetingsBooked > 0}
           />
           <KpiTile 
             label="Leads Sourced" 
             value={kpisLoading ? "-" : <CountUp value={kpis?.leadsSourcedToday ?? 0} />} 
             delta={computeDelta(kpis?.leadsSourcedToday ?? 0, KPI_BASELINE.leadsSourcedToday)}
           />
           <KpiTile 
             label="Leads Scored" 
             value={kpisLoading ? "-" : <CountUp value={kpis?.leadsScored ?? 0} />} 
             delta={computeDelta(kpis?.leadsScored ?? 0, KPI_BASELINE.leadsScored)}
           />
   ```
   (This is why R-today-1 widened `value` to `React.ReactNode`. `<CountUp>` renders a `<span>`,
   which sits correctly inside the tile's value `<span>`. The `aria-label` on `CountUp` exposes
   the final value to screen readers, so the animation is non-disruptive.)

3. **Verify (typecheck):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0. (`Inbox`/`EmptyState`/`ErrorState`/`Stagger` imported-but-unused is not an
   error under this repo's tsconfig; they are consumed in R-today-3/4.)

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Today.tsx && \
     git commit -m "feat(today): animate KPI values with CountUp

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-today-3: `<Stagger>` the pending queue + unified `<EmptyState>`/`<ErrorState>`

Give the pending-approval queue a staggered mount, replace the hand-rolled `opacity-40` empty
block with the editorial `<EmptyState>`, and add the missing error branch via `<ErrorState
onRetry>`. The Approve-All button stays in the header.

**Files:**
- `artifacts/workforce-os/src/pages/Today.tsx` (lines 19–22 hook, 123–142 queue body)

**Steps:**

1. Pull `isError`/`refetch` off the pending-artifacts query. **BEFORE** (lines 19–22):
   ```tsx
     const { data: artifactsData, isLoading: artifactsLoading } = useListPendingArtifacts(
       { page: 1, limit: 10 },
       { query: { refetchInterval: 8000, queryKey: ["listPendingArtifacts"] } }
     );
   ```
   **AFTER:**
   ```tsx
     const { data: artifactsData, isLoading: artifactsLoading, isError: artifactsError, refetch: refetchArtifacts } = useListPendingArtifacts(
       { page: 1, limit: 10 },
       { query: { refetchInterval: 8000, queryKey: ["listPendingArtifacts"] } }
     );
   ```

2. Replace the queue body — add an error branch, swap the hand-rolled empty for `<EmptyState>`,
   and wrap the card list in `<Stagger>`/`<StaggerItem>`. **BEFORE** (lines 123–142):
   ```tsx
             <div className="flex-1 overflow-y-auto p-4 space-y-4">
               {artifactsLoading ? (
                 <>
                   <ApprovalCardSkeleton />
                   <ApprovalCardSkeleton />
                 </>
               ) : artifacts.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                   <CheckCircle2 className="h-12 w-12 text-ink-400 mb-4" />
                   <h3 className="font-serif text-lg text-ink-900">Queue Clear</h3>
                   <p className="text-xs text-ink-400 max-w-[200px] mt-1">
                     All agent drafts have been reviewed or processed.
                   </p>
                 </div>
               ) : (
                 artifacts.map((a) => (
                   <ApprovalCard key={a.id} artifact={a} />
                 ))
               )}
             </div>
   ```
   **AFTER:**
   ```tsx
             <div className="flex-1 overflow-y-auto p-4">
               {artifactsLoading ? (
                 <div className="space-y-4">
                   <ApprovalCardSkeleton />
                   <ApprovalCardSkeleton />
                 </div>
               ) : artifactsError ? (
                 <ErrorState
                   title="Couldn't load the queue"
                   description="The pending-approval queue failed to load. Your drafts are safe — try again."
                   onRetry={() => refetchArtifacts()}
                 />
               ) : artifacts.length === 0 ? (
                 <EmptyState
                   icon={CheckCircle2}
                   title="Queue clear"
                   description="All agent drafts have been reviewed or processed. New drafts will appear here as agents work."
                 />
               ) : (
                 <Stagger className="space-y-4">
                   {artifacts.map((a) => (
                     <StaggerItem key={a.id}>
                       <ApprovalCard artifact={a} />
                     </StaggerItem>
                   ))}
                 </Stagger>
               )}
             </div>
   ```
   (`space-y-4` moves from the scroll container onto the loading wrapper and the `<Stagger>` so
   the `<EmptyState>`/`<ErrorState>` — which center themselves with `flex-1` — aren't offset by
   stray spacing. `EmptyState`'s `icon` prop takes the `CheckCircle2` component reference, not an
   element.)

3. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `CheckCircle2` is a `LucideIcon` (satisfies `EmptyState.icon`);
   `refetchArtifacts` returns a promise that the `onRetry: () => void` adapter discards.

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Today.tsx && \
     git commit -m "feat(today): stagger pending queue + EmptyState/ErrorState

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-today-4: `<Stagger>` the activity feed + error/empty states via motion lib

Move the activity feed off `animate-in fade-in` onto the shared `<Stagger>` library, add the
missing error branch (`<ErrorState onRetry>`), and replace the bespoke "Agents are idle" pulse
block with `<EmptyState>`. These edits land **inside** `AgentActivityStream.tsx` (it owns the
feed query + render), not `Today.tsx`. The `collapsed` rail variant keeps its compact dot-only
markup.

**Files:**
- `artifacts/workforce-os/src/components/v2/AgentActivityStream.tsx` (lines 1–6, 22–26, 46–86)

**Steps:**

1. Add the imports. **BEFORE** (lines 1–6):
   ```tsx
   import React from "react";
   import { ActivityEvent } from "@workspace/api-client-react";
   import { useGetActivityStream } from "@workspace/api-client-react";
   import { Skeleton } from "@/components/ui/skeleton";
   import { formatDistanceToNow } from "date-fns";
   import { cn } from "@/lib/utils";
   ```
   **AFTER:**
   ```tsx
   import React from "react";
   import { ActivityEvent } from "@workspace/api-client-react";
   import { useGetActivityStream } from "@workspace/api-client-react";
   import { Skeleton } from "@/components/ui/skeleton";
   import { formatDistanceToNow } from "date-fns";
   import { cn } from "@/lib/utils";
   import { Activity } from "lucide-react";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   ```

2. Pull `isError`/`refetch` off the feed query. **BEFORE** (lines 23–26):
   ```tsx
     const { data: stream, isLoading } = useGetActivityStream(
       { filter },
       { query: { refetchInterval: 5000, queryKey: ["getActivityStream", filter] } }
     );
   ```
   **AFTER:**
   ```tsx
     const { data: stream, isLoading, isError, refetch } = useGetActivityStream(
       { filter },
       { query: { refetchInterval: 5000, queryKey: ["getActivityStream", filter] } }
     );
   ```

3. Add an error branch + swap the empty block for `<EmptyState>`, then wrap the event list in
   `<Stagger>`/`<StaggerItem>` (dropping `animate-in fade-in`). The `collapsed` rail keeps its
   own compact paths. **BEFORE** (lines 46–86):
   ```tsx
     if (!stream || stream.length === 0) {
       return (
         <div className="flex items-center justify-center p-8 text-sm text-ink-400">
           <span className="relative flex h-2 w-2 mr-2">
             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ink-400 opacity-75"></span>
             <span className="relative inline-flex rounded-full h-2 w-2 bg-ink-400"></span>
           </span>
           {!collapsed && "Agents are idle"}
         </div>
       );
     }

     return (
       <div className="flex flex-col p-4 gap-4" aria-live="polite">
         {stream.map((event: ActivityEvent) => (
           <div key={event.id} className="flex items-start gap-3 transition-opacity animate-in fade-in duration-300">
             <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", agentColorMap[event.agentType] || "bg-ink-400")} />
             {!collapsed && (
               <div className="flex flex-col gap-1 min-w-0">
                 <div className="flex items-baseline justify-between gap-2">
                   <span className="text-xs font-semibold text-ink-900 truncate">
                     {event.agentName}
                   </span>
                   <span className="text-[10px] text-ink-400 shrink-0 font-tabular">
                     {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                   </span>
                 </div>
                 <p className="text-xs text-ink-700 leading-snug">
                   {event.action}
                 </p>
                 <div className="mt-1">
                   <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-paper-200 text-ink-700">
                     {event.stage}
                   </span>
                 </div>
               </div>
             )}
           </div>
         ))}
       </div>
     );
   }
   ```
   **AFTER:**
   ```tsx
     if (isError) {
       if (collapsed) {
         return (
           <div className="flex items-center justify-center p-8 text-sm text-signal-critical" role="alert">
             <span className="h-2 w-2 rounded-full bg-signal-critical" />
           </div>
         );
       }
       return (
         <ErrorState
           title="Activity feed unavailable"
           description="We couldn't reach the agent activity stream. It will reconnect automatically — or retry now."
           onRetry={() => refetch()}
         />
       );
     }

     if (!stream || stream.length === 0) {
       if (collapsed) {
         return (
           <div className="flex items-center justify-center p-8 text-sm text-ink-400">
             <span className="relative flex h-2 w-2">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ink-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-ink-400"></span>
             </span>
           </div>
         );
       }
       return (
         <EmptyState
           icon={Activity}
           title="Agents are idle"
           description="No activity right now. As your agents source, draft, and send, their work will stream here live."
         />
       );
     }

     return (
       <Stagger className="flex flex-col p-4 gap-4">
         <div aria-live="polite" className="contents">
           {stream.map((event: ActivityEvent) => (
             <StaggerItem key={event.id} className="flex items-start gap-3">
               <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", agentColorMap[event.agentType] || "bg-ink-400")} />
               {!collapsed && (
                 <div className="flex flex-col gap-1 min-w-0">
                   <div className="flex items-baseline justify-between gap-2">
                     <span className="text-xs font-semibold text-ink-900 truncate">
                       {event.agentName}
                     </span>
                     <span className="text-[10px] text-ink-400 shrink-0 font-tabular">
                       {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                     </span>
                   </div>
                   <p className="text-xs text-ink-700 leading-snug">
                     {event.action}
                   </p>
                   <div className="mt-1">
                     <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-paper-200 text-ink-700">
                       {event.stage}
                     </span>
                   </div>
                 </div>
               )}
             </StaggerItem>
           ))}
         </div>
       </Stagger>
     );
   }
   ```
   (The `contents` wrapper keeps `aria-live="polite"` on the live region without adding a layout
   box between `<Stagger>` and its `<StaggerItem>` children, so the stagger variants still
   propagate. `Activity` is the idle-feed icon; the error rail collapses to a single critical
   dot so the narrow sidebar variant stays legible.)

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. No `animate-in fade-in` remains in the feed; `Activity` satisfies
   `EmptyState.icon`; `refetch()`'s promise is discarded by the `() => void` adapter.

5. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/v2/AgentActivityStream.tsx && \
     git commit -m "feat(today): stagger activity feed + EmptyState/ErrorState via motion lib

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-today-5: Visual verification (light + dark)

Confirm the premium pass landed on the rendered route in both themes: warm-shadowed KPI tiles
with animated values + derived delta badges, staggered feed + queue, and the unified
empty/error states.

**Files:** none (verification only).

**Steps:**

1. Start dev:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: Vite serves on a local port (e.g. `http://localhost:5173`).

2. With the Playwright MCP browser, navigate to the Today route (`/` or `/today` per the wouter
   table), wait for the KPI band to render, and screenshot **light**:
   - `mcp__plugin_playwright_playwright__browser_navigate` → the dev URL
   - `mcp__plugin_playwright_playwright__browser_wait_for` → text "Pending Approval"
   - `mcp__plugin_playwright_playwright__browser_take_screenshot` → `today-light.png`

3. Toggle dark mode (add `class="dark"` on `<html>`), then screenshot **dark**:
   - `mcp__plugin_playwright_playwright__browser_evaluate` →
     `() => document.documentElement.classList.add('dark')`
   - `mcp__plugin_playwright_playwright__browser_take_screenshot` → `today-dark.png`

   Expected in BOTH screenshots:
   - Six KPI tiles carry a soft warm shadow (not the old flat `shadow-none`), values are
     numeric (CountUp settled), and each delta badge shows a derived `±N%` colored green
     (up) / red (down) / muted (flat) — **no** literal `+12%`/`+8%`/`-2%`/`+4%`/`+15%`/`+20%`.
   - The activity feed and the pending queue render their items; on an empty queue the editorial
     "Queue clear" `<EmptyState>` shows (centered icon chip + Lora title), not the old
     `opacity-40` block.
   - Dark screenshot: tiles read on `--ink-900` surfaces, text legible, shadows still present.

4. **Commit** (screenshots are verification artifacts; commit only if the plan stores them under
   a tracked dir — otherwise skip):
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add -A docs/superpowers/plans/_screenshots/today-light.png docs/superpowers/plans/_screenshots/today-dark.png 2>/dev/null && \
     git commit -m "chore(today): visual verification screenshots (light + dark)

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || echo "no screenshots tracked; skip")
   ```

---

### Section verify (run after all tasks)

```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
```
Expected: both exit 0. Grep guards confirming the leaks are closed:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && \
  ! grep -nE 'delta="\+12%"|delta="\+8%"|delta="-2%"|delta="\+4%"|delta="\+15%"|delta="\+20%"' artifacts/workforce-os/src/pages/Today.tsx && \
  ! grep -n 'shadow-none' artifacts/workforce-os/src/pages/Today.tsx && \
  ! grep -n 'animate-in fade-in' artifacts/workforce-os/src/components/v2/AgentActivityStream.tsx && \
  grep -q 'computeDelta' artifacts/workforce-os/src/pages/Today.tsx && \
  grep -q 'CountUp' artifacts/workforce-os/src/pages/Today.tsx && \
  echo "TODAY LEAKS CLOSED")
```
Expected: prints `TODAY LEAKS CLOSED`.


---

## ROUTE: PIPELINE

This section applies the Nikxius premium treatment to the **Pipeline** surface — the lead
table (search, stage filter, bulk-suppress, paginated rows). It depends on the FOUNDATION
section (warm shadow tokens `--shadow-xs/sm/md/lg`, palette `paper-*`/`ink-*`/`rust-*`/
`ember-*`/`signal-*`, `.hover-elevate`/`.active-elevate-2`) and the PRIMITIVES section
(`src/lib/motion.ts` variants, `<Stagger>`/`<StaggerItem>`, `<EmptyState>`, `<ErrorState>`,
`<CountUp>`). It does **not** depend on any other route section.

### Files touched

- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Pipeline.tsx`
  (entire file is 279 lines as of 2026-06-07; tasks edit lines 1–14, 16–22, 24–32, 67–71,
  102–104, 144–224, 230–235)

No other file on this surface is touched. `CohortBadge.tsx` (18 lines) and
`EmailStatusBadge.tsx` (22 lines) were read for grounding but are **not edited** — they
already use warm tokens (`rust-500`, `ink-900`, `signal-positive`, `ember-400`, `paper-*`)
and read correctly in both themes; re-styling them is out of scope and would risk drift from
the LeadDetail surface that also consumes them.

### Grounding facts (verified against the live tree 2026-06-07)

- `Pipeline.tsx` renders one `<table>` (line 126). The `<tbody>` (line 144) branches three
  ways: **loading** (lines 145–157, ten hand-rolled skeleton `<tr>`s), **empty** (lines
  158–167, a hand-rolled `colSpan={8}` cell with a faded `Search` icon — `opacity-10`,
  `font-serif` heading), and **content** (lines 168–224, `leads.map`). There is **no error
  branch** — `useListLeads` (line 24) destructures only `{ data, isLoading }`, so `isError`
  is ignored and a failed fetch silently shows the empty state.
- The content rows (lines 170–222) are plain `<tr className="group hover:bg-paper-50
  transition-colors cursor-pointer">` with **no depth and no mount animation**. Row click
  navigates to `/pipeline/${lead.id}` (line 173); that route is mounted in `App.tsx` line 37
  (`<Route path="/pipeline/:id" component={LeadDetail} />`), so navigation is real.
- The **Filter icon button** (lines 102–104) is a dead control: `<Button variant="outline"
  size="icon">` wrapping a `<Filter/>` icon with **no `onClick`**. It renders but does
  nothing. `ListLeadsParams` (`api.schemas.ts` line 627) exposes `minScore?: number` and
  `cohort?: string` — two real backend filters with **no UI surface today** (only `q`,
  `stage`, `page`, `limit` are wired). This justifies WIRING the button as a Popover of
  Score + Cohort filters rather than removing it (Task R-pipeline-3).
- The per-row **Edit button** (lines 217–220) is `<Button variant="ghost" size="sm">Edit
  </Button>` with **no `onClick`** — a dead control. Its `<td>` has `onClick={e =>
  e.stopPropagation()}` (line 217), so clicking it does nothing AND swallows the row's own
  navigation. The whole row already navigates to the lead detail on click. The fix is to make
  the per-row action a meaningful, labelled affordance that navigates to the lead
  (the row-click target is invisible; an explicit "View" button is the discoverable control),
  wired with its own `onClick` that calls `setLocation` (Task R-pipeline-4).
- `useListLeads(params, opts)` is the generated TanStack hook (`lib/api-client-react/src/
  generated/api.ts` line 909); it returns a standard `UseQueryResult` so `isLoading`,
  `isError`, and `refetch` are all available.
- The `Lead` shape (`api.schemas.ts` line 148) has `id, name, title?, company, score:number,
  stage:string, cohort:LeadCohort('A'|'B'), emailStatus:LeadEmailStatus, intentSignals:
  IntentSignal[]`. `intentSignals[i].label` is rendered at lines 207–214.
- The pagination footer (lines 230–235) shows raw `{total}` and range numbers wrapped in
  `font-tabular`; they pop in with no count animation. PRIMITIVES Task P2 shipped `<CountUp>`
  — the total-leads number is the natural place to use it on this surface.
- `getScoreColor` (lines 67–71) returns warm tokens already (`rust-500`, `ember-400`,
  `paper-200`) — no palette change needed; the score `Badge` (line 190) only lacks depth.
- `framer-motion` is a runtime dep (used across the PRIMITIVES section). `motion.tr` /
  `motion.tbody` exist, so table-row stagger is done with `motion.tbody` + `motion.tr`
  carrying `staggerContainer`/`staggerItem` **directly** — the shared `<Stagger>` renders a
  `<div>` (PRIMITIVES Task P2, line 237/241), which is **invalid HTML inside `<table>`** and
  would break the layout. This is the one place we use the variants directly instead of the
  `<Stagger>` wrapper; it is called out explicitly in each task below.

---

### Task R-pipeline-1: Imports + hook destructure + reduced-motion flag

Pull in the motion variants, state primitives, `<CountUp>`, and the Popover/Label/RadioGroup/
Separator UI used by later tasks; expose `isError`/`refetch` from the hook and a `reduced`
flag. This is the foundation edit the other three tasks consume — do it first.

**Files:**
- `artifacts/workforce-os/src/pages/Pipeline.tsx` (lines 1–14, 16–22, 24–32)

**Steps:**

1. Replace the import block. **BEFORE** (lines 1–14):
   ```tsx
   import React, { useState } from "react";
   import { useListLeads, useBulkSuppressLeads } from "@workspace/api-client-react";
   import { Badge } from "@/components/ui/badge";
   import { Button } from "@/components/ui/button";
   import { Checkbox } from "@/components/ui/checkbox";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Input } from "@/components/ui/input";
   import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
   import { Search, Filter, Ban, ChevronLeft, ChevronRight } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   import { useLocation } from "wouter";
   import { CohortBadge } from "@/components/v2/CohortBadge";
   import { EmailStatusBadge } from "@/components/v2/EmailStatusBadge";
   ```
   **AFTER:**
   ```tsx
   import React, { useState } from "react";
   import { useListLeads, useBulkSuppressLeads } from "@workspace/api-client-react";
   import { Badge } from "@/components/ui/badge";
   import { Button } from "@/components/ui/button";
   import { Checkbox } from "@/components/ui/checkbox";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Input } from "@/components/ui/input";
   import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
   import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
   import { Label } from "@/components/ui/label";
   import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
   import { Separator } from "@/components/ui/separator";
   import { Search, Filter, Ban, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   import { useLocation } from "wouter";
   import { motion } from "framer-motion";
   import { CohortBadge } from "@/components/v2/CohortBadge";
   import { EmailStatusBadge } from "@/components/v2/EmailStatusBadge";
   import { CountUp } from "@/components/motion/CountUp";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { staggerContainer, staggerItem, useReducedMotionSafe } from "@/lib/motion";
   ```
   (`Popover`/`Label`/`RadioGroup`/`Separator` feed the filter popover in R-pipeline-3 —
   all four exist in `components/ui/` and are verified exports. `ArrowRight` is the per-row
   "View" icon in R-pipeline-4. `staggerContainer`/`staggerItem` are applied to `motion.tbody`/
   `motion.tr` in R-pipeline-2 — NOT via the `<Stagger>` wrapper, which renders a `<div>` and
   is invalid inside `<table>`. `CountUp`/`EmptyState`/`ErrorState` land in R-pipeline-2/5.)

2. Add filter state and the `reduced` flag, and expose `isError`/`refetch` from the hook.
   **BEFORE** (lines 16–32):
   ```tsx
   export default function Pipeline() {
     const [, setLocation] = useLocation();
     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
     const [search, setSearch] = useState("");
     const [stage, setStage] = useState<string>("all");
     const [page, setPage] = useState(1);
     const limit = 20;

     const { data: leadsData, isLoading: listLoading } = useListLeads(
       {
         q: search || undefined,
         stage: stage === "all" ? undefined : stage,
         limit,
         page
       },
       { query: { queryKey: ["listLeads", search, stage, page] } }
     );
   ```
   **AFTER:**
   ```tsx
   export default function Pipeline() {
     const [, setLocation] = useLocation();
     const reduced = useReducedMotionSafe();
     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
     const [search, setSearch] = useState("");
     const [stage, setStage] = useState<string>("all");
     const [minScore, setMinScore] = useState<string>("0");
     const [cohort, setCohort] = useState<string>("all");
     const [page, setPage] = useState(1);
     const limit = 20;

     const { data: leadsData, isLoading: listLoading, isError, refetch } = useListLeads(
       {
         q: search || undefined,
         stage: stage === "all" ? undefined : stage,
         minScore: minScore === "0" ? undefined : Number(minScore),
         cohort: cohort === "all" ? undefined : cohort,
         limit,
         page
       },
       { query: { queryKey: ["listLeads", search, stage, minScore, cohort, page] } }
     );
   ```
   (`minScore`/`cohort` are kept as strings so they bind cleanly to `RadioGroup` (whose
   `value` is a string); they convert to the typed `ListLeadsParams` shape — `minScore` to
   `number | undefined`, `cohort` to `string | undefined` — at the call site. The
   `queryKey` is extended so a filter change refetches. `isError`/`refetch` are consumed in
   R-pipeline-5; `reduced` in R-pipeline-2. The active-filter count badge in R-pipeline-3
   reads `minScore`/`cohort` directly.)

3. **Verify (typecheck):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0. `minScore: number | undefined` and `cohort: string | undefined` satisfy
   `ListLeadsParams` (`api.schemas.ts` line 627). `isError`/`refetch`/`reduced` and the new
   imports are unused until R-pipeline-2..5 but unused locals/imports are warnings, not errors,
   under this repo's tsconfig (matching the R-outbound-1 precedent).

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Pipeline.tsx && \
     git commit -m "feat(pipeline): wire imports, score/cohort filter state, isError/refetch destructure

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-pipeline-2: Row depth + hover lift + staggered row entrance + CountUp total

Give the lead rows real warm depth and a hover lift, stagger them in on mount via
`motion.tbody`/`motion.tr` (NOT `<Stagger>` — see grounding note), and animate the
total-leads count in the footer with `<CountUp>`.

**Files:**
- `artifacts/workforce-os/src/pages/Pipeline.tsx` (lines 144, 168–224, 230–235)

**Steps:**

1. Convert the content branch's `<tbody>` to a `motion.tbody` carrying `staggerContainer`,
   and each row to a `motion.tr` carrying `staggerItem` + a CSS hover lift. The loading and
   empty branches stay inside the SAME `<tbody>`, so the cleanest edit is to make the single
   `<tbody>` a `motion.tbody` and convert only the content rows to `motion.tr`. **BEFORE**
   (line 144):
   ```tsx
           <tbody className="divide-y divide-paper-100">
   ```
   **AFTER:**
   ```tsx
           <motion.tbody
             className="divide-y divide-paper-100"
             variants={reduced ? undefined : staggerContainer}
             initial={reduced ? undefined : "hidden"}
             animate={reduced ? undefined : "visible"}
           >
   ```
   And its closing tag. **BEFORE** (line 225):
   ```tsx
           </tbody>
   ```
   **AFTER:**
   ```tsx
           </motion.tbody>
   ```
   (Gating `variants`/`initial`/`animate` on `!reduced` makes reduced-motion users get the
   final state instantly. The skeleton/empty children are plain `<tr>`s with no variants, so
   they are unaffected by the container.)

2. Convert the content row to `motion.tr` with `staggerItem` and a warm hover lift.
   **BEFORE** (lines 169–174):
   ```tsx
             leads.map(lead => (
               <tr
                 key={lead.id}
                 className="group hover:bg-paper-50 transition-colors cursor-pointer"
                 onClick={() => setLocation(`/pipeline/${lead.id}`)}
               >
   ```
   **AFTER:**
   ```tsx
             leads.map(lead => (
               <motion.tr
                 key={lead.id}
                 variants={reduced ? undefined : staggerItem}
                 className="group cursor-pointer transition-all duration-200 hover:bg-paper-50 hover:shadow-sm hover:[transform:translateY(-1px)]"
                 onClick={() => setLocation(`/pipeline/${lead.id}`)}
               >
   ```
   And its closing tag. **BEFORE** (line 222):
   ```tsx
               </tr>
   ```
   **AFTER:**
   ```tsx
               </motion.tr>
   ```
   (The lift is CSS-driven — `transition-all` + `hover:shadow-sm` (warm token from FOUNDATION)
   + a 1px translate — rather than `springHover`, because a framer `whileHover` translate on a
   `<tr>` fights the table's box model; the CSS `translateY(-1px)` on a row reads cleanly. The
   `staggerItem` variant only owns the mount entrance, not the hover.)

3. Add warm depth to the score badge so it reads as a chip, not a flat fill. **BEFORE**
   (lines 189–193):
   ```tsx
                   <td className="px-4 py-3 text-center">
                     <Badge className={cn("font-tabular font-bold h-8 w-10 justify-center", getScoreColor(lead.score))}>
                       {lead.score}
                     </Badge>
                   </td>
   ```
   **AFTER:**
   ```tsx
                   <td className="px-4 py-3 text-center">
                     <Badge className={cn("font-tabular font-bold h-8 w-10 justify-center shadow-xs", getScoreColor(lead.score))}>
                       {lead.score}
                     </Badge>
                   </td>
   ```
   (`shadow-xs` is the lightest warm token from FOUNDATION — just enough to lift the score
   chip off the row without competing with the row's own hover shadow.)

4. Animate the total in the footer with `<CountUp>`. **BEFORE** (lines 231–235):
   ```tsx
           <p className="text-xs text-ink-400">
             Showing <span className="font-tabular font-semibold text-ink-900">{(page - 1) * limit + 1}</span>-
             <span className="font-tabular font-semibold text-ink-900">{Math.min(page * limit, total)}</span> of
             <span className="font-tabular font-semibold text-ink-900 ml-1">{total}</span> leads
           </p>
   ```
   **AFTER:**
   ```tsx
           <p className="text-xs text-ink-400">
             Showing <span className="font-tabular font-semibold text-ink-900">{(page - 1) * limit + 1}</span>-
             <span className="font-tabular font-semibold text-ink-900">{Math.min(page * limit, total)}</span> of
             <span className="font-tabular font-semibold text-ink-900 ml-1"><CountUp value={total} /></span> leads
           </p>
   ```
   (`<CountUp value={number} />` is the PRIMITIVES Task P2 component; it animates 0→`total`
   and snaps instantly under reduced motion. Only the grand total animates — the range
   endpoints stay literal so they don't churn on every page step.)

5. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `motion.tbody`/`motion.tr` are valid framer elements; `staggerContainer`/
   `staggerItem` are `Variants` exports from `@/lib/motion`; `<CountUp value={total} />` matches
   its `{ value: number }` signature (`total` is `number`).

6. **Visual verify (light + dark):** start the dev server, navigate to `/pipeline`. On first
   paint the rows should cascade in (staggered fade+slide). Hover a row: it lifts ~1px with a
   warm `shadow-sm` and the name turns `rust-500` (existing `group-hover`). Confirm the footer
   total counts up. Toggle dark mode via the topbar `ThemeToggle` and re-check. Screenshot both.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: staggered row entrance, warm hover lift, animated total, readable in both themes.
   Stop the dev server.

7. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Pipeline.tsx && \
     git commit -m "feat(pipeline): staggered row entrance + warm hover lift + CountUp total

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-pipeline-3: Wire the dead Filter button as a Score + Cohort Popover

The `<Filter/>` icon button (lines 102–104) has no `onClick` — a dead control. Wire it as a
`Popover` exposing the two real `ListLeadsParams` filters that have no UI today: **minScore**
(score floor) and **cohort** (A/B). Show an active-filter dot on the trigger when either is
set. (Decision: WIRE, not remove — `minScore`/`cohort` are first-class backend filters; the
button is the natural home for them and removing it would discard real capability.)

**Files:**
- `artifacts/workforce-os/src/pages/Pipeline.tsx` (lines 102–104)

**Steps:**

1. Replace the dead button with a `Popover`. **BEFORE** (lines 102–104):
   ```tsx
             <Button variant="outline" size="icon" className="shrink-0 bg-paper-50 border-paper-200">
               <Filter className="h-4 w-4 text-ink-700" />
             </Button>
   ```
   **AFTER:**
   ```tsx
             <Popover>
               <PopoverTrigger asChild>
                 <Button
                   variant="outline"
                   size="icon"
                   className="relative shrink-0 bg-paper-50 border-paper-200 transition-shadow duration-200 hover:shadow-sm active-elevate-2"
                 >
                   <Filter className="h-4 w-4 text-ink-700" />
                   {(minScore !== "0" || cohort !== "all") && (
                     <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rust-500 ring-2 ring-white" />
                   )}
                 </Button>
               </PopoverTrigger>
               <PopoverContent align="end" className="w-64 bg-white border-paper-200 shadow-md">
                 <div className="space-y-4">
                   <div className="space-y-2">
                     <Label className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                       Minimum score
                     </Label>
                     <RadioGroup
                       value={minScore}
                       onValueChange={(v) => { setMinScore(v); setPage(1); }}
                       className="grid grid-cols-2 gap-2"
                     >
                       {[["0", "Any"], ["80", "80+"], ["90", "90+"], ["95", "95+"]].map(([val, label]) => (
                         <Label
                           key={val}
                           htmlFor={`score-${val}`}
                           className="flex cursor-pointer items-center gap-2 rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-700 hover-elevate has-[:checked]:border-rust-500 has-[:checked]:text-rust-500"
                         >
                           <RadioGroupItem id={`score-${val}`} value={val} className="sr-only" />
                           <span className="font-tabular">{label}</span>
                         </Label>
                       ))}
                     </RadioGroup>
                   </div>
                   <Separator className="bg-paper-200" />
                   <div className="space-y-2">
                     <Label className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                       Cohort
                     </Label>
                     <RadioGroup
                       value={cohort}
                       onValueChange={(v) => { setCohort(v); setPage(1); }}
                       className="grid grid-cols-3 gap-2"
                     >
                       {[["all", "All"], ["A", "A"], ["B", "B"]].map(([val, label]) => (
                         <Label
                           key={val}
                           htmlFor={`cohort-${val}`}
                           className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-paper-200 px-3 py-2 text-sm text-ink-700 hover-elevate has-[:checked]:border-rust-500 has-[:checked]:text-rust-500"
                         >
                           <RadioGroupItem id={`cohort-${val}`} value={val} className="sr-only" />
                           <span className="font-mono">{label}</span>
                         </Label>
                       ))}
                     </RadioGroup>
                   </div>
                   {(minScore !== "0" || cohort !== "all") && (
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={() => { setMinScore("0"); setCohort("all"); setPage(1); }}
                       className="w-full text-ink-400 hover:text-ink-900"
                     >
                       Clear filters
                     </Button>
                   )}
                 </div>
               </PopoverContent>
             </Popover>
   ```
   (`Popover`/`PopoverTrigger`/`PopoverContent`, `Label`, `RadioGroup`/`RadioGroupItem`,
   `Separator` were all imported in R-pipeline-1. The radio item is visually hidden (`sr-only`)
   and styled via the wrapping `<Label>`'s `has-[:checked]:` selector — a Tailwind v4 feature
   live in this repo — so the chip itself shows selection in `rust-500`. `hover-elevate`/
   `active-elevate-2` are FOUNDATION utilities. Each change resets `page` to 1 so a narrowed
   result set doesn't strand the user on an empty page. `minScore`/`cohort`/`setMinScore`/
   `setCohort`/`setPage` are all in scope from R-pipeline-1 step 2.)

2. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `RadioGroup`'s `value`/`onValueChange` are `string`/`(v:string)=>void`
   (matching the string-typed `minScore`/`cohort` state); `[["0","Any"],…]` is `string[][]` so
   the destructure `[val, label]` is `string`. No `any`.

3. **Visual verify (light + dark):** dev server up, `/pipeline`. Click the Filter icon — a
   warm-shadowed popover opens with a Score grid (Any/80+/90+/95+) and a Cohort grid
   (All/A/B). Pick "90+" → the list narrows to score ≥ 90 and a rust dot appears on the
   trigger; pick Cohort "A" → narrows further. Click **Clear filters** → resets and the dot
   disappears. Confirm the selected chip shows `rust-500` border/text. Toggle dark mode and
   re-check the popover surface + chip contrast. Screenshot both.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: functional score/cohort filtering, active-state dot, working clear, readable in
   both themes. Stop the dev server.

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Pipeline.tsx && \
     git commit -m "feat(pipeline): wire Filter button as score/cohort Popover (was dead control)

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-pipeline-4: Make the dead per-row Edit button a working "View" action

The per-row "Edit" button (lines 217–220) has no `onClick` and its `<td>` swallows the row's
own navigation via `stopPropagation` — clicking it does nothing. Replace it with a labelled,
icon-bearing **View** action that explicitly navigates to the lead detail (the row-click
target is invisible; this is the discoverable affordance), with a hover/press micro-interaction.
(Decision: keep + wire, not remove — a per-row action makes the row's destination
discoverable; "Edit" was the wrong verb since the detail route is read-first, so it becomes
"View".)

**Files:**
- `artifacts/workforce-os/src/pages/Pipeline.tsx` (lines 217–220)

**Steps:**

1. Replace the dead Edit button with a wired View button. **BEFORE** (lines 217–221):
   ```tsx
                   <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                     <Button variant="ghost" size="sm" className="h-8 text-ink-400 hover:text-ink-900">
                       Edit
                     </Button>
                   </td>
   ```
   **AFTER:**
   ```tsx
                   <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={() => setLocation(`/pipeline/${lead.id}`)}
                       className="h-8 gap-1 text-ink-400 transition-all hover:text-rust-500 active:scale-95"
                     >
                       View
                       <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                     </Button>
                   </td>
   ```
   (Navigates to the same `/pipeline/${lead.id}` the row click targets, so the action is
   real and consistent. `ArrowRight` was imported in R-pipeline-1. The `group-hover:translate-x-0.5`
   nudges the arrow when the row is hovered — a small directional cue. `active:scale-95` is the
   press feedback; `hover:text-rust-500` ties the action to the brand accent. The `<td>` keeps
   `stopPropagation` so the click is handled once, by the button.)

2. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `setLocation` and `lead` are in scope inside `leads.map`; `ArrowRight`
   is imported.

3. **Visual verify (light + dark):** dev server up, `/pipeline`. Hover a row — the arrow on
   the View button nudges right. Click **View** → navigates to `/pipeline/:id` (LeadDetail).
   Go back, click anywhere else on the row → also navigates (row click still works; only the
   button cell stops propagation). Toggle dark mode and re-check the button contrast.
   Screenshot both.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: View navigates, arrow micro-cue on row hover, press feedback, readable in both
   themes. Stop the dev server.

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Pipeline.tsx && \
     git commit -m "feat(pipeline): wire per-row View action to lead detail (was dead Edit button)

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-pipeline-5: Unified EmptyState + ErrorState in the table body

Replace the hand-rolled empty cell with the shared `<EmptyState>`, and add the missing error
branch with `<ErrorState onRetry={refetch}>`. Both render inside a single full-width `<tr>`/
`<td colSpan={8}>` so the table layout holds.

**Files:**
- `artifacts/workforce-os/src/pages/Pipeline.tsx` (lines 158–167, and a new branch before it)

**Steps:**

1. Replace the hand-rolled empty branch AND prepend an error branch. The empty branch is the
   second arm of the `listLoading ? … : leads.length === 0 ? … : (…)` ternary in `<tbody>`.
   Add the error check as a third state by nesting it. **BEFORE** (lines 158–167):
   ```tsx
             ) : leads.length === 0 ? (
               <tr>
                 <td colSpan={8} className="py-20 text-center text-ink-400">
                   <div className="flex flex-col items-center">
                     <Search className="h-12 w-12 opacity-10 mb-4" />
                     <p className="text-lg font-serif">No leads found</p>
                     <p className="text-sm">Try adjusting your filters or search query.</p>
                   </div>
                 </td>
               </tr>
             ) : (
   ```
   **AFTER:**
   ```tsx
             ) : isError ? (
               <tr>
                 <td colSpan={8} className="p-0">
                   <ErrorState
                     title="Couldn't load the pipeline"
                     description="The leads service didn't respond. Your data is safe — try again."
                     onRetry={() => refetch()}
                   />
                 </td>
               </tr>
             ) : leads.length === 0 ? (
               <tr>
                 <td colSpan={8} className="p-0">
                   <EmptyState
                     icon={Search}
                     title="No leads found"
                     description="No leads match your current search, stage, or filters. Try widening them — or clear filters to see everything."
                   />
                 </td>
               </tr>
             ) : (
   ```
   (`ErrorState` (`{title?, description?, onRetry?}`) and `EmptyState` (`{icon, title,
   description, action?}`) are PRIMITIVES Task P3 components imported in R-pipeline-1.
   `() => refetch()` drops `refetch`'s return value to match `onRetry?: () => void`. The
   `<td>` uses `p-0` because `EmptyState`/`ErrorState` own their own `py-16` padding and
   centering; `colSpan={8}` matches the eight `<th>`s (lines 129–141). The error branch is
   evaluated before the empty branch so a failed fetch no longer masquerades as "no leads".)

2. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `icon={Search}` satisfies `EmptyState`'s `icon: LucideIcon`; `isError`
   is `boolean` and `refetch` is callable (`UseQueryResult`); `() => refetch()` satisfies
   `onRetry?: () => void`.

3. **Visual verify (light + dark):** dev server up, `/pipeline`. Search a nonsense string
   (e.g. "zzzzz") → the editorial `<EmptyState>` renders (centered `paper-100` circular Search
   chip, Lora "No leads found", muted body) instead of the old faded block. Then force an
   error (stop the API/DB or block the `listLeads` request in devtools) and reload → the
   `<ErrorState>` renders (rust AlertTriangle chip, "Try again" button); click **Try again** →
   it refetches. Toggle dark mode and re-check both. Screenshot both themes for each state.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: shared empty/error states render with working retry, table layout intact (full
   width, no column collapse), readable in both themes. Stop the dev server.

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Pipeline.tsx && \
     git commit -m "feat(pipeline): unify EmptyState + add ErrorState with retry in table body

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **FOUNDATION** (warm `--shadow-xs/sm/md`, palette, `.hover-elevate`/`.active-elevate-2`) and
  **PRIMITIVES** (P1 motion lib `staggerContainer`/`staggerItem`/`useReducedMotionSafe`,
  P2 `<CountUp>`, P3 `<EmptyState>`/`<ErrorState>`) must land first.
- **R-pipeline-1 must run first** — it adds every import and the `minScore`/`cohort`/`reduced`
  state plus the `isError`/`refetch` destructure that R-pipeline-2 (reduced, CountUp),
  R-pipeline-3 (filter state, Popover/Label/RadioGroup/Separator), R-pipeline-4 (ArrowRight),
  and R-pipeline-5 (isError/refetch, EmptyState/ErrorState) all consume.
- **R-pipeline-2 → R-pipeline-3 → R-pipeline-4 → R-pipeline-5** is the natural order but
  2/3/4/5 are mutually independent after R-1 (they touch disjoint line regions:
  2 = `<tbody>`/rows/footer, 3 = filter button lines 102–104, 4 = row Action `<td>` lines
  217–221, 5 = empty/error branches lines 158–167). Run them in order to keep the BEFORE line
  numbers stable, since R-2 inserts lines (the `motion.tbody` block) above R-5's region — if
  you reorder, re-read the file to re-anchor the BEFORE blocks.
- `CohortBadge.tsx` and `EmailStatusBadge.tsx` are intentionally **not** edited (already on
  warm tokens; shared with LeadDetail). No cross-section symbol is renamed; every imported
  name (`staggerContainer`, `staggerItem`, `useReducedMotionSafe`, `CountUp`, `EmptyState`,
  `ErrorState`) matches the SHARED CONTRACT exactly. The one deliberate deviation from the
  contract's `<Stagger>` wrapper — using `motion.tbody`/`motion.tr` with the variants directly
  — is required because `<Stagger>` renders a `<div>`, which is invalid inside `<table>`.


---

## ROUTE: LEADDETAIL

Premium UI/UX pass for the `/pipeline/:id` lead detail surface
(`artifacts/workforce-os/src/pages/LeadDetail.tsx`) and its `ScoreRing`
(`artifacts/workforce-os/src/components/v2/ScoreRing.tsx`). This section applies the shared
depth (warm shadow tokens), motion (`Stagger`/`CountUp`/`cardEnter`), unified
`EmptyState`/`ErrorState`, and hover/press micro-interactions — and closes four concrete
leaks:

1. The **"Edit Lead"** button (`LeadDetail.tsx:82`) is wired to nothing — there is no
   lead-edit/update mutation in `@workspace/api-client-react` (only `useTriggerOutbound` and
   `useBulkSuppressLeads` touch a lead). **Remove it** (the CONTRACT for this leak is "wire OR
   remove"; with no backend there is nothing to wire).
2. The hardcoded **"Intent Detected"** blurb (`LeadDetail.tsx:163-167`) claims "Lead recently
   interacted with your LinkedIn posts and visited your pricing page" regardless of the actual
   lead. **Replace** it with a sentence derived from the real `lead.intentSignals`
   (`{ label: string; confidence: number }[]`, confidence on a 0–1 scale per seed data).
3. **ScoreRing** has no count-up and the hero card has no depth/hover. Add `<CountUp>` to the
   ring center and the warm-shadow raised-card treatment.
4. There is **no error path** — `useGetLead` exposes `isError`/`error`/`refetch` but the page
   only handles `isLoading` and `!detailData`. Add `<ErrorState onRetry>` and convert the
   "not found" branch to `<EmptyState>`.

### Grounding facts (verified against the live tree on 2026-06-07)

- **No lead-edit mutation exists.** `grep -nE "export const use[A-Z]" lib/api-client-react/src/generated/api.ts`
  for lead/update yields only `useTriggerOutbound` (line 1063) and `useBulkSuppressLeads`
  (line 1134). Confirms leak #1 is "remove", not "wire".
- **`useGetLead` is a standard TanStack `UseQueryResult`** (`lib/api-client-react/src/generated/api.ts:986-996`),
  so `isError`, `error`, and `refetch` are all available on its return value.
- **`IntentSignal`** = `{ label: string; confidence: number }`
  (`lib/api-zod/src/generated/types/intentSignal.ts`); `Lead.intentSignals: IntentSignal[]`
  (`lib/api-zod/src/generated/types/lead.ts:36`). Seed confidences are 0.76–0.91 (0–1 scale),
  so a `%` rendering multiplies by 100.
- **`Lead.domain` is `string | null`** (`lead.ts:20`) — `LeadDetail.tsx:107` renders it raw,
  which prints nothing when null. Out of scope to fix beyond what the edits below touch.
- The CONTRACT primitives this section consumes are created by earlier sections:
  motion variants/`useReducedMotionSafe` in `src/lib/motion.ts` (Task P1); `<Stagger>`/
  `<StaggerItem>` in `src/components/motion/Stagger.tsx` and `<CountUp>` in
  `src/components/motion/CountUp.tsx` (Task P2); `<EmptyState>`/`<ErrorState>` in
  `src/components/states/` (Task P3). Warm shadow tokens (`--shadow-sm/md`) + `.hover-elevate`
  come from foundation Tasks F2/F3. **This section only consumes them.**
- This page renders **plain string** `researchBrief` as a text node (`LeadDetail.tsx:122`),
  not via `dangerouslySetInnerHTML`, so no `sanitizeHtml` is needed here. Do NOT add it.

> Ordering: this section depends on P1, P2, P3 (primitives) and F2, F3 (foundation tokens).
> If a reviewer runs it before tokens land, `shadow-sm/md` fall back to Tailwind defaults and
> still build; the motion/state imports are hard deps and must exist first.

---

### Task R-leaddetail-1: ScoreRing — animate the value with `<CountUp>` + add a soft glow

**Files:**
- Modify: `artifacts/workforce-os/src/components/v2/ScoreRing.tsx` (lines 1-2 imports; lines 44-46 center label)

1. Add the `CountUp` import. **BEFORE** (`ScoreRing.tsx:1-2`):
   ```tsx
   import React from "react";
   import { cn } from "@/lib/utils";
   ```
   **AFTER:**
   ```tsx
   import React from "react";
   import { cn } from "@/lib/utils";
   import { CountUp } from "@/components/motion/CountUp";
   ```

2. Replace the static center label with `<CountUp>`. **BEFORE** (`ScoreRing.tsx:44-46`):
   ```tsx
       <span className="absolute font-tabular text-sm font-bold text-ink-900">
         {score}
       </span>
   ```
   **AFTER:**
   ```tsx
       <CountUp
         value={score}
         className="absolute font-tabular text-sm font-bold text-ink-900"
       />
   ```
   `CountUp` renders a `<span>` with the same classes, animates 0→`score`, and snaps to the
   final value when `prefers-reduced-motion` is set (it gates on `useReducedMotionSafe()`).

3. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `CountUp`'s `value: number` matches `score: number`; the class
   string is unchanged so layout is identical.

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/v2/ScoreRing.tsx && \
     git commit -m "feat(leaddetail): animate ScoreRing value with CountUp

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-leaddetail-2: Imports — pull in motion, state primitives, and trim unused icons

**Files:**
- Modify: `artifacts/workforce-os/src/pages/LeadDetail.tsx` (lines 1-21 import block)

1. Replace the entire import block. **BEFORE** (`LeadDetail.tsx:1-21`):
   ```tsx
   import React from "react";
   import { useGetLead, useTriggerOutbound } from "@workspace/api-client-react";
   import { useRoute, useLocation } from "wouter";
   import { Button } from "@/components/ui/button";
   import { Card } from "@/components/ui/card";
   import { Skeleton } from "@/components/ui/skeleton";
   import { 
     ChevronLeft, 
     Sparkles, 
     Zap, 
     Clock, 
     Target, 
     Search,
     MessageSquare
   } from "lucide-react";
   import { ScoreRing } from "@/components/v2/ScoreRing";
   import { CohortBadge } from "@/components/v2/CohortBadge";
   import { EmailStatusBadge } from "@/components/v2/EmailStatusBadge";
   import { formatDistanceToNow } from "date-fns";
   import { cn } from "@/lib/utils";
   import { toast } from "sonner";
   ```
   **AFTER** (adds `UserX` for the not-found EmptyState; drops nothing in use; adds motion +
   states + `Lead` type import for the derived-blurb helper in R-leaddetail-5):
   ```tsx
   import React from "react";
   import { useGetLead, useTriggerOutbound } from "@workspace/api-client-react";
   import type { Lead } from "@workspace/api-client-react";
   import { useRoute, useLocation } from "wouter";
   import { Button } from "@/components/ui/button";
   import { Card } from "@/components/ui/card";
   import { Skeleton } from "@/components/ui/skeleton";
   import {
     ChevronLeft,
     Sparkles,
     Zap,
     Clock,
     Target,
     Search,
     MessageSquare,
     UserX,
   } from "lucide-react";
   import { ScoreRing } from "@/components/v2/ScoreRing";
   import { CohortBadge } from "@/components/v2/CohortBadge";
   import { EmailStatusBadge } from "@/components/v2/EmailStatusBadge";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { formatDistanceToNow } from "date-fns";
   import { cn } from "@/lib/utils";
   import { toast } from "sonner";
   ```
   > `Lead` is re-exported by `@workspace/api-client-react` (it re-exports the orval-generated
   > schema types). If typecheck reports it is not exported from the package root, import it
   > from the generated path instead: `import type { Lead } from "@workspace/api-client-react/generated/api.schemas";`
   > — verify the export in step 2 before committing.

2. **Verify (typecheck):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0. If it fails on the `Lead` import only, switch to the
   `/generated/api.schemas` path noted above and re-run. (The `Stagger`/`EmptyState`/
   `ErrorState`/`UserX` symbols all exist after P2/P3.) Some symbols are not yet *used* — that
   is fine, this is the import scaffolding; usage lands in R-leaddetail-3..6. tsc does not
   error on unused imports under this repo's config (it `exclude`s noUnused enforcement at the
   build level; if your local `tsc` flags TS6133, leave the imports — they are consumed by the
   end of this section and the section's tasks are committed in order).

3. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/LeadDetail.tsx && \
     git commit -m "chore(leaddetail): add motion + state-primitive imports

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-leaddetail-3: Loading + error + empty states (replace ad-hoc branches)

**Files:**
- Modify: `artifacts/workforce-os/src/pages/LeadDetail.tsx` (lines 28-30 query opts; lines 44-64 the two guard branches)

1. Expose `isError`/`refetch` from the query. **BEFORE** (`LeadDetail.tsx:28-30`):
   ```tsx
     const { data: detailData, isLoading } = useGetLead(id, {
       query: { enabled: !!id, queryKey: ["getLead", id] }
     });
   ```
   **AFTER:**
   ```tsx
     const { data: detailData, isLoading, isError, refetch } = useGetLead(id, {
       query: { enabled: !!id, queryKey: ["getLead", id] }
     });
   ```

2. Wrap the loading skeleton card in `shadow-none` flat treatment (skeletons stay flat per the
   depth convention) — no change to the skeleton markup is needed; it already uses bare
   `Skeleton`. Replace the **error/not-found** handling. **BEFORE** (`LeadDetail.tsx:57-64`):
   ```tsx
     if (!detailData) {
       return (
         <div className="flex flex-col items-center justify-center h-full">
           <p className="text-ink-400">Lead not found</p>
           <Button variant="link" onClick={() => setLocation("/pipeline")}>Back to Pipeline</Button>
         </div>
       );
     }
   ```
   **AFTER** (error → `<ErrorState onRetry>`; genuinely-missing lead → `<EmptyState>`):
   ```tsx
     if (isError) {
       return (
         <div className="flex h-full flex-col bg-paper-50">
           <ErrorState
             title="Couldn't load this lead"
             description="The lead detail failed to load. Check your connection and try again."
             onRetry={() => refetch()}
           />
         </div>
       );
     }

     if (!detailData) {
       return (
         <div className="flex h-full flex-col bg-paper-50">
           <EmptyState
             icon={UserX}
             title="Lead not found"
             description="This lead may have been suppressed or removed from the pipeline."
             action={
               <Button
                 variant="outline"
                 size="sm"
                 onClick={() => setLocation("/pipeline")}
                 className="hover-elevate active-elevate-2 border-paper-200"
               >
                 Back to Pipeline
               </Button>
             }
           />
         </div>
       );
     }
   ```
   `EmptyState` and `ErrorState` both `flex-1` to center inside their parent; the wrapping
   `flex h-full flex-col` gives them the full route height. `onRetry={() => refetch()}`
   discards the `QueryObserverResult` promise so the prop's `() => void` signature is honored.

3. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0.

4. **Verify (visual — error + empty):** start dev, force each state with Playwright.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   - Empty: navigate to `http://localhost:21792/pipeline/does-not-exist` (a real, unknown id)
     → `browser_take_screenshot` in light AND dark. Expected: centered `UserX` chip, serif
     "Lead not found" title, muted body, "Back to Pipeline" button.
   - Error: with the dev server up, `browser_route` the API to 500 (or stop the api-server)
     and reload a valid lead → screenshot light + dark. Expected: rust `AlertTriangle` chip,
     "Couldn't load this lead", and a "Try again" button that refetches on click.
   Stop the dev server.

5. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/LeadDetail.tsx && \
     git commit -m "feat(leaddetail): unify loading/error/empty with ErrorState + EmptyState

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-leaddetail-4: Remove the dead "Edit Lead" button (leak #1)

**Files:**
- Modify: `artifacts/workforce-os/src/pages/LeadDetail.tsx` (lines 81-87 topbar control cluster)

1. There is no lead-edit mutation in `@workspace/api-client-react`, so "Edit Lead" is a dead
   control. Remove it and keep the working "Trigger Outbound" button, adding the
   `.hover-elevate`/`.active-elevate-2` micro-interaction. **BEFORE** (`LeadDetail.tsx:81-87`):
   ```tsx
           <div className="flex items-center gap-2">
             <Button variant="outline" size="sm" className="bg-white border-paper-200">Edit Lead</Button>
             <Button onClick={handleTrigger} className="bg-rust-500 hover:bg-rust-600 text-white" disabled={triggerMut.isPending}>
               <Zap className="h-4 w-4 mr-2" />
               Trigger Outbound
             </Button>
           </div>
   ```
   **AFTER:**
   ```tsx
           <div className="flex items-center gap-2">
             <Button
               onClick={handleTrigger}
               className="bg-rust-500 hover:bg-rust-600 text-white hover-elevate active-elevate-2 transition-colors"
               disabled={triggerMut.isPending}
             >
               <Zap className="h-4 w-4 mr-2" />
               Trigger Outbound
             </Button>
           </div>
   ```

2. **Verify (typecheck + build + no dangling "Edit Lead"):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   grep -n "Edit Lead" artifacts/workforce-os/src/pages/LeadDetail.tsx
   ```
   Expected: typecheck + build exit 0; the `grep` prints **nothing** (exit 1) — the dead
   button is gone.

3. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/LeadDetail.tsx && \
     git commit -m "fix(leaddetail): remove dead Edit Lead button (no edit mutation exists)

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-leaddetail-5: Replace the hardcoded "Intent Detected" blurb with real signals (leak #2)

**Files:**
- Modify: `artifacts/workforce-os/src/pages/LeadDetail.tsx` (lines 163-175 Intent card; add a pure helper below the `ScoreBar` component near line 211)

1. Add a pure helper that builds the blurb from the lead's actual `intentSignals`. Insert it at
   the very end of the file, **after** the `ScoreBar` function (currently ends `LeadDetail.tsx:211`).
   **BEFORE** (end of file, `LeadDetail.tsx:209-213`):
   ```tsx
         <div 
           className={cn("h-full rounded-full transition-all duration-500", color)} 
           style={{ width: `${score}%` }} 
         />
       </div>
     </div>
   );
   }
   ```
   **AFTER** (append the helper after the closing `}` of `ScoreBar`):
   ```tsx
         <div 
           className={cn("h-full rounded-full transition-all duration-500", color)} 
           style={{ width: `${score}%` }} 
         />
       </div>
     </div>
   );
   }

   /**
    * Build a human sentence from the lead's real intent signals (confidence is 0–1).
    * Falls back to neutral copy when the lead has no signals.
    */
   function intentBlurb(signals: Lead["intentSignals"]): string {
     if (!signals.length) {
       return "No intent signals detected yet. We'll surface them here as evidence arrives.";
     }
     const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
     const top = sorted[0];
     const pct = Math.round(top.confidence * 100);
     const rest = sorted.slice(1, 3).map((s) => s.label);
     const restPhrase =
       rest.length === 0
         ? ""
         : rest.length === 1
           ? `, alongside ${rest[0]}`
           : `, alongside ${rest[0]} and ${rest[1]}`;
     return `Strongest signal: ${top.label} (${pct}% confidence)${restPhrase}.`;
   }
   ```

2. Replace the Intent card body. **BEFORE** (`LeadDetail.tsx:163-175`):
   ```tsx
               <Card className="p-6 bg-rust-50 border-rust-100 shadow-sm">
                 <h4 className="font-serif font-semibold text-rust-900 mb-2">Intent Detected</h4>
                 <p className="text-sm text-rust-700 mb-4 leading-snug">
                   Lead recently interacted with your LinkedIn posts and visited your pricing page.
                 </p>
                 <div className="flex flex-wrap gap-2">
                   {lead.intentSignals.map((sig, i) => (
                     <span key={i} className="text-[10px] px-2 py-1 bg-white border border-rust-200 rounded text-rust-600 font-medium">
                       {sig.label}
                     </span>
                   ))}
                 </div>
               </Card>
   ```
   **AFTER** (blurb derived from real signals; each chip shows its real confidence; whole card
   becomes a `<StaggerItem>` with the raised-card depth):
   ```tsx
               <StaggerItem>
                 <Card className="p-6 bg-rust-50 border-rust-100 shadow-sm transition-shadow duration-200 hover:shadow-md">
                   <h4 className="font-serif font-semibold text-rust-900 mb-2">
                     {lead.intentSignals.length ? "Intent Detected" : "Intent Pending"}
                   </h4>
                   <p className="text-sm text-rust-700 mb-4 leading-snug">
                     {intentBlurb(lead.intentSignals)}
                   </p>
                   <div className="flex flex-wrap gap-2">
                     {lead.intentSignals.map((sig, i) => (
                       <span
                         key={i}
                         className="text-[10px] px-2 py-1 bg-white border border-rust-200 rounded text-rust-600 font-medium"
                       >
                         {sig.label}
                         <span className="ml-1 text-rust-400 font-tabular">
                           {Math.round(sig.confidence * 100)}%
                         </span>
                       </span>
                     ))}
                   </div>
                 </Card>
               </StaggerItem>
   ```
   > The `<StaggerItem>` wrapper requires this card to live inside a `<Stagger>` container —
   > that wrapper is added in R-leaddetail-6. If you run this task standalone before -6, a bare
   > `StaggerItem` still renders its children (it just won't stagger); typecheck/build pass
   > either way.

3. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   grep -n "LinkedIn posts and visited your pricing page" artifacts/workforce-os/src/pages/LeadDetail.tsx
   ```
   Expected: typecheck + build exit 0; the `grep` prints **nothing** (exit 1) — the hardcoded
   blurb is gone. `intentBlurb` is a pure `(signals) => string` so no type widening.

4. **Verify (visual):** dev up, navigate to a seeded lead with signals
   (`http://localhost:21792/pipeline/<seeded-id>`) and screenshot light + dark. Expected: the
   blurb reads e.g. "Strongest signal: Hiring spike (91% confidence), alongside …", and each
   chip shows its own `%`. Stop the dev server.

5. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/LeadDetail.tsx && \
     git commit -m "fix(leaddetail): derive Intent blurb from real intentSignals

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-leaddetail-6: Depth + motion — raised hero card, CountUp ring, staggered sections

**Files:**
- Modify: `artifacts/workforce-os/src/pages/LeadDetail.tsx` (lines 90-189 the content region)

1. Convert the hero card to the raised-card depth treatment and wrap the content region in a
   `<Stagger>` so the hero / main column / sidebar fade-slide in sequence. **BEFORE**
   (`LeadDetail.tsx:90-92`):
   ```tsx
         <div className="max-w-6xl mx-auto w-full p-6 md:p-10 space-y-8">
           {/* Hero Card */}
           <Card className="p-8 border-paper-200 shadow-sm overflow-hidden relative">
   ```
   **AFTER** (open a `<Stagger>` and make the hero a raised `StaggerItem` on a white surface so
   the warm shadow reads):
   ```tsx
         <Stagger className="max-w-6xl mx-auto w-full p-6 md:p-10 space-y-8">
           {/* Hero Card */}
           <StaggerItem>
             <Card className="p-8 bg-ink-0 border-paper-200 shadow-sm transition-shadow duration-200 hover:shadow-md overflow-hidden relative">
   ```

2. Close the hero `StaggerItem`. **BEFORE** (`LeadDetail.tsx:110-112`):
   ```tsx
             </div>
           </div>
         </Card>
   ```
   **AFTER** (add the `</StaggerItem>` after the hero `</Card>`):
   ```tsx
             </div>
           </div>
           </Card>
         </StaggerItem>
   ```

3. Wrap the Research Brief + Score Breakdown sections in `StaggerItem`s and give their cards
   the raised treatment. **BEFORE** (`LeadDetail.tsx:116-137`):
   ```tsx
             <section>
               <div className="flex items-center gap-2 mb-4">
                 <Sparkles className="h-5 w-5 text-rust-500" />
                 <h3 className="font-serif text-xl font-semibold text-ink-900">Research Brief</h3>
               </div>
               <Card className="p-6 border-paper-200 bg-white prose prose-ink max-w-none text-ink-700 shadow-sm leading-relaxed">
                 {researchBrief}
               </Card>
             </section>

             <section>
               <div className="flex items-center gap-2 mb-4">
                 <Target className="h-5 w-5 text-ink-900" />
                 <h3 className="font-serif text-xl font-semibold text-ink-900">Score Breakdown</h3>
               </div>
               <Card className="p-6 border-paper-200 bg-white shadow-sm space-y-6">
                 <ScoreBar label="Firmographic Fit" score={scoreBreakdown.fit} />
                 <ScoreBar label="Intent Signals" score={scoreBreakdown.intent} />
                 <ScoreBar label="Prior Engagement" score={scoreBreakdown.engagement} />
                 <ScoreBar label="Timing / Urgency" score={scoreBreakdown.timing} />
               </Card>
             </section>
   ```
   **AFTER:**
   ```tsx
             <StaggerItem>
               <section>
                 <div className="flex items-center gap-2 mb-4">
                   <Sparkles className="h-5 w-5 text-rust-500" />
                   <h3 className="font-serif text-xl font-semibold text-ink-900">Research Brief</h3>
                 </div>
                 <Card className="p-6 border-paper-200 bg-ink-0 prose prose-ink max-w-none text-ink-700 shadow-sm transition-shadow duration-200 hover:shadow-md leading-relaxed">
                   {researchBrief}
                 </Card>
               </section>
             </StaggerItem>

             <StaggerItem>
               <section>
                 <div className="flex items-center gap-2 mb-4">
                   <Target className="h-5 w-5 text-ink-900" />
                   <h3 className="font-serif text-xl font-semibold text-ink-900">Score Breakdown</h3>
                 </div>
                 <Card className="p-6 border-paper-200 bg-ink-0 shadow-sm transition-shadow duration-200 hover:shadow-md space-y-6">
                   <ScoreBar label="Firmographic Fit" score={scoreBreakdown.fit} />
                   <ScoreBar label="Intent Signals" score={scoreBreakdown.intent} />
                   <ScoreBar label="Prior Engagement" score={scoreBreakdown.engagement} />
                   <ScoreBar label="Timing / Urgency" score={scoreBreakdown.timing} />
                 </Card>
               </section>
             </StaggerItem>
   ```

4. Wrap the sidebar "Recent Evidence" section and the "Last Contact" tile in `StaggerItem`s
   (the Intent card was already wrapped in R-leaddetail-5). **BEFORE** (`LeadDetail.tsx:142-161`):
   ```tsx
             <section>
               <div className="flex items-center gap-2 mb-4">
                 <Search className="h-5 w-5 text-ink-400" />
                 <h3 className="font-serif text-lg font-semibold text-ink-900">Recent Evidence</h3>
               </div>
               <div className="space-y-4">
                 {recentEvidenceEvents.map((evt) => (
   ```
   **AFTER** (open a `StaggerItem` around the section; the inner `.map` is unchanged):
   ```tsx
             <StaggerItem>
               <section>
                 <div className="flex items-center gap-2 mb-4">
                   <Search className="h-5 w-5 text-ink-400" />
                   <h3 className="font-serif text-lg font-semibold text-ink-900">Recent Evidence</h3>
                 </div>
                 <div className="space-y-4">
                   {recentEvidenceEvents.map((evt) => (
   ```
   Then close that section's `StaggerItem`. **BEFORE** (`LeadDetail.tsx:159-161`):
   ```tsx
                 ))}
               </div>
             </section>
   ```
   **AFTER:**
   ```tsx
                 ))}
                 </div>
               </section>
             </StaggerItem>
   ```

5. Wrap the "Last Contact" tile and close the `<Stagger>` container. **BEFORE**
   (`LeadDetail.tsx:177-191`):
   ```tsx
             {lead.lastContactedAt && (
               <div className="flex items-center gap-3 p-4 bg-paper-100 rounded-lg border border-paper-200">
                 <MessageSquare className="h-4 w-4 text-ink-400" />
                 <div className="text-xs">
                   <span className="text-ink-400 block uppercase tracking-wider font-mono">Last Contact</span>
                   <span className="text-ink-900 font-medium">
                     {formatDistanceToNow(new Date(lead.lastContactedAt), { addSuffix: true })}
                   </span>
                 </div>
               </div>
             )}
           </div>
         </div>
       </div>
     );
   }
   ```
   **AFTER** (wrap the tile in `StaggerItem`; change the outer content wrapper `</div>` that
   closed the old `max-w-6xl` div into `</Stagger>`):
   ```tsx
             {lead.lastContactedAt && (
               <StaggerItem>
                 <div className="flex items-center gap-3 p-4 bg-paper-100 rounded-lg border border-paper-200">
                   <MessageSquare className="h-4 w-4 text-ink-400" />
                   <div className="text-xs">
                     <span className="text-ink-400 block uppercase tracking-wider font-mono">Last Contact</span>
                     <span className="text-ink-900 font-medium">
                       {formatDistanceToNow(new Date(lead.lastContactedAt), { addSuffix: true })}
                     </span>
                   </div>
                 </div>
               </StaggerItem>
             )}
           </div>
         </Stagger>
       </div>
     );
   }
   ```
   > Tag-balance check: the original wrapper opened as `<div className="max-w-6xl …">` (step 1
   > changed it to `<Stagger …>`), so its matching close — the `</div>` immediately before the
   > `</div>` that closes the outermost route container — becomes `</Stagger>`. After all edits
   > the JSX must still balance: one `<Stagger>` … one `</Stagger>`, and every `<StaggerItem>`
   > paired. The build's `tsc` + esbuild will hard-fail on any imbalance, so the verify step
   > catches a miscount.

6. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. A JSX imbalance (mismatched `Stagger`/`StaggerItem`/`div`) fails here
   — if it does, recount the open/close pairs in steps 1-5 before proceeding.

7. **Verify (visual — happy path, light + dark):** dev up, navigate to a seeded lead.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Navigate to `http://localhost:21792/pipeline/<seeded-id>` and `browser_take_screenshot` in
   **light** then `browser_click` the theme toggle and screenshot **dark**. Expected vs the F0
   baseline (`baseline/lead-detail.png`):
   - hero + section + sidebar cards read as raised white cards with a soft warm shadow, lifting
     to `shadow-md` on hover;
   - the ScoreRing center number counts up 0→score on load;
   - sections fade-slide in staggered, not all at once;
   - the Intent card shows the real-signal blurb + per-chip confidence;
   - no "Edit Lead" button in the topbar.
   With `prefers-reduced-motion: reduce` emulated (`browser` emulate or DevTools), confirm the
   page renders final state instantly (CountUp shows the number, no slide). Stop the dev server.

8. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/LeadDetail.tsx && \
     git commit -m "feat(leaddetail): raised-card depth + staggered section motion

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **R-leaddetail-1** (ScoreRing CountUp) is independent of the rest and can ship first; it only
  needs P2's `CountUp`.
- **R-leaddetail-2** (imports) must precede 3, 5, 6 (they use `Stagger`/`EmptyState`/
  `ErrorState`/`UserX`/`Lead`).
- **R-leaddetail-3** (states) is independent of 4/5/6 once imports exist.
- **R-leaddetail-5** introduces a `<StaggerItem>` that only staggers once **R-leaddetail-6**
  adds the enclosing `<Stagger>`; both still build standalone. Prefer running 5 then 6.
- **R-leaddetail-4** (remove Edit Lead) is independent and can run any time after -2.
- Upstream hard deps: P1, P2, P3 (motion + state primitives) and F2, F3 (elevate utilities +
  warm shadow tokens). No CONTRACT symbol is renamed or re-invented.


---

## ROUTE: OUTBOUND

This section applies the Nikxius premium treatment to the **Outbound** surface — the
human-in-the-loop approval queue. It depends on the FOUNDATION section (warm shadow tokens
`--shadow-xs/sm/md/lg`, palette, `.hover-elevate`/`.active-elevate-2`) and the PRIMITIVES
section (`src/lib/motion.ts`, `<Stagger>`/`<StaggerItem>`, `<EmptyState>`, `<ErrorState>`,
`sanitizeHtml`). It does **not** depend on any other route section.

### Files touched

- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Outbound.tsx`
  (entire file is 189 lines as of 2026-06-07; tasks edit lines 16–19, 73–90, 107–188)
- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/v2/ApprovalCard.tsx`
  (236 lines; tasks edit lines 1–14, 53–74, 76–78, 100–107)

### Grounding facts (verified against the live tree 2026-06-07)

- `Outbound.tsx` renders the queue through a nested `ArtifactList` function (lines 107–188).
  It branches three ways: loading (lines 116–123, two `<ApprovalCardSkeleton/>`), empty
  (lines 125–133, a **hand-rolled** `opacity-40` block with a raw `ShieldAlert` icon), and
  content. Content has a `SENT` table branch (lines 135–177) and the default card-list
  branch (lines 179–187). It has **no error branch** — `useListArtifacts` exposes `isError`
  but it is ignored, so a failed fetch silently shows the empty state.
- The card list (lines 180–186) wraps each `<ApprovalCard/>` in a plain `<div>` with
  `cursor-pointer transition-transform active:scale-[0.98]` — a hand-rolled press
  micro-interaction with no depth and no mount animation.
- `ApprovalCard` (line 78) renders `<Card className="p-5">`. The shared `Card`
  (`components/ui/card.tsx` line 12) ships a default `shadow` (Tailwind's gray default), so
  the card currently has cool, undefined depth — it must be pinned to the warm `shadow-sm`
  rest / `shadow-md` hover scale.
- The `SENT` (lines 53–63) and `REJECTED` (lines 65–74) result cards use `animate-in
  fade-in` (a tailwindcss-animate utility), **not** the shared motion library. The CONTRACT
  requires the approve/reject transition to animate via `cardEnter` exit.
- `ApprovalCard` line 106 renders `dangerouslySetInnerHTML={{ __html: artifact.bodyHtml }}`
  **unsanitized**. PRIMITIVES Task P5 shipped `sanitizeHtml` from `@/lib/sanitize`; the
  CONTRACT requires it at EVERY `dangerouslySetInnerHTML`. This is the one such call site on
  this surface.
- `useListArtifacts(params, opts)` returns a standard TanStack
  `UseQueryResult & { queryKey }` (generated hook, `lib/api-client-react/src/generated/api.ts`
  line 305) so `isLoading`, `isError`, and `refetch` are all available.
- `OutreachArtifactStatus` values are `PENDING_REVIEW | APPROVED | SENT | REJECTED`
  (`api.schemas.ts` line 45). The `activeTab` state adds an `"ALL"` literal.
- The tabs (lines 75–89) use shadcn `Tabs` with a single `<TabsContent>`-less body: the
  active tab drives one `<ArtifactList status=…/>` (line 87) instead of per-tab panels, so a
  status change swaps the list in place with **no transition**. The CONTRACT requires a
  smooth status-tab transition (crossfade keyed on `activeTab`).

---

### Task R-outbound-1: Pin warm depth + hover/press micro-interactions on ApprovalCard

Give the approval card real depth (warm `shadow-sm` at rest → `shadow-md` on hover, on a
white `ink-0` surface so the ink-tinted shadow reads) and replace the hand-rolled
`active:scale` wrapper in the list with a `springHover`-driven interaction. Also sanitize the
body HTML at the one `dangerouslySetInnerHTML` site on this surface.

**Files:**
- `artifacts/workforce-os/src/components/v2/ApprovalCard.tsx` (lines 1–14, 76–78, 100–107)
- `artifacts/workforce-os/src/pages/Outbound.tsx` (lines 16–19, 179–187)

**Steps:**

1. In `ApprovalCard.tsx`, add the `sanitizeHtml` import. **BEFORE** (lines 11–14):
   ```tsx
   import { cn } from "@/lib/utils";
   import { toast } from "sonner";
   import { EvidenceTimeline } from "./EvidenceTimeline";
   import { Skeleton } from "../ui/skeleton";
   ```
   **AFTER:**
   ```tsx
   import { cn } from "@/lib/utils";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { toast } from "sonner";
   import { EvidenceTimeline } from "./EvidenceTimeline";
   import { Skeleton } from "../ui/skeleton";
   ```

2. Sanitize the body HTML. **BEFORE** (lines 100–107):
   ```tsx
           <div className="relative">
             <div 
               className={cn(
                 "prose prose-sm prose-ink max-w-none text-ink-700",
                 !bodyExpanded && "max-h-[160px] overflow-hidden"
               )}
               dangerouslySetInnerHTML={{ __html: artifact.bodyHtml }}
             />
   ```
   **AFTER:**
   ```tsx
           <div className="relative">
             <div 
               className={cn(
                 "prose prose-sm prose-ink max-w-none text-ink-700",
                 !bodyExpanded && "max-h-[160px] overflow-hidden"
               )}
               dangerouslySetInnerHTML={{ __html: sanitizeHtml(artifact.bodyHtml) }}
             />
   ```

3. Pin the warm shadow scale on the active card. **BEFORE** (line 78):
   ```tsx
       <Card className="p-5">
   ```
   **AFTER:**
   ```tsx
       <Card className="p-5 bg-ink-0 border-paper-200 shadow-sm transition-shadow duration-200 hover:shadow-md">
   ```
   (`bg-ink-0` = white surface; `shadow-sm`→`shadow-md` is the raised-card convention from
   FOUNDATION/PRIMITIVES Task P6. The `transition-shadow` keeps the lift smooth; the
   list-level `springHover` in step 5 supplies the translate.)

4. In `Outbound.tsx`, add the motion imports. **BEFORE** (lines 16–19):
   ```tsx
   import { CheckCircle2, ShieldAlert, Check, XCircle, Ban, History } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   import { useLocation } from "wouter";
   ```
   **AFTER:**
   ```tsx
   import { CheckCircle2, ShieldAlert, Check, XCircle, Ban, History, Inbox, Send, ThumbsDown } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   import { useLocation } from "wouter";
   import { motion, AnimatePresence } from "framer-motion";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { springHover, useReducedMotionSafe } from "@/lib/motion";
   ```
   (`Inbox`, `Send`, `ThumbsDown` are the per-tab empty-state icons used in
   Task R-outbound-3.)

5. Replace the hand-rolled press wrapper in the default card-list branch with a
   `springHover`-driven motion wrapper that supplies both hover lift and press feedback.
   **BEFORE** (lines 179–187):
   ```tsx
     return (
       <div className="max-w-3xl mx-auto space-y-6 pb-12">
         {items.map((item) => (
           <div key={item.id} className="cursor-pointer transition-transform active:scale-[0.98]" onClick={() => setLocation(`/outbound/${item.id}`)}>
             <ApprovalCard artifact={item} />
           </div>
         ))}
       </div>
     );
   }
   ```
   **AFTER:**
   ```tsx
     return (
       <Stagger className="max-w-3xl mx-auto space-y-6 pb-12">
         {items.map((item) => (
           <StaggerItem key={item.id}>
             <motion.div
               className="cursor-pointer"
               variants={reduced ? undefined : springHover}
               initial="rest"
               whileHover="hover"
               whileTap="tap"
               onClick={() => setLocation(`/outbound/${item.id}`)}
             >
               <ApprovalCard artifact={item} />
             </motion.div>
           </StaggerItem>
         ))}
       </Stagger>
     );
   }
   ```
   This requires a `reduced` flag inside `ArtifactList`. Add it at the top of the function.
   **BEFORE** (lines 107–112):
   ```tsx
   function ArtifactList({ status }: { status?: OutreachArtifactStatus }) {
     const [, setLocation] = useLocation();
     const { data: draftsData, isLoading } = useListArtifacts(
       { status, limit: 20 },
       { query: { refetchInterval: 8000, queryKey: ["listArtifacts", status] } }
     );
   ```
   **AFTER:**
   ```tsx
   function ArtifactList({ status }: { status?: OutreachArtifactStatus }) {
     const [, setLocation] = useLocation();
     const reduced = useReducedMotionSafe();
     const { data: draftsData, isLoading, isError, refetch } = useListArtifacts(
       { status, limit: 20 },
       { query: { refetchInterval: 8000, queryKey: ["listArtifacts", status] } }
     );
   ```
   (`isError` + `refetch` are consumed in Task R-outbound-4; pulling them now keeps the hook
   destructure in one place. They are valid `UseQueryResult` fields.)

6. **Verify (typecheck):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0. (`isError`/`refetch` unused warnings are not errors under this repo's
   tsconfig; they are consumed two tasks later. The new lucide icons are imported but the
   empty/error consumers land in R-outbound-3/4 — imports alone do not error.)

7. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/v2/ApprovalCard.tsx \
             artifacts/workforce-os/src/pages/Outbound.tsx && \
     git commit -m "feat(outbound): warm depth + springHover/press on ApprovalCard list + sanitize body

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-outbound-2: Animate approve/reject result cards with cardEnter exit

The SENT and REJECTED result cards (the post-decision states inside `ApprovalCard`) use
`animate-in fade-in`. Wrap the whole card body in `<AnimatePresence mode="wait">` keyed on
`localStatus` so the pending card animates **out** via `cardEnter`'s `exit` and the result
card animates **in** — a single continuous decision transition instead of an abrupt swap.

**Files:**
- `artifacts/workforce-os/src/components/v2/ApprovalCard.tsx` (lines 1–14, 53–74, 76–78,
  end of the active-card `</Card>` block + the closing `</>`)

**Steps:**

1. Add the motion + variant imports. **BEFORE** (lines 1–3):
   ```tsx
   import React, { useState } from "react";
   import { OutreachArtifact, OutreachArtifactStatus } from "@workspace/api-client-react";
   import { useApproveArtifact, useRejectArtifact } from "@workspace/api-client-react";
   ```
   **AFTER:**
   ```tsx
   import React, { useState } from "react";
   import { motion, AnimatePresence } from "framer-motion";
   import { OutreachArtifact, OutreachArtifactStatus } from "@workspace/api-client-react";
   import { useApproveArtifact, useRejectArtifact } from "@workspace/api-client-react";
   import { cardEnter, useReducedMotionSafe } from "@/lib/motion";
   ```

2. Add a `reduced` flag at the top of the component. **BEFORE** (lines 20–25):
   ```tsx
   export function ApprovalCard({ artifact }: ApprovalCardProps) {
     const [localStatus, setLocalStatus] = useState<OutreachArtifactStatus>(artifact.status);
     const [rejectMode, setRejectMode] = useState(false);
     const [rejectReason, setRejectReason] = useState("");
     const [bodyExpanded, setBodyExpanded] = useState(false);
     const [timelineOpen, setTimelineOpen] = useState(false);
   ```
   **AFTER:**
   ```tsx
   export function ApprovalCard({ artifact }: ApprovalCardProps) {
     const reduced = useReducedMotionSafe();
     const [localStatus, setLocalStatus] = useState<OutreachArtifactStatus>(artifact.status);
     const [rejectMode, setRejectMode] = useState(false);
     const [rejectReason, setRejectReason] = useState("");
     const [bodyExpanded, setBodyExpanded] = useState(false);
     const [timelineOpen, setTimelineOpen] = useState(false);
   ```

3. Replace the three return branches (SENT / REJECTED / active) with a single
   `AnimatePresence` that crossfades between them keyed on `localStatus`. The cleanest edit is
   to convert each branch's outer element to a `motion.div` carrying `cardEnter`, and wrap all
   three in one `AnimatePresence`. **BEFORE** (lines 53–78, the SENT branch through the start
   of the active card):
   ```tsx
     if (localStatus === "SENT") {
       return (
         <Card className="p-4 bg-signal-positive/5 border-signal-positive/20 flex flex-col justify-center items-center text-center animate-in fade-in duration-500">
           <div className="h-10 w-10 bg-signal-positive rounded-full flex items-center justify-center mb-3">
             <Check className="h-5 w-5 text-white" />
           </div>
           <h4 className="font-serif text-lg text-ink-900">Sent to {artifact.recipient.name}</h4>
           <p className="text-sm text-ink-700 mt-1">Approval recorded.</p>
         </Card>
       );
     }

     if (localStatus === "REJECTED") {
       return (
         <Card className="p-4 bg-paper-100 border-paper-200 flex flex-col justify-center items-center text-center animate-in fade-in">
           <div className="h-10 w-10 bg-ink-400 rounded-full flex items-center justify-center mb-3">
             <X className="h-5 w-5 text-white" />
           </div>
           <h4 className="font-serif text-lg text-ink-900">Rejected draft for {artifact.recipient.name}</h4>
         </Card>
       );
     }

     return (
       <>
         <Card className="p-5 bg-ink-0 border-paper-200 shadow-sm transition-shadow duration-200 hover:shadow-md">
   ```
   **AFTER** (note: `motion` props on the result cards are gated on `!reduced` via spreading
   an empty object when reduced, so reduced-motion users get an instant swap):
   ```tsx
     const motionProps = reduced
       ? {}
       : {
           variants: cardEnter,
           initial: "hidden" as const,
           animate: "visible" as const,
           exit: "exit" as const,
         };

     if (localStatus === "SENT") {
       return (
         <AnimatePresence mode="wait">
           <motion.div key="sent" {...motionProps}>
             <Card className="p-4 bg-signal-positive/5 border-signal-positive/20 shadow-sm flex flex-col justify-center items-center text-center">
               <div className="h-10 w-10 bg-signal-positive rounded-full flex items-center justify-center mb-3">
                 <Check className="h-5 w-5 text-white" />
               </div>
               <h4 className="font-serif text-lg text-ink-900">Sent to {artifact.recipient.name}</h4>
               <p className="text-sm text-ink-700 mt-1">Approval recorded.</p>
             </Card>
           </motion.div>
         </AnimatePresence>
       );
     }

     if (localStatus === "REJECTED") {
       return (
         <AnimatePresence mode="wait">
           <motion.div key="rejected" {...motionProps}>
             <Card className="p-4 bg-paper-100 border-paper-200 shadow-sm flex flex-col justify-center items-center text-center">
               <div className="h-10 w-10 bg-ink-400 rounded-full flex items-center justify-center mb-3">
                 <X className="h-5 w-5 text-white" />
               </div>
               <h4 className="font-serif text-lg text-ink-900">Rejected draft for {artifact.recipient.name}</h4>
             </Card>
           </motion.div>
         </AnimatePresence>
       );
     }

     return (
       <>
         <Card className="p-5 bg-ink-0 border-paper-200 shadow-sm transition-shadow duration-200 hover:shadow-md">
   ```
   (Each branch gets its own single-child `AnimatePresence` keyed by a stable string so the
   entering result card runs `cardEnter` `visible`. The decision-time exit of the *pending*
   card is carried by the list-level wrapper from R-outbound-1 when React unmounts/swaps the
   card on `localStatus` change; keeping `mode="wait"` here ensures the result card's own
   entrance does not overlap. The redundant `animate-in fade-in*` utilities are removed since
   `cardEnter` now owns the motion. The result cards also gain `shadow-sm` to match the warm
   depth convention.)

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `cardEnter` is a valid `Variants` export from `@/lib/motion`;
   `AnimatePresence`/`motion` resolve from the runtime `framer-motion` dependency.

5. **Visual verify (light + dark):** start the dev server, navigate to `/outbound`
   (Pending tab), click **Approve** on a card and watch it fade-scale to the green "Sent"
   result card; click **Reject → Confirm** on another and watch the grey "Rejected" result
   card animate in. Repeat in dark mode via the topbar `ThemeToggle`. Screenshot both.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: the pending→result swap reads as one smooth `cardEnter` transition (no hard cut),
   warm shadow present on all card states, in both themes. Stop the dev server.

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/v2/ApprovalCard.tsx && \
     git commit -m "feat(outbound): animate approve/reject result cards via cardEnter

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-outbound-3: Smooth status-tab transition + per-tab EmptyState

Two changes in `Outbound.tsx`: (1) crossfade the queue body when the active tab changes by
wrapping the `<ArtifactList/>` mount in `<AnimatePresence>` keyed on `activeTab`; (2) replace
the hand-rolled `opacity-40` empty block with the shared `<EmptyState>`, with copy + icon
tailored per tab.

**Files:**
- `artifacts/workforce-os/src/pages/Outbound.tsx` (lines 73–90, 107, 125–133)

**Steps:**

1. Crossfade the queue body on tab change. **BEFORE** (lines 86–88, inside the `Tabs`
   body):
   ```tsx
             <div className="flex-1 overflow-y-auto p-6 md:p-8">
               <ArtifactList status={activeTab === "ALL" ? undefined : activeTab} />
             </div>
   ```
   **AFTER:**
   ```tsx
             <div className="flex-1 overflow-y-auto p-6 md:p-8">
               <AnimatePresence mode="wait" initial={false}>
                 <motion.div
                   key={activeTab}
                   variants={fadeIn}
                   initial="hidden"
                   animate="visible"
                   exit="exit"
                 >
                   <ArtifactList status={activeTab === "ALL" ? undefined : activeTab} />
                 </motion.div>
               </AnimatePresence>
             </div>
   ```
   `fadeIn` is the calm opacity-only variant — right for a tab swap (no vertical jump while
   the list height changes). Add it to the motion import you created in R-outbound-1.
   **BEFORE** (the import line added in R-outbound-1 step 4):
   ```tsx
   import { springHover, useReducedMotionSafe } from "@/lib/motion";
   ```
   **AFTER:**
   ```tsx
   import { fadeIn, springHover, useReducedMotionSafe } from "@/lib/motion";
   ```
   (`AnimatePresence` + `motion` are already imported from R-outbound-1. The component-level
   `Outbound()` does not call `useReducedMotionSafe`; `fadeIn`'s reduced-motion behavior is
   handled by framer respecting the user's preference on the short opacity tween, and the
   inner list still gates its own motion. If you prefer to hard-gate, the `Outbound()`
   function can read `const reduced = useReducedMotionSafe();` and pass
   `variants={reduced ? undefined : fadeIn}` — optional, not required to pass verify.)

2. Replace the hand-rolled empty block with `<EmptyState>`, choosing icon + copy per tab.
   The `status` prop on `ArtifactList` is `undefined` for the ALL tab. **BEFORE**
   (lines 125–133):
   ```tsx
     if (items.length === 0) {
       return (
         <div className="flex flex-col items-center justify-center py-32 text-center max-w-md mx-auto opacity-40">
           <ShieldAlert className="w-16 h-16 text-ink-400 mb-4" />
           <h3 className="font-serif text-xl text-ink-900 mb-2">Queue Clear</h3>
           <p className="text-ink-400 text-sm">No items matching this status found.</p>
         </div>
       );
     }
   ```
   **AFTER:**
   ```tsx
     if (items.length === 0) {
       const empty = {
         PENDING_REVIEW: {
           icon: CheckCircle2,
           title: "Queue clear",
           description: "No drafts are waiting on your review. New drafts land here as agents finish them.",
         },
         APPROVED: {
           icon: Check,
           title: "Nothing approved yet",
           description: "Approved drafts queue here before they send. Approve a pending draft to get started.",
         },
         SENT: {
           icon: Send,
           title: "No sends yet",
           description: "Once approved drafts go out, they'll show up here with delivery status.",
         },
         REJECTED: {
           icon: ThumbsDown,
           title: "No rejections",
           description: "Drafts you reject — and the reason why — collect here to tune future agent output.",
         },
       } as const;
       const e = status ? empty[status] : {
         icon: Inbox,
         title: "Nothing outbound",
         description: "No outbound drafts across any status yet. Agents will populate this queue as they run.",
       };
       return <EmptyState icon={e.icon} title={e.title} description={e.description} />;
     }
   ```
   (Icons `CheckCircle2`, `Check`, `Send`, `ThumbsDown`, `Inbox` are all imported in
   R-outbound-1 step 4. `EmptyState`'s signature is `{ icon, title, description, action? }`
   from PRIMITIVES Task P3.)

3. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. The `empty` lookup is keyed on the four non-`ALL`
   `OutreachArtifactStatus` literals, which is exactly the type of `status` when defined;
   `status` being `undefined` (ALL tab) takes the fallback branch — TypeScript narrows this
   correctly with the `status ?` guard.

4. **Visual verify (light + dark):** dev server up, navigate to `/outbound`. Click through
   the **All / Pending / Approved / Sent / Rejected** tabs — the body should crossfade (no
   hard cut). Find/force an empty tab (e.g. Rejected on a fresh seed) and confirm the editorial
   `<EmptyState>` renders with the per-tab icon + copy (Lora title, muted body, centered
   circular icon chip) instead of the old faded block. Toggle dark mode and re-check.
   Screenshot both themes.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: smooth tab crossfade; tab-specific empty states; readable in both themes. Stop
   the dev server.

5. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Outbound.tsx && \
     git commit -m "feat(outbound): crossfade status tabs + per-tab EmptyState

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-outbound-4: ErrorState on failed artifact fetch

`ArtifactList` ignores `useListArtifacts`'s error — a failed/aborted fetch currently falls
through to the empty state, lying to the user. Add an explicit error branch that renders the
shared `<ErrorState onRetry={refetch}>`. `isError`/`refetch` were already destructured in
R-outbound-1 step 5.

**Files:**
- `artifacts/workforce-os/src/pages/Outbound.tsx` (lines 114–123 region, immediately after
  the loading branch)

**Steps:**

1. Add the error branch directly after the `isLoading` skeleton branch and before the empty
   branch. **BEFORE** (lines 114–124, the `items` const through the start of the loading
   branch and into the empty branch — insert between the loading branch's closing `}` on
   line 123 and the `if (items.length === 0)` on line 125):
   ```tsx
     const items = draftsData?.items || [];

     if (isLoading) {
       return (
         <div className="max-w-3xl mx-auto space-y-6">
           <ApprovalCardSkeleton />
           <ApprovalCardSkeleton />
         </div>
       );
     }

     if (items.length === 0) {
   ```
   **AFTER:**
   ```tsx
     const items = draftsData?.items || [];

     if (isLoading) {
       return (
         <div className="max-w-3xl mx-auto space-y-6">
           <ApprovalCardSkeleton />
           <ApprovalCardSkeleton />
         </div>
       );
     }

     if (isError) {
       return (
         <ErrorState
           title="Couldn't load the outbound queue"
           description="The drafts service didn't respond. Your data is safe — try again."
           onRetry={() => refetch()}
         />
       );
     }

     if (items.length === 0) {
   ```
   (`ErrorState`'s signature is `{ title?, description?, onRetry? }` from PRIMITIVES Task P3;
   wrapping `refetch` in an arrow drops its return value to match the `() => void` prop type.)

2. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `isError` is `boolean` and `refetch` is callable on
   `UseQueryResult`; `() => refetch()` satisfies `onRetry?: () => void`.

3. **Visual verify (light + dark):** dev server up. Force an error by stopping the API/DB (or
   in devtools, block the `listArtifacts` request) and navigate to `/outbound`. Confirm the
   editorial `<ErrorState>` renders (rust-tinted AlertTriangle chip, Lora title, "Try again"
   button) instead of the empty state. Click **Try again** and confirm it re-fetches. Toggle
   dark mode and re-check. Screenshot both.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: error branch renders with working retry, in both themes. Stop the dev server.

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Outbound.tsx && \
     git commit -m "feat(outbound): render ErrorState with retry on failed draft fetch

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **FOUNDATION** (warm `--shadow-*`, palette, elevate) and **PRIMITIVES** (P1 motion lib,
  P2 `<Stagger>`, P3 `<EmptyState>`/`<ErrorState>`, P5 `sanitizeHtml`) must land first.
- **R-outbound-1 → R-outbound-3 → R-outbound-4**: R-1 adds the motion/state imports and the
  `isError`/`refetch` + `reduced` destructure that R-3 and R-4 consume; do them in order.
  R-outbound-2 is independent of R-3/R-4 (it only touches `ApprovalCard.tsx`) but should
  follow R-1 because R-1 changes the active card's `<Card>` className (line 78) that R-2's
  BEFORE block references.
- No cross-section symbol is renamed; every imported name (`Stagger`, `StaggerItem`,
  `EmptyState`, `ErrorState`, `cardEnter`, `fadeIn`, `springHover`, `useReducedMotionSafe`,
  `sanitizeHtml`) matches the SHARED CONTRACT exactly.


---

## Section 44 — ROUTE: ARTIFACT DETAIL (`/outbound/:id`)

Premium pass for `artifacts/workforce-os/src/pages/ArtifactDetail.tsx` — the
single-artifact review surface (email preview + evaluator quality scores + send
policy + approve/reject/suppress). This section applies the foundation treatment
(warm depth via `shadow-*`, `cardEnter`/`Stagger` motion, `springHover`/active-press
micro-interactions, unified `<EmptyState>`/`<ErrorState>`) **and** closes four
concrete leaks that exist in the current file:

1. **XSS leak — `bodyHtml` is injected raw.** Line 96–99 renders
   `dangerouslySetInnerHTML={{ __html: data.bodyHtml }}` with no sanitizer. Wrap in
   `sanitizeHtml()` from `@/lib/sanitize` (CONTRACT).
2. **Flat evaluator Quality Score visuals.** `ScoreBar` (lines 19–31) uses raw
   `bg-green-500`/`bg-amber-400`/`bg-red-400` Tailwind colors (off-palette), a flat
   track, and no depth or motion. Re-skin to brand `signal-*`/`ember`/`rust` tokens,
   color-by-threshold, add a `<CountUp>` percent and bar fill animation.
3. **No error branch.** Lines 54–61 handle `isLoading` and the falsy-`data` case
   (rendered as a bare `Artifact not found` string), but never handle `isError`. Add
   `<ErrorState onRetry={refetch}>` for fetch failure and route the genuinely-missing
   artifact through `<EmptyState>`.
4. **Email preview surface sits flat.** The preview card (lines 90–101) is
   `border + rounded-lg` with no elevation; it should be the focal "paper" surface —
   raise it with `shadow-md` and a subtle hover lift so it reads as the document.

Everything below references the shared primitives created in Sections 10/20 by their
fixed CONTRACT paths/props:
- Motion variants from `@/lib/motion`: `cardEnter`, `springHover`,
  `useReducedMotionSafe`.
- `<Stagger>` / `<StaggerItem>` from `@/components/motion/Stagger`.
- `<CountUp value decimals? suffix? className? />` from `@/components/motion/CountUp`.
- `<EmptyState icon title description action? />` /
  `<ErrorState title? description? onRetry? />` from `@/components/states/`.
- `sanitizeHtml(html: string): string` from `@/lib/sanitize`.
- Warm shadow utilities `shadow-xs/sm/md/lg` + `.hover-elevate`/`.active-elevate-2`
  (registered in `src/index.css` by Section 10).

> Dependency note: this section assumes Sections 10 (foundation: shadow tokens,
> elevate utilities) and 20 (primitives: motion lib, motion components, state
> components, `sanitize.ts`) have already landed. All imports below resolve against
> those files.

---

### Task R-artifactdetail-1: Sanitize `bodyHtml` + raise the email-preview surface

Close the XSS leak at the only `dangerouslySetInnerHTML` on this route and promote the
email card to the focal elevated surface with a hover lift.

**Files:**
- Modify: `artifacts/workforce-os/src/pages/ArtifactDetail.tsx` (imports line 1–17;
  preview card lines 89–101)

1. Add the `sanitizeHtml` import and the `motion` + `springHover`/`useReducedMotionSafe`
   imports. **Before** (lines 16–17):

   ```tsx
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   ```

   **After:**

   ```tsx
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   import { motion } from "framer-motion";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { springHover, useReducedMotionSafe } from "@/lib/motion";
   ```

2. Inside `ArtifactDetail()`, read the reduced-motion flag once so the card can opt out
   of the hover lift. **Before** (lines 37–38):

   ```tsx
   const [rejectOpen, setRejectOpen] = React.useState(false);
   const [rejectReason, setRejectReason] = React.useState("");
   ```

   **After:**

   ```tsx
   const [rejectOpen, setRejectOpen] = React.useState(false);
   const [rejectReason, setRejectReason] = React.useState("");
   const reduced = useReducedMotionSafe();
   ```

3. Raise the email-preview card and sanitize the body. **Before** (lines 89–101):

   ```tsx
   <div className="lg:col-span-2 space-y-4">
     <div className="bg-white border border-paper-200 rounded-lg overflow-hidden">
       <div className="px-5 py-4 border-b border-paper-100 bg-paper-50">
         <p className="text-xs text-ink-400 uppercase tracking-wide mb-1">Subject</p>
         <p className="text-sm font-medium text-ink-900">{data.subject}</p>
       </div>
       <div className="px-5 py-4">
         <div
           className="text-sm text-ink-800 leading-relaxed prose prose-sm max-w-none"
           dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
         />
       </div>
     </div>
   ```

   **After:**

   ```tsx
   <div className="lg:col-span-2 space-y-4">
     <motion.div
       className="bg-white border border-paper-200 rounded-xl overflow-hidden shadow-md transition-shadow hover:shadow-lg"
       variants={reduced ? undefined : springHover}
       initial="rest"
       whileHover="hover"
     >
       <div className="px-5 py-4 border-b border-paper-100 bg-paper-50">
         <p className="text-xs text-ink-400 uppercase tracking-wide mb-1">Subject</p>
         <p className="text-sm font-medium text-ink-900">{data.subject}</p>
       </div>
       <div className="px-5 py-4">
         <div
           className="text-sm text-ink-800 leading-relaxed prose prose-sm max-w-none"
           dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.bodyHtml) }}
         />
       </div>
     </motion.div>
   ```

   Note: the closing tag of this card on line 101 (`</div>`) becomes `</motion.div>`.

4. Update the preview card's closing tag. **Before** (line 101):

   ```tsx
       </div>
   ```

   (the `</div>` that closes the email card, immediately before the `{/* Citations */}`
   comment)

   **After:**

   ```tsx
       </motion.div>
   ```

5. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: passes (exit 0). `springHover` is a `Variants`; `motion.div` accepts
   `variants`/`initial`/`whileHover`; `sanitizeHtml` returns `string`, so
   `__html` stays typed.

6. **Verify (build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)
   ```

   Expected: build succeeds. `framer-motion`, `@/lib/sanitize`, `@/lib/motion` all
   resolve (created in Section 20).

7. **Verify (no raw injection remains):**

   ```bash
   grep -n "dangerouslySetInnerHTML" artifacts/workforce-os/src/pages/ArtifactDetail.tsx
   ```

   Expected: exactly **one** match, and the line contains `sanitizeHtml(data.bodyHtml)`
   — no remaining `__html: data.bodyHtml` (unsanitized).

8. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/ArtifactDetail.tsx && \
     git commit -m "fix(artifact-detail): sanitize bodyHtml + raise email preview surface

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-artifactdetail-2: Premium evaluator Quality Score visuals (depth, color-by-threshold, motion)

Re-skin `ScoreBar` to the brand palette with `signal-*`/`ember`/`rust` thresholds, give
the track inset depth, animate the fill width, and replace the static percent text with
`<CountUp>`.

**Files:**
- Modify: `artifacts/workforce-os/src/pages/ArtifactDetail.tsx` (`ScoreBar` lines 19–31;
  `CountUp` import line 1–17)

1. Add the `<CountUp>` import. **Before** (the import added in Task 1, lines 16–21 after
   that edit):

   ```tsx
   import { motion } from "framer-motion";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { springHover, useReducedMotionSafe } from "@/lib/motion";
   ```

   **After:**

   ```tsx
   import { motion } from "framer-motion";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { springHover, useReducedMotionSafe } from "@/lib/motion";
   import { CountUp } from "@/components/motion/CountUp";
   ```

2. Replace the entire `ScoreBar` component. **Before** (lines 19–31):

   ```tsx
   function ScoreBar({ label, value }: { label: string; value: number }) {
     const pct = Math.round(value * 100);
     const color = pct >= 85 ? "bg-green-500" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
     return (
       <div className="flex items-center gap-2">
         <span className="text-xs text-ink-600 w-32 shrink-0">{label}</span>
         <div className="flex-1 h-1.5 bg-paper-200 rounded-full overflow-hidden">
           <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
         </div>
         <span className="text-xs font-mono text-ink-700 w-8 text-right">{pct}%</span>
       </div>
     );
   }
   ```

   **After:**

   ```tsx
   function ScoreBar({ label, value }: { label: string; value: number }) {
     const reduced = useReducedMotionSafe();
     const pct = Math.round(value * 100);
     // Brand thresholds: signal-positive (pass) / ember (caution) / rust (fail).
     const fill =
       pct >= 85
         ? "bg-signal-positive"
         : pct >= 70
           ? "bg-ember-400"
           : "bg-rust-500";
     const text =
       pct >= 85
         ? "text-signal-positive"
         : pct >= 70
           ? "text-ember-500"
           : "text-rust-500";
     return (
       <div className="flex items-center gap-3">
         <span className="text-xs text-ink-600 w-32 shrink-0">{label}</span>
         <div className="flex-1 h-2 bg-paper-200 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(20,12,8,0.08)]">
           <motion.div
             className={cn("h-full rounded-full", fill)}
             initial={reduced ? false : { width: 0 }}
             animate={{ width: `${pct}%` }}
             transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
           />
         </div>
         <CountUp
           value={pct}
           suffix="%"
           className={cn("text-xs font-mono w-9 text-right font-tabular", text)}
         />
       </div>
     );
   }
   ```

3. Raise the Quality Scores sidebar card so the new bars read with depth. **Before**
   (lines 157–167):

   ```tsx
   {scores && (
     <div className="bg-white border border-paper-200 rounded-lg p-4">
       <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Quality Scores</h3>
       <div className="space-y-2">
         <ScoreBar label="PII check" value={scores.pii} />
         <ScoreBar label="Hallucination" value={scores.hallucination} />
         <ScoreBar label="Citation coverage" value={scores.citationCoverage} />
         {scores.toxicity != null && <ScoreBar label="Toxicity" value={scores.toxicity} />}
       </div>
     </div>
   )}
   ```

   **After:**

   ```tsx
   {scores && (
     <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
       <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Quality Scores</h3>
       <div className="space-y-2.5">
         <ScoreBar label="PII check" value={scores.pii} />
         <ScoreBar label="Hallucination" value={scores.hallucination} />
         <ScoreBar label="Citation coverage" value={scores.citationCoverage} />
         {scores.toxicity != null && <ScoreBar label="Toxicity" value={scores.toxicity} />}
       </div>
     </div>
   )}
   ```

4. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: passes (exit 0). `<CountUp value={pct} suffix="%" className=…/>` matches the
   `CountUpProps` signature; `motion.div animate={{ width }}` is valid.

5. **Verify (build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)
   ```

   Expected: build succeeds.

6. **Verify (off-palette colors removed):**

   ```bash
   grep -nE "bg-green-500|bg-amber-400|bg-red-400" artifacts/workforce-os/src/pages/ArtifactDetail.tsx
   ```

   Expected: **no matches** — all evaluator bar colors now use `signal-*`/`ember`/`rust`
   tokens.

7. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/ArtifactDetail.tsx && \
     git commit -m "feat(artifact-detail): premium evaluator score bars (depth, threshold color, CountUp)

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-artifactdetail-3: Unified error/empty states + staggered card entrance

Replace the bare `Artifact not found` string with proper `<EmptyState>`/`<ErrorState>`,
wire `isError`, and stagger the page's cards in on mount.

**Files:**
- Modify: `artifacts/workforce-os/src/pages/ArtifactDetail.tsx` (imports line 1–17;
  loading/error/empty branches lines 40–61; layout grid lines 87–120)

1. Add the state-component + icon imports and `Stagger`/`StaggerItem`. **Before** (line
   15):

   ```tsx
   import { ArrowLeft, CheckCircle2, XCircle, ShieldOff } from "lucide-react";
   ```

   **After:**

   ```tsx
   import { ArrowLeft, CheckCircle2, XCircle, ShieldOff, FileX2 } from "lucide-react";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   ```

2. Pull `isError` off the query so we can branch on it. **Before** (lines 40–42):

   ```tsx
   const { data, isLoading, refetch } = useGetArtifact(id, {
     query: { queryKey: ["getArtifact", id], enabled: !!id },
   });
   ```

   **After:**

   ```tsx
   const { data, isLoading, isError, refetch } = useGetArtifact(id, {
     query: { queryKey: ["getArtifact", id], enabled: !!id },
   });
   ```

3. Replace the loading + not-found branches with loading + error + empty. **Before**
   (lines 54–61):

   ```tsx
   if (isLoading) return (
     <div className="p-6 space-y-4 max-w-4xl mx-auto">
       <Skeleton className="h-8 w-40" />
       <Skeleton className="h-64 w-full" />
     </div>
   );

   if (!data) return <div className="p-6 text-ink-400">Artifact not found</div>;
   ```

   **After:**

   ```tsx
   if (isLoading) return (
     <div className="p-6 space-y-4 max-w-4xl mx-auto">
       <Skeleton className="h-8 w-40" />
       <Skeleton className="h-64 w-full" />
     </div>
   );

   if (isError) return (
     <div className="flex h-full items-center justify-center bg-paper-50">
       <ErrorState
         title="Couldn't load this draft"
         description="The artifact failed to load. Check your connection and try again."
         onRetry={() => refetch()}
       />
     </div>
   );

   if (!data) return (
     <div className="flex h-full items-center justify-center bg-paper-50">
       <EmptyState
         icon={FileX2}
         title="Artifact not found"
         description="This draft may have been deleted or never existed."
         action={
           <Button
             variant="outline"
             size="sm"
             className="border-paper-300 hover-elevate active-elevate-2"
             onClick={() => navigate("/outbound")}
           >
             <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Outbound
           </Button>
         }
       />
     </div>
   );
   ```

4. Wrap the two-column body in `<Stagger>` so the cards animate in, and lift each column
   card via `<StaggerItem>` + `cardEnter`. The simplest in-place change keeps the grid but
   makes it the stagger container. **Before** (lines 87–89):

   ```tsx
   <div className="max-w-5xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
     {/* Email preview */}
     <div className="lg:col-span-2 space-y-4">
   ```

   **After:**

   ```tsx
   <Stagger className="max-w-5xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
     {/* Email preview */}
     <StaggerItem className="lg:col-span-2 space-y-4">
   ```

5. Close the left column with `</StaggerItem>` and open the sidebar as a `<StaggerItem>`.
   **Before** (lines 117–120):

   ```tsx
       </div>

       {/* Sidebar */}
       <div className="space-y-4">
   ```

   **After:**

   ```tsx
       </StaggerItem>

       {/* Sidebar */}
       <StaggerItem className="space-y-4">
   ```

6. Close the sidebar `<StaggerItem>` and the `<Stagger>` container. **Before** (lines
   187–188):

   ```tsx
       </div>
     </div>
   ```

   (the two closing `</div>`s before the `{/* Reject dialog */}` comment — the first
   closes the sidebar column, the second closes the grid)

   **After:**

   ```tsx
       </StaggerItem>
     </Stagger>
   ```

7. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: passes (exit 0). `<EmptyState icon={FileX2} …>` matches `EmptyStateProps`
   (`icon: LucideIcon`); `<ErrorState onRetry={() => refetch()}>` matches `ErrorStateProps`;
   `<Stagger>`/`<StaggerItem>` accept `className` + `children`.

8. **Verify (build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)
   ```

   Expected: build succeeds.

9. **Verify (no bare not-found string remains):**

   ```bash
   grep -n "Artifact not found</div>" artifacts/workforce-os/src/pages/ArtifactDetail.tsx
   ```

   Expected: **no matches** — the legacy `<div className="p-6 text-ink-400">Artifact not
   found</div>` is gone, replaced by `<EmptyState>`.

10. **Commit:**

    ```bash
    (cd /Users/nikhil/Downloads/Workforce-OS && \
      git add artifacts/workforce-os/src/pages/ArtifactDetail.tsx && \
      git commit -m "feat(artifact-detail): unified Error/Empty states + staggered card entrance

    Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
    ```

---

### Task R-artifactdetail-4: Hover/press micro-interactions on action + supporting cards

Apply `.hover-elevate`/`.active-elevate-2` press affordance to the approve/reject/suppress
buttons and raise the supporting sidebar cards (Actions, Recipient, Send Policy) to match
the new depth language.

**Files:**
- Modify: `artifacts/workforce-os/src/pages/ArtifactDetail.tsx` (Actions card lines
  121–145; Recipient card lines 147–154; Send Policy card lines 169–186)

1. Raise the Actions card and add press affordance to its three buttons. **Before**
   (lines 122–145):

   ```tsx
   {isPending && (
     <div className="bg-white border border-paper-200 rounded-lg p-4 space-y-2">
       <Button
         className="w-full bg-rust-500 hover:bg-rust-600 text-white"
         onClick={() => approve({ id })}
       >
         <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
       </Button>
       <Button
         variant="outline"
         className="w-full border-paper-300"
         onClick={() => setRejectOpen(true)}
       >
         <XCircle className="h-4 w-4 mr-2" /> Reject
       </Button>
       <Button
         variant="ghost"
         className="w-full text-ink-500"
         onClick={() => suppress({ id })}
       >
         <ShieldOff className="h-4 w-4 mr-2" /> Suppress
       </Button>
     </div>
   )}
   ```

   **After:**

   ```tsx
   {isPending && (
     <div className="bg-white border border-paper-200 rounded-xl p-4 space-y-2 shadow-sm">
       <Button
         className="w-full bg-rust-500 hover:bg-rust-600 text-white shadow-sm active-elevate-2"
         onClick={() => approve({ id })}
       >
         <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
       </Button>
       <Button
         variant="outline"
         className="w-full border-paper-300 hover-elevate active-elevate-2"
         onClick={() => setRejectOpen(true)}
       >
         <XCircle className="h-4 w-4 mr-2" /> Reject
       </Button>
       <Button
         variant="ghost"
         className="w-full text-ink-500 hover-elevate active-elevate-2"
         onClick={() => suppress({ id })}
       >
         <ShieldOff className="h-4 w-4 mr-2" /> Suppress
       </Button>
     </div>
   )}
   ```

2. Raise the Recipient card. **Before** (line 148):

   ```tsx
       <div className="bg-white border border-paper-200 rounded-lg p-4">
         <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Recipient</h3>
   ```

   **After:**

   ```tsx
       <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
         <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Recipient</h3>
   ```

3. Raise the Send Policy card. **Before** (line 170):

   ```tsx
       <div className="bg-white border border-paper-200 rounded-lg p-4">
         <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Send Policy</h3>
   ```

   **After:**

   ```tsx
       <div className="bg-white border border-paper-200 rounded-xl p-4 shadow-sm">
         <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Send Policy</h3>
   ```

4. Re-skin the Send Policy status dots to brand `signal-*` tokens (currently raw
   `bg-green-500`/`bg-red-400`). **Before** (lines 180–183):

   ```tsx
       <div key={key} className="flex items-center gap-2 py-1">
         <div className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-green-500" : "bg-red-400")} />
         <span className="text-xs text-ink-600">{label}</span>
       </div>
   ```

   **After:**

   ```tsx
       <div key={key} className="flex items-center gap-2 py-1">
         <div className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-signal-positive" : "bg-rust-500")} />
         <span className="text-xs text-ink-600">{label}</span>
       </div>
   ```

5. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: passes (exit 0). Only `className` strings changed — no type surface moved.

6. **Verify (build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)
   ```

   Expected: build succeeds.

7. **Verify (elevate utilities present + no off-palette dots):**

   ```bash
   grep -c "active-elevate-2" artifacts/workforce-os/src/pages/ArtifactDetail.tsx; \
   grep -nE "bg-green-500|bg-red-400" artifacts/workforce-os/src/pages/ArtifactDetail.tsx
   ```

   Expected: first count is `3` (the three action buttons); second grep returns **no
   matches** (policy dots now `signal-positive`/`rust-500`).

8. **Visual verify (light + dark, both states):** start the dev server and Playwright-
   screenshot `/outbound/:id` for a real **PENDING_REVIEW** artifact in light AND dark.
   Confirm: (a) sanitized email body renders inside the elevated `shadow-md` preview card
   and lifts on hover; (b) Quality Score bars animate their fill and the percent counts
   up, colored green/amber/rust by threshold; (c) cards stagger in on load; (d) Approve/
   Reject/Suppress show the press (`active-elevate-2`) affordance. Then hit a bad id (e.g.
   `/outbound/does-not-exist`) and confirm the `<EmptyState>` renders with the "Back to
   Outbound" action.

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)
   ```

   Expected: all four behaviors visible; no console errors; dark mode uses `ink-*` surfaces
   (the `bg-white` cards intentionally stay paper-white as the document surface — matches
   the Outbound/ApprovalCard treatment).

9. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/ArtifactDetail.tsx && \
     git commit -m "feat(artifact-detail): card depth + hover/press micro-interactions + signal-token policy dots

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section 44 — Done criteria

- [ ] `bodyHtml` rendered only through `sanitizeHtml()` — exactly one
      `dangerouslySetInnerHTML` and it is sanitized.
- [ ] Evaluator Quality Score bars use brand `signal-positive`/`ember`/`rust` thresholds,
      inset-shadow track, animated fill, and `<CountUp>` percent. No `bg-green-500`/
      `bg-amber-400`/`bg-red-400` anywhere in the file.
- [ ] Email-preview card raised to `shadow-md` (hover `shadow-lg`) and lifts via
      `springHover`.
- [ ] Fetch failure shows `<ErrorState onRetry={refetch}>`; missing artifact shows
      `<EmptyState>` with a "Back to Outbound" action — no bare strings.
- [ ] Page cards enter via `<Stagger>`/`<StaggerItem>`; action buttons + supporting cards
      carry depth + `.hover-elevate`/`.active-elevate-2`.
- [ ] All four tasks: `typecheck` + `build` pass; visual verified light + dark; each
      committed with the Co-Authored-By trailer.
- [ ] All motion respects `useReducedMotionSafe()` (preview lift, score-bar fill, page
      stagger all opt out under reduced motion).


---

## ROUTE — CONVERSATIONS

This section applies the Nikxius premium treatment to the **conversations** surface and
closes its specific leaks. The surface spans three files:

- `pages/Conversations.tsx` — the split **inbox** (left thread list + right detail pane).
- `components/v2/ConversationThread.tsx` — the preview-card + full-thread renderer the
  inbox composes (`mode="preview"` and `mode="full"`).
- `pages/ConversationThread.tsx` — the standalone `/conversations/:id` route (mobile / deep
  link) wired in `App.tsx` line 41.

### Grounding facts (verified against the live tree on 2026-06-07)

- **The search box is decorative.** `pages/Conversations.tsx` lines 46-49 render an `<Input
  placeholder="Search conversations…">` with **no `value`, no `onChange`** — it filters
  nothing. R-conversations-1 binds it.
- **Two hand-rolled empties + one hand-rolled "not found".**
  `Conversations.tsx` lines 82-86 (`<Inbox/>` + "No conversations match your criteria.") and
  lines 103-108 (`<Inbox/>` + "No conversation selected"). `ConversationThread.tsx` line 48
  (`<div className="p-6 text-ink-400">Conversation not found</div>`). All replaced by
  `<EmptyState>` / `<ErrorState>`.
- **No error handling anywhere.** Neither page reads `isError`/`error` from the query, so a
  failed `useListConversations`/`useGetConversation` silently shows the empty/skeleton state
  forever. R-conversations-1 adds `<ErrorState onRetry={refetch}>` to the inbox; the standalone
  `/conversations/:id` route's error state is handled in section 50 (R-convothread-4).
- **Two unsanitized HTML sinks.** `components/v2/ConversationThread.tsx` line 155 and
  `pages/ConversationThread.tsx` line 87 both do
  `dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}` on server-supplied email bodies with
  **no sanitizer**. R-conversations-2 wraps the v2 component's sink; the `pages/ConversationThread.tsx`
  sink is sanitized in section 50 (R-convothread-1).
- **The list maps `<ConversationThread mode="preview">` directly** (`Conversations.tsx`
  lines 88-96) with no entrance animation. R-conversations-3 wraps the list in `<Stagger>` /
  `<StaggerItem>`.
- **Depends on:** FOUNDATION (palette, warm shadow tokens `--shadow-xs/sm/md/lg`,
  `.hover-elevate`/`.active-elevate-2`) and PRIMITIVES (P1 motion lib, P2 `<Stagger>`/
  `<StaggerItem>`, P3 `<EmptyState>`/`<ErrorState>`, P5 `sanitizeHtml`). All names used
  below match the SHARED CONTRACT exactly.
- The `Conversation` preview type exposes `id, leadName, leadCompany?, subject,
  lastMessagePreview, lastMessageAt, unread, needsReply, leadAvatarUrl?,
  replyIntelligence.sentiment` (confirmed from existing reads in `v2/ConversationThread.tsx`
  lines 56-74). The client filter in R-conversations-1 reads only `leadName`, `subject`,
  `lastMessagePreview` — all present.

---

### Task R-conversations-1: Bind the search box + add list error/empty states to the inbox

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Conversations.tsx`
  - imports (lines 1-8)
  - state + query (lines 17-36)
  - search `<Input>` (lines 46-49)
  - thread-list body (lines 70-98)

**Steps:**

1. Update the imports. Replace lines 1-8:

   **BEFORE** (lines 1-8):
   ```tsx
   import React, { useState } from "react";
   import { useListConversations, useGetConversation, ListConversationsSentiment } from "@workspace/api-client-react";
   import { ConversationThread } from "@/components/v2/ConversationThread";
   import { Input } from "@/components/ui/input";
   import { Badge } from "@/components/ui/badge";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Search, Inbox } from "lucide-react";
   import { cn } from "@/lib/utils";
   ```

   **AFTER**:
   ```tsx
   import React, { useMemo, useState } from "react";
   import { useListConversations, useGetConversation, ListConversationsSentiment } from "@workspace/api-client-react";
   import { ConversationThread } from "@/components/v2/ConversationThread";
   import { Input } from "@/components/ui/input";
   import { Badge } from "@/components/ui/badge";
   import { Skeleton } from "@/components/ui/skeleton";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { Search, Inbox, SearchX } from "lucide-react";
   import { cn } from "@/lib/utils";
   ```

2. Add the search-query state and read `isError`/`error`/`refetch` off the list query, then
   derive the filtered list. Replace lines 17-36:

   **BEFORE** (lines 17-36):
   ```tsx
   export default function Conversations() {
     const [activeFilter, setActiveFilter] = useState("all");
     const [selectedId, setSelectedId] = useState<string | null>(null);

     const queryParams: any = { limit: 50 };
     if (activeFilter === "needs_reply") queryParams.needsReply = true;
     if (activeFilter === "positive") queryParams.sentiment = "positive" as ListConversationsSentiment;
     if (activeFilter === "objection") queryParams.sentiment = "objection" as ListConversationsSentiment;

     const { data: listData, isLoading: listLoading } = useListConversations(
       queryParams,
       { query: { refetchInterval: 15000, queryKey: ["listConversations", activeFilter] } }
     );

     const conversations = listData?.items || [];

     const { data: detailData, isLoading: detailLoading } = useGetConversation(
       selectedId || "",
       { query: { enabled: !!selectedId, queryKey: ["getConversation", selectedId] } }
     );
   ```

   **AFTER**:
   ```tsx
   export default function Conversations() {
     const [activeFilter, setActiveFilter] = useState("all");
     const [selectedId, setSelectedId] = useState<string | null>(null);
     const [search, setSearch] = useState("");

     const queryParams: any = { limit: 50 };
     if (activeFilter === "needs_reply") queryParams.needsReply = true;
     if (activeFilter === "positive") queryParams.sentiment = "positive" as ListConversationsSentiment;
     if (activeFilter === "objection") queryParams.sentiment = "objection" as ListConversationsSentiment;

     const {
       data: listData,
       isLoading: listLoading,
       isError: listError,
       refetch: refetchList,
     } = useListConversations(
       queryParams,
       { query: { refetchInterval: 15000, queryKey: ["listConversations", activeFilter] } }
     );

     const allConversations = listData?.items || [];

     const conversations = useMemo(() => {
       const q = search.trim().toLowerCase();
       if (!q) return allConversations;
       return allConversations.filter((c) =>
         [c.leadName, c.subject, c.lastMessagePreview]
           .filter(Boolean)
           .some((field) => field!.toLowerCase().includes(q))
       );
     }, [allConversations, search]);

     const { data: detailData, isLoading: detailLoading } = useGetConversation(
       selectedId || "",
       { query: { enabled: !!selectedId, queryKey: ["getConversation", selectedId] } }
     );
   ```

3. Bind the search `<Input>` to the new state. Replace lines 46-49:

   **BEFORE** (lines 46-49):
   ```tsx
           <Input 
             placeholder="Search conversations..." 
             className="pl-9 bg-paper-50 border-paper-200"
           />
   ```

   **AFTER**:
   ```tsx
           <Input
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             placeholder="Search conversations..."
             className="pl-9 bg-paper-50 border-paper-200"
           />
   ```

4. Replace the thread-list body so it (a) renders an `<ErrorState onRetry>` on query
   failure, (b) distinguishes "no search match" from "inbox empty" via `<EmptyState>`, and
   (c) wraps the rendered previews in `<Stagger>`/`<StaggerItem>`. Replace lines 70-98:

   **BEFORE** (lines 70-98):
   ```tsx
         <div className="flex-1 overflow-y-auto">
           {listLoading ? (
             Array.from({ length: 6 }).map((_, i) => (
               <div key={i} className="p-4 border-b border-paper-200 flex gap-3">
                 <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                 <div className="space-y-2 flex-1">
                   <Skeleton className="h-4 w-1/3" />
                   <Skeleton className="h-3 w-full" />
                   <Skeleton className="h-3 w-2/3" />
                 </div>
               </div>
             ))
           ) : conversations.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-ink-400 p-8 text-center">
               <Inbox className="w-12 h-12 mb-4 opacity-20" />
               <p className="text-sm">No conversations match your criteria.</p>
             </div>
           ) : (
             conversations.map(conv => (
               <ConversationThread 
                 key={conv.id} 
                 mode="preview" 
                 conversation={conv} 
                 selected={selectedId === conv.id}
                 onSelect={setSelectedId}
               />
             ))
           )}
         </div>
   ```

   **AFTER**:
   ```tsx
         <div className="flex-1 overflow-y-auto">
           {listLoading ? (
             Array.from({ length: 6 }).map((_, i) => (
               <div key={i} className="p-4 border-b border-paper-200 flex gap-3">
                 <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                 <div className="space-y-2 flex-1">
                   <Skeleton className="h-4 w-1/3" />
                   <Skeleton className="h-3 w-full" />
                   <Skeleton className="h-3 w-2/3" />
                 </div>
               </div>
             ))
           ) : listError ? (
             <ErrorState
               title="Couldn't load conversations"
               description="The inbox failed to load. Check your connection and try again."
               onRetry={() => refetchList()}
             />
           ) : conversations.length === 0 ? (
             search.trim() ? (
               <EmptyState
                 icon={SearchX}
                 title="No matches"
                 description={`No conversations match "${search.trim()}". Try a different search.`}
               />
             ) : (
               <EmptyState
                 icon={Inbox}
                 title="Inbox zero"
                 description="No conversations match this filter. New replies will appear here as they arrive."
               />
             )
           ) : (
             <Stagger>
               {conversations.map((conv) => (
                 <StaggerItem key={conv.id}>
                   <ConversationThread
                     mode="preview"
                     conversation={conv}
                     selected={selectedId === conv.id}
                     onSelect={setSelectedId}
                   />
                 </StaggerItem>
               ))}
             </Stagger>
           )}
         </div>
   ```

5. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. The `Inbox` import is still used (empty state), `SearchX` is newly
   used, and `Search` (the magnifier inside the input wrapper, line 45) is unchanged — no
   unused-import error.

6. **Visual verify:** start the dev server, navigate to `/conversations`, and with Playwright
   `browser_type` into the "Search conversations…" box. Confirm the thread list filters live
   to matching leads/subjects, and that an unmatched query shows the `<EmptyState>` "No
   matches" card (not the generic empty). Screenshot light **and** dark (toggle via the
   topbar). Compare against `baseline/conversations.png`.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```

7. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Conversations.tsx && \
     git commit -m "feat(conversations): bind search filter + Stagger list + Empty/ErrorState

   Binds the previously-decorative search box to a client-side filter over
   leadName/subject/lastMessagePreview, staggers the thread list in, and replaces
   the hand-rolled empty with EmptyState (distinct no-match vs inbox-zero) plus an
   ErrorState retry on list-query failure.

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-conversations-2: Premium preview card + sanitized full thread in the v2 component

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/v2/ConversationThread.tsx`
  - imports (lines 1-10)
  - preview card root (lines 43-49)
  - full-thread message body sink (lines 153-156)

**Steps:**

1. Add the `sanitizeHtml` import. Replace lines 7-10:

   **BEFORE** (lines 7-10):
   ```tsx
   import { formatDistanceToNow, format } from "date-fns";
   import { cn } from "@/lib/utils";
   import { Sparkles, Bot, AlertTriangle } from "lucide-react";
   import { toast } from "sonner";
   ```

   **AFTER**:
   ```tsx
   import { formatDistanceToNow, format } from "date-fns";
   import { cn } from "@/lib/utils";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { Sparkles, Bot, AlertTriangle } from "lucide-react";
   import { toast } from "sonner";
   ```

   (`AlertTriangle` is currently imported but unused in this file; leave it — removing it is
   out of scope and the hygiene section owns dead-import cleanup.)

2. Give the preview card a press/hover micro-interaction and selected-state depth. The card
   is the inbox's primary interactive object, so it lifts on hover and presses on active via
   the foundation `.hover-elevate`/`.active-elevate-2` utilities, plus a left rust rail when
   selected. Replace lines 43-49:

   **BEFORE** (lines 43-49):
   ```tsx
       return (
         <div 
           className={cn(
             "p-4 border-b border-paper-200 cursor-pointer hover:bg-paper-100 transition-colors flex gap-3 relative",
             selected && "bg-paper-100"
           )}
           onClick={() => onSelect?.(conversation.id)}
         >
   ```

   **AFTER**:
   ```tsx
       return (
         <div
           role="button"
           tabIndex={0}
           aria-pressed={selected}
           className={cn(
             "hover-elevate active-elevate-2 p-4 pl-5 border-b border-paper-200 cursor-pointer transition-colors flex gap-3 relative",
             "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust-500/40 focus-visible:ring-inset",
             selected
               ? "bg-paper-100 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-rust-500"
               : "hover:bg-paper-100/60"
           )}
           onClick={() => onSelect?.(conversation.id)}
           onKeyDown={(e) => {
             if (e.key === "Enter" || e.key === " ") {
               e.preventDefault();
               onSelect?.(conversation.id);
             }
           }}
         >
   ```

   > The unread dot at line 50-52 (`absolute left-2`) still reads fine against the new
   > `pl-5`; the selected rail sits at `left-0` so the two never collide.

3. Sanitize the full-thread message body. Replace lines 153-156:

   **BEFORE** (lines 153-156):
   ```tsx
                   <div 
                     className="prose prose-sm prose-ink max-w-none text-ink-700 leading-relaxed"
                     dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                   />
   ```

   **AFTER**:
   ```tsx
                   <div
                     className="prose prose-sm prose-ink max-w-none text-ink-700 leading-relaxed"
                     dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.bodyHtml) }}
                   />
   ```

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `sanitizeHtml` resolves from `@/lib/sanitize` (PRIMITIVES P5).

5. **Visual verify:** dev server up at `/conversations`, select a thread. Confirm the preview
   cards lift on hover (warm elevate overlay) and show the rust left-rail when selected, and
   that the full thread renders message bodies unchanged for benign HTML (DOMPurify keeps
   `<p>`/`<a>`/lists). Tab through the list to confirm the focus ring appears. Screenshot
   light **and** dark.

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/v2/ConversationThread.tsx && \
     git commit -m "feat(conversations): premium preview card + sanitize thread HTML sink

   Adds hover-elevate/active-elevate-2 press micro-interaction, a selected rust
   left-rail, and keyboard focus affordances to the preview card, and wraps the
   full-thread dangerouslySetInnerHTML body in sanitizeHtml.

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-conversations-3: Premium split view + EmptyState for the unselected detail pane

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Conversations.tsx`
  - inbox header surface (line 42)
  - detail pane (lines 101-120)

**Steps:**

1. Raise the inbox header onto a warm-shadowed surface so the split is visually anchored.
   Replace line 42:

   **BEFORE** (line 42):
   ```tsx
           <div className="p-4 border-b border-paper-200 space-y-4 shrink-0 bg-white">
   ```

   **AFTER**:
   ```tsx
           <div className="p-4 border-b border-paper-200 space-y-4 shrink-0 bg-ink-0 shadow-sm z-10">
   ```

   (`bg-white` → `bg-ink-0` so the surface flips in dark mode; `shadow-sm` is the warm
   ink-tinted token from FOUNDATION F3; `z-10` keeps the shadow above the scrolling list.)

2. Replace the unselected / loading / loaded detail pane so the "no conversation selected"
   message uses `<EmptyState>` and the loaded thread fades in via `cardEnter`. Replace lines
   101-120:

   **BEFORE** (lines 101-120):
   ```tsx
         {/* Detail View (Right) */}
         <div className="hidden md:flex flex-col flex-1 bg-paper-50 min-w-0">
           {!selectedId ? (
             <div className="flex flex-col items-center justify-center h-full text-ink-400">
               <Inbox className="w-16 h-16 mb-4 opacity-10" />
               <h3 className="font-serif text-xl text-ink-900 mb-2">No conversation selected</h3>
               <p className="text-sm max-w-sm text-center">Select a thread from the list to view the full message history and AI analysis.</p>
             </div>
           ) : detailLoading || !detailData ? (
             <div className="p-6 space-y-6 h-full flex flex-col">
               <Skeleton className="h-16 w-full" />
               <div className="flex-1 space-y-4">
                 <Skeleton className="h-32 w-[80%] ml-auto" />
                 <Skeleton className="h-24 w-[70%]" />
               </div>
             </div>
           ) : (
             <ConversationThread mode="full" detail={detailData} />
           )}
         </div>
   ```

   **AFTER**:
   ```tsx
         {/* Detail View (Right) */}
         <div className="hidden md:flex flex-col flex-1 bg-paper-50 min-w-0">
           {!selectedId ? (
             <EmptyState
               icon={MessageSquareText}
               title="No conversation selected"
               description="Select a thread from the list to view the full message history and AI analysis."
             />
           ) : detailLoading || !detailData ? (
             <div className="p-6 space-y-6 h-full flex flex-col">
               <Skeleton className="h-16 w-full" />
               <div className="flex-1 space-y-4">
                 <Skeleton className="h-32 w-[80%] ml-auto" />
                 <Skeleton className="h-24 w-[70%]" />
               </div>
             </div>
           ) : (
             <motion.div
               key={selectedId}
               variants={reduced ? undefined : cardEnter}
               initial={reduced ? false : "hidden"}
               animate={reduced ? false : "visible"}
               className="flex flex-col h-full min-w-0"
             >
               <ConversationThread mode="full" detail={detailData} />
             </motion.div>
           )}
         </div>
   ```

3. Wire the new imports + the reduced-motion guard this pane now uses. The detail pane needs
   `motion`, `cardEnter`, `useReducedMotionSafe`, and the `MessageSquareText` icon. Extend
   the import block from R-conversations-1 (lines 1-11). Replace the motion/icon lines:

   **BEFORE** (the two lines added/kept in R-conversations-1):
   ```tsx
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { Search, Inbox, SearchX } from "lucide-react";
   ```

   **AFTER**:
   ```tsx
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { motion } from "framer-motion";
   import { cardEnter, useReducedMotionSafe } from "@/lib/motion";
   import { Search, Inbox, SearchX, MessageSquareText } from "lucide-react";
   ```

   Then add the guard at the top of the component body, immediately after the `const [search,
   setSearch] = useState("")` line from R-conversations-1:

   **BEFORE**:
   ```tsx
     const [search, setSearch] = useState("");
   ```

   **AFTER**:
   ```tsx
     const [search, setSearch] = useState("");
     const reduced = useReducedMotionSafe();
   ```

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `Inbox` is still used by the inbox-zero `<EmptyState>` from
   R-conversations-1; `MessageSquareText` is newly used by the detail-pane empty.

5. **Visual verify:** dev server up at `/conversations`. With no thread selected, confirm the
   right pane shows the editorial `<EmptyState>` (rounded `MessageSquareText` chip, serif
   title) instead of the old faint `<Inbox>`. Click a thread and confirm the full thread
   fades/scales in (`cardEnter`); switch threads and confirm the re-mount animates (keyed on
   `selectedId`). Screenshot light **and** dark; verify the header `shadow-sm` reads warm in
   light and the split surfaces flip correctly in dark.

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Conversations.tsx && \
     git commit -m "feat(conversations): premium split view + EmptyState detail pane + cardEnter

   Raises the inbox header onto a warm shadow-sm surface, replaces the unselected
   detail-pane placeholder with EmptyState, and animates the loaded thread in with
   the cardEnter variant (reduced-motion safe, keyed on selection).

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-conversations-4 — moved to section 50 (convothread)

> The standalone `/conversations/:id` route (`pages/ConversationThread.tsx`) is owned in full by
> section **50-route-convothread** (tasks R-convothread-1..4: sanitize, bubble depth, message-enter
> motion, ErrorState). To avoid two sections editing the same file with contradictory edits, the
> original R-conversations-4 task was removed here. Section 45 owns only `pages/Conversations.tsx`
> (inbox list + split view) and `components/v2/ConversationThread.tsx` (the preview/full renderer).

---

### Section dependencies & ordering

- **R-conversations-1 → R-conversations-3** both edit `pages/Conversations.tsx`; do 1 first
  (it establishes the import block and the `search`/`reduced` state that 3 extends). Running
  3 before 1 would leave the `<Stagger>` import unreferenced and `motion`/`cardEnter` would
  collide with a not-yet-added import block.
- **R-conversations-2** is independent (only `components/v2/ConversationThread.tsx`) and may
  run any time after PRIMITIVES P5 (`sanitizeHtml`).
- **R-conversations-4** was moved to section 50 (convothread); `pages/ConversationThread.tsx` is owned there.
- All three remaining tasks require FOUNDATION (warm shadow tokens, `.hover-elevate`/`.active-elevate-2`) and
  PRIMITIVES (motion lib P1/P2, states P3, sanitize P5) to be merged first. No symbol is
  renamed; every imported name matches the SHARED CONTRACT.


---

## ROUTE: CONVOTHREAD

This section applies the Nikxius premium treatment to the **ConversationThread** surface — the
full-page message thread at `/conversations/:id` (the inbound/outbound bubble stack plus the
Reply-Intelligence sidebar). It depends on the FOUNDATION section (warm shadow tokens
`--shadow-xs/sm/md/lg`, palette `paper-*/ink-*/rust-*/signal-*`, `.hover-elevate`/
`.active-elevate-2`) and the PRIMITIVES section (`src/lib/motion.ts`, `<Stagger>`/
`<StaggerItem>`, `<CountUp>`, `<EmptyState>`, `<ErrorState>`, `sanitizeHtml`). It does **not**
depend on any other route section.

### Files touched

- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/ConversationThread.tsx`
  (entire file is 143 lines as of 2026-06-07; tasks edit lines 1–9, 40–48, 73–95, 98–138)

> Scope note: this section owns **only** the page `pages/ConversationThread.tsx`. The
> sibling `components/v2/ConversationThread.tsx` (the preview/full inline component composed by
> `Conversations.tsx`) is a different surface and is **out of scope** here — do not edit it.

### Grounding facts (verified against the live tree 2026-06-07)

- The page is a single component (`ConversationThread()`, line 18) keyed off
  `useRoute("/conversations/:id")`. It calls `useGetConversation(id, …)` (line 23) which
  returns a standard TanStack `UseQueryResult & { queryKey }` (generated hook,
  `lib/api-client-react/src/generated/api.ts` line 1288–1298) — `isLoading`, `isError`, and
  `refetch` are all available. Today it destructures only `{ data, isLoading, refetch }`
  (line 23) — **`isError` is ignored**, so a failed/aborted fetch falls through to the
  `if (!data)` branch (line 48) and renders a flat grey `"Conversation not found"` string.
  This is the missing `<ErrorState>` leak.
- The body of every message is rendered at line 84–88 via
  `dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}` **unsanitized**. PRIMITIVES Task P5
  shipped `sanitizeHtml` from `@/lib/sanitize`; the CONTRACT requires it at EVERY
  `dangerouslySetInnerHTML`. This is the one such call site on this surface.
- `messages` is typed `ConversationMessage[]` (`api.schemas.ts` line 228–234): each has
  `id: string`, `direction: "inbound" | "outbound"`, `bodyHtml: string`, `sentAt: string`,
  `senderName: string`. The map (lines 74–95) renders a `flex` row, justified end for
  `outbound`, with a `max-w-[80%] rounded-lg px-4 py-3` bubble. Outbound bubbles are
  `bg-ink-900 text-paper-50`; inbound are `bg-white border border-paper-200 text-ink-900`.
  **Neither bubble has any depth** (no shadow) and the thread has **no mount/enter motion**
  — messages just appear.
- The Reply-Intelligence sidebar (lines 98–138) is guarded by `{ri && …}` (line 99). Per
  schema, `conversation.replyIntelligence` is **non-nullable** (`api.schemas.ts` line 277:
  `replyIntelligence: ReplyIntelligence`), so the guard is defensive-only and always true at
  runtime — keep it (it costs nothing and survives a looser API). The sidebar panel is a flat
  `bg-white` column with **no depth** and the Next-Best-Action card (lines 111–114) is a flat
  `bg-rust-50 border border-rust-200` block.
- The sentiment badge (lines 104–106) prints `{ri.sentiment} · {Math.round(ri.sentimentConfidence * 100)}%`
  using the local `SENTIMENT_STYLES` map (lines 11–16) keyed on the four
  `ReplyIntelligenceSentiment` literals (`positive | objection | neutral | negative`,
  `api.schemas.ts` line 239–244). `sentimentConfidence` is a `0–1` number — a natural
  `<CountUp suffix="%">` target.
- The loading branch (lines 40–46) is a hand-rolled three-`<Skeleton>` stack. The not-found /
  error branch (line 48) is a single flat string. Neither uses the shared state primitives.
- The page imports `cn` (line 9), `Button`/`Skeleton`/`Badge` (lines 4–6), lucide
  `ArrowLeft, MessageSquare, Archive, Sparkles` (line 7 — `MessageSquare` is imported but
  unused today), and `toast` (line 8). There is **no** `Card` component on this surface; the
  bubbles and sidebar are raw `div`s, so depth is applied via the warm `shadow-*` utilities
  directly on those `div`s.
- `framer-motion ^12.23.24` is already a resolved workspace dep (PRIMITIVES grounding), so
  `motion`/`AnimatePresence` import without an install.

---

### Task R-convothread-1: Sanitize message bodies + warm-depth the inbound/outbound bubbles

Close the XSS leak (sanitize every message body) and give the bubbles real depth: inbound
bubbles get a warm `shadow-sm` lift on the white surface; outbound (ink) bubbles get the same
`shadow-sm` so the thread reads as physical cards instead of flat fills. No motion yet — that
lands in R-convothread-2.

**Files:**
- `artifacts/workforce-os/src/pages/ConversationThread.tsx` (lines 1–9, 78–88)

**Steps:**

1. Add the `sanitizeHtml` import and drop the unused `MessageSquare` icon. **BEFORE**
   (lines 7–9):
   ```tsx
   import { ArrowLeft, MessageSquare, Archive, Sparkles } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   ```
   **AFTER:**
   ```tsx
   import { ArrowLeft, Archive, Sparkles } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   import { sanitizeHtml } from "@/lib/sanitize";
   ```
   (`MessageSquare` is imported but never rendered today; removing it keeps the import list
   honest. `sanitizeHtml` is the PRIMITIVES P5 export at `@/lib/sanitize`.)

2. Sanitize the body HTML **and** pin warm depth on both bubble variants. **BEFORE**
   (lines 78–88):
   ```tsx
                 <div className={cn(
                   "max-w-[80%] rounded-lg px-4 py-3",
                   isOut
                     ? "bg-ink-900 text-paper-50"
                     : "bg-white border border-paper-200 text-ink-900"
                 )}>
                   <div
                     className="text-sm leading-relaxed prose prose-sm max-w-none"
                     style={{ color: "inherit" }}
                     dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                   />
   ```
   **AFTER:**
   ```tsx
                 <div className={cn(
                   "max-w-[80%] rounded-lg px-4 py-3 shadow-sm",
                   isOut
                     ? "bg-ink-900 text-paper-50"
                     : "bg-ink-0 border border-paper-200 text-ink-900"
                 )}>
                   <div
                     className="text-sm leading-relaxed prose prose-sm max-w-none"
                     style={{ color: "inherit" }}
                     dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.bodyHtml) }}
                   />
   ```
   Changes: added `shadow-sm` to the shared bubble class so both variants carry warm depth;
   `bg-white` → `bg-ink-0` (the CONTRACT white-surface token so the ink-tinted shadow reads
   in dark mode too); body HTML now passes through `sanitizeHtml(...)`.

3. **Verify (typecheck):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0. `sanitizeHtml(html: string): string` accepts `msg.bodyHtml`
   (typed `string`, `api.schemas.ts` line 231) and returns `string`, satisfying
   `__html`. Removing the unused `MessageSquare` import resolves cleanly.

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/ConversationThread.tsx && \
     git commit -m "feat(convothread): sanitize message bodies + warm depth on inbound/outbound bubbles

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-convothread-2: Message-enter motion (Stagger + cardEnter) on the thread

Animate the message stack on mount: wrap the list in `<Stagger>` so messages cascade in, and
give each bubble a `cardEnter` entrance via `<StaggerItem>` so it fades + slides + scales into
place instead of popping. Reduced-motion users get the instant render for free (both
primitives gate on `useReducedMotionSafe` internally).

**Files:**
- `artifacts/workforce-os/src/pages/ConversationThread.tsx` (lines 1–9, 73–96)

**Steps:**

1. Add the motion imports. **BEFORE** (the import block after the `sanitizeHtml` line added in
   R-convothread-1 step 1):
   ```tsx
   import { cn } from "@/lib/utils";
   import { sanitizeHtml } from "@/lib/sanitize";
   ```
   **AFTER:**
   ```tsx
   import { cn } from "@/lib/utils";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   ```
   (`Stagger`/`StaggerItem` are the PRIMITIVES P2 components. `staggerItem`'s variant already
   fades + slides each child; we override the inner bubble with `cardEnter` in step 2 for the
   richer scale-in by attaching the variant on a nested `motion.div` — but the simplest,
   contract-faithful approach is to let `<StaggerItem>` own the entrance, so we add **only**
   `Stagger`/`StaggerItem` here and no raw `motion` import.)

2. Replace the bare `messages.map` container + row wrapper with a `<Stagger>` container whose
   children are `<StaggerItem>`s. **BEFORE** (lines 73–96):
   ```tsx
         {/* Message thread */}
         <div className="flex-1 overflow-y-auto p-4 space-y-4">
           {messages.map((msg) => {
             const isOut = msg.direction === "outbound";
             return (
               <div key={msg.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                 <div className={cn(
                   "max-w-[80%] rounded-lg px-4 py-3 shadow-sm",
                   isOut
                     ? "bg-ink-900 text-paper-50"
                     : "bg-ink-0 border border-paper-200 text-ink-900"
                 )}>
                   <div
                     className="text-sm leading-relaxed prose prose-sm max-w-none"
                     style={{ color: "inherit" }}
                     dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.bodyHtml) }}
                   />
                   <p className={cn("text-xs mt-2", isOut ? "text-paper-400" : "text-ink-400")}>
                     {msg.senderName} · {new Date(msg.sentAt).toLocaleString()}
                   </p>
                 </div>
               </div>
             );
           })}
         </div>
   ```
   **AFTER:**
   ```tsx
         {/* Message thread */}
         <Stagger className="flex-1 overflow-y-auto p-4 space-y-4">
           {messages.map((msg) => {
             const isOut = msg.direction === "outbound";
             return (
               <StaggerItem key={msg.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                 <div className={cn(
                   "max-w-[80%] rounded-lg px-4 py-3 shadow-sm",
                   isOut
                     ? "bg-ink-900 text-paper-50"
                     : "bg-ink-0 border border-paper-200 text-ink-900"
                 )}>
                   <div
                     className="text-sm leading-relaxed prose prose-sm max-w-none"
                     style={{ color: "inherit" }}
                     dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.bodyHtml) }}
                   />
                   <p className={cn("text-xs mt-2", isOut ? "text-paper-400" : "text-ink-400")}>
                     {msg.senderName} · {new Date(msg.sentAt).toLocaleString()}
                   </p>
                 </div>
               </StaggerItem>
             );
           })}
         </Stagger>
   ```
   The outer scroll `div` becomes `<Stagger>` (it renders a `motion.div` carrying
   `staggerContainer` and forwards `className`, so `flex-1 overflow-y-auto p-4 space-y-4` is
   preserved). Each row `div` becomes `<StaggerItem>` (renders a `motion.div` with
   `staggerItem`, forwarding the `flex justify-*` class and `key`). Result: messages cascade
   in top-to-bottom on mount; reduced-motion users get the plain `div` fallback (the
   primitives branch on `useReducedMotionSafe`).

3. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `<Stagger>`/`<StaggerItem>` accept `{ children, className }`
   (PRIMITIVES P2 signature); `StaggerItem` forwards an arbitrary `key` like any React
   element. No `any` introduced.

4. **Visual verify (light + dark):** start the dev server, navigate to a thread
   (`/conversations/<id>`). On load the message bubbles should cascade in (fade + slight
   upward slide, staggered ~60ms apart) rather than appearing all at once. Confirm both bubble
   variants carry a soft warm shadow. Toggle dark mode via the topbar `ThemeToggle` and
   re-check (shadow + cascade still read). Screenshot both. Enable
   `prefers-reduced-motion: reduce` (devtools → Rendering) and confirm the cascade collapses to
   an instant render. Stop the dev server.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: staggered message entrance in both themes; instant render under reduced motion.

5. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/ConversationThread.tsx && \
     git commit -m "feat(convothread): stagger message-enter motion on the thread

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-convothread-3: Depth + CountUp + hover/press polish on the Reply-Intelligence sidebar

Raise the sidebar into a real surface: pin warm depth on the panel and the Next-Best-Action
card, animate the sentiment confidence with `<CountUp>`, and give the two action buttons a
`springHover` lift/press micro-interaction. The sidebar also gains a `cardEnter` entrance so it
settles in alongside the thread.

**Files:**
- `artifacts/workforce-os/src/pages/ConversationThread.tsx` (lines 1–9, 98–138)

**Steps:**

1. Add the `motion`, `cardEnter`/`springHover`, `useReducedMotionSafe`, and `CountUp`
   imports. **BEFORE** (the import block after the `Stagger` line added in
   R-convothread-2 step 1):
   ```tsx
   import { cn } from "@/lib/utils";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   ```
   **AFTER:**
   ```tsx
   import { cn } from "@/lib/utils";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { CountUp } from "@/components/motion/CountUp";
   import { motion } from "framer-motion";
   import { cardEnter, springHover, useReducedMotionSafe } from "@/lib/motion";
   ```

2. Add a `reduced` flag at the top of the component so the sidebar motion can gate on it.
   **BEFORE** (lines 18–22):
   ```tsx
   export default function ConversationThread() {
     const [, params] = useRoute("/conversations/:id");
     const [, navigate] = useLocation();
     const id = params?.id ?? "";
   ```
   **AFTER:**
   ```tsx
   export default function ConversationThread() {
     const reduced = useReducedMotionSafe();
     const [, params] = useRoute("/conversations/:id");
     const [, navigate] = useLocation();
     const id = params?.id ?? "";
   ```

3. Convert the sidebar shell into a `cardEnter` `motion.div`, pin warm depth on the panel +
   the Next-Best-Action card, animate the confidence with `<CountUp>`, and wrap the two action
   buttons in `springHover` motion wrappers. **BEFORE** (lines 98–138):
   ```tsx
         {/* Reply intelligence sidebar */}
         {ri && (
           <div className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-paper-200 bg-white overflow-y-auto">
             <div className="p-4 space-y-4">
               <div>
                 <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Reply Intelligence</p>
                 <Badge className={cn("text-xs border", SENTIMENT_STYLES[ri.sentiment])}>
                   {ri.sentiment} · {Math.round(ri.sentimentConfidence * 100)}%
                 </Badge>
               </div>

               <div>
                 <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Next Best Action</p>
                 <div className="bg-rust-50 border border-rust-200 rounded-lg p-3">
                   <p className="text-sm text-rust-900">{ri.nextBestAction}</p>
                   <p className="text-xs text-rust-500 mt-1 capitalize">{ri.nextBestActionType?.replace(/_/g, " ")}</p>
                 </div>
               </div>

               <div className="space-y-2">
                 <Button
                   className="w-full bg-rust-500 hover:bg-rust-600 text-white"
                   size="sm"
                   onClick={() => draftReply({ id })}
                   disabled={drafting}
                 >
                   <Sparkles className="h-4 w-4 mr-2" />
                   {drafting ? "Drafting…" : "Draft Reply"}
                 </Button>
                 <Button
                   variant="outline"
                   className="w-full border-paper-300"
                   size="sm"
                   onClick={() => archive({ id })}
                 >
                   <Archive className="h-4 w-4 mr-2" /> Archive
                 </Button>
               </div>
             </div>
           </div>
         )}
   ```
   **AFTER:**
   ```tsx
         {/* Reply intelligence sidebar */}
         {ri && (
           <motion.div
             className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-paper-200 bg-ink-0 shadow-md overflow-y-auto"
             variants={reduced ? undefined : cardEnter}
             initial={reduced ? undefined : "hidden"}
             animate={reduced ? undefined : "visible"}
           >
             <div className="p-4 space-y-4">
               <div>
                 <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Reply Intelligence</p>
                 <Badge className={cn("text-xs border", SENTIMENT_STYLES[ri.sentiment])}>
                   {ri.sentiment} · <CountUp value={ri.sentimentConfidence * 100} suffix="%" />
                 </Badge>
               </div>

               <div>
                 <p className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Next Best Action</p>
                 <div className="bg-rust-50 border border-rust-200 rounded-lg p-3 shadow-sm">
                   <p className="text-sm text-rust-900">{ri.nextBestAction}</p>
                   <p className="text-xs text-rust-500 mt-1 capitalize">{ri.nextBestActionType?.replace(/_/g, " ")}</p>
                 </div>
               </div>

               <div className="space-y-2">
                 <motion.div
                   variants={reduced ? undefined : springHover}
                   initial="rest"
                   whileHover="hover"
                   whileTap="tap"
                 >
                   <Button
                     className="w-full bg-rust-500 hover:bg-rust-600 text-white"
                     size="sm"
                     onClick={() => draftReply({ id })}
                     disabled={drafting}
                   >
                     <Sparkles className="h-4 w-4 mr-2" />
                     {drafting ? "Drafting…" : "Draft Reply"}
                   </Button>
                 </motion.div>
                 <motion.div
                   variants={reduced ? undefined : springHover}
                   initial="rest"
                   whileHover="hover"
                   whileTap="tap"
                 >
                   <Button
                     variant="outline"
                     className="w-full border-paper-300"
                     size="sm"
                     onClick={() => archive({ id })}
                   >
                     <Archive className="h-4 w-4 mr-2" /> Archive
                   </Button>
                 </motion.div>
               </div>
             </div>
           </motion.div>
         )}
   ```
   Changes: the sidebar shell is now a `motion.div` carrying `cardEnter` (gated on `reduced`),
   `bg-white` → `bg-ink-0`, and gains `shadow-md` (it's a floating side panel — `shadow-md` per
   FOUNDATION/PRIMITIVES depth convention); the Next-Best-Action card gains `shadow-sm` to read
   as a raised object inside the panel; the raw `Math.round(...) %` confidence is replaced by
   `<CountUp value={ri.sentimentConfidence * 100} suffix="%" />` (CountUp's default
   `decimals = 0` reproduces the rounded integer, now animated); each `Button` is wrapped in a
   `springHover` `motion.div` so it lifts on hover and depresses on tap. Reduced-motion users
   get instant render (variants `undefined`) and CountUp snaps to the final value internally.

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `cardEnter`/`springHover` are valid `Variants` exports from
   `@/lib/motion`; `<CountUp value suffix />` matches the PRIMITIVES P2 signature
   (`value: number; decimals?; suffix?`), and `ri.sentimentConfidence * 100` is `number`.
   Gating `variants={reduced ? undefined : …}` with `initial`/`animate` as string literals is
   accepted by framer's prop types.

5. **Visual verify (light + dark):** dev server up, navigate to a thread
   (`/conversations/<id>`). The Reply-Intelligence sidebar should settle in via `cardEnter`
   (fade + slight scale) with a clear warm `shadow-md` separating it from the thread; the
   confidence percentage should count up from 0 to its value; the Next-Best-Action card should
   carry a soft `shadow-sm`; hovering **Draft Reply** / **Archive** should lift them ~2px and
   pressing should depress them. Toggle dark mode and re-check (shadows + CountUp still read).
   Enable `prefers-reduced-motion: reduce` and confirm the sidebar renders instantly with the
   confidence already at its final value and no hover lift. Screenshot both themes. Stop the
   dev server.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: depth + CountUp + hover/press polish present in both themes; instant under
   reduced motion.

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/ConversationThread.tsx && \
     git commit -m "feat(convothread): depth + CountUp + springHover polish on reply-intelligence sidebar

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-convothread-4: ErrorState on failed conversation fetch + loading polish

The page ignores `useGetConversation`'s `isError` and renders a flat `"Conversation not found"`
string on any failure (line 48). Destructure `isError` and add an explicit error branch that
renders the shared `<ErrorState onRetry={refetch}>`, so a transient fetch failure shows a
recoverable, branded state instead of an indistinguishable "not found" string. The
not-found-after-success case keeps a friendly `<EmptyState>`.

**Files:**
- `artifacts/workforce-os/src/pages/ConversationThread.tsx` (lines 1–9, 23–25, 40–48)

**Steps:**

1. Add the state-primitive imports + the lucide `MessageSquareDashed` icon for the empty
   state. **BEFORE** (the import block from the prior tasks):
   ```tsx
   import { ArrowLeft, Archive, Sparkles } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   ```
   **AFTER:**
   ```tsx
   import { ArrowLeft, Archive, Sparkles, MessageSquareDashed } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   ```
   (`MessageSquareDashed` is a valid lucide-react icon and a `LucideIcon`, satisfying
   `EmptyState`'s `icon` prop.)

2. Destructure `isError` from the query. **BEFORE** (lines 23–25):
   ```tsx
     const { data, isLoading, refetch } = useGetConversation(id, {
       query: { queryKey: ["getConversation", id], enabled: !!id },
     });
   ```
   **AFTER:**
   ```tsx
     const { data, isLoading, isError, refetch } = useGetConversation(id, {
       query: { queryKey: ["getConversation", id], enabled: !!id },
     });
   ```

3. Replace the flat loading skeleton + not-found string with: a skeleton on load, an
   `<ErrorState>` on error, and an `<EmptyState>` when the fetch succeeded but returned no
   conversation. **BEFORE** (lines 40–48):
   ```tsx
     if (isLoading) return (
       <div className="flex flex-col h-full p-6 space-y-4">
         <Skeleton className="h-8 w-40" />
         <Skeleton className="h-32 w-full" />
         <Skeleton className="h-32 w-full" />
       </div>
     );

     if (!data) return <div className="p-6 text-ink-400">Conversation not found</div>;
   ```
   **AFTER:**
   ```tsx
     if (isLoading) return (
       <div className="flex flex-col h-full p-6 space-y-4">
         <Skeleton className="h-8 w-40" />
         <Skeleton className="h-32 w-full" />
         <Skeleton className="h-32 w-full" />
       </div>
     );

     if (isError) return (
       <div className="flex h-full items-center justify-center bg-paper-50">
         <ErrorState
           title="Couldn't load this conversation"
           description="The conversation service didn't respond. Your data is safe — try again."
           onRetry={() => refetch()}
         />
       </div>
     );

     if (!data) return (
       <div className="flex h-full items-center justify-center bg-paper-50">
         <EmptyState
           icon={MessageSquareDashed}
           title="Conversation not found"
           description="This thread may have been archived or moved. Head back to your inbox to find it."
         />
       </div>
     );
   ```
   (`ErrorState`'s signature is `{ title?, description?, onRetry? }` and `EmptyState`'s is
   `{ icon, title, description, action? }` — both PRIMITIVES P3. Wrapping `refetch` in an arrow
   drops its `Promise` return to match the `() => void` prop type. The centering wrapper gives
   the editorial state room on this full-height surface.)

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `isError` is `boolean` and `refetch` is callable on
   `UseQueryResult` (generated hook returns `UseQueryResult & { queryKey }`,
   `api.ts` line 1291); `() => refetch()` satisfies `onRetry?: () => void`;
   `MessageSquareDashed` is a `LucideIcon`.

5. **Visual verify (light + dark):** dev server up. Force an error by stopping the API/DB (or
   in devtools, block the `getConversation` request) and navigate to `/conversations/<id>`.
   Confirm the editorial `<ErrorState>` renders (rust-tinted AlertTriangle chip, Lora title,
   "Try again" button) instead of the old flat string. Click **Try again** and confirm it
   re-fetches. Then navigate to a bogus id (e.g. `/conversations/does-not-exist`) and confirm
   the `<EmptyState>` (MessageSquareDashed chip, Lora title) renders. Toggle dark mode and
   re-check both. Screenshot both themes. Stop the dev server.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Expected: error branch with working retry + distinct empty branch, both in both themes.

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/ConversationThread.tsx && \
     git commit -m "feat(convothread): ErrorState with retry on fetch failure + EmptyState for missing thread

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **FOUNDATION** (warm `--shadow-*`, palette, `bg-ink-0`, elevate utilities) and
  **PRIMITIVES** (P1 motion lib, P2 `<Stagger>`/`<StaggerItem>`/`<CountUp>`, P3
  `<EmptyState>`/`<ErrorState>`, P5 `sanitizeHtml`) must land first.
- **R-convothread-1 → 2 → 3 → 4**: do them in order. R-1 establishes the import block (adds
  `sanitizeHtml`, drops `MessageSquare`) and the bubble class (`shadow-sm`, `bg-ink-0`) that
  R-2's BEFORE block references. R-2 adds the `Stagger` import line that R-3's BEFORE block
  anchors to. R-3 adds the `reduced` flag + motion imports. R-4 is largely independent
  (loading/error/empty branches) but follows R-1 because it appends to the same import block.
- No cross-section symbol is renamed; every imported name (`Stagger`, `StaggerItem`,
  `CountUp`, `EmptyState`, `ErrorState`, `cardEnter`, `springHover`, `useReducedMotionSafe`,
  `sanitizeHtml`) matches the SHARED CONTRACT exactly. The only out-of-scope sibling
  (`components/v2/ConversationThread.tsx`) is explicitly left untouched.


---

## ROUTE — RUNS

This section applies the Nikxius premium treatment to the **runs** surface (`/runs`, the
"Run History" table) and closes its specific leaks. The surface is a single file:

- `pages/Runs.tsx` — a polling (`refetchInterval: 10000`) table of pipeline runs with a
  header "Trigger Run" button, a `Skeleton` loading branch, a hand-rolled empty branch, and
  a `<table>` of run rows (status badge, agents, leads, drafts, duration, cost, triggeredBy,
  date, chevron).

### Grounding facts (verified against the live tree on 2026-06-07)

- **The table has no entrance motion and no row stagger.** The content branch maps
  `(data?.items ?? []).map((run) => …)` into plain `<tr>`s inside a plain `<tbody
  className="divide-y divide-paper-100">` (lines 85-112). Rows snap in on every 10 s poll.
  R-runs-2 converts `<tbody>`→`motion.tbody` (`staggerContainer`) and the content `<tr>`→
  `motion.tr` (`staggerItem`) so the history cascades in.
- **Row hover is a flat color swap, no lift.** The row is
  `className="hover:bg-paper-50 cursor-pointer transition-colors"` (line 89) — a cool 1px
  table row with a background tint on hover, no depth, no translate. R-runs-2 gives it a warm
  `shadow-sm` + 1px lift on hover (the same CSS-driven row-lift pattern PIPELINE uses, because
  a framer `whileHover` translate on a `<tr>` fights the table box model).
- **The Trigger Run button has no press motion and a text-only pending state.** Lines 46-54
  render a plain shadcn `<Button disabled={triggering}>` whose only pending affordance is the
  label flipping to `"Starting…"`. No spinner, no scale-on-press, no hover lift. R-runs-1
  wraps it in a `springHover`-driven `motion.div` (hover lift + tap press) and adds a spinning
  `Loader2` icon while `triggering`.
- **The empty + (missing) error states are hand-rolled / absent.** Lines 64-68 inline a
  centered `text-ink-400` "No runs yet" block — not the shared `<EmptyState>`. The query's
  `isError`/`error` are **never read** (only `data`, `isLoading`, `refetch` are destructured at
  lines 26-29), so a failed `useListRuns` shows the empty "No runs yet" copy forever — a false
  negative. R-runs-3 destructures `isError`, adds an `<ErrorState onRetry={refetch}>` branch,
  and replaces the inline empty with `<EmptyState>` (its `action` re-uses the Trigger button).
- **`useTriggerRun` is `void`-input and returns `{ runId }`.** From
  `lib/api-client-react/src/generated/api.ts:1589`, `useTriggerRun` is
  `UseMutationResult<…, TError, void, …>` — `triggerRun()` takes no args; the existing
  `onSuccess: (d) => toast.success(\`Run started — ${d.runId}\`)` (line 33) confirms the
  response carries `runId`. The `isPending` flag is aliased to `triggering` (line 31). These
  shapes are unchanged by this section.
- **`useListRuns` resolves to a `{ items: Run[] }` envelope** (consumed as `data?.items` at
  lines 64, 86) — NOT a bare array. `Run` exposes `id, status, agentsInvolved?: string[],
  leadsSourced, artifactsGenerated, durationMs, costUsd, triggeredBy, startedAt`. The standard
  TanStack `isError` flag is available on the same query result; the section only adds it to
  the existing destructure.
- **No `dangerouslySetInnerHTML` anywhere** in this file — all cells render plain text/numbers.
  `sanitizeHtml` is **not** applicable here. Do not add it.
- **`shadcn <Button>` cannot be a framer `motion` element.** It is a `Slot`/`button`
  composite, so press/hover spring is applied to a **wrapping `motion.div`** (which is what
  PIPELINE/OUTBOUND do), not to the `<Button>` itself. The `<Button>` keeps `disabled`.
- **Depends on:** FOUNDATION (palette `paper-*`/`ink-*`/`rust-*`, warm shadow tokens
  `--shadow-xs`/`--shadow-sm`/`--shadow-md`, `.hover-elevate`/`.active-elevate-2`) and
  PRIMITIVES (P1 motion lib `@/lib/motion` — `staggerContainer`, `staggerItem`, `springHover`,
  `useReducedMotionSafe`; P2 `<CountUp>` from `@/components/motion/CountUp`; P3 `<EmptyState>`/
  `<ErrorState>` from `@/components/states/*`). All names below match the SHARED CONTRACT
  exactly. `PageTransition` is already wired at the router level (PRIMITIVES P2 step 4), so
  this page needs no per-page page-transition wrapper.

> **Table-row stagger note (applies to R-runs-2):** the shared `<Stagger>`/`<StaggerItem>`
> components render `<div>`s, which are **invalid** inside `<table>`. Row stagger is therefore
> done with `motion.tbody` + `motion.tr` carrying the `staggerContainer`/`staggerItem`
> variants **directly** — the same approach PIPELINE uses. All motion props are gated on
> `!reduced` so reduced-motion users get the final state instantly.

> **Line-number drift note:** apply the tasks in order R-runs-1 → R-runs-2 → R-runs-3.
> R-runs-1 only edits imports (lines 1-9) and the header button (lines 46-54); R-runs-2 edits
> the `<tbody>`/rows (lines 85-112); R-runs-3 edits the destructure (lines 26-36) and the
> loading/empty ternary (lines 57-69). Because each task's region is disjoint and R-runs-3's
> destructure edit sits ABOVE R-runs-2's table, re-Read before each task if a prior task
> shifted line counts.

---

### Task R-runs-1: Trigger Run button — springHover press + hover lift + spinner pending state

Give the header "Trigger Run" button a real interaction: a `springHover` lift on hover, a
press (`tap`) scale, and a spinning `Loader2` while the mutation is pending (replacing the
text-only "Starting…" cue with an icon + label).

**Files:**
- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Runs.tsx`
  - imports (lines 1-9)
  - header Trigger button (lines 46-54)

**Steps:**

1. Add the framer `motion` import, the motion-lib imports, and the `Loader2` icon. Replace
   the import block.

   **BEFORE** (lines 1-9):
   ```tsx
   import React from "react";
   import { useLocation } from "wouter";
   import { useListRuns, useTriggerRun } from "@workspace/api-client-react";
   import { Button } from "@/components/ui/button";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Badge } from "@/components/ui/badge";
   import { Play, ChevronRight } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   ```

   **AFTER:**
   ```tsx
   import React from "react";
   import { useLocation } from "wouter";
   import { motion } from "framer-motion";
   import { useListRuns, useTriggerRun } from "@workspace/api-client-react";
   import { Button } from "@/components/ui/button";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Badge } from "@/components/ui/badge";
   import { Play, ChevronRight, Loader2 } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   import {
     staggerContainer,
     staggerItem,
     springHover,
     useReducedMotionSafe,
   } from "@/lib/motion";
   import { CountUp } from "@/components/motion/CountUp";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { Inbox } from "lucide-react";
   ```
   (`CountUp`, `EmptyState`, `ErrorState`, `Inbox`, `staggerContainer`, `staggerItem` are
   consumed by R-runs-2 and R-runs-3 — importing them now keeps the import block edited once.
   `Inbox` is the `<EmptyState icon>` for the runs surface. The duplicate `lucide-react`
   import line is intentional and tree-shakes cleanly; collapse it into the first lucide line
   if your linter flags `no-duplicate-imports` — see step 4.)

2. Add the reduced-motion guard at the top of the component body, right after the
   `useLocation` hook. **BEFORE** (lines 24-25):
   ```tsx
   export default function Runs() {
     const [, navigate] = useLocation();
   ```
   **AFTER:**
   ```tsx
   export default function Runs() {
     const [, navigate] = useLocation();
     const reduced = useReducedMotionSafe();
   ```

3. Wrap the header `<Button>` in a `springHover`-driven `motion.div` and swap the text-only
   pending cue for a spinning `Loader2`. **BEFORE** (lines 46-54):
   ```tsx
           <Button
             className="bg-rust-500 hover:bg-rust-600 text-white"
             size="sm"
             onClick={() => triggerRun()}
             disabled={triggering}
           >
             <Play className="h-4 w-4 mr-2" />
             {triggering ? "Starting…" : "Trigger Run"}
           </Button>
   ```
   **AFTER:**
   ```tsx
           <motion.div
             variants={reduced ? undefined : springHover}
             initial={reduced ? undefined : "rest"}
             whileHover={reduced ? undefined : "hover"}
             whileTap={reduced ? undefined : "tap"}
             className="inline-flex"
           >
             <Button
               className="bg-rust-500 hover:bg-rust-600 text-white shadow-sm transition-shadow duration-200 hover:shadow-md"
               size="sm"
               onClick={() => triggerRun()}
               disabled={triggering}
             >
               {triggering ? (
                 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
               ) : (
                 <Play className="h-4 w-4 mr-2" />
               )}
               {triggering ? "Starting…" : "Trigger Run"}
             </Button>
           </motion.div>
   ```
   (`springHover` supplies the lift + press; the warm `shadow-sm`→`shadow-md` on hover (tokens
   from FOUNDATION) adds depth; `Loader2 animate-spin` is the missing pending affordance.
   `disabled={triggering}` already blocks double-fire, and framer's `whileTap` is a no-op while
   disabled, so the press never fires mid-flight.)

4. **If your ESLint config errors `no-duplicate-imports`** on the two `lucide-react` lines
   from step 1, collapse them. **BEFORE:**
   ```tsx
   import { Play, ChevronRight, Loader2 } from "lucide-react";
   ```
   ```tsx
   import { Inbox } from "lucide-react";
   ```
   **AFTER** (single line, delete the standalone `Inbox` import):
   ```tsx
   import { Play, ChevronRight, Loader2, Inbox } from "lucide-react";
   ```

5. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `springHover` is a `Variants` export from `@/lib/motion`;
   `useReducedMotionSafe()` returns `boolean`; `motion.div` is a valid framer element;
   `Loader2` is a valid lucide icon. (`CountUp`/`EmptyState`/`ErrorState`/`Inbox`/
   `staggerContainer`/`staggerItem` are imported-but-unused until R-runs-2/3 — `tsc` does not
   error on unused imports, and the production build tree-shakes them. If `pnpm run lint` is in
   your gate and flags `no-unused-vars`, complete R-runs-2 and R-runs-3 before linting, since
   those tasks consume every remaining import.)

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/pages/Runs.tsx && \
     git commit -m "feat(runs): springHover press + spinner pending state on Trigger Run

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-runs-2: Stagger the run-history rows + warm hover lift + CountUp the run count

Stagger the history rows in on mount/poll via `motion.tbody`/`motion.tr` (NOT `<Stagger>` —
see the table-row note above), give each row a warm `shadow-sm` + 1px hover lift, and animate
the row count in the header subtitle with `<CountUp>`.

**Files:**
- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Runs.tsx`
  - header subtitle (lines 43-44)
  - `<tbody>` open (line 85)
  - content `<tr>` (lines 87-91) + its close (line 111)
  - `</tbody>` close (line 113)

**Steps:**

1. Animate the run count in the header subtitle so the polling total reads as live, not a
   snap. **BEFORE** (lines 43-44):
   ```tsx
           <h1 className="font-serif font-semibold text-ink-900 text-lg">Run History</h1>
           <p className="text-xs text-ink-400 mt-0.5">Agent pipeline executions</p>
   ```
   **AFTER:**
   ```tsx
           <h1 className="font-serif font-semibold text-ink-900 text-lg">Run History</h1>
           <p className="text-xs text-ink-400 mt-0.5">
             <CountUp value={(data?.items ?? []).length} /> agent pipeline executions
           </p>
   ```
   (`<CountUp value={number} />` is the PRIMITIVES P2 component — it animates 0→count and snaps
   instantly under reduced motion. `(data?.items ?? []).length` is `number`, matching the
   `{ value: number }` signature.)

2. Convert the `<tbody>` to a `motion.tbody` carrying `staggerContainer`. **BEFORE** (line 85):
   ```tsx
               <tbody className="divide-y divide-paper-100">
   ```
   **AFTER:**
   ```tsx
               <motion.tbody
                 className="divide-y divide-paper-100"
                 variants={reduced ? undefined : staggerContainer}
                 initial={reduced ? undefined : "hidden"}
                 animate={reduced ? undefined : "visible"}
               >
   ```
   And its closing tag. **BEFORE** (line 113):
   ```tsx
               </tbody>
   ```
   **AFTER:**
   ```tsx
               </motion.tbody>
   ```
   (Gating `variants`/`initial`/`animate` on `!reduced` gives reduced-motion users the final
   state instantly.)

3. Convert the content row to `motion.tr` with `staggerItem` and a warm hover lift. **BEFORE**
   (lines 87-91):
   ```tsx
                 {(data?.items ?? []).map((run) => (
                   <tr
                     key={run.id}
                     className="hover:bg-paper-50 cursor-pointer transition-colors"
                     onClick={() => navigate(`/runs/${run.id}`)}
                   >
   ```
   **AFTER:**
   ```tsx
                 {(data?.items ?? []).map((run) => (
                   <motion.tr
                     key={run.id}
                     variants={reduced ? undefined : staggerItem}
                     className="group cursor-pointer transition-all duration-200 hover:bg-paper-50 hover:shadow-sm hover:[transform:translateY(-1px)]"
                     onClick={() => navigate(`/runs/${run.id}`)}
                   >
   ```
   And its closing tag. **BEFORE** (line 111):
   ```tsx
                   </tr>
   ```
   **AFTER:**
   ```tsx
                   </motion.tr>
   ```
   (The lift is CSS-driven — `transition-all` + warm `hover:shadow-sm` (FOUNDATION token) + a
   1px translate — rather than `springHover`, because a framer `whileHover` translate on a
   `<tr>` fights the table's box model; the CSS `translateY(-1px)` reads cleanly. `staggerItem`
   owns only the mount/poll entrance, not the hover. The `group` class is added so the chevron
   in step 4 can react to row hover.)

4. Nudge the chevron on row hover for a directional cue. **BEFORE** (lines 108-110):
   ```tsx
                     <td className="px-4 py-3 text-ink-300">
                       <ChevronRight className="h-4 w-4" />
                     </td>
   ```
   **AFTER:**
   ```tsx
                     <td className="px-4 py-3 text-ink-300">
                       <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-rust-400" />
                     </td>
   ```
   (`group-hover:translate-x-0.5` slides the chevron toward the row destination and warms it to
   `rust-400` — a small "this row is clickable, here's where it goes" affordance.)

5. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `motion.tbody`/`motion.tr` are valid framer elements;
   `staggerContainer`/`staggerItem` are `Variants` exports from `@/lib/motion`;
   `<CountUp value={(data?.items ?? []).length} />` matches its `{ value: number }` signature.

6. **Visual verify (light + dark):** start the dev server and navigate to `/runs`. On first
   paint the history rows should cascade in (staggered fade+slide). Hover a row: it lifts ~1px
   with a warm `shadow-sm` and the chevron slides right + warms. Confirm the header count
   animates up. Toggle dark mode via the topbar `ThemeToggle` and re-check.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21793 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Then screenshot the route in both themes:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && npx playwright screenshot --wait-for-timeout 1500 "http://localhost:21793/runs" /tmp/runs-light.png)
   ```
   Expected: staggered row entrance, warm hover lift + chevron nudge, animated header count,
   readable in both themes. Stop the dev server.

7. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/pages/Runs.tsx && \
     git commit -m "feat(runs): stagger run-history rows + warm hover lift + CountUp count

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-runs-3: Unified <EmptyState> + <ErrorState> (read isError, wire onRetry)

Read the query's `isError` flag, add a dedicated `<ErrorState onRetry={refetch}>` branch
(today a failed load silently shows the empty copy), and replace the hand-rolled
`text-ink-400` empty block with the shared `<EmptyState>` whose `action` re-uses the Trigger
button.

**Files:**
- `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Runs.tsx`
  - `useListRuns` destructure (lines 26-29)
  - loading / empty ternary (lines 57-69)

**Steps:**

1. Destructure `isError` from the query result so the error branch can read it. **BEFORE**
   (lines 26-29):
   ```tsx
     const { data, isLoading, refetch } = useListRuns(
       { page: 1, limit: 50 },
       { query: { queryKey: ["listRuns"], refetchInterval: 10000 } }
     );
   ```
   **AFTER:**
   ```tsx
     const { data, isLoading, isError, refetch } = useListRuns(
       { page: 1, limit: 50 },
       { query: { queryKey: ["listRuns"], refetchInterval: 10000 } }
     );
   ```

2. Insert the error branch and replace the inline empty with `<EmptyState>`. The content
   branch (the `<table>` wrapper) is unchanged. **BEFORE** (lines 57-69):
   ```tsx
       <div className="p-6">
         {isLoading ? (
           <div className="space-y-3">
             {Array.from({ length: 5 }).map((_, i) => (
               <Skeleton key={i} className="h-16 w-full rounded-lg" />
             ))}
           </div>
         ) : (data?.items ?? []).length === 0 ? (
           <div className="text-center py-16 text-ink-400">
             <p className="text-sm">No runs yet</p>
             <p className="text-xs mt-1">Click "Trigger Run" to start your first pipeline run</p>
           </div>
         ) : (
   ```
   **AFTER:**
   ```tsx
       <div className="p-6">
         {isLoading ? (
           <div className="space-y-3">
             {Array.from({ length: 5 }).map((_, i) => (
               <Skeleton key={i} className="h-16 w-full rounded-lg" />
             ))}
           </div>
         ) : isError ? (
           <div className="bg-white border border-paper-200 rounded-lg shadow-sm">
             <ErrorState
               title="Couldn't load run history"
               description="We hit a snag fetching your pipeline runs. Please try again."
               onRetry={() => refetch()}
             />
           </div>
         ) : (data?.items ?? []).length === 0 ? (
           <div className="bg-white border border-paper-200 rounded-lg shadow-sm">
             <EmptyState
               icon={Inbox}
               title="No runs yet"
               description="Trigger your first pipeline run to start sourcing leads and drafting outreach."
               action={
                 <Button
                   className="bg-rust-500 hover:bg-rust-600 text-white shadow-sm transition-shadow duration-200 hover:shadow-md"
                   size="sm"
                   onClick={() => triggerRun()}
                   disabled={triggering}
                 >
                   {triggering ? (
                     <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                   ) : (
                     <Play className="h-4 w-4 mr-2" />
                   )}
                   {triggering ? "Starting…" : "Trigger Run"}
                 </Button>
               }
             />
           </div>
         ) : (
   ```
   (`<EmptyState icon title description action?>` and `<ErrorState title? description?
   onRetry?>` are the PRIMITIVES P3 components — exact contract signatures. The error branch is
   placed BEFORE the empty branch so a failed fetch shows the retry, not the "no runs" copy
   (the leak). Both are wrapped in the same `bg-white border shadow-sm` card chrome the content
   table uses, so the surface stays cohesive. The empty-state `action` re-uses the Trigger
   button so users can launch their first run inline. `() => refetch()` discards the returned
   promise to match `onRetry`'s `() => void` signature.)

3. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `isError` is a `boolean` on the TanStack query result;
   `<EmptyState icon={Inbox} title=… description=… action=… />` and `<ErrorState title=…
   description=… onRetry=… />` match the P3 prop signatures; `Inbox` is a `LucideIcon`;
   `() => refetch()` is `() => void`. With this task complete, every import added in R-runs-1
   is now consumed, so `pnpm run lint` reports no `no-unused-vars`.

4. **Visual verify (light + dark):** start the dev server and navigate to `/runs`. Confirm an
   org with zero runs shows the editorial `<EmptyState>` (Inbox icon, serif title, inline
   Trigger button) — not the old grey two-line text. Temporarily force the error branch (e.g.
   block the `/api/runs` request in DevTools or point the API base at an unreachable host) and
   confirm `<ErrorState>` renders with a working "Try again" button. Toggle dark mode and
   re-check both.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21793 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && npx playwright screenshot --wait-for-timeout 1500 "http://localhost:21793/runs" /tmp/runs-empty-light.png)
   ```
   Expected: editorial empty state with inline Trigger button; error state with working retry;
   both readable in light AND dark. Stop the dev server.

5. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/pages/Runs.tsx && \
     git commit -m "feat(runs): unified EmptyState + ErrorState with onRetry wiring

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section close — leaks closed

| Leak (from brief) | Closed by | How |
| --- | --- | --- |
| Stagger the run-history rows | R-runs-2 | `motion.tbody` (`staggerContainer`) + `motion.tr` (`staggerItem`), gated on `!reduced` |
| Trigger Run button press motion + pending state | R-runs-1 | `springHover` `motion.div` wrapper (hover lift + tap) + spinning `Loader2` while `triggering` |
| Row hover lift | R-runs-2 | CSS `transition-all` + warm `hover:shadow-sm` + `translateY(-1px)` + chevron nudge |
| `<EmptyState>` / `<ErrorState>` | R-runs-3 | shared P3 primitives; reads `isError`, wires `onRetry={refetch}`, empty `action` re-uses Trigger |

**Premium treatment applied:** depth (warm `shadow-xs`/`shadow-sm`/`shadow-md` tokens on the
button + rows + state cards), motion (`staggerContainer`/`staggerItem` row cascade, `springHover`
button, `<CountUp>` header count via the motion lib), unified `<EmptyState>`/`<ErrorState>`, and
hover/press micro-interactions (button lift+press, row lift, chevron nudge) — all reduced-motion-safe
via `useReducedMotionSafe()`.

**Names consumed (all match SHARED CONTRACT):** `staggerContainer`, `staggerItem`, `springHover`,
`useReducedMotionSafe` from `@/lib/motion`; `<CountUp>` from `@/components/motion/CountUp`;
`<EmptyState>`/`<ErrorState>` from `@/components/states/*`. No `dangerouslySetInnerHTML` on this
surface, so `sanitizeHtml` is correctly not used.


---

## Section 52 — ROUTE: RUN DETAIL (`/runs/:id`)

Premium pass for `artifacts/workforce-os/src/pages/RunDetail.tsx` — the single-run evidence
surface (summary KPI grid + the recursive evidence-timeline tree). This section applies the
Nikxius foundation treatment (warm depth via `shadow-*`, `cardEnter`/`Stagger` motion,
`springHover`/`active-elevate` micro-interactions, unified `<EmptyState>`/`<ErrorState>`) **and**
closes four concrete leaks that exist in the current file:

1. **Flat summary grid — no raised tiles, no motion, no CountUp.** The four KPI cells (lines
   136–153) live inside one flat `bg-white border border-paper-200 rounded-lg` card (line 134)
   and print raw numbers. Promote each cell to its own raised tile (`bg-ink-0` + `shadow-sm`),
   stagger them in on mount, and animate the numerics with `<CountUp>`.
2. **Evidence-timeline tree has no depth and a weak connector.** The recursive `TimelineNode`
   (lines 39–96) draws child indentation with a single hairline `border-l border-paper-200`
   (line 44) and **no node markers**; rows are flat `hover:bg-paper-50` (line 47). Re-skin the
   tree with a real connector rail + per-node type-colored dot markers (the language already
   used in `components/v2/TimelineTree.tsx`) and give the timeline card warm depth.
3. **No node-enter stagger.** Top-level timeline nodes (lines 167–171) render all at once.
   Cascade them in with `<Stagger>`/`<StaggerItem>` so the trace builds top-to-bottom.
4. **No error branch.** `useGetRun` exposes `isError`/`refetch` (generated hook returns
   `UseQueryResult & { queryKey }`, `api.ts` line 1662), but the page destructures only
   `{ data, isLoading }` (line 103) and renders a bare `Run not found` string on **any** failure
   (line 115). Add `<ErrorState onRetry={refetch}>` for fetch failure and route the
   genuinely-missing run through `<EmptyState>`. The off-palette status badge map (lines 10–15)
   is re-skinned to brand `signal-*`/`ember`/`rust` tokens at the same time.

Everything below references the shared primitives created in Sections 10/20 by their fixed
CONTRACT paths/props:
- Motion variants from `@/lib/motion`: `cardEnter`, `springHover`, `useReducedMotionSafe`.
- `<Stagger>` / `<StaggerItem>` from `@/components/motion/Stagger`.
- `<CountUp value decimals? suffix? className? />` from `@/components/motion/CountUp`.
- `<EmptyState icon title description action? />` /
  `<ErrorState title? description? onRetry? />` from `@/components/states/`.
- Warm shadow utilities `shadow-xs/sm/md/lg` + `.hover-elevate`/`.active-elevate-2` (registered
  in `src/index.css` by Section 10).

> Dependency note: this section assumes Sections 10 (foundation: shadow tokens, palette tokens
> `paper-*/ink-*/rust-*/ember-*/signal-*`, `bg-ink-0`, elevate utilities) and 20 (primitives:
> motion lib, motion components, state components) have already landed. All imports below resolve
> against those files. There is **no** `dangerouslySetInnerHTML` on this surface, so no
> `sanitizeHtml` is needed here.

### Grounding facts (verified against the live tree 2026-06-07)

- The page is one default-export component `RunDetail()` (line 98) keyed off
  `useRoute("/runs/:id")`. It calls `useGetRun(id, …)` (line 103) which returns the standard
  generated `UseQueryResult & { queryKey }` (`api.ts` lines 1659–1669) — `isLoading`, `isError`,
  and `refetch` are all available; today it destructures only `{ data, isLoading }`.
- `data` is `GraphRunDetail` (`api.schemas.ts` line 547): `{ run: GraphRun; timeline: TimelineNode[] }`.
  `GraphRun` (line 496) has `id`, `status: GraphRunStatus`, `agentsInvolved: string[]`,
  `leadsSourced: number`, `artifactsGenerated: number`, `durationMs: number`, `costUsd: number`,
  `triggeredBy: string`, `startedAt: string`, `completedAt?: string | null`.
- The page declares its **own** inline `TimelineNodeData` interface (lines 25–37) that mirrors the
  generated `TimelineNode` (`api.schemas.ts` line 528), and its **own** inline `TimelineNode`
  component (lines 39–96). It does **not** import `components/v2/EvidenceTimeline.tsx` or
  `components/v2/TimelineTree.tsx` — those are a separate Sheet/preview surface and are **out of
  scope** here. The dot-marker + connector-rail language we adopt in R-rundetail-2 is borrowed
  from `TimelineTree.tsx` (its `colorMap`, lines 22–28, and ring-marker dot, lines 49–54) but
  applied to this page's own component.
- `NODE_ICONS` (lines 17–23) already maps each `nodeType` to a lucide glyph. The five node types
  (`agent_run | llm_call | evaluator | tool_call | human_action`) match `TimelineNodeNodeType`
  (`api.schemas.ts` line 520).
- `framer-motion ^12.23.24` is already a resolved workspace dep (PRIMITIVES grounding), so
  `motion` imports without an install.

---

### Task R-rundetail-1: Brand status tokens + raised, staggered, CountUp summary tiles

Re-skin the off-palette status badge map to brand tokens, then break the flat 4-up KPI grid into
four individually-raised tiles that stagger in on mount and animate their numerics with
`<CountUp>`. The timeline card gets warm depth in R-rundetail-2; this task owns the header badge
and the summary block.

**Files:**
- Modify: `artifacts/workforce-os/src/pages/RunDetail.tsx` (imports lines 1–8; `STATUS_STYLES`
  lines 10–15; summary block lines 132–161)

1. Add the motion + CountUp imports. **Before** (lines 7–8):

   ```tsx
   import { ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon, Bot, Zap, FlaskConical, Wrench, User } from "lucide-react";
   import { cn } from "@/lib/utils";
   ```

   **After:**

   ```tsx
   import { ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon, Bot, Zap, FlaskConical, Wrench, User } from "lucide-react";
   import { cn } from "@/lib/utils";
   import { motion } from "framer-motion";
   import { cardEnter, springHover, useReducedMotionSafe } from "@/lib/motion";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { CountUp } from "@/components/motion/CountUp";
   ```

2. Re-skin the status badge map to brand `signal-*`/`ember`/`rust` tokens. **Before**
   (lines 10–15):

   ```tsx
   const STATUS_STYLES: Record<string, string> = {
     COMPLETED: "bg-green-100 text-green-800 border-green-200",
     RUNNING: "bg-amber-100 text-amber-800 border-amber-200",
     AWAITING_APPROVAL: "bg-rust-100 text-rust-800 border-rust-200",
     FAILED: "bg-red-100 text-red-800 border-red-200",
   };
   ```

   **After:**

   ```tsx
   const STATUS_STYLES: Record<string, string> = {
     COMPLETED: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
     RUNNING: "bg-ember-400/15 text-ember-500 border-ember-400/30",
     AWAITING_APPROVAL: "bg-rust-100 text-rust-800 border-rust-200",
     FAILED: "bg-rust-500/10 text-rust-500 border-rust-500/20",
   };
   ```

   (`COMPLETED`/`FAILED`/`RUNNING` move off raw `green`/`red`/`amber` onto the brand
   `signal-positive`/`rust`/`ember` tokens; `AWAITING_APPROVAL` was already on `rust-*` and stays.)

3. Read the reduced-motion flag once at the top of the component so the summary tiles can opt out
   of the hover lift. **Before** (lines 99–101):

   ```tsx
     const [, params] = useRoute("/runs/:id");
     const [, navigate] = useLocation();
     const id = params?.id ?? "";
   ```

   **After:**

   ```tsx
     const reduced = useReducedMotionSafe();
     const [, params] = useRoute("/runs/:id");
     const [, navigate] = useLocation();
     const id = params?.id ?? "";
   ```

4. Replace the flat 4-up summary card with a `<Stagger>` grid of four raised `springHover` tiles,
   each animating its numeric with `<CountUp>`. **Before** (lines 133–161):

   ```tsx
           {/* Summary */}
           <div className="bg-white border border-paper-200 rounded-lg p-5">
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
               <div>
                 <p className="text-xs text-ink-400 uppercase tracking-wide">Leads sourced</p>
                 <p className="text-xl font-mono font-semibold text-ink-900 mt-1">{run.leadsSourced}</p>
               </div>
               <div>
                 <p className="text-xs text-ink-400 uppercase tracking-wide">Drafts generated</p>
                 <p className="text-xl font-mono font-semibold text-ink-900 mt-1">{run.artifactsGenerated}</p>
               </div>
               <div>
                 <p className="text-xs text-ink-400 uppercase tracking-wide">Duration</p>
                 <p className="text-xl font-mono font-semibold text-ink-900 mt-1">
                   {run.durationMs > 0 ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
                 </p>
               </div>
               <div>
                 <p className="text-xs text-ink-400 uppercase tracking-wide">Cost</p>
                 <p className="text-xl font-mono font-semibold text-ink-900 mt-1">${run.costUsd.toFixed(3)}</p>
               </div>
             </div>
             <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-500">
               <span>Agents: {((run.agentsInvolved ?? []) as string[]).join(", ")}</span>
               <span>Triggered by: {run.triggeredBy}</span>
               <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
               {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
             </div>
           </div>
   ```

   **After:**

   ```tsx
           {/* Summary */}
           <div className="space-y-4">
             <Stagger className="grid grid-cols-2 sm:grid-cols-4 gap-3">
               <StaggerItem>
                 <motion.div
                   className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                   variants={reduced ? undefined : springHover}
                   initial="rest"
                   whileHover="hover"
                 >
                   <p className="text-xs text-ink-400 uppercase tracking-wide">Leads sourced</p>
                   <CountUp
                     value={run.leadsSourced}
                     className="block text-xl font-mono font-semibold text-ink-900 mt-1 font-tabular"
                   />
                 </motion.div>
               </StaggerItem>
               <StaggerItem>
                 <motion.div
                   className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                   variants={reduced ? undefined : springHover}
                   initial="rest"
                   whileHover="hover"
                 >
                   <p className="text-xs text-ink-400 uppercase tracking-wide">Drafts generated</p>
                   <CountUp
                     value={run.artifactsGenerated}
                     className="block text-xl font-mono font-semibold text-ink-900 mt-1 font-tabular"
                   />
                 </motion.div>
               </StaggerItem>
               <StaggerItem>
                 <motion.div
                   className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                   variants={reduced ? undefined : springHover}
                   initial="rest"
                   whileHover="hover"
                 >
                   <p className="text-xs text-ink-400 uppercase tracking-wide">Duration</p>
                   {run.durationMs > 0 ? (
                     <CountUp
                       value={run.durationMs / 1000}
                       decimals={1}
                       suffix="s"
                       className="block text-xl font-mono font-semibold text-ink-900 mt-1 font-tabular"
                     />
                   ) : (
                     <p className="text-xl font-mono font-semibold text-ink-900 mt-1">—</p>
                   )}
                 </motion.div>
               </StaggerItem>
               <StaggerItem>
                 <motion.div
                   className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                   variants={reduced ? undefined : springHover}
                   initial="rest"
                   whileHover="hover"
                 >
                   <p className="text-xs text-ink-400 uppercase tracking-wide">Cost</p>
                   <p className="text-xl font-mono font-semibold text-ink-900 mt-1 font-tabular">
                     $<CountUp value={run.costUsd} decimals={3} />
                   </p>
                 </motion.div>
               </StaggerItem>
             </Stagger>
             <div className="flex flex-wrap gap-3 text-xs text-ink-500">
               <span>Agents: {run.agentsInvolved.join(", ")}</span>
               <span>Triggered by: {run.triggeredBy}</span>
               <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
               {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
             </div>
           </div>
   ```

   Changes: the single flat card becomes a `<Stagger>` grid of four `<StaggerItem>` tiles, each a
   `bg-ink-0` `shadow-sm` card that lifts to `shadow-md` on hover via `springHover` (gated on
   `reduced`); raw numbers become `<CountUp>` (Cost renders `$` as a sibling of `<CountUp decimals={3}>`
   to reproduce `$X.XXX`; Duration uses `decimals={1}` + `suffix="s"` and falls back to `—` when
   zero; counts use the default `decimals=0`); the metadata footer drops the now-unnecessary
   `(run.agentsInvolved ?? []) as string[]` cast because `agentsInvolved` is a non-nullable
   `string[]` (`api.schemas.ts` line 499). The corner radius bumps `rounded-lg` → `rounded-xl` to
   match the ArtifactDetail tile language.

   > **Contract note — `prefix` on `<CountUp>`:** the PRIMITIVES P2 `CountUpProps` is
   > `{ value; decimals?; suffix?; duration?; className? }` (`20-primitives.md` lines 297–304) and
   > does **not** include `prefix`. The Cost tile needs a leading `$`. Resolve this **without
   > inventing a new prop name** by rendering the `$` as a sibling instead:
   > ```tsx
   >                   <p className="text-xl font-mono font-semibold text-ink-900 mt-1 font-tabular">
   >                     $<CountUp value={run.costUsd} decimals={3} />
   >                   </p>
   > ```
   > The AFTER block above already uses this sibling form for the Cost tile. The other three tiles
   > keep the block `<CountUp>` with `className`. This keeps the `CountUpProps` surface exactly as
   > PRIMITIVES shipped it.

5. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: passes (exit 0). `<CountUp value decimals? suffix? className?>` matches `CountUpProps`;
   `run.leadsSourced`/`artifactsGenerated`/`durationMs`/`costUsd` are all `number`
   (`api.schemas.ts` lines 500–503); `springHover` is a valid `Variants`; `<Stagger>`/`<StaggerItem>`
   accept `{ children, className }`. No `any` introduced (the removed `as string[]` cast was the
   only assertion on this block).

6. **Verify (off-palette status colors removed):**

   ```bash
   grep -nE "bg-green-100|bg-amber-100|bg-red-100|text-green-800|text-amber-800|text-red-800" artifacts/workforce-os/src/pages/RunDetail.tsx
   ```

   Expected: **no matches** — `STATUS_STYLES` now uses `signal-positive`/`ember`/`rust` tokens
   only.

7. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/RunDetail.tsx && \
     git commit -m "feat(run-detail): brand status tokens + raised staggered CountUp summary tiles

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-rundetail-2: Depth + connector-rail/dot-marker polish on the evidence-timeline tree

Re-skin the recursive `TimelineNode` so the tree reads as a real reasoning trace: each node gets
a type-colored dot marker on a continuous connector rail (the language from
`components/v2/TimelineTree.tsx`) instead of the bare hairline `border-l`, rows get a press
affordance, and the timeline card gets warm depth.

**Files:**
- Modify: `artifacts/workforce-os/src/pages/RunDetail.tsx` (`typeColors` map: add near line 23;
  `TimelineNode` component lines 39–96; timeline card lines 164–173)

1. Add a `NODE_DOT_COLORS` map next to `NODE_ICONS` so each node type gets a brand-colored marker.
   **Before** (lines 17–23):

   ```tsx
   const NODE_ICONS: Record<string, React.ReactNode> = {
     agent_run: <Bot className="h-3.5 w-3.5" />,
     llm_call: <Zap className="h-3.5 w-3.5" />,
     evaluator: <FlaskConical className="h-3.5 w-3.5" />,
     tool_call: <Wrench className="h-3.5 w-3.5" />,
     human_action: <User className="h-3.5 w-3.5" />,
   };
   ```

   **After:**

   ```tsx
   const NODE_ICONS: Record<string, React.ReactNode> = {
     agent_run: <Bot className="h-3.5 w-3.5" />,
     llm_call: <Zap className="h-3.5 w-3.5" />,
     evaluator: <FlaskConical className="h-3.5 w-3.5" />,
     tool_call: <Wrench className="h-3.5 w-3.5" />,
     human_action: <User className="h-3.5 w-3.5" />,
   };

   // Type-colored markers for the timeline rail (mirrors components/v2/TimelineTree colorMap).
   const NODE_DOT_COLORS: Record<string, string> = {
     agent_run: "bg-rust-500",
     llm_call: "bg-signal-info",
     evaluator: "bg-ember-400",
     tool_call: "bg-ink-900",
     human_action: "bg-paper-200 border border-ink-400",
   };
   ```

2. Replace the body of the `TimelineNode` component: swap the bare `border-l` for a depth-aware
   connector rail, add a type-colored dot marker pinned on the rail, and add a press affordance on
   clickable rows. **Before** (lines 39–95):

   ```tsx
   function TimelineNode({ node, depth = 0 }: { node: TimelineNodeData; depth?: number }) {
     const [expanded, setExpanded] = React.useState(depth === 0);
     const hasChildren = (node.children ?? []).length > 0;

     return (
       <div className={cn("relative", depth > 0 && "ml-4 pl-4 border-l border-paper-200")}>
         <div
           className={cn(
             "flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-paper-50 transition-colors",
             hasChildren && "cursor-pointer"
           )}
           onClick={() => hasChildren && setExpanded(!expanded)}
         >
           <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
             {hasChildren ? (
               expanded ? <ChevronDown className="h-3.5 w-3.5 text-ink-400" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-ink-400" />
             ) : (
               <div className="w-3.5" />
             )}
             <div className="text-ink-500">{NODE_ICONS[node.nodeType] ?? <Bot className="h-3.5 w-3.5" />}</div>
           </div>

           <div className="flex-1 min-w-0">
             <div className="flex items-center gap-2 flex-wrap">
               <span className="text-sm font-medium text-ink-900">{node.label}</span>
               <span className="text-xs text-ink-400 capitalize">{node.nodeType.replace(/_/g, " ")}</span>
               {node.score != null && (
                 <span className="text-xs font-mono text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                   {Math.round(node.score * 100)}%
                 </span>
               )}
               {node.durationMs != null && node.durationMs > 0 && (
                 <span className="text-xs text-ink-400 font-mono">{node.durationMs}ms</span>
               )}
               {node.tokensUsed != null && (
                 <span className="text-xs text-ink-400 font-mono">{node.tokensUsed} tok</span>
               )}
               {node.cost != null && (
                 <span className="text-xs text-ink-400 font-mono">${node.cost.toFixed(3)}</span>
               )}
             </div>
             <p className="text-xs text-ink-600 mt-0.5">{node.summary}</p>
             {node.reasoning && expanded && (
               <p className="text-xs text-ink-400 mt-1 italic">{node.reasoning}</p>
             )}
           </div>
         </div>

         {expanded && hasChildren && (
           <div className="mt-1 space-y-1">
             {node.children.map((child) => (
               <TimelineNode key={child.id} node={child} depth={depth + 1} />
             ))}
           </div>
         )}
       </div>
     );
   }
   ```

   **After:**

   ```tsx
   function TimelineNode({ node, depth = 0 }: { node: TimelineNodeData; depth?: number }) {
     const [expanded, setExpanded] = React.useState(depth === 0);
     const hasChildren = (node.children ?? []).length > 0;

     return (
       <div className={cn("relative", depth > 0 && "ml-3 pl-5 border-l-2 border-paper-200")}>
         {/* Type-colored marker pinned on the connector rail. */}
         {depth > 0 && (
           <span
             className={cn(
               "absolute left-[-7px] top-3.5 h-3 w-3 rounded-full ring-4 ring-paper-50",
               NODE_DOT_COLORS[node.nodeType] ?? "bg-ink-400"
             )}
           />
         )}
         <div
           className={cn(
             "flex items-start gap-3 py-2 px-3 rounded-lg transition-colors hover-elevate",
             hasChildren && "cursor-pointer active-elevate-2"
           )}
           onClick={() => hasChildren && setExpanded(!expanded)}
         >
           <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
             {hasChildren ? (
               expanded ? <ChevronDown className="h-3.5 w-3.5 text-ink-400" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-ink-400" />
             ) : (
               <div className="w-3.5" />
             )}
             <div className="text-ink-500">{NODE_ICONS[node.nodeType] ?? <Bot className="h-3.5 w-3.5" />}</div>
           </div>

           <div className="flex-1 min-w-0">
             <div className="flex items-center gap-2 flex-wrap">
               <span className="text-sm font-medium text-ink-900">{node.label}</span>
               <span className="text-xs text-ink-400 capitalize">{node.nodeType.replace(/_/g, " ")}</span>
               {node.score != null && (
                 <span
                   className={cn(
                     "text-xs font-mono px-1.5 py-0.5 rounded font-tabular",
                     node.score >= 0.85
                       ? "text-signal-positive bg-signal-positive/10"
                       : node.score >= 0.7
                         ? "text-ember-500 bg-ember-400/15"
                         : "text-rust-500 bg-rust-500/10"
                   )}
                 >
                   {Math.round(node.score * 100)}%
                 </span>
               )}
               {node.durationMs != null && node.durationMs > 0 && (
                 <span className="text-xs text-ink-400 font-mono">{node.durationMs}ms</span>
               )}
               {node.tokensUsed != null && (
                 <span className="text-xs text-ink-400 font-mono">{node.tokensUsed} tok</span>
               )}
               {node.cost != null && (
                 <span className="text-xs text-ink-400 font-mono">${node.cost.toFixed(3)}</span>
               )}
             </div>
             <p className="text-xs text-ink-600 mt-0.5">{node.summary}</p>
             {node.reasoning && expanded && (
               <p className="text-xs text-ink-400 mt-1 italic">{node.reasoning}</p>
             )}
           </div>
         </div>

         {expanded && hasChildren && (
           <div className="mt-1 space-y-1">
             {node.children.map((child) => (
               <TimelineNode key={child.id} node={child} depth={depth + 1} />
             ))}
           </div>
         )}
       </div>
     );
   }
   ```

   Changes: the child wrapper's hairline `border-l border-paper-200` becomes a `border-l-2`
   connector rail (`ml-3 pl-5`); each non-root node renders an absolutely-positioned
   `ring-4 ring-paper-50` dot marker colored by `NODE_DOT_COLORS` and pinned onto the rail at
   `left-[-7px]` so the dot sits centered on the 2px line; the flat `hover:bg-paper-50` row becomes
   `.hover-elevate` (warm depth on hover) with `.active-elevate-2` press affordance on clickable
   (parent) rows; and the score chip moves off raw `text-green-700 bg-green-50` onto brand
   `signal-positive`/`ember`/`rust` thresholds (≥85 / ≥70 / below).

3. Raise the timeline card to warm depth and bump its radius. **Before** (lines 164–166):

   ```tsx
           {/* Timeline */}
           {(timeline ?? []).length > 0 && (
             <div className="bg-white border border-paper-200 rounded-lg p-5">
               <h2 className="font-serif font-semibold text-ink-900 mb-4">Evidence Timeline</h2>
   ```

   **After:**

   ```tsx
           {/* Timeline */}
           {(timeline ?? []).length > 0 && (
             <div className="bg-ink-0 border border-paper-200 rounded-xl p-5 shadow-sm">
               <h2 className="font-serif font-semibold text-ink-900 mb-4">Evidence Timeline</h2>
   ```

   (`bg-white` → `bg-ink-0` so the ink-tinted warm shadow reads in dark mode; `rounded-lg` →
   `rounded-xl`; add `shadow-sm`.)

4. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: passes (exit 0). `node.score` is `number | null | undefined` (`api.schemas.ts`
   line 542); the `node.score >= 0.85 / >= 0.7` comparisons are inside the existing
   `node.score != null` guard, so they narrow to `number`. `NODE_DOT_COLORS[node.nodeType]` is a
   `string | undefined` indexed by `string`, resolved by the `?? "bg-ink-400"` fallback. No
   structural type change.

5. **Verify (off-palette score chip removed + connector present):**

   ```bash
   grep -nE "text-green-700|bg-green-50|hover:bg-paper-50" artifacts/workforce-os/src/pages/RunDetail.tsx; \
   grep -c "NODE_DOT_COLORS\[node.nodeType\]" artifacts/workforce-os/src/pages/RunDetail.tsx
   ```

   Expected: first grep returns **no matches** (score chip on `signal/ember/rust`, row uses
   `.hover-elevate` not `hover:bg-paper-50`); second count is `1` (the dot marker reads
   `NODE_DOT_COLORS`).

6. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/RunDetail.tsx && \
     git commit -m "feat(run-detail): depth + connector-rail/dot-marker polish on evidence timeline

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-rundetail-3: Node-enter stagger animation on the top-level timeline

Cascade the top-level timeline nodes in on mount with `<Stagger>`/`<StaggerItem>` so the trace
builds top-to-bottom instead of all appearing at once. Reduced-motion users get the instant render
for free (both primitives branch on `useReducedMotionSafe` internally).

**Files:**
- Modify: `artifacts/workforce-os/src/pages/RunDetail.tsx` (timeline node list lines 167–171)

1. Wrap the top-level node list in `<Stagger>` and each root node in `<StaggerItem>`. **Before**
   (lines 167–171):

   ```tsx
             <div className="space-y-1">
               {(timeline as TimelineNodeData[]).map((node) => (
                 <TimelineNode key={node.id} node={node} />
               ))}
             </div>
   ```

   **After:**

   ```tsx
             <Stagger className="space-y-1">
               {(timeline as TimelineNodeData[]).map((node) => (
                 <StaggerItem key={node.id}>
                   <TimelineNode node={node} />
                 </StaggerItem>
               ))}
             </Stagger>
   ```

   The outer `div` becomes `<Stagger>` (renders a `motion.div` carrying `staggerContainer` and
   forwarding `className`, so `space-y-1` is preserved); each root `<TimelineNode>` is wrapped in a
   `<StaggerItem>` (renders a `motion.div` with `staggerItem`, carrying the `key`). Result:
   top-level nodes fade + slide in, cascading ~60ms apart. Only the **top level** staggers — child
   nodes still expand instantly inside their parent, which keeps the expand/collapse interaction
   snappy. Reduced-motion users get the plain `div`/fragment fallback.

2. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both exit 0. `<Stagger>`/`<StaggerItem>` accept `{ children, className }` (PRIMITIVES
   P2 signature) and `StaggerItem` carries an arbitrary `key` like any React element. No `any`
   introduced (the existing `timeline as TimelineNodeData[]` assertion is unchanged — it predates
   this section).

3. **Visual verify (light + dark):** start the dev server and navigate to a real run
   (`/runs/<id>`). On load the top-level timeline nodes should cascade in (fade + slight upward
   slide, staggered ~60ms apart) rather than appearing at once; expanding a parent node should
   reveal its children instantly with the connector rail + type-colored dot markers visible.
   Toggle dark mode via the topbar `ThemeToggle` and re-check (stagger + rail + dots still read).
   Screenshot both. Enable `prefers-reduced-motion: reduce` (devtools → Rendering) and confirm the
   cascade collapses to an instant render. Stop the dev server.

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```

   Expected: staggered node entrance in both themes; instant render under reduced motion.

4. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/RunDetail.tsx && \
     git commit -m "feat(run-detail): stagger node-enter motion on the evidence timeline

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-rundetail-4: ErrorState on failed run fetch + EmptyState for missing run

The page ignores `useGetRun`'s `isError` and renders a flat `Run not found` string on **any**
failure (line 115). Destructure `isError`/`refetch` and add an explicit error branch that renders
the shared `<ErrorState onRetry={refetch}>`, so a transient fetch failure shows a recoverable,
branded state instead of an indistinguishable "not found" string. The genuinely-missing run keeps
a friendly `<EmptyState>`.

**Files:**
- Modify: `artifacts/workforce-os/src/pages/RunDetail.tsx` (imports lines 1–8; query destructure
  line 103; loading/error/empty branches lines 107–115)

1. Add the state-primitive imports + the lucide `Activity` icon for the empty state. **Before**
   (lines 4–8, after the edits from R-rundetail-1):

   ```tsx
   import { Button } from "@/components/ui/button";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Badge } from "@/components/ui/badge";
   import { ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon, Bot, Zap, FlaskConical, Wrench, User } from "lucide-react";
   import { cn } from "@/lib/utils";
   ```

   **After:**

   ```tsx
   import { Button } from "@/components/ui/button";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Badge } from "@/components/ui/badge";
   import { ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon, Bot, Zap, FlaskConical, Wrench, User, Activity } from "lucide-react";
   import { cn } from "@/lib/utils";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   ```

   (`Activity` is a valid lucide-react icon and a `LucideIcon`, satisfying `EmptyState`'s `icon`
   prop, and matches the "run/trace" semantics of this surface.)

2. Destructure `isError` and `refetch` from the query. **Before** (lines 103–105):

   ```tsx
     const { data, isLoading } = useGetRun(id, {
       query: { queryKey: ["getRun", id], enabled: !!id },
     });
   ```

   **After:**

   ```tsx
     const { data, isLoading, isError, refetch } = useGetRun(id, {
       query: { queryKey: ["getRun", id], enabled: !!id },
     });
   ```

3. Replace the loading + bare not-found branches with loading + error + empty. **Before**
   (lines 107–115):

   ```tsx
     if (isLoading) return (
       <div className="p-6 space-y-4 max-w-3xl mx-auto">
         <Skeleton className="h-8 w-40" />
         <Skeleton className="h-24 w-full" />
         <Skeleton className="h-64 w-full" />
       </div>
     );

     if (!data) return <div className="p-6 text-ink-400">Run not found</div>;
   ```

   **After:**

   ```tsx
     if (isLoading) return (
       <div className="p-6 space-y-4 max-w-3xl mx-auto">
         <Skeleton className="h-8 w-40" />
         <Skeleton className="h-24 w-full" />
         <Skeleton className="h-64 w-full" />
       </div>
     );

     if (isError) return (
       <div className="flex h-full items-center justify-center bg-paper-50">
         <ErrorState
           title="Couldn't load this run"
           description="The run service didn't respond. Your data is safe — try again."
           onRetry={() => refetch()}
         />
       </div>
     );

     if (!data) return (
       <div className="flex h-full items-center justify-center bg-paper-50">
         <EmptyState
           icon={Activity}
           title="Run not found"
           description="This run may have been deleted or never existed. Head back to your runs to find it."
           action={
             <Button
               variant="outline"
               size="sm"
               className="border-paper-300 hover-elevate active-elevate-2"
               onClick={() => navigate("/runs")}
             >
               <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Runs
             </Button>
           }
         />
       </div>
     );
   ```

   (`ErrorState`'s signature is `{ title?, description?, onRetry? }` and `EmptyState`'s is
   `{ icon, title, description, action? }` — both PRIMITIVES P3. Wrapping `refetch` in an arrow
   drops its `Promise` return to match the `() => void` prop type. The centering wrapper gives the
   editorial state room on this full-height surface; the empty state's `action` reuses the existing
   `navigate` to return to `/runs`.)

4. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both exit 0. `isError` is `boolean` and `refetch` is callable on `UseQueryResult`
   (generated hook returns `UseQueryResult & { queryKey }`, `api.ts` line 1662); `() => refetch()`
   satisfies `onRetry?: () => void`; `Activity` is a `LucideIcon` matching `EmptyState`'s `icon`.

5. **Verify (no bare not-found string remains):**

   ```bash
   grep -n "Run not found</div>" artifacts/workforce-os/src/pages/RunDetail.tsx
   ```

   Expected: **no matches** — the legacy `<div className="p-6 text-ink-400">Run not found</div>` is
   gone, replaced by `<EmptyState>`.

6. **Visual verify (light + dark):** dev server up. Force an error by stopping the API/DB (or in
   devtools, block the `getRun` request) and navigate to `/runs/<id>`. Confirm the editorial
   `<ErrorState>` renders (rust-tinted AlertTriangle chip, Lora title, "Try again" button) instead
   of the old flat string. Click **Try again** and confirm it re-fetches. Then navigate to a bogus
   id (e.g. `/runs/does-not-exist`) and confirm the `<EmptyState>` (Activity chip, Lora title,
   "Back to Runs" action) renders. Toggle dark mode and re-check both. Screenshot both themes. Stop
   the dev server.

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```

   Expected: error branch with working retry + distinct empty branch with "Back to Runs", both in
   both themes.

7. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/RunDetail.tsx && \
     git commit -m "feat(run-detail): ErrorState with retry on fetch failure + EmptyState for missing run

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section 52 — Done criteria

- [ ] Status badge map uses brand `signal-positive`/`ember`/`rust` tokens — no `bg-green-100`/
      `bg-amber-100`/`bg-red-100` anywhere in the file.
- [ ] Summary KPI grid is four individually-raised `bg-ink-0` `shadow-sm` tiles that lift on hover
      via `springHover`, stagger in via `<Stagger>`/`<StaggerItem>`, and animate their numerics via
      `<CountUp>` (Cost `$X.XXX`, Duration `X.Xs` with `—` fallback, counts integer).
- [ ] Evidence-timeline tree has a `border-l-2` connector rail with per-node type-colored dot
      markers (`ring-4 ring-paper-50`), rows use `.hover-elevate`/`.active-elevate-2` instead of
      flat `hover:bg-paper-50`, and the score chip uses `signal/ember/rust` thresholds (no
      `text-green-700`/`bg-green-50`).
- [ ] Timeline card raised to `bg-ink-0` `rounded-xl` `shadow-sm`.
- [ ] Top-level timeline nodes cascade in via `<Stagger>`/`<StaggerItem>`; children still expand
      instantly.
- [ ] Fetch failure shows `<ErrorState onRetry={refetch}>`; missing run shows `<EmptyState>` with a
      "Back to Runs" action — no bare `Run not found` string.
- [ ] All four tasks: `typecheck` + `build` pass; visual verified light + dark; each committed with
      the Co-Authored-By trailer.
- [ ] All motion respects `useReducedMotionSafe()` (summary tile hover + stagger, node-enter
      stagger all opt out under reduced motion; CountUp snaps to final value).

### Section dependencies & ordering

- **FOUNDATION** (warm `--shadow-*`, palette tokens incl. `bg-ink-0`/`signal-*`/`ember-*`, elevate
  utilities) and **PRIMITIVES** (P1 motion lib, P2 `<Stagger>`/`<StaggerItem>`/`<CountUp>`, P3
  `<EmptyState>`/`<ErrorState>`) must land first.
- **R-rundetail-1 → 2 → 3 → 4**: do them in order. R-1 establishes the import block (adds `motion`,
  `cardEnter`/`springHover`/`useReducedMotionSafe`, `Stagger`/`StaggerItem`, `CountUp`) and the
  `reduced` flag that R-2/R-3 rely on. R-2 re-skins the `TimelineNode` component + adds
  `NODE_DOT_COLORS`. R-3 wraps the top-level node list that R-2 left intact. R-4 appends the state
  imports to the same block and adds the error/empty branches (independent of R-2/R-3's tree edits).
- This section owns **only** `pages/RunDetail.tsx` and its inline `TimelineNode`. The sibling
  `components/v2/EvidenceTimeline.tsx` and `components/v2/TimelineTree.tsx` (a separate Sheet/preview
  surface) are **out of scope** and must not be edited — R-2 only *borrows* their `colorMap` /
  dot-marker language. There is no `dangerouslySetInnerHTML` on this surface, so `sanitizeHtml` is
  not imported here. Every imported name (`Stagger`, `StaggerItem`, `CountUp`, `EmptyState`,
  `ErrorState`, `cardEnter`, `springHover`, `useReducedMotionSafe`) matches the SHARED CONTRACT
  exactly.


---

## ROUTE — AGENTS

This section applies the Nikxius premium treatment to the **agents** surface (`/agents`, the
"Agent Roster") and closes its specific leaks. The surface is a single file:

- `pages/Agents.tsx` — a polling grid of agent cards (status dot, inline sparkline, recent
  activity count, description, last-action footer).

### Grounding facts (verified against the live tree on 2026-06-07)

- **A dead canonical component + a duplicated re-implementation.**
  `components/v2/SparklineChart.tsx` exports `SparklineChart({ data, width?, height? })` and
  is imported **nowhere** (`grep -rn "SparklineChart"` returns only its own definition and
  `Agents.tsx`). Meanwhile `pages/Agents.tsx` lines 6-29 hand-roll a **second** local
  `function SparklineChart({ data }: { data: number[] })` that the grid uses at line 78.
  R-agents-1 deletes the local copy and switches the import to the canonical one. The two
  differ on purpose: the canonical version uses `fill="currentColor"` with
  `text-rust-500 opacity-40 hover:opacity-100 transition-opacity` (the **sparkline hover**
  micro-interaction the leak list calls for), whereas the inline copy is a flat
  `fill-rust-300` with no hover. Swapping in the canonical version is what *adds* the hover.
- **The card has no depth and no motion.** Each card is `bg-white border border-paper-200
  rounded-lg p-5` (line 71) — a cool, flat 1px box. No warm shadow token, no hover lift, no
  entrance animation. R-agents-2 gives it `bg-ink-0 … shadow-sm hover:shadow-md` depth + a
  press affordance and staggers the grid in.
- **No empty state, no error state.** The render is a binary `isLoading ? <skeletons> :
  <grid>` (lines 60-114). The query's `isError`/`error` are never read, so a failed
  `useListAgents` shows an **empty grid forever**; an org with zero agents shows a bare blank
  panel with no copy. R-agents-2 adds `<ErrorState onRetry={refetch}>` and `<EmptyState>`.
- **The metric is a static string.** `recentActivityCount` renders as a plain
  `{agent.recentActivityCount}` (line 80) with no count-up; on the 10 s `refetchInterval`
  (line 48) it snaps. R-agents-2 wraps it in `<CountUp>`.
- **No `dangerouslySetInnerHTML` anywhere** in this file — `sanitizeHtml` is **not**
  applicable here (all text is plain). Do not add it.
- **Agent type is fully known** (from `lib/api-client-react/src/generated/api.schemas.ts`
  lines 573-584): `Agent { id, name, type: AgentType, status: AgentStatus, lastAction?:
  string|null, lastActionAt?: string|null, recentActivityCount: number, sparklineData:
  number[] }`. `AgentStatus = 'idle'|'running'|'error'`. `sparklineData` is **non-nullable
  `number[]`**, so the existing `(agent.sparklineData ?? []) as number[]` cast at line 78 can
  be simplified to `agent.sparklineData`. `useListAgents` resolves to `Agent[]` (not a
  `{ items }` envelope) and exposes the standard TanStack `isError`/`refetch`.
- **Depends on:** FOUNDATION (palette `paper-*`/`ink-*`/`rust-*`, warm shadow tokens
  `--shadow-sm`/`--shadow-md`, `.hover-elevate`/`.active-elevate-2`) and PRIMITIVES
  (P1 motion lib `@/lib/motion`, P2 `<Stagger>`/`<StaggerItem>` + `<CountUp>` from
  `@/components/motion/*`, P3 `<EmptyState>`/`<ErrorState>` from `@/components/states/*`).
  All names below match the SHARED CONTRACT exactly. PageTransition is already wired at the
  router level in PRIMITIVES P2 step 4, so this page needs no per-page page-transition
  wrapper.

---

### Task R-agents-1: De-dupe — delete the inline SparklineChart, use the canonical v2 one (adds sparkline hover)

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Agents.tsx`
  - imports (lines 1-4)
  - inline `SparklineChart` definition (lines 6-29)
  - sparkline call site (line 78)

**Steps:**

1. Add the canonical import and drop the now-unused `cn` only if it becomes unused — it does
   **not** (it is still used at line 74 for the status dot), so keep it. Replace lines 1-4:

   **BEFORE** (lines 1-4):
   ```tsx
   import React from "react";
   import { useListAgents } from "@workspace/api-client-react";
   import { Skeleton } from "@/components/ui/skeleton";
   import { cn } from "@/lib/utils";
   ```

   **AFTER**:
   ```tsx
   import React from "react";
   import { useListAgents } from "@workspace/api-client-react";
   import { Skeleton } from "@/components/ui/skeleton";
   import { SparklineChart } from "@/components/v2/SparklineChart";
   import { cn } from "@/lib/utils";
   ```

2. Delete the entire inline `SparklineChart` re-implementation. Remove lines 6-29 (the whole
   block below, including the trailing blank line at 30 so the file collapses cleanly into the
   `STATUS_CONFIG` const).

   **BEFORE** (lines 6-30):
   ```tsx
   function SparklineChart({ data }: { data: number[] }) {
     const max = Math.max(...data, 1);
     const H = 24;
     const W = 80;
     const barW = Math.floor(W / data.length) - 1;
     return (
       <svg width={W} height={H} className="shrink-0">
         {data.map((val, i) => {
           const h = Math.max(1, Math.round((val / max) * H));
           return (
             <rect
               key={i}
               x={i * (barW + 1)}
               y={H - h}
               width={barW}
               height={h}
               className="fill-rust-300"
               rx="1"
             />
           );
         })}
       </svg>
     );
   }

   ```

   **AFTER** (the block is gone entirely — the file now goes straight from the imports to
   `const STATUS_CONFIG = {`):
   ```tsx
   const STATUS_CONFIG = {
   ```

3. Simplify the now-redundant cast at the call site. The canonical component is typed
   `data: number[]` and `Agent.sparklineData` is a non-nullable `number[]`, so the
   `?? []` fallback and the `as number[]` cast are both dead. Replace the call site (was
   line 78, now shifted up ~24 lines after the deletion):

   **BEFORE**:
   ```tsx
                     <SparklineChart data={(agent.sparklineData ?? []) as number[]} />
   ```

   **AFTER**:
   ```tsx
                     <SparklineChart data={agent.sparklineData} />
   ```

   > The canonical component's props are exactly `{ data: number[], width?, height? }` — it
   > has **no `className` prop**, so do not pass one. Rust color and the hover reveal are
   > already hard-coded inside it (`fill="currentColor"` +
   > `className="text-rust-500 opacity-40 hover:opacity-100 transition-opacity"`), which is
   > precisely the sparkline-hover micro-interaction this de-dupe is meant to deliver. The
   > defaults `width=80`/`height=24` match the inline component's old `W=80`/`H=24`, so the
   > chart footprint is unchanged.

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. No `'SparklineChart' is declared but never used` (the local def is
   gone), no duplicate-identifier error (only one `SparklineChart` in scope now — the import),
   and `cn` is still referenced (line 74 status dot) so no unused-import error.

5. **Visual verify:** start the dev server, navigate to `/agents`, and hover one card's
   sparkline. Confirm the bars fade from `opacity-40` to full `opacity-100` on hover (the
   behavior the inline copy never had), and that the chart still reads rust against the card.
   Screenshot light **and** dark (toggle via topbar).
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Agents.tsx && \
     git commit -m "refactor(agents): de-dupe SparklineChart — use canonical v2 component

   Deletes the inline SparklineChart re-implementation in Agents.tsx and switches to
   the canonical src/components/v2/SparklineChart, which renders bars via currentColor
   with an opacity-40→100 hover reveal. Drops the dead '?? []'/'as number[]' cast now
   that sparklineData is a non-nullable number[].

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-agents-2: Premium agent cards — warm depth, staggered grid, CountUp, EmptyState/ErrorState

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Agents.tsx`
  - imports (lines 1-5, as left by R-agents-1)
  - query (lines 47-49)
  - grid body (lines 59-115)

Run **after** R-agents-1 (this task assumes the canonical `SparklineChart` import is already
in place and the inline copy is gone, so line numbers below reflect the post-R-agents-1 file).

**Steps:**

1. Add the motion + state-primitive imports. Replace the import block (lines 1-5 after
   R-agents-1):

   **BEFORE** (lines 1-5):
   ```tsx
   import React from "react";
   import { useListAgents } from "@workspace/api-client-react";
   import { Skeleton } from "@/components/ui/skeleton";
   import { SparklineChart } from "@/components/v2/SparklineChart";
   import { cn } from "@/lib/utils";
   ```

   **AFTER**:
   ```tsx
   import React from "react";
   import { useListAgents } from "@workspace/api-client-react";
   import { Skeleton } from "@/components/ui/skeleton";
   import { SparklineChart } from "@/components/v2/SparklineChart";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { CountUp } from "@/components/motion/CountUp";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { Bot } from "lucide-react";
   import { cn } from "@/lib/utils";
   ```

2. Read `isError` + `refetch` off the query so the grid can render an `<ErrorState>` with a
   working retry. Replace the query (lines 47-49):

   **BEFORE** (lines 47-49):
   ```tsx
     const { data: agents, isLoading } = useListAgents({
       query: { queryKey: ["listAgents"], refetchInterval: 10000 },
     });
   ```

   **AFTER**:
   ```tsx
     const { data: agents, isLoading, isError, refetch } = useListAgents({
       query: { queryKey: ["listAgents"], refetchInterval: 10000 },
     });
   ```

3. Replace the entire grid body so it (a) renders `<ErrorState onRetry>` on failure,
   (b) renders `<EmptyState>` when the roster is empty, (c) wraps the cards in
   `<Stagger>`/`<StaggerItem>`, (d) gives each card warm `shadow-sm`→`shadow-md` depth plus a
   `.hover-elevate`/`.active-elevate-2` press affordance on a dark-mode-safe `bg-ink-0`
   surface, and (e) counts the activity metric up via `<CountUp>`. Replace lines 59-115 (the
   `<div className="p-6">…</div>` block):

   **BEFORE** (lines 59-115):
   ```tsx
         <div className="p-6">
           {isLoading ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               {Array.from({ length: 4 }).map((_, i) => (
                 <Skeleton key={i} className="h-36 rounded-lg" />
               ))}
             </div>
           ) : (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               {(agents ?? []).map((agent) => {
                 const statusCfg = STATUS_CONFIG[agent.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.idle;
                 return (
                   <div key={agent.id} className="bg-white border border-paper-200 rounded-lg p-5">
                     <div className="flex items-start justify-between mb-3">
                       <div className="flex items-center gap-2">
                         <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", statusCfg.dot)} />
                         <h3 className="font-serif font-semibold text-ink-900">{agent.name}</h3>
                       </div>
                       <div className="flex items-center gap-3">
                         <SparklineChart data={agent.sparklineData} />
                         <div className="text-right">
                           <p className="text-xs font-mono text-rust-600 font-semibold">{agent.recentActivityCount}</p>
                           <p className="text-xs text-ink-400">events</p>
                         </div>
                       </div>
                     </div>

                     <p className="text-xs text-ink-500 mb-3 leading-relaxed">
                       {AGENT_DESCRIPTIONS[agent.type] ?? "AI agent handling automated tasks."}
                     </p>

                     <div className="flex items-center justify-between">
                       <div>
                         <p className="text-xs text-ink-400">
                           {statusCfg.label}
                           {agent.lastActionAt && (
                             <span className="ml-1 text-ink-300">
                               · {new Date(agent.lastActionAt).toLocaleTimeString()}
                             </span>
                           )}
                         </p>
                         {agent.lastAction && (
                           <p className="text-xs text-ink-600 mt-0.5 truncate max-w-[200px]">
                             {agent.lastAction}
                           </p>
                         )}
                       </div>
                       <span className="text-xs text-ink-300 font-mono capitalize px-2 py-0.5 bg-paper-100 rounded">
                         {agent.type}
                       </span>
                     </div>
                   </div>
                 );
               })}
             </div>
           )}
         </div>
   ```

   **AFTER**:
   ```tsx
         <div className="p-6">
           {isLoading ? (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               {Array.from({ length: 4 }).map((_, i) => (
                 <Skeleton key={i} className="h-36 rounded-lg" />
               ))}
             </div>
           ) : isError ? (
             <ErrorState
               title="Couldn't load your agents"
               description="The agent roster failed to load. Check your connection and try again."
               onRetry={() => refetch()}
             />
           ) : (agents ?? []).length === 0 ? (
             <EmptyState
               icon={Bot}
               title="No agents yet"
               description="Your workspace has no agents configured. Agents appear here once your workforce is provisioned."
             />
           ) : (
             <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               {(agents ?? []).map((agent) => {
                 const statusCfg = STATUS_CONFIG[agent.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.idle;
                 return (
                   <StaggerItem key={agent.id}>
                     <div className="hover-elevate active-elevate-2 bg-ink-0 border border-paper-200 rounded-lg p-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
                       <div className="flex items-start justify-between mb-3">
                         <div className="flex items-center gap-2">
                           <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", statusCfg.dot)} />
                           <h3 className="font-serif font-semibold text-ink-900">{agent.name}</h3>
                         </div>
                         <div className="flex items-center gap-3">
                           <SparklineChart data={agent.sparklineData} />
                           <div className="text-right">
                             <CountUp
                               value={agent.recentActivityCount}
                               className="block text-xs font-mono text-rust-600 font-semibold"
                             />
                             <p className="text-xs text-ink-400">events</p>
                           </div>
                         </div>
                       </div>

                       <p className="text-xs text-ink-500 mb-3 leading-relaxed">
                         {AGENT_DESCRIPTIONS[agent.type] ?? "AI agent handling automated tasks."}
                       </p>

                       <div className="flex items-center justify-between">
                         <div>
                           <p className="text-xs text-ink-400">
                             {statusCfg.label}
                             {agent.lastActionAt && (
                               <span className="ml-1 text-ink-300">
                                 · {new Date(agent.lastActionAt).toLocaleTimeString()}
                               </span>
                             )}
                           </p>
                           {agent.lastAction && (
                             <p className="text-xs text-ink-600 mt-0.5 truncate max-w-[200px]">
                               {agent.lastAction}
                             </p>
                           )}
                         </div>
                         <span className="text-xs text-ink-300 font-mono capitalize px-2 py-0.5 bg-paper-100 rounded">
                           {agent.type}
                         </span>
                       </div>
                     </div>
                   </StaggerItem>
                 );
               })}
             </Stagger>
           )}
         </div>
   ```

   > Notes:
   > - `<Stagger>` accepts a `className` (PRIMITIVES P2 `StaggerProps { children, className? }`)
   >   and renders a `motion.div`, so moving the `grid grid-cols-1 sm:grid-cols-2 gap-4`
   >   classes onto it preserves the exact 2-up grid while making it the stagger container.
   > - `<CountUp>` renders a `<span>`; the `block text-xs font-mono text-rust-600
   >   font-semibold` classes reproduce the old `<p>` styling (the metric was previously a
   >   `<p className="text-xs font-mono text-rust-600 font-semibold">`), so the layout is
   >   pixel-identical at rest and animates on the 10 s refetch.
   > - `bg-white` → `bg-ink-0` so the card surface flips correctly in dark mode (per the
   >   FOUNDATION surface convention used by the outbound/conversations sections).
   > - `.hover-elevate`/`.active-elevate-2` add the warm overlay press affordance; the
   >   `shadow-sm`→`hover:shadow-md` transition is the raised-card depth language from
   >   `43-route-outbound.md`. The two compose: overlay tint on press, shadow lift on hover.

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `Bot` (lucide) is now used by the `<EmptyState>` icon; `Stagger`,
   `StaggerItem`, `CountUp`, `EmptyState`, `ErrorState` are all referenced; no unused-import
   error. `CountUp value={agent.recentActivityCount}` typechecks (`recentActivityCount:
   number`), and `onRetry={() => refetch()}` matches `ErrorState`'s `onRetry?: () => void`.

5. **Visual verify:** dev server up at `/agents`. Confirm:
   - On first paint the cards **stagger in** (fade-slide-up, ~60 ms apart) rather than
     appearing at once.
   - Hovering a card lifts it (`shadow-sm`→`shadow-md`) with the warm `.hover-elevate`
     overlay; pressing it shows `.active-elevate-2`.
   - The `recentActivityCount` **counts up** on load and re-animates on the 10 s refetch.
   - Force an error (block the `/agents` request in devtools, or point at a bad API base) and
     confirm the `<ErrorState>` card with a working "Try again" button replaces the grid.
   - With an empty roster the `<EmptyState>` "No agents yet" card (rounded `Bot` chip, serif
     title) renders instead of a blank panel.
   Screenshot light **and** dark for the loaded grid and for the EmptyState.

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Agents.tsx && \
     git commit -m "feat(agents): premium roster — warm card depth, Stagger, CountUp, Empty/ErrorState

   Gives agent cards bg-ink-0 + warm shadow-sm→shadow-md depth and a hover-elevate/
   active-elevate-2 press affordance, staggers the grid in via Stagger/StaggerItem,
   animates recentActivityCount with CountUp, and replaces the binary loading/grid
   render with ErrorState (retry on query failure) and EmptyState (zero agents).

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-agents-3: Premium header — warm shadow surface + editorial subtitle

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Agents.tsx`
  - sticky header (lines 54-57)

Run any time after R-agents-1 (it does not depend on R-agents-2; the header is untouched by
the grid edits). Line numbers reference the post-R-agents-1 file.

**Steps:**

1. Raise the sticky header onto a warm `shadow-sm` surface so it matches the depth language of
   the conversations/runs headers, and flip its surface for dark mode. Replace the header
   opening tag (line 54):

   **BEFORE** (line 54):
   ```tsx
         <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-6 py-4">
   ```

   **AFTER**:
   ```tsx
         <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 shadow-sm px-6 py-4">
   ```

   > `shadow-sm` is the warm ink-tinted token from FOUNDATION F3; `z-10` (already present)
   > keeps the shadow above the scrolling grid. `bg-paper-100` already flips correctly in dark
   > mode, so no surface-token change is needed here (unlike the white card bodies).

2. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. Pure className change — no symbol or import change.

3. **Visual verify:** dev server up at `/agents`. Scroll the grid under the header and confirm
   the header now casts a soft warm shadow onto the scrolling content (it previously had only
   a 1px border). Screenshot light **and** dark; confirm the shadow reads warm in light and
   the header surface flips in dark.

4. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Agents.tsx && \
     git commit -m "feat(agents): raise roster header onto warm shadow-sm surface

   Adds the warm shadow-sm token to the sticky Agent Roster header so it anchors above
   the scrolling grid, matching the conversations/runs header depth convention.

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **R-agents-1 → R-agents-2 → R-agents-3** all edit the single file `pages/Agents.tsx`; run
  in order. R-agents-1 must go first because it establishes the canonical `SparklineChart`
  import and removes the inline copy that shifts every subsequent line number; R-agents-2's
  BEFORE/AFTER blocks assume the post-R-agents-1 line layout. R-agents-3 is independent of
  R-agents-2 (header only) but is sequenced last so each task commits a clean, typechecking
  tree.
- All three require FOUNDATION (warm shadow tokens `--shadow-sm`/`--shadow-md`,
  `.hover-elevate`/`.active-elevate-2`) and PRIMITIVES (motion lib P1, `<Stagger>`/
  `<StaggerItem>`/`<CountUp>` P2, `<EmptyState>`/`<ErrorState>` P3) to be merged first.
- **`sanitizeHtml` is intentionally NOT used** on this surface — there is no
  `dangerouslySetInnerHTML` sink in `Agents.tsx`. All agent text (`name`, `lastAction`,
  `type`, descriptions) is rendered as plain React children.
- No symbol is renamed and no API contract is touched; every imported name matches the SHARED
  CONTRACT exactly.


---

## ROUTE — SETTINGS

This section applies the Nikxius premium treatment to the **settings** surface
(`/settings/*`, the workspace configuration console) and closes its specific leaks. The
surface is a single file:

- `pages/Settings.tsx` (878 lines) — a left-rail (or mobile horizontal tab strip) navigation
  over **9 tabs** rendered into one scrolling content panel: `org` (General), `icp` (ICP),
  `cadence` (Cadence), `brand` (Brand Voice), `integrations` (Integrations), `team` (Team),
  `billing` (Billing), `apikeys` (API Keys), `notifications` (Notifications). A persistent
  `HealthBar` sits above the rail + content.

### Grounding facts (verified against the live tree on 2026-06-07)

- **The tab swap is an instant `&&` cut.** The content panel (lines 102–114) renders the
  active tab via a chain of `{activeTab === "org" && <OrgTab />}` etc. inside a static
  `<main>` → `<div className="max-w-3xl mx-auto space-y-6">`. There is **zero** transition
  between tabs: the old panel is unmounted and the new one painted in the same frame.
- **The router-level `PageTransition` does NOT cover tab changes the way we want.** PRIMITIVES
  P2 step 4 keys `<PageTransition key={location}>` on the wouter location, and the route is
  registered as `<Route path="/settings/*" component={Settings} />`
  (`App.tsx`). Because `location` is the *full* path, navigating `/settings/org` →
  `/settings/icp` changes the key and **crossfades the entire Settings shell** — health bar,
  sidebar, and content all fade together. That is the wrong granularity: the persistent rail
  should stay put while only the content panel transitions. R-settings-1 fixes this by giving
  Settings a **stable** router key and moving the transition *inside* to an
  `AnimatePresence` keyed on `activeTab` around the content panel only. (We cannot change the
  `App.tsx` route here without touching PRIMITIVES, so we neutralize the over-broad crossfade
  by making the shell visually identical across `/settings/*` and animating the inner panel.)
- **Every card is a cool, flat 1px box with no depth.** The reused surface across all 9 tabs
  is `bg-white border border-paper-200 rounded-lg p-5` (lines 180, 208, 252, 312, 381, 476,
  527, 598, 616, 676, 693, 767). No warm shadow token, no `bg-ink-0` dark-mode surface flip,
  no hover/press affordance on the interactive list rows. R-settings-2 introduces a single
  shared `<SettingsCard>` helper (warm `shadow-sm`, `bg-ink-0`) so the depth language is
  applied **once** and every tab inherits it without re-touching its data wiring.
- **No `<EmptyState>` / `<ErrorState>` anywhere — six queries swallow their errors and two
  tabs hand-roll empties.** All nine tabs read TanStack queries (`useGetOrgSettings`,
  `useGetIcpProfile`, `useGetCadence`, `useGetStyleConfig`, `useListIntegrations`,
  `useListTeamMembers`, `useGetBilling`, `useListApiKeys`, `useGetNotificationPrefs`) but
  **none read `isError`** — a failed load shows a stale skeleton or a blank panel forever.
  The only error handling is `BillingTab`'s `if (!data) return <div …>Billing data
  unavailable</div>` (line 593) and `ApiKeysTab`'s hand-rolled `No API keys yet.` empty
  (line 709), plus `IntegrationsTab` rendering an empty grid when `data` is `[]`. R-settings-3
  routes every tab through a shared `<TabBoundary>` wrapper that renders `<ErrorState
  onRetry={refetch}>` on `isError`, the existing skeleton on `isLoading`, and the tab body
  otherwise; it replaces the two hand-rolled empties with `<EmptyState>`.
- **The Billing "Upgrade" button is a dead no-op.** `Settings.tsx:604`
  `<Button size="sm" className="bg-rust-500 hover:bg-rust-600 text-white">Upgrade</Button>`
  has **no `onClick`** — clicking it does nothing. R-settings-4 wires it to a confirmation
  `<Dialog>` (the `Dialog` family is already imported, line 21, and used by `TeamTab`) that,
  on confirm, fires a `toast` and closes. No billing mutation hook exists in the generated
  client, so the confirm path is a toast acknowledgement (`"Upgrade request sent — our team
  will reach out."`), not a live charge.
- **`BillingInfo` shape is fully known** (`lib/api-client-react/src/generated/api.schemas.ts`
  lines 423–432): `BillingInfo { plan: string; creditsRemaining: number; creditsTotal:
  number; sendsThisMonth: number; sendsLimit: number; seats: number; seatsLimit: number;
  invoices: Invoice[] }`. `useGetBilling` resolves to `BillingInfo` and exposes the standard
  TanStack `isError`/`refetch`. The numeric `seats`/`seatsLimit` (line 611) and the usage
  numbers are static strings today; R-settings-5 wraps the plan-summary numbers in `<CountUp>`
  so they animate on load.
- **No `dangerouslySetInnerHTML` sink exists in this file.** `BrandTab`'s `signatureHtml`
  (lines 423–431) is only ever bound to a `<Textarea value=…>` — it is **edited**, never
  rendered as HTML, on this surface. `sanitizeHtml` is therefore **NOT** applicable here; do
  not add it. (The signature *preview* lives on a different surface and is handled there.)
- **`OrgHealth` shape** (`api.schemas.ts` lines 327–333): `{ liveSendEnabled,
  postalAddressConfigured, unsubscribeConfigured, suppressionCount, blockers: string[] }`.
  `HealthBar` (lines 121–143) reads `useGetOrgHealth` but ignores `isError`; on failure it
  shows a permanent black `h-10` bar (the `isLoading` placeholder is reused as the implicit
  error state because `isLoading` flips to `false` with `data` still `undefined`, and the
  `ok = !health || …` branch then claims "Workspace healthy" — a **false-positive health
  signal**). R-settings-6 makes the bar honest on error.
- **Depends on:** FOUNDATION (palette `paper-*`/`ink-*`/`rust-*`, warm shadow tokens
  `--shadow-sm`/`--shadow-md`, `.hover-elevate`/`.active-elevate-2`, dark-mode surface flips)
  and PRIMITIVES (P1 motion lib `@/lib/motion` exposing `fadeIn`/`fadeSlideUp`/
  `staggerContainer`/`staggerItem`/`cardEnter`/`springHover` + `useReducedMotionSafe()`;
  P2 `<Stagger>`/`<StaggerItem>`/`<CountUp>` from `@/components/motion/*`;
  P3 `<EmptyState>`/`<ErrorState>` from `@/components/states/*`). All names below match the
  SHARED CONTRACT exactly.

### Authoring note: ONE task, six sub-concerns

Per the brief this is authored as **one task — `R-settings-1`** with sub-steps grouped by
concern (depth, tab-transition motion, unified Empty/ErrorState, Upgrade-button Dialog,
CountUp, honest HealthBar). The sub-steps share the same file and must be applied in order
(later BEFORE/AFTER blocks assume the shared helpers from earlier sub-steps already exist).
Each concern is self-contained so a reviewer can read it in isolation, but there is a single
verify + single commit at the end so the tree commits once, clean and typechecking.

---

### Task R-settings-1: Premium Settings — warm card depth, per-tab motion, unified Empty/ErrorState, live Upgrade Dialog, CountUp, honest HealthBar

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Settings.tsx`
  - imports (lines 1–32)
  - content panel (lines 102–114)
  - `HealthBar` (lines 121–143)
  - card surfaces across the 9 tabs (lines 180, 208, 252, 312, 381, 476, 527, 598, 616, 693, 767)
  - `ApiKeysTab` empty (line 709), `IntegrationsTab` (lines 471–501), `BillingTab` (lines 589–613)
  - shared helpers block (lines 807–877)

All line numbers below reference the **original** 878-line file; apply the sub-steps in the
listed order and re-anchor on the surrounding code (the BEFORE blocks are unique strings).

**Steps:**

1. **(imports)** Add the motion, state-primitive, and `AnimatePresence` imports, and the two
   lucide icons used by the new empty states (`KeyRound` for API Keys, `Plug` for
   Integrations). Replace the import block (lines 1–32):

   **BEFORE** (lines 1–32):
   ```tsx
   import React, { useState, useEffect, useRef } from "react";
   import { useLocation } from "wouter";
   import {
     useGetOrgSettings, useUpdateOrgSettings, useGetOrgHealth,
     useGetIcpProfile, useUpdateIcpProfile,
     useGetCadence, useUpdateCadence,
     useGetStyleConfig, useUpdateStyleConfig,
     useListIntegrations, useConnectIntegration, useDisconnectIntegration,
     useListTeamMembers, useInviteTeamMember, useRemoveTeamMember,
     useGetBilling,
     useListApiKeys, useCreateApiKey, useRevokeApiKey,
     useGetNotificationPrefs, useUpdateNotificationPrefs,
     type CadenceStage, type NotificationPrefs,
   } from "@workspace/api-client-react";
   import { Button } from "@/components/ui/button";
   import { Input } from "@/components/ui/input";
   import { Label } from "@/components/ui/label";
   import { Switch } from "@/components/ui/switch";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Badge } from "@/components/ui/badge";
   import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
   import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
   import { Slider } from "@/components/ui/slider";
   import { Textarea } from "@/components/ui/textarea";
   import { Separator } from "@/components/ui/separator";
   import {
     Building, Shield, Link as LinkIcon, Users, CreditCard,
     Key, Bell, Map, Layers, Mic, AlertCircle, CheckCircle2,
     ChevronUp, ChevronDown, Plus, Trash2, Copy, Eye, EyeOff, X,
   } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   ```

   **AFTER**:
   ```tsx
   import React, { useState, useEffect, useRef } from "react";
   import { useLocation } from "wouter";
   import { AnimatePresence, motion } from "framer-motion";
   import {
     useGetOrgSettings, useUpdateOrgSettings, useGetOrgHealth,
     useGetIcpProfile, useUpdateIcpProfile,
     useGetCadence, useUpdateCadence,
     useGetStyleConfig, useUpdateStyleConfig,
     useListIntegrations, useConnectIntegration, useDisconnectIntegration,
     useListTeamMembers, useInviteTeamMember, useRemoveTeamMember,
     useGetBilling,
     useListApiKeys, useCreateApiKey, useRevokeApiKey,
     useGetNotificationPrefs, useUpdateNotificationPrefs,
     type CadenceStage, type NotificationPrefs,
   } from "@workspace/api-client-react";
   import { Button } from "@/components/ui/button";
   import { Input } from "@/components/ui/input";
   import { Label } from "@/components/ui/label";
   import { Switch } from "@/components/ui/switch";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Badge } from "@/components/ui/badge";
   import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
   import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
   import { Slider } from "@/components/ui/slider";
   import { Textarea } from "@/components/ui/textarea";
   import { Separator } from "@/components/ui/separator";
   import {
     Building, Shield, Link as LinkIcon, Users, CreditCard,
     Key, Bell, Map, Layers, Mic, AlertCircle, CheckCircle2,
     ChevronUp, ChevronDown, Plus, Trash2, Copy, Eye, EyeOff, X,
     KeyRound, Plug, ArrowUpRight,
   } from "lucide-react";
   import { toast } from "sonner";
   import { fadeSlideUp, useReducedMotionSafe } from "@/lib/motion";
   import { CountUp } from "@/components/motion/CountUp";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { cn } from "@/lib/utils";
   ```

   > `motion`/`AnimatePresence` drive the per-tab crossfade (sub-step 3). `fadeSlideUp` +
   > `useReducedMotionSafe` are the motion language from PRIMITIVES P1. `DialogDescription`
   > is already exported by `dialog.tsx` (line 99) and is needed for the Upgrade modal copy.
   > `KeyRound`/`Plug`/`ArrowUpRight` are the icons for the API-keys EmptyState, integrations
   > EmptyState, and the Upgrade button glyph.

2. **(depth — shared card surface)** Add a `<SettingsCard>` helper alongside the other shared
   helpers so the warm depth language is defined **once**. Insert it immediately after the
   `TwoCol` helper (after line 828, before `FormSkeleton`):

   **BEFORE** (lines 826–830):
   ```tsx
   function TwoCol({ children }: { children: React.ReactNode }) {
     return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
   }

   function FormSkeleton({ rows }: { rows: number }) {
   ```

   **AFTER**:
   ```tsx
   function TwoCol({ children }: { children: React.ReactNode }) {
     return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
   }

   /**
    * Shared settings surface: warm depth (shadow-sm → shadow-md on hover) on a
    * dark-mode-safe bg-ink-0 panel. Replaces the flat `bg-white border border-paper-200
    * rounded-lg` boxes repeated across all nine tabs so the depth language is applied once.
    */
   function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
     return (
       <div
         className={cn(
           "bg-ink-0 border border-paper-200 rounded-lg shadow-sm hover:shadow-md transition-shadow",
           className,
         )}
       >
         {children}
       </div>
     );
   }

   function FormSkeleton({ rows }: { rows: number }) {
   ```

   Now swap the flat card containers for `<SettingsCard>` (preserving each card's own padding
   / layout classes via `className`, so the data wiring inside is untouched). The repeated
   pattern is `bg-white border border-paper-200 rounded-lg <rest>`. Apply these exact edits:

   - **OrgTab body** (line 180):
     **BEFORE** `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-4">`
     **AFTER** `<SettingsCard className="p-5 space-y-4">`
     and its matching `</div>` at line 206 → `</SettingsCard>`.
   - **OrgTab Live-Send card** (line 208):
     **BEFORE** `<div className="bg-white border border-paper-200 border-l-4 border-l-rust-500 rounded-lg p-5">`
     **AFTER** `<SettingsCard className="border-l-4 border-l-rust-500 p-5">`
     and its `</div>` at line 219 → `</SettingsCard>`.
   - **IcpTab body** (line 252): `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-5">`
     → `<SettingsCard className="p-5 space-y-5">`; closing `</div>` at line 263 → `</SettingsCard>`.
   - **CadenceTab stage rows** (line 312): `<div key={stage.id} className="bg-white border border-paper-200 rounded-lg p-4 flex items-center gap-3">`
     → `<SettingsCard key={stage.id} className="p-4 flex items-center gap-3 hover-elevate">`; closing `</div>` at line 341 → `</SettingsCard>`.
   - **BrandTab body** (line 381): `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-6">`
     → `<SettingsCard className="p-5 space-y-6">`; closing `</div>` at line 432 → `</SettingsCard>`.
   - **IntegrationsTab cards** (line 476): `<div key={int.id} className="bg-white border border-paper-200 rounded-lg p-4 flex gap-3">`
     → `<SettingsCard key={int.id} className="p-4 flex gap-3 hover-elevate">`; closing `</div>` at line 498 → `</SettingsCard>`.
   - **TeamTab body** (line 527): `<div className="bg-white border border-paper-200 rounded-lg overflow-hidden">`
     → `<SettingsCard className="overflow-hidden">`; closing `</div>` at line 558 → `</SettingsCard>`.
   - **BillingTab plan card** (line 598): `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-5">`
     → `<SettingsCard className="p-5 space-y-5">`; closing `</div>` at line 613 → `</SettingsCard>`.
   - **BillingTab invoices card** (line 616): `<div className="bg-white border border-paper-200 rounded-lg overflow-hidden">`
     → `<SettingsCard className="overflow-hidden">`; closing `</div>` at line 632 → `</SettingsCard>`.
   - **ApiKeysTab body** (line 693): `<div className="bg-white border border-paper-200 rounded-lg overflow-hidden">`
     → `<SettingsCard className="overflow-hidden">`; closing `</div>` at line 730 → `</SettingsCard>`.
   - **NotificationsTab body** (line 767): `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-4">`
     → `<SettingsCard className="p-5 space-y-4">`; closing `</div>` at line 802 → `</SettingsCard>`.

   > Each edit replaces ONLY the wrapper element and its matching close — no child JSX, no
   > query, no mutation, no state moves. `bg-white`→`bg-ink-0` is the FOUNDATION surface flip
   > so the panels darken correctly in dark mode; `shadow-sm`→`hover:shadow-md` is the warm
   > raised-card depth used by the agents/outbound sections; the `hover-elevate` on the two
   > *interactive list-row* cards (cadence stages, integration tiles) adds the warm press
   > overlay the leak list calls for. The two `overflow-hidden` list panels intentionally keep
   > only `shadow-sm`→`shadow-md` (no `hover-elevate`) because their rows have their own hover.

3. **(tab-transition motion + neutralize over-broad router crossfade)** Replace the static
   content panel so (a) the Settings shell gets a **stable** identity (no full-shell crossfade
   on tab change — see grounding fact 2) and (b) only the inner panel crossfades between tabs,
   keyed on `activeTab`. Replace the `<main>` block (lines 102–114):

   **BEFORE** (lines 102–114):
   ```tsx
         {/* Content */}
         <main className="flex-1 overflow-y-auto p-6 md:p-8">
           <div className="max-w-3xl mx-auto space-y-6">
             {activeTab === "org"           && <OrgTab />}
             {activeTab === "icp"           && <IcpTab />}
             {activeTab === "cadence"       && <CadenceTab />}
             {activeTab === "brand"         && <BrandTab />}
             {activeTab === "integrations"  && <IntegrationsTab />}
             {activeTab === "team"          && <TeamTab />}
             {activeTab === "billing"       && <BillingTab />}
             {activeTab === "apikeys"       && <ApiKeysTab />}
             {activeTab === "notifications" && <NotificationsTab />}
           </div>
         </main>
   ```

   **AFTER**:
   ```tsx
         {/* Content */}
         <main className="flex-1 overflow-y-auto p-6 md:p-8">
           <TabPanel tabId={activeTab} />
         </main>
   ```

   Then add the `TabPanel` helper next to the other shared helpers, immediately before
   `SectionHeader` (before line 808):

   **BEFORE** (lines 806–808):
   ```tsx
   // ─── Shared helpers ───────────────────────────────────────────────────────────
   function SectionHeader({ title, description }: { title: string; description: string }) {
   ```

   **AFTER**:
   ```tsx
   // ─── Tab panel (per-tab crossfade) ─────────────────────────────────────────────
   /**
    * Renders the active tab inside an AnimatePresence keyed on `tabId`, so switching
    * tabs crossfades only the content column while the persistent rail + health bar stay
    * fixed. The router-level PageTransition keys on the full `/settings/<tab>` location,
    * which would otherwise crossfade the whole shell on every tab click; keeping the shell
    * markup identical across tabs makes that outer crossfade a no-op and lets this inner
    * AnimatePresence own the motion at the correct granularity.
    */
   function TabPanel({ tabId }: { tabId: TabId }) {
     const reduced = useReducedMotionSafe();
     const body = (
       <div className="max-w-3xl mx-auto space-y-6">
         {tabId === "org"           && <OrgTab />}
         {tabId === "icp"           && <IcpTab />}
         {tabId === "cadence"       && <CadenceTab />}
         {tabId === "brand"         && <BrandTab />}
         {tabId === "integrations"  && <IntegrationsTab />}
         {tabId === "team"          && <TeamTab />}
         {tabId === "billing"       && <BillingTab />}
         {tabId === "apikeys"       && <ApiKeysTab />}
         {tabId === "notifications" && <NotificationsTab />}
       </div>
     );

     if (reduced) return body;

     return (
       <AnimatePresence mode="wait" initial={false}>
         <motion.div
           key={tabId}
           variants={fadeSlideUp}
           initial="hidden"
           animate="visible"
           exit="exit"
         >
           {body}
         </motion.div>
       </AnimatePresence>
     );
   }

   // ─── Shared helpers ───────────────────────────────────────────────────────────
   function SectionHeader({ title, description }: { title: string; description: string }) {
   ```

   > `AnimatePresence mode="wait"` finishes the exit before the next tab enters; `key={tabId}`
   > drives the swap; `fadeSlideUp` is the same calm editorial entrance used everywhere else.
   > `initial={false}` skips the entrance on first paint (no flash on cold load). The
   > reduced-motion branch returns the panel verbatim. The `&&` data wiring is **byte-identical**
   > — it was only moved inside `TabPanel`, so every tab still mounts exactly when it did.

4. **(unified Empty/ErrorState — shared boundary)** Add a `<TabBoundary>` helper that turns the
   ad-hoc `isLoading`/`isError`/`data` handling into one consistent path, then route the tabs
   through it. Insert `TabBoundary` after the new `SettingsCard` helper (right after the
   `SettingsCard` block from sub-step 2):

   ```tsx
   /**
    * Shared loading/error gate for a settings tab. Renders the skeleton while loading, an
    * <ErrorState> with retry on query failure, and the tab body otherwise. Centralizes the
    * error handling that every tab previously omitted (no tab read `isError`).
    */
   function TabBoundary({
     isLoading,
     isError,
     onRetry,
     skeleton,
     children,
   }: {
     isLoading: boolean;
     isError: boolean;
     onRetry: () => void;
     skeleton: React.ReactNode;
     children: React.ReactNode;
   }) {
     if (isLoading) return <>{skeleton}</>;
     if (isError)
       return (
         <ErrorState
           description="We couldn't load these settings just now. Please try again."
           onRetry={onRetry}
         />
       );
     return <>{children}</>;
   }
   ```

   Wire it into the tabs that own a query. Two representative edits (apply the same shape to
   `IcpTab`, `CadenceTab`, `BrandTab`, `NotificationsTab`, and the list tabs):

   - **OrgTab** — capture `isError`/`refetch` and gate the render. Replace line 155 and the
     loading guard at line 175:

     **BEFORE** (line 155):
     ```tsx
       const { data, isLoading } = useGetOrgSettings({ query: { queryKey: ["getOrgSettings"] } });
     ```
     **AFTER**:
     ```tsx
       const { data, isLoading, isError, refetch } = useGetOrgSettings({ query: { queryKey: ["getOrgSettings"] } });
     ```

     **BEFORE** (line 175):
     ```tsx
       if (isLoading) return <FormSkeleton rows={6} />;

       return (
         <>
           <SectionHeader title="Organization" description="Core workspace settings and compliance configuration." />
     ```
     **AFTER**:
     ```tsx
       return (
         <TabBoundary isLoading={isLoading} isError={isError} onRetry={() => refetch()} skeleton={<FormSkeleton rows={6} />}>
           <SectionHeader title="Organization" description="Core workspace settings and compliance configuration." />
     ```
     and change the tab's closing `</>` (line 230) to `</TabBoundary>`.

   - **BillingTab** — replace the hand-rolled `if (!data)` no-data branch with the boundary +
     `<EmptyState>`. Replace lines 589–596:

     **BEFORE** (lines 589–596):
     ```tsx
   function BillingTab() {
     const { data, isLoading } = useGetBilling({ query: { queryKey: ["getBilling"] } });

     if (isLoading) return <FormSkeleton rows={5} />;
     if (!data) return <div className="text-ink-400 text-sm">Billing data unavailable</div>;

     return (
       <>
         <SectionHeader title="Billing & Usage" description="Plan, credits, and invoice history." />
     ```
     **AFTER**:
     ```tsx
   function BillingTab() {
     const { data, isLoading, isError, refetch } = useGetBilling({ query: { queryKey: ["getBilling"] } });

     return (
       <TabBoundary
         isLoading={isLoading}
         isError={isError || (!isLoading && !data)}
         onRetry={() => refetch()}
         skeleton={<FormSkeleton rows={5} />}
       >
         <SectionHeader title="Billing & Usage" description="Plan, credits, and invoice history." />
     ```
     and change BillingTab's closing `</>` (line 634) to `</TabBoundary>`. (`data` is now
     guaranteed defined inside the boundary because `!data` is folded into `isError`; keep the
     existing `data.plan`, `data.invoices`, etc. references — they typecheck because the
     boundary only renders children when `data` is present, but to satisfy the compiler add a
     `if (!data) return null;` immediately after the `return (` is **not** needed since the
     references are inside JSX evaluated lazily — instead guard once: see the note below.)

     > **Compiler note:** `BillingInfo | undefined` is not narrowed by the runtime
     > `TabBoundary` for TypeScript. Keep the body simple: right after the new `return (`
     > opener is JSX, so add a single early guard *before* the `return` to narrow the type:
     > ```tsx
     >   if (!isLoading && !isError && !data) return null; // unreachable; satisfies narrowing
     >   const billing = data!; // safe inside boundary
     > ```
     > then reference `billing.plan` / `billing.invoices` / `billing.creditsTotal` etc. in the
     > JSX instead of `data.…`. This keeps `no non-null in JSX` clean while the runtime gate is
     > the `TabBoundary`.

   - **ApiKeysTab** — replace the hand-rolled empty (line 709) with `<EmptyState>`:

     **BEFORE** (lines 708–709):
     ```tsx
         ) : (data ?? []).length === 0 ? (
           <div className="py-10 text-center text-ink-400 text-sm">No API keys yet.</div>
     ```
     **AFTER**:
     ```tsx
         ) : (data ?? []).length === 0 ? (
           <EmptyState
             icon={KeyRound}
             title="No API keys yet"
             description="Create a key above to access the Workforce OS API programmatically."
           />
     ```

   - **IntegrationsTab** — render an `<EmptyState>` when the provider list is empty and an
     `<ErrorState>` on failure. Replace line 458 and the loading guard at line 466:

     **BEFORE** (line 458):
     ```tsx
     const { data, isLoading, refetch } = useListIntegrations({ query: { queryKey: ["listIntegrations"] } });
     ```
     **AFTER**:
     ```tsx
     const { data, isLoading, isError, refetch } = useListIntegrations({ query: { queryKey: ["listIntegrations"] } });
     ```

     **BEFORE** (line 466):
     ```tsx
     if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>;
     ```
     **AFTER**:
     ```tsx
     if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>;
     if (isError) return <ErrorState description="We couldn't load your integrations just now. Please try again." onRetry={() => refetch()} />;
     if ((data ?? []).length === 0) return <EmptyState icon={Plug} title="No integrations available" description="Connect Gmail, a CRM, or an enrichment provider to power sourcing and outreach." />;
     ```

   > Repeat the OrgTab-shape boundary edit on `IcpTab` (line 236 query / line 247 guard / line
   > 269 close), `CadenceTab` (line 275 / 305 / 352), `BrandTab` (line 358 / 376 / 438),
   > `NotificationsTab` (line 745 / 762 / 803). `TeamTab` and `ApiKeysTab` keep their inline
   > skeleton/empty structure (they render their header + create-row even while loading), so
   > they get the `<EmptyState>` swap above plus an `isError`/`refetch` capture and an
   > `<ErrorState>` rendered in place of the divide-y list when `isError` is true.

5. **(Upgrade button → confirmation Dialog + toast)** Wire the dead Billing Upgrade button.
   First add Dialog state to `BillingTab`. Replace the `BillingTab` opener (just after the
   `useGetBilling` hook, before the `return`):

   **BEFORE** (the line just added in sub-step 4):
   ```tsx
     const { data, isLoading, isError, refetch } = useGetBilling({ query: { queryKey: ["getBilling"] } });
   ```
   **AFTER**:
   ```tsx
     const { data, isLoading, isError, refetch } = useGetBilling({ query: { queryKey: ["getBilling"] } });
     const [upgradeOpen, setUpgradeOpen] = useState(false);
   ```

   Then replace the dead Upgrade button (line 604):

   **BEFORE** (line 604):
   ```tsx
             <Button size="sm" className="bg-rust-500 hover:bg-rust-600 text-white">Upgrade</Button>
   ```
   **AFTER**:
   ```tsx
             <Button
               size="sm"
               className="bg-rust-500 hover:bg-rust-600 text-white active-elevate-2"
               onClick={() => setUpgradeOpen(true)}
             >
               Upgrade <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
             </Button>
   ```

   Then add the confirmation Dialog immediately before BillingTab's closing `</TabBoundary>`
   (i.e. as the last child inside the boundary, after the invoices card block at line 633):

   **BEFORE** (lines 633–635):
   ```tsx
         </div>
       )}
     </>
   );
   }
   ```
   **AFTER**:
   ```tsx
         </div>
       )}

       <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle className="font-serif">Upgrade your plan</DialogTitle>
             <DialogDescription>
               You're currently on the <span className="font-medium text-ink-900">{billing.plan}</span> plan.
               Confirm and our team will reach out to tailor a plan to your sending volume and seats.
             </DialogDescription>
           </DialogHeader>
           <DialogFooter>
             <Button variant="outline" onClick={() => setUpgradeOpen(false)}>Cancel</Button>
             <Button
               className="bg-rust-500 hover:bg-rust-600 text-white"
               onClick={() => {
                 setUpgradeOpen(false);
                 toast.success("Upgrade request sent — our team will reach out shortly.");
               }}
             >
               Confirm upgrade
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </TabBoundary>
   );
   }
   ```

   > The `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` family is already
   > imported and proven by `TeamTab`'s invite modal; `DialogDescription` was added in
   > sub-step 1. There is **no** billing mutation hook in the generated client (only
   > `useGetBilling`), so confirm is a `toast.success` acknowledgement, not a live charge — the
   > honest behaviour for a surface with no checkout endpoint. `billing.plan` references the
   > narrowed local from sub-step 4. `active-elevate-2` adds the warm press affordance.

6. **(CountUp on the plan summary)** Animate the Billing plan-summary numbers. Replace the
   Seats line (lines 609–612) to wrap the numeric pair in `<CountUp>`:

   **BEFORE** (lines 609–612):
   ```tsx
           <div className="flex items-center justify-between text-sm">
             <span className="text-ink-600">Seats</span>
             <span className="font-mono text-ink-900">{data.seats} / {data.seatsLimit}</span>
           </div>
   ```
   **AFTER**:
   ```tsx
           <div className="flex items-center justify-between text-sm">
             <span className="text-ink-600">Seats</span>
             <span className="font-mono text-ink-900">
               <CountUp value={billing.seats} /> / <CountUp value={billing.seatsLimit} />
             </span>
           </div>
   ```

   And animate the current-plan credits headline by wrapping the `UsageBar` numerator is out of
   scope (UsageBar owns its own markup); instead add a credits-remaining count beneath the plan
   name. Replace the plan-name block (lines 600–603):

   **BEFORE** (lines 600–603):
   ```tsx
           <div>
             <p className="text-xs text-ink-400 uppercase tracking-wide">Current Plan</p>
             <p className="text-2xl font-serif font-semibold text-ink-900 mt-0.5">{data.plan}</p>
           </div>
   ```
   **AFTER**:
   ```tsx
           <div>
             <p className="text-xs text-ink-400 uppercase tracking-wide">Current Plan</p>
             <p className="text-2xl font-serif font-semibold text-ink-900 mt-0.5">{billing.plan}</p>
             <p className="text-xs text-ink-400 mt-1">
               <CountUp value={billing.creditsRemaining} /> credits remaining
             </p>
           </div>
   ```

   > `CountUp` renders a `<span>` and animates from 0 → `value` on mount (and re-animates if the
   > value changes), snapping to the final value under reduced motion. `value` is `number` on
   > all four (`seats`, `seatsLimit`, `creditsRemaining`) per `BillingInfo`, so it typechecks
   > with no `decimals`/`suffix`. The remaining `UsageBar`/invoice `data.…` references must also
   > be renamed to `billing.…` (sub-step 4's narrowed local).

7. **(honest HealthBar on error)** Make `HealthBar` read `isError` so a failed health fetch
   stops claiming "Workspace healthy." Replace lines 121–132:

   **BEFORE** (lines 121–132):
   ```tsx
   function HealthBar() {
     const { data: health, isLoading } = useGetOrgHealth({ query: { queryKey: ["getOrgHealth"] } });
     if (isLoading) return <div className="h-10 bg-ink-900" />;
     const ok = !health || health.blockers.length === 0;
     return (
       <div className={cn("shrink-0 px-6 py-2.5 flex items-center gap-4 flex-wrap", ok ? "bg-ink-900" : "bg-ember-500")}>
         {ok
           ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
           : <AlertCircle className="h-4 w-4 text-white shrink-0" />}
         <span className="text-sm text-white font-medium">
           {ok ? "Workspace healthy" : `${health!.blockers.length} blocker${health!.blockers.length !== 1 ? "s" : ""}: ${health!.blockers.join(", ")}`}
         </span>
   ```
   **AFTER**:
   ```tsx
   function HealthBar() {
     const { data: health, isLoading, isError } = useGetOrgHealth({ query: { queryKey: ["getOrgHealth"] } });
     if (isLoading) return <div className="h-10 bg-ink-900 animate-pulse" />;
     if (isError || !health)
       return (
         <div className="shrink-0 px-6 py-2.5 flex items-center gap-3 bg-ember-500">
           <AlertCircle className="h-4 w-4 text-white shrink-0" />
           <span className="text-sm text-white font-medium">Health status unavailable — could not reach the workspace health check.</span>
         </div>
       );
     const ok = health.blockers.length === 0;
     return (
       <div className={cn("shrink-0 px-6 py-2.5 flex items-center gap-4 flex-wrap", ok ? "bg-ink-900" : "bg-ember-500")}>
         {ok
           ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
           : <AlertCircle className="h-4 w-4 text-white shrink-0" />}
         <span className="text-sm text-white font-medium">
           {ok ? "Workspace healthy" : `${health.blockers.length} blocker${health.blockers.length !== 1 ? "s" : ""}: ${health.blockers.join(", ")}`}
         </span>
   ```

   > Now `health` is guaranteed defined past the early return, so the `health!` non-null
   > assertions in the `<span>` and in the `{health && (…)}` detail block (line 133) collapse to
   > plain `health.…`. Update line 133 `{health && (` → `{` … actually the `{health && (`
   > guard at line 133 is now always-true; leave it as `{health && (` (harmless) OR simplify to
   > `(`; either typechecks. The error branch reuses the existing `bg-ember-500` alarm surface
   > so it reads as a real problem, not a false "healthy".

8. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. New symbols `AnimatePresence`, `motion`, `fadeSlideUp`,
   `useReducedMotionSafe`, `CountUp`, `EmptyState`, `ErrorState`, `KeyRound`, `Plug`,
   `ArrowUpRight`, `DialogDescription`, `SettingsCard`, `TabBoundary`, `TabPanel`, `upgradeOpen`
   are all referenced (no unused-import / unused-var error). `CountUp value={billing.seats}`
   etc. typecheck (`number`); `onRetry={() => refetch()}` matches `ErrorState`'s `onRetry?:
   () => void`; `EmptyState icon={KeyRound}` matches `icon: LucideIcon`. No `any`. The
   `billing` narrowing eliminates `'data' is possibly 'undefined'` in BillingTab.

9. **Visual verify:** dev server up, then Playwright-screenshot `/settings/org`,
   `/settings/billing`, and `/settings/integrations` in light **and** dark:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Confirm:
   - Switching tabs in the left rail **crossfades only the content column** (fade-slide-up);
     the health bar and the rail stay fixed (no full-shell flash).
   - Every tab's card now sits on a warm `shadow-sm` surface that lifts to `shadow-md` on
     hover; cadence-stage rows and integration tiles show the `.hover-elevate` warm overlay and
     `.active-elevate-2` on press. Cards flip to the dark `bg-ink-0` surface in dark mode.
   - On `/settings/billing` the plan headline shows "<n> credits remaining" counting up, and
     Seats counts up `n / m` on load.
   - Clicking **Upgrade** opens the confirmation Dialog ("Upgrade your plan", current plan
     named); **Confirm upgrade** closes it and fires the success toast; **Cancel** closes with
     no toast.
   - Force a health-check failure (block `/org/health` in devtools): the top bar turns
     `bg-ember-500` with "Health status unavailable…" instead of a false "Workspace healthy".
   - Force an integrations error / point at an empty provider list: `<ErrorState>` (with a
     working "Try again") / `<EmptyState>` ("No integrations available", `Plug` chip) renders.
   Screenshot light **and** dark for `/settings/org`, `/settings/billing`, `/settings/integrations`.

10. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Settings.tsx && \
     git commit -m "feat(settings): premium pass — warm card depth, per-tab motion, Empty/ErrorState, live Upgrade dialog

   Applies the Nikxius depth language across all nine Settings tabs via a shared
   SettingsCard (bg-ink-0 + warm shadow-sm→shadow-md, hover-elevate/active-elevate-2 on
   interactive rows), crossfades only the content panel between tabs with an
   AnimatePresence keyed on activeTab (fadeSlideUp, reduced-motion-safe), and routes every
   tab through a shared TabBoundary so failed loads render ErrorState(onRetry=refetch) and
   empty API-keys / integrations render EmptyState. Wires the previously-dead Billing
   Upgrade button to a confirmation Dialog + success toast, animates the plan-summary
   credits/seats with CountUp, and makes the HealthBar honest on fetch error (alarm bar
   instead of a false 'Workspace healthy'). No data wiring, query keys, or mutations
   changed; no sanitizeHtml needed (no dangerouslySetInnerHTML sink on this surface).

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **R-settings-1 is a single task**; its sub-steps (1 imports → 2 depth → 3 tab motion →
  4 Empty/ErrorState → 5 Upgrade dialog → 6 CountUp → 7 HealthBar) edit the one file
  `pages/Settings.tsx` and **must be applied in that order** — sub-step 2 defines
  `SettingsCard`, sub-step 3 defines `TabPanel`/uses `fadeSlideUp`, sub-step 4 defines
  `TabBoundary` and introduces the `billing` narrowed local that sub-steps 5 and 6 reference,
  and sub-step 1 supplies the imports all of them need. One verify + one commit at the end.
- Requires **FOUNDATION** (palette `paper-*`/`ink-*`/`rust-*`/`ember-500`, warm shadow tokens
  `--shadow-sm`/`--shadow-md`, `.hover-elevate`/`.active-elevate-2`, dark-mode surface flips)
  and **PRIMITIVES** (motion lib P1 `@/lib/motion`; `<CountUp>` P2 from `@/components/motion/*`;
  `<EmptyState>`/`<ErrorState>` P3 from `@/components/states/*`) to be merged first. Every
  imported name matches the SHARED CONTRACT exactly.
- **`sanitizeHtml` is intentionally NOT used** on this surface — `BrandTab.signatureHtml` is
  bound to a `<Textarea value=…>` (edited, never rendered as HTML); there is no
  `dangerouslySetInnerHTML` sink in `Settings.tsx`.
- **No data wiring is changed.** Every query hook, query key, mutation, `onSuccess`/`onError`
  toast, and form-state ref is preserved byte-for-byte; the only additions are `isError`/
  `refetch` destructures (already returned by the hooks) and one `upgradeOpen` boolean. No
  symbol is renamed and no API contract is touched.


---

## Surface: Chrome — Command Palette

Premium pass for the global Command Palette (`src/components/layout/CommandPalette.tsx`).
This section applies the foundation treatment — warm shadow depth on the dialog panel, motion
(`cardEnter` / `staggerItem`-style entrance via the motion lib), and hover/press
micro-interactions on items — and closes the palette's functional leaks:

1. **Four dead "Actions" just `console.log`** (`CommandPalette.tsx:54-66`):
   - **Trigger Pipeline** → `console.log("Trigger Pipeline")` → wire `useTriggerRun()` and
     navigate `/runs` on success.
   - **Approve Next Draft** → `console.log("Approve Next")` → approve the first
     `PENDING_REVIEW` artifact via `useApproveArtifact()`, sourcing it from
     `useListArtifacts({ status: "PENDING_REVIEW", limit: 1 })`.
   - **Add Suppression** → `console.log("Add Suppression")` → navigate to the Settings
     suppression surface. **The only suppression-management surface inside Settings is the
     ICP tab's "Exclusion Domains" field (`Settings.tsx` ICP tab, `/settings/icp`)** — there
     is no `/settings/suppression` route (verified: `TABS` in `Settings.tsx:35-45` has no
     suppression entry). We navigate `/settings/icp`.
   - **Invite Teammate** → `console.log("Invite Teammate")` → navigate `/settings/team`
     (the Team tab, `Settings.tsx:41`, `513`, owns the Invite dialog).
2. **Missing Navigation entries** — the Navigation group (`CommandPalette.tsx:31-52`) lists
   Today, Pipeline, Outbound, Conversations, Settings. The app also routes `/runs`
   (`App.tsx:42`) and `/agents` (`App.tsx:44`) but neither is reachable from the palette.
   Add **Runs** and **Agents**. (Outbound is *already present* at
   `CommandPalette.tsx:40-43`; the brief's "Outbound, Runs, Agents" list is satisfied by
   verifying Outbound stays and adding the two missing ones.)

### Dependencies (must land first)
- `src/lib/motion.ts` — `staggerContainer`, `staggerItem`, `cardEnter`, `springHover`,
  `useReducedMotionSafe()` (foundation section).
- Warm shadow tokens `--shadow-md` + `.hover-elevate` / `.active-elevate-2` utilities in
  `src/index.css` (foundation section).
- **Ordering note:** section `56-chrome-notifications.md` (Task R-notifications-2) also edits
  `CommandPalette.tsx`, but only the `useEffect` keydown listener at **lines 10-19**. This
  section edits **lines 1-4 (imports), 6-9 + 21-24 (hooks/handlers), and 31-70 (the
  CommandList body)** — no overlapping lines. If both have landed, the listener edit and these
  edits coexist; apply this section's edits against whatever the listener body currently is.

### Ground truth (verified against current source)
- `useTriggerRun()` is a **`void`-argument** mutation (`api.ts:1589`) returning
  `TriggerResult = { runId: string }` (`api.schemas.ts:206-207`). Pattern already used in
  `Runs.tsx:31-36`: `const { mutate, isPending } = useTriggerRun({ mutation: { onSuccess, onError } })`.
- `useApproveArtifact()` takes **`{ id: string }`** (`api.ts:459-468`,
  `mutationFn` destructures `{ id }`). Pattern already used in `ApprovalCard.tsx:34`
  (`approveMut.mutateAsync({ id: artifact.id })`) and `ArtifactDetail.tsx:126`.
- `useListArtifacts(params, { query })` → `PaginatedArtifacts = { items: OutreachArtifact[], total, page }`
  (`api.ts:257`, `api.schemas.ts:76`). `params.status` is `ListArtifactsStatus`, whose
  `PENDING_REVIEW` member exists (`api.schemas.ts:604-610`). Pattern used in
  `Outbound.tsx:109-112`.
- `toast` is imported from `"sonner"` everywhere (`Runs.tsx:8`, `Outbound.tsx:17`,
  `ApprovalCard.tsx:12`).
- Routes exist: `/runs` (`App.tsx:42`), `/agents` (`App.tsx:44`), `/settings/team`
  + `/settings/icp` (catch-all `/settings/*`, `App.tsx:45`; resolved by
  `Settings.tsx:52-53`).
- The `CommandDialog` primitive wraps a shadcn `DialogContent` (`command.tsx:29`); adding
  `shadow-md` to items / depth is done via `className` on `CommandItem`s and the
  `cardEnter`/`staggerItem` motion variants on wrapping `motion` elements.

---

### Task R-cmdpalette-1: Wire the four Actions to real hooks + navigation

**Files:**
- `src/components/layout/CommandPalette.tsx` (imports lines 1-4; hook/handler region lines 6-24; Actions group lines 53-70)

**Step 1 — Replace imports (current lines 1-4).**

Before:
```tsx
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus } from "lucide-react";
```

After:
```tsx
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useTriggerRun,
  useApproveArtifact,
  useListArtifacts,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus, History, Bot } from "lucide-react";
```

**Step 2 — Add hooks + action handlers (current lines 6-24).**

Before:
```tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };
```

After:
```tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { mutate: triggerRun, isPending: triggering } = useTriggerRun({
    mutation: {
      onSuccess: (d) => {
        toast.success(`Run started — ${d.runId}`);
        setLocation("/runs");
      },
      onError: () => toast.error("Failed to start run"),
    },
  });

  const { mutate: approveArtifact, isPending: approving } = useApproveArtifact({
    mutation: {
      onSuccess: () => toast.success("Draft approved"),
      onError: () => toast.error("Failed to approve draft"),
    },
  });

  // Lazily fetch the single oldest pending draft so "Approve Next Draft" has a target.
  const { data: pendingDrafts, refetch: refetchPending } = useListArtifacts(
    { status: "PENDING_REVIEW", limit: 1 },
    { query: { queryKey: ["listArtifacts", "PENDING_REVIEW", "cmdk"] } },
  );

  const handleApproveNext = async () => {
    const { data } = await refetchPending();
    const next = data?.items?.[0];
    if (!next) {
      toast("No drafts awaiting review");
      return;
    }
    approveArtifact({ id: next.id });
  };

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };
```

> Note: `triggering` / `approving` are wired now and consumed in the JSX (Step 4) to disable
> their items while in flight; `pendingDrafts` seeds the count badge in Step 4. No unused-var
> lint.

**Step 3 — Replace the Actions group with real wiring (current lines 53-70).**

Before:
```tsx
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => console.log("Trigger Pipeline"))}>
            <PlayCircle className="mr-2 h-4 w-4 text-rust-500" />
            <span>Trigger Pipeline</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Approve Next"))}>
            <CheckCircle className="mr-2 h-4 w-4 text-signal-positive" />
            <span>Approve Next Draft</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Add Suppression"))}>
            <Ban className="mr-2 h-4 w-4 text-ember-400" />
            <span>Add Suppression</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Invite Teammate"))}>
            <UserPlus className="mr-2 h-4 w-4 text-signal-info" />
            <span>Invite Teammate</span>
          </CommandItem>
        </CommandGroup>
```

After:
```tsx
        <CommandGroup heading="Actions">
          <CommandItem
            disabled={triggering}
            onSelect={() => runCommand(() => triggerRun())}
          >
            <PlayCircle className="mr-2 h-4 w-4 text-rust-500" />
            <span>Trigger Pipeline</span>
            {triggering && <span className="ml-auto text-xs text-ink-400">Starting…</span>}
          </CommandItem>
          <CommandItem
            disabled={approving}
            onSelect={() => runCommand(() => { void handleApproveNext(); })}
          >
            <CheckCircle className="mr-2 h-4 w-4 text-signal-positive" />
            <span>Approve Next Draft</span>
            {(pendingDrafts?.items?.length ?? 0) > 0 && (
              <span className="ml-auto rounded-full bg-signal-positive/10 px-1.5 py-0.5 text-[10px] font-medium text-signal-positive font-tabular">
                {pendingDrafts!.items.length}
              </span>
            )}
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings/icp"))}>
            <Ban className="mr-2 h-4 w-4 text-ember-400" />
            <span>Add Suppression</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings/team"))}>
            <UserPlus className="mr-2 h-4 w-4 text-signal-info" />
            <span>Invite Teammate</span>
          </CommandItem>
        </CommandGroup>
```

**Step 4 — Verify.**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
```
Expected: exits 0, no errors. Specifically: no TS error on `triggerRun()` (the mutation is
`void`-argument), no error on `d.runId` (it is `TriggerResult.runId: string`), no error on
`approveArtifact({ id: next.id })` (mutation variable is `{ id: string }` and `next.id` is a
`string`), no error on `useListArtifacts({ status: "PENDING_REVIEW", limit: 1 }, ...)` (the
status literal is a member of `ListArtifactsStatus`), and no unused-var error on `triggering`,
`approving`, or `pendingDrafts`.

**Step 5 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/layout/CommandPalette.tsx && \
git commit -m "feat(cmdpalette): wire 4 dead Actions to real hooks + navigation

- Trigger Pipeline -> useTriggerRun(); toast runId + navigate /runs on success
- Approve Next Draft -> fetch first PENDING_REVIEW artifact via useListArtifacts
  and approve it with useApproveArtifact({ id }); toast when queue is empty
- Add Suppression -> navigate /settings/icp (Exclusion Domains is the only
  Settings suppression surface; no /settings/suppression route exists)
- Invite Teammate -> navigate /settings/team (Team tab owns the Invite dialog)
- In-flight disable + pending-draft count badge on the relevant items

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task R-cmdpalette-2: Add missing Navigation entries (Runs, Agents)

The Navigation group lists Today, Pipeline, Outbound, Conversations, Settings — but the app
also routes `/runs` (`App.tsx:42`) and `/agents` (`App.tsx:44`). Outbound is already present
(`CommandPalette.tsx:40-43`); we add the two genuinely missing destinations. Icons
`History` (Runs) and `Bot` (Agents) were imported in Task R-cmdpalette-1, Step 1.

**Files:**
- `src/components/layout/CommandPalette.tsx` (Navigation group, current lines 44-51)

**Step 1 — Insert Runs + Agents after Outbound, before Conversations is fine; we insert
after the Conversations item and before Settings (current lines 44-51).**

Before:
```tsx
          <CommandItem onSelect={() => runCommand(() => setLocation("/conversations"))}>
            <Inbox className="mr-2 h-4 w-4" />
            <span>Conversations</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
```

After:
```tsx
          <CommandItem onSelect={() => runCommand(() => setLocation("/conversations"))}>
            <Inbox className="mr-2 h-4 w-4" />
            <span>Conversations</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/runs"))}>
            <History className="mr-2 h-4 w-4" />
            <span>Runs</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/agents"))}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Agents</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
```

**Step 2 — Verify.**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
```
Expected: exits 0. `History` and `Bot` resolve (imported in Task R-cmdpalette-1, Step 1); no
unused-import error since both are now rendered.

**Step 3 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/layout/CommandPalette.tsx && \
git commit -m "feat(cmdpalette): add Runs + Agents to Navigation group

- /runs and /agents are routed (App.tsx) but were unreachable from the palette
- Use History (Runs) and Bot (Agents) lucide icons, matching existing item style

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task R-cmdpalette-3: Premium depth + motion + hover/press micro-interactions

Apply the foundation treatment: warm `shadow-md` on the dialog panel, a `cardEnter`-driven
panel entrance, a `staggerContainer`/`staggerItem` cascade over the two groups, and
`hover-elevate`/`active-elevate-2` press feedback on every `CommandItem`. All motion respects
`useReducedMotionSafe()`.

**Files:**
- `src/components/layout/CommandPalette.tsx` (imports line 1; `CommandDialog`/`CommandList` body lines 26-72)

**Step 1 — Add motion + React imports (current line 1) and motion-lib import (after the lucide import).**

Before (line 1):
```tsx
import React, { useEffect, useState } from "react";
```

After (line 1):
```tsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
```

Then, immediately after the lucide-react import added in Task R-cmdpalette-1 Step 1, add the
motion-lib import:

Before:
```tsx
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus, History, Bot } from "lucide-react";
```

After:
```tsx
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus, History, Bot } from "lucide-react";
import { staggerContainer, staggerItem, cardEnter, useReducedMotionSafe } from "@/lib/motion";
```

**Step 2 — Read the reduced-motion flag (inside the component, right after `const [, setLocation] = useLocation();`, current line 8).**

Before:
```tsx
  const [, setLocation] = useLocation();
```

After:
```tsx
  const [, setLocation] = useLocation();
  const reduce = useReducedMotionSafe();
```

**Step 3 — Wrap the dialog body in motion + add warm depth and staggered groups (current lines 27-72).**

This wraps the existing `CommandInput`/`CommandList` in a `motion.div` panel that animates with
`cardEnter`, and converts each `CommandGroup`'s children container to a `staggerContainer` so
items cascade in. Item markup is unchanged except for the added `hover-elevate active-elevate-2`
press utilities and `motion` wrappers on each item (shown for the Navigation group; apply the
identical `motion.div`/`staggerItem` wrapper to every `CommandItem` in the Actions group too).

Before (current lines 27-72):
```tsx
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => setLocation("/today"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Today</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/pipeline"))}>
            <Target className="mr-2 h-4 w-4" />
            <span>Pipeline</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/outbound"))}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Outbound</span>
          </CommandItem>
```

After (current lines 27-39 region — the rest of the items keep the same `motion.div`+`hover-elevate` wrapper pattern):
```tsx
    <CommandDialog open={open} onOpenChange={setOpen}>
      <motion.div
        variants={reduce ? undefined : cardEnter}
        initial={reduce ? undefined : "hidden"}
        animate={reduce ? undefined : "visible"}
        className="shadow-md"
      >
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <motion.div
              variants={reduce ? undefined : staggerContainer}
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "visible"}
            >
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/today"))}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <span>Today</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/pipeline"))}
                >
                  <Target className="mr-2 h-4 w-4" />
                  <span>Pipeline</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/outbound"))}
                >
                  <Activity className="mr-2 h-4 w-4" />
                  <span>Outbound</span>
                </CommandItem>
              </motion.div>
```

Apply the **same `<motion.div variants={reduce ? undefined : staggerItem}>` wrapper + the
`className="hover-elevate active-elevate-2"` prop** to the remaining Navigation items
(Conversations, Runs, Agents, Settings) and to **all four** Actions items. Then close the
Navigation `staggerContainer` `motion.div` before the Actions `CommandGroup`, wrap the Actions
items in their own `staggerContainer` `motion.div`, and finally close `CommandList`, the
`cardEnter` `motion.div`, and `CommandDialog`:

After (current lines 70-72 region — the closing tags):
```tsx
            </motion.div>
          </CommandGroup>
        </CommandList>
      </motion.div>
    </CommandDialog>
```

> Indentation moves in one level because of the new `motion.div` panel wrapper — re-indent the
> two `CommandGroup`s accordingly. The Actions items keep the `disabled`/badge logic added in
> Task R-cmdpalette-1; only their `className` (add `hover-elevate active-elevate-2`) and the
> `staggerItem` `motion.div` wrapper change here.

**Step 4 — Verify (typecheck + build + visual).**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
```
Expected: both exit 0. No TS error on the `framer-motion` `motion.div` `variants`/`initial`/
`animate` props, no error on the `@/lib/motion` named imports (`staggerContainer`,
`staggerItem`, `cardEnter`, `useReducedMotionSafe`), and no unused-var error on `reduce`.

Visual check — run dev and screenshot the palette in light AND dark:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)
```
Then Playwright: navigate to `/today`, press `⌘K` (or `Ctrl+K`) to open the palette.
Expected (light + dark screenshots): the dialog panel shows a warm `shadow-md` and animates in
via `cardEnter`; Navigation and Actions items cascade in (stagger); hovering an item elevates
it and pressing depresses it (`hover-elevate`/`active-elevate-2`). Selecting **Trigger
Pipeline** fires a toast and routes to `/runs`; **Approve Next Draft** shows the pending count
badge and approves (or toasts "No drafts awaiting review" when the queue is empty); **Add
Suppression** routes to `/settings/icp`; **Invite Teammate** routes to `/settings/team`;
**Runs** routes to `/runs`; **Agents** routes to `/agents`. With OS "Reduce Motion" enabled,
the panel and items appear with no animation (verify `useReducedMotionSafe()` short-circuits
the variants — items still render and remain interactive).

**Step 5 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/layout/CommandPalette.tsx && \
git commit -m "feat(cmdpalette): premium depth + motion + hover/press micro-interactions

- Warm shadow-md on the dialog panel; cardEnter panel entrance
- staggerContainer/staggerItem cascade over Navigation + Actions groups
- hover-elevate/active-elevate-2 press feedback on every CommandItem
- All motion gated on useReducedMotionSafe()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```


---

## Surface: Chrome — Notifications + Topbar

Premium pass for the notification bell (`src/components/v2/NotificationBell.tsx`) and the
chrome topbar Search control (`src/components/layout/Shell.tsx`). This section applies the
foundation treatment — warm shadow depth, motion (`Stagger`/`StaggerItem`/`cardEnter`),
unified `<EmptyState>`/`<ErrorState>`, hover/press micro-interactions — and closes three
functional leaks:

1. **"Mark all as read" is dead** — `NotificationBell.tsx:58-60` renders a button with no
   `onClick`. Wire it to the generated `useMarkNotificationsRead()` mutation with an
   optimistic local read overlay and query invalidation.
2. **Notification rows don't navigate** — rows at `NotificationBell.tsx:46-52` are
   `cursor-pointer` but inert. The `Notification` model has a `link?: string | null`
   field (`api.schemas.ts:472`); wire rows to `setLocation(n.link)` via wouter when present.
3. **Topbar Search button is dead** — `Shell.tsx:89-92` renders a `⌘K` button with no
   `onClick`. `CommandPalette` (`CommandPalette.tsx:6-19`) owns its `open` state privately and
   toggles on a `metaKey/ctrlKey + "k"` keydown. Dispatch that exact synthetic event so the
   button and the shortcut share one code path — no prop drilling, no state lift.

### Dependencies (must land first)
- `src/lib/motion.ts` — `staggerContainer`, `staggerItem`, `cardEnter`, `springHover`,
  `useReducedMotionSafe()` (foundation section).
- `src/components/states/EmptyState.tsx`, `ErrorState.tsx` (state-primitives section).
- Warm shadow tokens `--shadow-sm/md` + `.hover-elevate`/`.active-elevate-2` utilities in
  `src/index.css` (foundation section).

### Ground truth (verified against current source)
- `useListNotifications` query key in this component is overridden to `["listNotifications"]`
  (`NotificationBell.tsx:11`), NOT the generated `["/api/notifications"]`. Invalidate the
  overridden key.
- `useMarkNotificationsRead()` is a `void`-argument mutation exported from
  `@workspace/api-client-react` (generated, `api.ts:3420`). Calling `.mutate()` with no args.
- `Notification` shape (`api.schemas.ts:465-474`): `{ id, type, title, body, read, link?:
  string|null, createdAt }`.
- `NotificationList` (`api.schemas.ts:476-479`): `{ items: Notification[], unreadCount: number }`.

---

### Task R-notifications-1: Wire "Mark all as read" + premium depth/motion on the bell

**Files:**
- `src/components/v2/NotificationBell.tsx` (full rewrite of imports + body; current lines 1-65)

**Step 1 — Replace imports (current lines 1-7).**

Before:
```tsx
import React from "react";
import { useListNotifications } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
```

After:
```tsx
import React from "react";
import {
  useListNotifications,
  useMarkNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { staggerContainer, staggerItem, useReducedMotionSafe } from "@/lib/motion";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
```

**Step 2 — Replace the hook body + add mark-read handler (current lines 10-14).**

Before:
```tsx
  const { data: notifications } = useListNotifications({ 
    query: { refetchInterval: 30000, queryKey: ["listNotifications"] } 
  });

  const unreadCount = notifications?.items.filter(n => !n.read).length || 0;
```

After:
```tsx
  const reduce = useReducedMotionSafe();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: notifications, isError, refetch } = useListNotifications({
    query: { refetchInterval: 30000, queryKey: ["listNotifications"] },
  });

  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listNotifications"] });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      },
    },
  });

  const items = notifications?.items ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  const handleRowClick = (link?: string | null) => {
    if (!link) return;
    setOpen(false);
    setLocation(link);
  };
```

**Step 3 — Make the Popover controlled (current line 17).**

Before:
```tsx
    <Popover>
```

After:
```tsx
    <Popover open={open} onOpenChange={setOpen}>
```

**Step 4 — Add press micro-interaction to the trigger button (current line 19).**

Before:
```tsx
        <Button variant="ghost" size="icon" className="relative text-ink-400 hover:text-ink-900">
```

After:
```tsx
        <Button
          variant="ghost"
          size="icon"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          className="relative text-ink-400 hover:text-ink-900 hover-elevate active-elevate-2"
        >
```

**Step 5 — Add warm-shadow depth to the popover panel (current line 29).**

Before:
```tsx
      <PopoverContent className="w-80 p-0 border-paper-200" align="end">
```

After:
```tsx
      <PopoverContent
        className="w-80 p-0 border-paper-200 shadow-md overflow-hidden"
        align="end"
      >
```

**Step 6 — Replace the list region (current lines 38-56): unified states, stagger entrance, navigating rows.**

Before:
```tsx
        <ScrollArea className="h-[300px]">
          {notifications?.items.length === 0 ? (
            <div className="p-8 text-center text-ink-400 text-sm">
              No notifications yet.
            </div>
          ) : (
            <div className="divide-y divide-paper-100">
              {notifications?.items.map((n) => (
                <div key={n.id} className="p-4 hover:bg-paper-50 transition-colors cursor-pointer">
                  <p className="text-sm text-ink-900 leading-snug font-medium">{n.title}</p>
                  <p className="text-xs text-ink-500 leading-snug mt-0.5">{n.body}</p>
                  <p className="text-[10px] text-ink-400 mt-1 uppercase font-tabular tracking-wider">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
```

After:
```tsx
        <ScrollArea className="h-[300px]">
          {isError ? (
            <ErrorState
              title="Couldn’t load notifications"
              description="We hit a snag fetching your activity feed."
              onRetry={() => refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="You’re all caught up"
              description="New replies, approvals, and run alerts will show up here."
            />
          ) : (
            <motion.div
              className="divide-y divide-paper-100"
              variants={reduce ? undefined : staggerContainer}
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "visible"}
            >
              {items.map((n) => {
                const navigable = Boolean(n.link);
                return (
                  <motion.button
                    key={n.id}
                    type="button"
                    variants={reduce ? undefined : staggerItem}
                    whileHover={reduce || !navigable ? undefined : { y: -1 }}
                    whileTap={reduce || !navigable ? undefined : { scale: 0.99 }}
                    disabled={!navigable}
                    onClick={() => handleRowClick(n.link)}
                    className={`w-full text-left p-4 transition-colors ${
                      navigable
                        ? "hover:bg-paper-50 cursor-pointer"
                        : "cursor-default"
                    } ${n.read ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rust-500" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-ink-900 leading-snug font-medium">{n.title}</p>
                        <p className="text-xs text-ink-500 leading-snug mt-0.5">{n.body}</p>
                        <p className="text-[10px] text-ink-400 mt-1 uppercase font-tabular tracking-wider">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </ScrollArea>
```

**Step 7 — Wire "Mark all as read" + press feedback (current lines 57-61).**

Before:
```tsx
        <div className="p-2 border-t border-paper-200 bg-paper-50 text-center">
          <Button variant="ghost" size="sm" className="text-xs text-ink-400 hover:text-ink-900 w-full">
            Mark all as read
          </Button>
        </div>
```

After:
```tsx
        <div className="p-2 border-t border-paper-200 bg-paper-50 text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || markRead.isPending}
            onClick={() => markRead.mutate()}
            className="text-xs text-ink-400 hover:text-ink-900 w-full hover-elevate active-elevate-2 disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            {markRead.isPending ? "Marking…" : "Mark all as read"}
          </Button>
        </div>
```

**Step 8 — Verify.**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
```
Expected: exits 0, no errors. Specifically no TS error on `markRead.mutate()` (the
mutation takes `void`), no error on `useQueryClient`, `useLocation`, or the `motion.button`
`variants`/`whileHover` props, and no error on `n.link` (nullable string is accepted by
`handleRowClick`).

**Step 9 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/v2/NotificationBell.tsx && \
git commit -m "feat(notifications): wire mark-all-read + navigable rows + premium depth/motion

- Wire dead 'Mark all as read' button to useMarkNotificationsRead() with
  query invalidation on the overridden listNotifications key
- Make rows navigate via wouter setLocation(n.link) when link present;
  controlled Popover closes on navigate
- Unread dot + opacity treatment, warm shadow-md panel, staggerContainer
  entrance, springHover on navigable rows, press micro-interactions
- Unified EmptyState (caught-up) and ErrorState (retry) replace bare divs
- Respect useReducedMotionSafe()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
---

### Task R-notifications-2: Wire topbar Search button to open the Command Palette

The cleanest, lowest-coupling approach: `CommandPalette` already toggles on a global
`metaKey/ctrlKey + "k"` keydown (`CommandPalette.tsx:11-18`). The Search button dispatches
that exact synthetic `KeyboardEvent` so both entry points share one code path. No lifted
state, no props threaded through `Shell`. We add a tiny typed helper so the dispatch is
reused and testable.

**Files:**
- `src/lib/openCommandPalette.ts` (new file)
- `src/components/layout/Shell.tsx` (imports + the Search button, current lines 1-16, 89-92)

**Step 1 — Create the dispatch helper.**

Create `src/lib/openCommandPalette.ts`:
```ts
/**
 * Opens the global Command Palette by dispatching the same Cmd/Ctrl+K keydown
 * that CommandPalette listens for. Keeps the palette's open-state private while
 * letting any control (topbar Search, etc.) trigger it without prop drilling.
 */
export function openCommandPalette(): void {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const event = new KeyboardEvent("keydown", {
    key: "k",
    code: "KeyK",
    metaKey: isMac,
    ctrlKey: !isMac,
    bubbles: true,
  });
  document.dispatchEvent(event);
}
```

**Step 2 — Make the palette toggle idempotent for the button (current `CommandPalette.tsx:10-19`).**

The listener currently flips `setOpen((open) => !open)`, so a second dispatch while open would
close it — fine for a keyboard toggle, but the Search button should always *open*. Guard the
button path by having the helper dispatch only when closed is not knowable from outside; instead,
make the listener open-only when the event carries a marker. Update `CommandPalette.tsx`.

Before (`CommandPalette.tsx:10-19`):
```tsx
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
```

After (`CommandPalette.tsx:10-19`):
```tsx
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Synthetic events from openCommandPalette() are not trusted → open-only.
        setOpen((prev) => (e.isTrusted ? !prev : true));
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
```

**Step 3 — Import the helper + add press feedback in Shell (current `Shell.tsx:16`).**

Before:
```tsx
import { cn } from "@/lib/utils";
```

After:
```tsx
import { cn } from "@/lib/utils";
import { openCommandPalette } from "@/lib/openCommandPalette";
```

**Step 4 — Wire the Search button (current `Shell.tsx:89-92`).**

Before:
```tsx
            <button className="hidden md:flex items-center gap-2 px-2 py-1 text-xs text-ink-400 bg-paper-100 border border-paper-200 rounded shadow-sm hover:bg-paper-200 transition-colors mr-2">
              <span>Search</span>
              <kbd className="font-mono bg-paper-200 px-1 rounded text-[10px]">⌘K</kbd>
            </button>
```

After:
```tsx
            <button
              type="button"
              aria-label="Open command palette"
              onClick={openCommandPalette}
              className="hidden md:flex items-center gap-2 px-2 py-1 text-xs text-ink-400 bg-paper-100 border border-paper-200 rounded shadow-sm hover-elevate active-elevate-2 transition-colors mr-2"
            >
              <span>Search</span>
              <kbd className="font-mono bg-paper-200 px-1 rounded text-[10px]">⌘K</kbd>
            </button>
```

**Step 5 — Verify (typecheck + build + visual).**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
```
Expected: both exit 0. No TS error on the new `openCommandPalette` import, no error on
`e.isTrusted` (it is a standard `KeyboardEvent` boolean).

Visual check — run dev and screenshot the chrome in light AND dark:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)
```
Then Playwright: navigate to `/today`, click the topbar **Search** button → the Command
Palette dialog opens. Press `Escape`, then `⌘K` (keyboard) → palette toggles as before.
Screenshot light + dark. Expected: button click opens palette; keyboard shortcut still
toggles open/closed; clicking the button while open keeps it open (no flicker-close).

**Step 6 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/lib/openCommandPalette.ts artifacts/workforce-os/src/components/layout/CommandPalette.tsx artifacts/workforce-os/src/components/layout/Shell.tsx && \
git commit -m "feat(chrome): wire topbar Search button to open Command Palette

- Add openCommandPalette() helper that dispatches the same Cmd/Ctrl+K keydown
  CommandPalette already listens for — no lifted state or prop drilling
- Make palette listener open-only for synthetic (untrusted) events so the
  Search button always opens; trusted keyboard shortcut still toggles
- Wire Shell topbar Search button onClick + hover/press micro-interactions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```


---

# §H · HYGIENE, A11Y & VERIFICATION
## HYGIENE, A11Y & VERIFICATION

This is the final section of the plan. It assumes every prior section (palette/tokens,
elevate system, warm shadows, motion library, state primitives, brand/identity, sanitize)
has already landed. Its job is to remove dead code, collapse duplication, prove every token
resolves, close the a11y gaps in the bespoke SVGs and clickable `<div>`/icon rows, verify
reduced-motion, and run the full typecheck + build + before/after screenshot sweep against
the spec's Definition of Done (§8).

**Source root for all paths below:** `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src`
(referred to as `<SRC>`). Run all `pnpm` commands from the monorepo root
`/Users/nikhil/Downloads/Workforce-OS`.

---

### Task H1: Delete dead component TimelineTree.tsx

`<SRC>/components/v2/TimelineTree.tsx` is never imported anywhere. The live evidence-timeline
UI is `<SRC>/components/v2/EvidenceTimeline.tsx` (confirmed in use across pages). Deleting
TimelineTree removes ~93 lines of dead surface that otherwise drags along an unused
`TimelineNode` type import and a stale `colorMap`/`iconMap`.

**Files:**
- Delete: `<SRC>/components/v2/TimelineTree.tsx`

**Steps:**

1. Confirm zero imports with grep. Run exactly:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rn "TimelineTree" src/
   ```
   Expected output is ONLY the self-declaration line (no import sites):
   ```
   src/components/v2/TimelineTree.tsx:30:export function TimelineTree({ nodes }: { nodes: TimelineNode[] }) {
   ```
   If any line other than that one self-reference appears (e.g. an `import { TimelineTree }`),
   STOP — the component is live; do not delete it, and flag this in your handoff instead.

2. Delete the file:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     git rm src/components/v2/TimelineTree.tsx
   ```

3. Verify nothing else referenced it (the grep should now return nothing at all):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rn "TimelineTree" src/ || echo "CLEAN: no TimelineTree references"
   ```
   Expected: `CLEAN: no TimelineTree references`.

4. Typecheck to prove the removal broke nothing:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit code 0, no errors. (If `TimelineNode` was ONLY imported by this file, the
   unused-export warning, if any, is benign — the type still lives in `@workspace/api-client-react`.)

5. Commit:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "chore: delete dead TimelineTree component (zero imports)

EvidenceTimeline is the live timeline UI; TimelineTree was never imported.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H2: Make SentimentBadge the single source of truth

`<SRC>/components/v2/SentimentBadge.tsx` exports a `<SentimentBadge>` with a canonical
sentiment→color map, but it is **never imported** — `ConversationThread.tsx` duplicates the
exact same `sentimentColors` map inline (preview mode, lines 35–40) and re-implements the
badge by hand (lines 71–73). We keep `SentimentBadge` as the single source of truth and
delete the inline duplication. One important nuance: `SentimentBadge`'s prop type is
`"positive" | "objection" | "neutral" | "negative"`, but the inline call site renders the
raw API value `conversation.replyIntelligence.sentiment` (type `ReplyIntelligenceSentiment`).
We type the badge prop to `ReplyIntelligenceSentiment` so the two stay aligned and add a
typed fallback so an unknown enum value renders as `neutral` instead of an unstyled badge.

**Files:**
- Modify: `<SRC>/components/v2/SentimentBadge.tsx` (full rewrite, 21 lines)
- Modify: `<SRC>/components/v2/ConversationThread.tsx` (lines 1–9 imports; 34–40 delete inline map; 70–79 use component)

**Steps:**

1. Confirm the duplication and zero imports before editing:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rn "SentimentBadge" src/ ; \
     grep -rn "sentimentColors" src/
   ```
   Expected: `SentimentBadge` appears only as its own declaration; `sentimentColors` appears
   only inside `src/components/v2/ConversationThread.tsx`. This proves H2 is a safe consolidation.

2. Rewrite `<SRC>/components/v2/SentimentBadge.tsx` so its prop matches the API enum and it
   degrades gracefully. Replace the **entire file** with:
   ```tsx
   import React from "react";
   import { ReplyIntelligenceSentiment } from "@workspace/api-client-react";
   import { Badge } from "@/components/ui/badge";
   import { cn } from "@/lib/utils";

   const sentimentColors: Record<ReplyIntelligenceSentiment, string> = {
     positive: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
     objection: "bg-ember-400/10 text-ember-400 border-ember-400/20",
     neutral: "bg-paper-200 text-ink-700 border-paper-200",
     negative: "bg-rust-500/10 text-rust-500 border-rust-500/20",
   };

   interface SentimentBadgeProps {
     sentiment: ReplyIntelligenceSentiment;
     /** Compact preview variant used in the conversation list row. */
     dense?: boolean;
     className?: string;
   }

   export function SentimentBadge({ sentiment, dense, className }: SentimentBadgeProps) {
     const colors = sentimentColors[sentiment] ?? sentimentColors.neutral;
     return (
       <Badge
         variant="outline"
         className={cn(
           "capitalize font-medium",
           dense && "text-[10px] px-1.5 py-0 h-4",
           colors,
           className,
         )}
       >
         {sentiment}
       </Badge>
     );
   }
   ```
   > NOTE: if `ReplyIntelligenceSentiment` is a string union that does NOT include
   > `"objection"`, drop that key from the `Record` literal so typecheck passes — the
   > runtime `?? sentimentColors.neutral` fallback still covers any stray value. Verify the
   > exact union before editing:
   > ```bash
   > cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
   >   grep -rn "ReplyIntelligenceSentiment" packages*/ node_modules/@workspace/api-client-react/ 2>/dev/null | head
   > ```

3. In `<SRC>/components/v2/ConversationThread.tsx`, add the import. Change the import block
   (line 6 imports `Badge` — keep it; full-mode still uses `Badge` for the "Needs Reply" and
   action chips). After the existing `Sparkles, Bot, AlertTriangle` lucide import line, add:
   ```tsx
   import { SentimentBadge } from "@/components/v2/SentimentBadge";
   ```

4. In the same file, delete the inline `sentimentColors` map. Remove these lines entirely
   (currently lines 35–40 inside the `mode === "preview"` branch):
   ```tsx
       const sentimentColors = {
         positive: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
         objection: "bg-ember-400/10 text-ember-400 border-ember-400/20",
         neutral: "bg-paper-200 text-ink-700 border-paper-200",
         negative: "bg-rust-500/10 text-rust-500 border-rust-500/20",
       };
   ```

5. In the same file, replace the hand-rolled preview badge (currently lines 70–79) with the
   component. Replace:
   ```tsx
             <div className="flex items-center gap-2">
               <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 font-medium", sentimentColors[conversation.replyIntelligence.sentiment])}>
                 {conversation.replyIntelligence.sentiment}
               </Badge>
               {conversation.needsReply && (
   ```
   with:
   ```tsx
             <div className="flex items-center gap-2">
               <SentimentBadge sentiment={conversation.replyIntelligence.sentiment} dense />
               {conversation.needsReply && (
   ```
   Leave the `Needs Reply` badge below it unchanged.

6. Verify no `sentimentColors` references remain and the import landed:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rn "sentimentColors" src/ && echo "FAIL: inline map still present" || echo "CLEAN: inline map removed" ; \
     grep -rn "SentimentBadge" src/components/v2/ConversationThread.tsx
   ```
   Expected: `CLEAN: inline map removed`, and `ConversationThread.tsx` now shows both the
   import line and the `<SentimentBadge ... dense />` usage.

7. Typecheck:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0, no errors.

8. Commit:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "refactor: SentimentBadge is single source of truth for sentiment colors

Delete the duplicated inline sentiment color map in ConversationThread
preview mode and render <SentimentBadge dense> instead. Type the badge
prop to ReplyIntelligenceSentiment with a neutral fallback.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H3: Post-palette token audit — no undefined token refs

After the palette/token section landed, every `*-ink-N`, `*-paper-N`, `*-rust-N`,
`*-ember-N`, and `*-signal-*` utility must resolve to a real `@theme inline` token in
`<SRC>/index.css`. This task is a sweep for **stragglers**: classes that reference a ramp
step that was never added (the contract calls out `ink-0` specifically — "ink-0 = pure white
surface accent"). The grep also catches typos like `ember-600` (only `ember-300/400/500`
exist) or `ink-200` (only `ink-0/300/400/500/600/700/800/900` exist).

> IMPORTANT — false positive: a naive `grep ink-0` matches the Tailwind utility `shrink-0`
> and `flex-shrink-0` everywhere. Use the boundary-anchored grep below so only genuine
> `*-ink-0` color utilities match.

**Files:**
- Modify (only if stragglers found): the offending page/component file(s), and/or
  `<SRC>/index.css` to add a missing ramp step.

**Steps:**

1. List every color token actually defined in the theme (the allowed set):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -oE -- "--color-(ink|paper|rust|ember|signal)[a-z0-9-]*" src/index.css | sort -u
   ```
   Keep this list as the source of truth.

2. Genuine `ink-0` usage audit (boundary-anchored so `shrink-0` cannot match — note the
   leading delimiter class `[ "'`(:>-]` is required before `ink-0`, and `shrink`/`flex-shrink`
   are excluded because their preceding char is `r`/`-shr`):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rnE "(bg|text|border|stroke|ring|from|via|to|fill)-ink-0([ \"'\`)]|$)" src/ \
       || echo "NO genuine *-ink-0 utility usages"
   ```
   - If this returns `NO genuine *-ink-0 utility usages`, then `--color-ink-0` is defined for
     contract completeness but unused — that is acceptable, no action.
   - If it returns hits, each is a real consumer; confirm `--color-ink-0` is in step 1's list.
     If the token is present, the class resolves — done. If absent, add it (step 4).

3. Full straggler sweep — every ramp utility, cross-checked against step 1's allowed set.
   Run this to enumerate every step used, then eyeball for any not in the defined list:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rhoE -- "(bg|text|border|stroke|ring|from|via|to|fill|ring-offset)-(ink|paper|rust|ember)-[0-9]+" src/ \
       | sort -u
   ```
   For each printed `<prefix>-<ramp>-<step>`, confirm `--color-<ramp>-<step>` appears in
   step 1's output. Known real consumers to verify resolve (from the current tree):
   - `bg-ember-500` in `src/pages/Settings.tsx:126` → requires `--color-ember-500`.
     The contract only guarantees `--color-ember-300/400/500`, so `ember-500` IS defined — OK.
   - `text-ink-300`, `text-ink-600`, `hover:text-ink-700` across Settings/ArtifactDetail →
     require `--color-ink-300/600/700` — all in the contract's ink ramp.
   Also sweep `signal`:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rhoE -- "(bg|text|border|stroke|ring|fill)-signal-(positive|info|critical)" src/ | sort -u
   ```
   Each must map to `--color-signal-positive|info|critical` (all three in the contract).

4. Fix any straggler. There are two legitimate fix shapes:
   - **Missing ramp step that SHOULD exist** → add it to `<SRC>/index.css`. Add the raw HSL
     to BOTH `:root` and `.dark` with a perceptually-even value anchored to the hue (ink ~20°,
     paper ~40–42°, rust ~15°, ember ~28°), then expose it in `@theme inline`. Example for a
     hypothetical missing `--color-ink-200`:
     ```css
     /* in :root */
     --ink-200: hsl(20 8% 82%);
     /* in .dark */
     --ink-200: hsl(20 6% 30%);
     /* in @theme inline */
     --color-ink-200: var(--ink-200);
     ```
   - **Typo / wrong step in a consumer** (e.g. a stray `ember-600` where `ember-500` was
     intended) → fix the class string in the offending file to the nearest defined step.
     Prefer this when the design clearly meant an existing token.

5. Re-run the sweep from steps 2–3 and confirm every printed step now has a matching
   `--color-*` in step 1's list. There must be zero unresolved refs.

6. Build to prove Tailwind v4 emits no "unknown utility" warnings for these classes:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build) 2>&1 | tee /tmp/h3-build.log ; \
     grep -i "could not\|unknown\|cannot resolve\|no such" /tmp/h3-build.log && echo "FAIL: unresolved token" || echo "CLEAN: no unresolved-token warnings"
   ```
   Expected: build exits 0 and `CLEAN: no unresolved-token warnings`.

7. Commit (only if a fix was applied; if the audit was clean, note "no stragglers — audit
   only" in your handoff and skip the commit):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "fix: resolve straggler color-token refs after palette migration

Audit confirms every *-ink/paper/rust/ember/signal utility maps to a
defined --color-* token in index.css.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H4: A11y pass — label bespoke SVGs, clickable divs, and focus rings

Three a11y gaps remain after the visual work:
1. **Bespoke SVGs** (`ScoreRing`, `SparklineChart`) render as unlabeled graphics — a screen
   reader announces nothing or "image".
2. **Clickable `<div>` / icon rows** — the conversation preview row in
   `ConversationThread.tsx` is a `<div onClick>` with no `role`, `tabIndex`, or keyboard
   handler, so it is invisible to keyboard and AT users. Same shape recurs in the agent
   activity stream rows.
3. **Raw `<input>` / `<button>`** in `Settings.tsx` and `ApprovalCard.tsx` bypass the
   design-system focus ring (`focus-visible:ring-1 focus-visible:ring-ring`), so keyboard
   focus is invisible on them.

This task does representative edits for each category; apply the same pattern to siblings.

**Files:**
- Modify: `<SRC>/components/v2/ScoreRing.tsx` (svg element, lines 22–43)
- Modify: `<SRC>/components/v2/SparklineChart.tsx` (svg element, lines 9–31)
- Modify: `<SRC>/components/v2/ConversationThread.tsx` (preview clickable div, lines 43–49)
- Modify: `<SRC>/pages/Settings.tsx` (raw `<input>` line 866; representative)
- Modify: `<SRC>/components/v2/ApprovalCard.tsx` (raw `<input>` line 170; representative)

**Steps:**

1. `ScoreRing` — give the SVG an `img` role and a dynamic label. In
   `<SRC>/components/v2/ScoreRing.tsx`, replace the opening `<svg>` tag (line 23):
   ```tsx
       <svg className="transform -rotate-90" width={size} height={size}>
   ```
   with:
   ```tsx
       <svg
         className="transform -rotate-90"
         width={size}
         height={size}
         role="img"
         aria-label={`Lead score ${score} out of 100`}
       >
   ```
   The centered numeric `<span>` (line 44) is decorative for AT once the svg is labeled; mark
   it `aria-hidden` to avoid a double-read. Replace:
   ```tsx
         <span className="absolute font-tabular text-sm font-bold text-ink-900">
   ```
   with:
   ```tsx
         <span aria-hidden="true" className="absolute font-tabular text-sm font-bold text-ink-900">
   ```

2. `SparklineChart` — purely decorative trend graphic; the surrounding metric already carries
   the number, so the chart should be hidden from AT (announcing 7 unlabeled bars is noise).
   In `<SRC>/components/v2/SparklineChart.tsx`, replace the opening `<svg>` (line 14):
   ```tsx
     return (
       <svg width={width} height={height} className="overflow-visible">
   ```
   with:
   ```tsx
     return (
       <svg
         width={width}
         height={height}
         className="overflow-visible"
         role="img"
         aria-label={`Trend sparkline, latest value ${data[data.length - 1] ?? 0}`}
       >
   ```
   (If the parent already provides an accessible label for the metric, prefer
   `aria-hidden="true"` instead of `role="img"` — choose per call site; default to the labeled
   `role="img"` shown here so the component is self-describing.)

3. Clickable `<div>` in `ConversationThread.tsx` preview — make it a real button-like target.
   Replace the opening clickable div (lines 43–49):
   ```tsx
         <div
           className={cn(
             "p-4 border-b border-paper-200 cursor-pointer hover:bg-paper-100 transition-colors flex gap-3 relative",
             selected && "bg-paper-100"
           )}
           onClick={() => onSelect?.(conversation.id)}
         >
   ```
   with:
   ```tsx
         <div
           role="button"
           tabIndex={0}
           aria-pressed={selected}
           aria-label={`Open conversation with ${conversation.leadName}: ${conversation.subject}`}
           className={cn(
             "p-4 border-b border-paper-200 cursor-pointer hover:bg-paper-100 transition-colors flex gap-3 relative",
             "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
             selected && "bg-paper-100"
           )}
           onClick={() => onSelect?.(conversation.id)}
           onKeyDown={(e) => {
             if (e.key === "Enter" || e.key === " ") {
               e.preventDefault();
               onSelect?.(conversation.id);
             }
           }}
         >
   ```

4. Raw `<input>` in `Settings.tsx` (line 866, representative) — add the DS focus ring. Read
   the element first to capture its exact existing `className`, then append the focus-ring
   utilities to it (do NOT remove existing classes). The utilities to ensure are present:
   ```
   focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
   ```
   For example, if the input currently reads:
   ```tsx
           <input
             className="... existing classes ..."
   ```
   change the className to:
   ```tsx
           <input
             className="... existing classes ... focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
   ```
   Prefer swapping any bespoke raw `<input>` for the design-system `<Input>` from
   `@/components/ui/input` where the markup allows — it carries the ring for free. Apply the
   same focus-ring append to the raw `<input>` in `ApprovalCard.tsx:170`.

5. Raw `<button>` rows in `Settings.tsx` (e.g. lines 314–315, 338, 386, 682–689) — these
   icon-only buttons have no accessible name and no focus ring. For each, add an
   `aria-label` describing the action and the focus-ring utilities. Representative edit for
   the move-up control (line 314):
   ```tsx
             <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-ink-300 hover:text-ink-700 disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5" /></button>
   ```
   →
   ```tsx
             <button aria-label="Move stage up" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-ink-300 hover:text-ink-700 disabled:opacity-20 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><ChevronUp className="h-3.5 w-3.5" /></button>
   ```
   Apply the same `aria-label` + focus-ring pattern to the sibling icon buttons (move down,
   remove stage, remove member, reveal/copy/dismiss key).

6. Run an automated a11y smoke with Playwright + axe after the dev server is up (full
   server-start commands are in Task H6 step 1). Once the server is running at
   `http://localhost:$PORT/today`:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     pnpm dlx @axe-core/cli "http://localhost:${PORT}/conversations" \
       --rules image-alt,button-name,label,aria-roles,color-contrast --exit
   ```
   Expected: zero `image-alt`, `button-name`, and `label` violations on the conversations
   route (the page exercises ScoreRing, the clickable preview rows, and sentiment badges).
   `color-contrast` is informational; record any findings but do not block on borderline AA
   ratios for decorative chips.

7. Typecheck (the new handlers/attrs must compile under strict mode, no `any`):
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0.

8. Commit:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "a11y: label bespoke SVGs, make clickable rows keyboard-operable, add DS focus rings

- ScoreRing/SparklineChart get role=img + aria-label (decorative span aria-hidden)
- Conversation preview row becomes role=button + tabIndex + Enter/Space handler
- Raw inputs/icon-buttons in Settings/ApprovalCard get focus-visible ring + aria-label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H5: Reduced-motion verification

The motion library (`<SRC>/lib/motion.ts`) gates every animation through
`useReducedMotionSafe()`. This task does not write feature code — it **proves** the gate
actually collapses motion everywhere, and documents the manual + automated test procedure so
QA and the assembler can re-run it.

**Files:**
- No source changes expected. If a regression is found (a motion component that ignores the
  hook), fix that component to honor `useReducedMotionSafe()` and note it.

**Steps:**

1. Confirm every motion component routes through the hook (no raw framer `animate`/`initial`
   that skips it):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     echo "=== components using motion ===" && \
     grep -rln "framer-motion\|from \"@/lib/motion\"\|from \"@/components/motion" src/ && \
     echo "=== of those, which call useReducedMotionSafe ===" && \
     grep -rln "useReducedMotionSafe" src/
   ```
   Every file in the first list that drives an animation (PageTransition, Stagger, CountUp,
   and any consumer using `cardEnter`/`springHover`/`fadeSlideUp` with hardcoded values)
   must either appear in the second list OR consume a variant from `motion.ts` that itself is
   already reduced-motion-aware. Inspect any file in list 1 but not list 2 to confirm it only
   imports pre-gated variants; if it sets its own `transition`/`animate` props raw, that is a
   regression — fix it to branch on `useReducedMotionSafe()`.

2. Confirm `motion.ts` short-circuits when reduced motion is requested. Read
   `<SRC>/lib/motion.ts` and verify the helper returns the OS/user preference and that the
   exported variants (or the components consuming them) swap to zero-duration / no-transform
   when it is `true`. Spot-check `CountUp` specifically — with reduced motion it must render
   the final `value` immediately (no tween), not count from 0.

3. **Manual test procedure (document this verbatim in your handoff so QA can repeat it):**
   - macOS: System Settings → Accessibility → Display → enable "Reduce motion".
   - OR per-page via Chrome DevTools: Cmd-Shift-P → "Show Rendering" → set
     **Emulate CSS media feature `prefers-reduced-motion`** to `reduce`.
   - With the dev server running (Task H6 step 1), reload `/today` and `/pipeline`.
     Expected with reduce ON:
     * `<PageTransition>` route changes are instant (no fade/slide).
     * `<Stagger>`/`<StaggerItem>` lists appear at once (no cascade).
     * `<CountUp>` metrics show their final number immediately (no roll-up).
     * `springHover` cards do not scale/lift on hover.
   - Toggle reduce OFF and reload: animations return. The visual diff between the two states
     is the proof the gate is wired.

4. **Automated assertion** (deterministic, no human toggle) — emulate the media feature in
   Playwright and assert a CountUp metric equals its final value on first paint:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     pnpm exec playwright screenshot \
       --reduced-motion=reduce \
       "http://localhost:${PORT}/today" \
       /tmp/h5-reduced-motion-today.png
   ```
   Compare `/tmp/h5-reduced-motion-today.png` against a normal-motion capture of `/today`:
   the reduced-motion frame must already show final metric numbers and fully-rendered lists
   (a normal capture taken mid-animation would show partial/0 values). If the reduced-motion
   shot still shows an in-progress animation, the gate is leaking — fix the offending
   component.

5. Commit (only if a regression was fixed; otherwise record "reduced-motion verified, no
   regressions" in handoff and skip):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "fix: honor useReducedMotionSafe in <component>

Reduced-motion audit found <component> animating regardless of preference;
now collapses to zero-duration when prefers-reduced-motion is reduce.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H6: Final verification — typecheck + build green, full before/after screenshot sweep, DoD checklist

This is the gate for the whole plan. It runs the full typecheck and build, captures "after"
Playwright screenshots of **all 12 routes** in **both light and dark**, and produces a
before/after checklist mapped to the spec's Definition of Done (§8).

**The 12 routes** (from `<SRC>/App.tsx`; `/` redirects to `/today`):

| # | Path | Page component | Needs a seeded `:id`? |
|---|------|----------------|------------------------|
| 1 | `/today` | Today | no |
| 2 | `/pipeline` | Pipeline | no |
| 3 | `/pipeline/:id` | LeadDetail | yes |
| 4 | `/outbound` | Outbound | no |
| 5 | `/outbound/:id` | ArtifactDetail | yes |
| 6 | `/conversations` | Conversations | no |
| 7 | `/conversations/:id` | ConversationThread | yes |
| 8 | `/runs` | Runs | no |
| 9 | `/runs/:id` | RunDetail | yes |
| 10 | `/agents` | Agents | no |
| 11 | `/settings` | Settings | no |
| 12 | `/__not-found__` (any unmatched path, e.g. `/zzz`) | NotFound | no |

> For the 4 detail routes, pick a real id from the seeded fixtures: navigate to the parent
> list route first, read the first card's href via Playwright, and reuse that id. Do NOT
> hardcode an id — it may not exist in the seed.

**Files:**
- Create: `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/` (screenshot output dir; ~24 PNGs)
- No source changes (verification only).

**Steps:**

1. **Start the dev server.** It requires `PORT` and `BASE_PATH` env vars (vite.config.ts
   throws without them). Run in the background:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && \
     PORT=5173 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev
   ```
   Wait until vite prints `Local: http://localhost:5173/`. Set `export PORT=5173` in the
   screenshot shell so the H4/H5 commands above resolve `${PORT}`.

2. **Typecheck — must be green:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0, zero errors. (Strict mode, no `any` — per CLAUDE.md rules.)

3. **Build — must be green:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)
   ```
   Expected: exit 0. Note: root `build` = `typecheck && pnpm -r build`, so this also re-runs
   typecheck across the workspace.

4. **Create the after/ directory:**
   ```bash
   mkdir -p /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after
   ```

5. **Resolve the 4 detail ids** (do this via the Playwright MCP browser, not a hardcoded
   list). For each of `/pipeline`, `/outbound`, `/conversations`, `/runs`: navigate, snapshot,
   read the first list item's link, and record its `:id`. Build a route list of 12 concrete
   URLs (e.g. `/pipeline/lead_abc`, `/outbound/art_def`, ...).

6. **Capture all 24 screenshots** (12 routes × light + dark). Theme is toggled by the `.dark`
   class on `<html>` (Tailwind v4 dark variant). Drive the Playwright MCP browser:
   for each route URL:
   - `browser_navigate` to `http://localhost:5173{route}`
   - `browser_resize` to `1440 × 900` (desktop) for a consistent frame
   - **Light:** ensure `<html>` has NO `.dark` class via
     `browser_evaluate`: `() => document.documentElement.classList.remove('dark')`,
     then `browser_take_screenshot` →
     `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/<NN>-<name>-light.png`
   - **Dark:** `browser_evaluate`: `() => document.documentElement.classList.add('dark')`,
     then `browser_take_screenshot` →
     `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/<NN>-<name>-dark.png`

   Use the route table's `#` and component name for `<NN>-<name>`, e.g.
   `01-today-light.png`, `01-today-dark.png`, … `12-notfound-dark.png`. End state: 24 PNGs.

   If the app exposes a theme toggle in the Shell header instead of relying on a manual class
   write, click it via `browser_click` rather than `browser_evaluate` — but the class write
   above is the robust fallback that does not depend on finding the toggle.

7. **Verify the capture is complete:**
   ```bash
   ls -1 /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/*.png | wc -l
   ```
   Expected: `24`. Then confirm both themes exist for every route:
   ```bash
   ls -1 /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/ | \
     grep -c "light\.png$" ; \
   ls -1 /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/ | \
     grep -c "dark\.png$"
   ```
   Expected: `12` and `12`.

8. **Produce the before/after Definition-of-Done checklist.** Compare each `after/` shot to
   the corresponding `before/` baseline captured in Task F0 (same `<NN>-<name>-<theme>.png`
   naming under `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/before/`). Fill in this checklist
   (DoD items from spec §8) and include it verbatim in your handoff:

   ```markdown
   ## Definition of Done (spec §8) — before/after

   | DoD item (§8) | Before | After | Evidence (screenshot / command) |
   |---|---|---|---|
   | Warm paper/ink/rust/ember palette applied across all routes | ☐ | ☐ | after/*-light.png vs before/*-light.png |
   | Dark mode renders correctly on all 12 routes | ☐ | ☐ | after/*-dark.png (12 files) |
   | Elevate hover/active overlays on buttons & badges | ☐ | ☐ | after/02-pipeline-light.png (cards) |
   | Warm ink-tinted shadow scale (no gray box-shadows) | ☐ | ☐ | after/01-today-light.png |
   | Motion (fade/slide/stagger/countup) on entry | ☐ | ☐ | manual + H5 reduced-motion proof |
   | prefers-reduced-motion collapses all motion | ☐ | ☐ | /tmp/h5-reduced-motion-today.png |
   | Empty/Error/ErrorBoundary states wired | ☐ | ☐ | after/08-runs-* (empty), after error route |
   | Brand = "Nikxius" (no "Mynoted"/"Nikhil Sood") | ☐ | ☐ | grep clean (step 9) |
   | All dangerouslySetInnerHTML go through sanitizeHtml | ☐ | ☐ | grep clean (step 9) |
   | A11y: SVGs labeled, clickable rows keyboard-operable, DS focus rings | ☐ | ☐ | H4 axe report (0 image-alt/button-name/label) |
   | No dead components (TimelineTree removed) | ☐ | ☐ | H1 grep CLEAN |
   | Single source of truth for sentiment colors (SentimentBadge) | ☐ | ☐ | H2 grep CLEAN |
   | Every color utility resolves to a defined --color-* token | ☐ | ☐ | H3 build CLEAN |
   | typecheck green | ☐ | ☐ | step 2 exit 0 |
   | build green | ☐ | ☐ | step 3 exit 0 |
   ```
   Mark each "After" box checked only when its evidence confirms it. Any unchecked "After"
   box is a blocker the assembler must resolve before merge.

9. **Final regression greps** (these back several DoD rows):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     echo "=== brand leftovers (must be empty) ===" && \
     grep -rn "Mynoted\|Nikhil Sood" src/ && echo "FAIL: brand leftover" || echo "CLEAN: no old brand" ; \
     echo "=== unsanitized dangerouslySetInnerHTML (each __html must be sanitizeHtml(...)) ===" && \
     grep -rn "dangerouslySetInnerHTML" src/
   ```
   For the second grep, every hit at the 4 content call sites (ApprovalCard.tsx,
   v2/ConversationThread.tsx, pages/ArtifactDetail.tsx, pages/ConversationThread.tsx) must
   read `__html: sanitizeHtml(...)`. The `chart.tsx` hit is a shadcn-internal style injection
   of a static CSS string (not user content) — leave it. If any content site is NOT wrapped,
   that is a blocker owned by the sanitize section; flag it.

10. Commit the after/ screenshots and checklist artifact:
    ```bash
    cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
      git commit -m "test: capture after/ screenshots for all 12 routes (light+dark) + DoD checklist

Full typecheck + build green. 24 before/after frames captured; every
spec §8 Definition-of-Done item verified.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

11. **Stop the dev server** (kill the background process from step 1) once captures are done.

---

#### Section notes for the assembler

- **Ordering:** H1→H2→H3 are independent cleanups and can run in any order. H4 and H5 should
  run before H6 (H6's axe + reduced-motion + DoD checklist depend on their fixes landing).
  H6 is always last — it is the whole-plan gate.
- **Dev server env:** vite **throws** without `PORT` and `BASE_PATH`. Always launch with
  `PORT=5173 BASE_PATH=/`. Every `${PORT}` in H4/H5/H6 assumes `5173`.
- **Token additions are NOT in scope here** — H3 only audits and fixes stragglers. The
  authoritative ramp is owned by the palette section; if a whole ramp is missing, that is a
  prior-section bug, not an H3 fix.
- **`ReplyIntelligenceSentiment` union:** H2 assumes it includes `objection`. Verify before
  editing (H2 step 2 note); drop the key from the `Record` literal if the enum differs — the
  runtime fallback still covers it.
