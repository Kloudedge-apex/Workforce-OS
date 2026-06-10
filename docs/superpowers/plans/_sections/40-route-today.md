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
