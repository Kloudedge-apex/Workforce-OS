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
