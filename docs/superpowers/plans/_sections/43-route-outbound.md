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
