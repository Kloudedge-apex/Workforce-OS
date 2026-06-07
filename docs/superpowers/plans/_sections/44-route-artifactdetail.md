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
