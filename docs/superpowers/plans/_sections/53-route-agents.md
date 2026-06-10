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
