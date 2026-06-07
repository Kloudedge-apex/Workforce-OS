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
