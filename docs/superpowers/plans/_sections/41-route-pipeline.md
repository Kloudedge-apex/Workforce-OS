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
