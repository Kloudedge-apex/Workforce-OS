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
