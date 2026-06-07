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
