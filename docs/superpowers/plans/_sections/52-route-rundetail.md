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
