## ROUTE — CONVERSATIONS

This section applies the Nikxius premium treatment to the **conversations** surface and
closes its specific leaks. The surface spans three files:

- `pages/Conversations.tsx` — the split **inbox** (left thread list + right detail pane).
- `components/v2/ConversationThread.tsx` — the preview-card + full-thread renderer the
  inbox composes (`mode="preview"` and `mode="full"`).
- `pages/ConversationThread.tsx` — the standalone `/conversations/:id` route (mobile / deep
  link) wired in `App.tsx` line 41.

### Grounding facts (verified against the live tree on 2026-06-07)

- **The search box is decorative.** `pages/Conversations.tsx` lines 46-49 render an `<Input
  placeholder="Search conversations…">` with **no `value`, no `onChange`** — it filters
  nothing. R-conversations-1 binds it.
- **Two hand-rolled empties + one hand-rolled "not found".**
  `Conversations.tsx` lines 82-86 (`<Inbox/>` + "No conversations match your criteria.") and
  lines 103-108 (`<Inbox/>` + "No conversation selected"). `ConversationThread.tsx` line 48
  (`<div className="p-6 text-ink-400">Conversation not found</div>`). All replaced by
  `<EmptyState>` / `<ErrorState>`.
- **No error handling anywhere.** Neither page reads `isError`/`error` from the query, so a
  failed `useListConversations`/`useGetConversation` silently shows the empty/skeleton state
  forever. R-conversations-1 adds `<ErrorState onRetry={refetch}>` to the inbox; the standalone
  `/conversations/:id` route's error state is handled in section 50 (R-convothread-4).
- **Two unsanitized HTML sinks.** `components/v2/ConversationThread.tsx` line 155 and
  `pages/ConversationThread.tsx` line 87 both do
  `dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}` on server-supplied email bodies with
  **no sanitizer**. R-conversations-2 wraps the v2 component's sink; the `pages/ConversationThread.tsx`
  sink is sanitized in section 50 (R-convothread-1).
- **The list maps `<ConversationThread mode="preview">` directly** (`Conversations.tsx`
  lines 88-96) with no entrance animation. R-conversations-3 wraps the list in `<Stagger>` /
  `<StaggerItem>`.
- **Depends on:** FOUNDATION (palette, warm shadow tokens `--shadow-xs/sm/md/lg`,
  `.hover-elevate`/`.active-elevate-2`) and PRIMITIVES (P1 motion lib, P2 `<Stagger>`/
  `<StaggerItem>`, P3 `<EmptyState>`/`<ErrorState>`, P5 `sanitizeHtml`). All names used
  below match the SHARED CONTRACT exactly.
- The `Conversation` preview type exposes `id, leadName, leadCompany?, subject,
  lastMessagePreview, lastMessageAt, unread, needsReply, leadAvatarUrl?,
  replyIntelligence.sentiment` (confirmed from existing reads in `v2/ConversationThread.tsx`
  lines 56-74). The client filter in R-conversations-1 reads only `leadName`, `subject`,
  `lastMessagePreview` — all present.

---

### Task R-conversations-1: Bind the search box + add list error/empty states to the inbox

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Conversations.tsx`
  - imports (lines 1-8)
  - state + query (lines 17-36)
  - search `<Input>` (lines 46-49)
  - thread-list body (lines 70-98)

**Steps:**

1. Update the imports. Replace lines 1-8:

   **BEFORE** (lines 1-8):
   ```tsx
   import React, { useState } from "react";
   import { useListConversations, useGetConversation, ListConversationsSentiment } from "@workspace/api-client-react";
   import { ConversationThread } from "@/components/v2/ConversationThread";
   import { Input } from "@/components/ui/input";
   import { Badge } from "@/components/ui/badge";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Search, Inbox } from "lucide-react";
   import { cn } from "@/lib/utils";
   ```

   **AFTER**:
   ```tsx
   import React, { useMemo, useState } from "react";
   import { useListConversations, useGetConversation, ListConversationsSentiment } from "@workspace/api-client-react";
   import { ConversationThread } from "@/components/v2/ConversationThread";
   import { Input } from "@/components/ui/input";
   import { Badge } from "@/components/ui/badge";
   import { Skeleton } from "@/components/ui/skeleton";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { Search, Inbox, SearchX } from "lucide-react";
   import { cn } from "@/lib/utils";
   ```

2. Add the search-query state and read `isError`/`error`/`refetch` off the list query, then
   derive the filtered list. Replace lines 17-36:

   **BEFORE** (lines 17-36):
   ```tsx
   export default function Conversations() {
     const [activeFilter, setActiveFilter] = useState("all");
     const [selectedId, setSelectedId] = useState<string | null>(null);

     const queryParams: any = { limit: 50 };
     if (activeFilter === "needs_reply") queryParams.needsReply = true;
     if (activeFilter === "positive") queryParams.sentiment = "positive" as ListConversationsSentiment;
     if (activeFilter === "objection") queryParams.sentiment = "objection" as ListConversationsSentiment;

     const { data: listData, isLoading: listLoading } = useListConversations(
       queryParams,
       { query: { refetchInterval: 15000, queryKey: ["listConversations", activeFilter] } }
     );

     const conversations = listData?.items || [];

     const { data: detailData, isLoading: detailLoading } = useGetConversation(
       selectedId || "",
       { query: { enabled: !!selectedId, queryKey: ["getConversation", selectedId] } }
     );
   ```

   **AFTER**:
   ```tsx
   export default function Conversations() {
     const [activeFilter, setActiveFilter] = useState("all");
     const [selectedId, setSelectedId] = useState<string | null>(null);
     const [search, setSearch] = useState("");

     const queryParams: any = { limit: 50 };
     if (activeFilter === "needs_reply") queryParams.needsReply = true;
     if (activeFilter === "positive") queryParams.sentiment = "positive" as ListConversationsSentiment;
     if (activeFilter === "objection") queryParams.sentiment = "objection" as ListConversationsSentiment;

     const {
       data: listData,
       isLoading: listLoading,
       isError: listError,
       refetch: refetchList,
     } = useListConversations(
       queryParams,
       { query: { refetchInterval: 15000, queryKey: ["listConversations", activeFilter] } }
     );

     const allConversations = listData?.items || [];

     const conversations = useMemo(() => {
       const q = search.trim().toLowerCase();
       if (!q) return allConversations;
       return allConversations.filter((c) =>
         [c.leadName, c.subject, c.lastMessagePreview]
           .filter(Boolean)
           .some((field) => field!.toLowerCase().includes(q))
       );
     }, [allConversations, search]);

     const { data: detailData, isLoading: detailLoading } = useGetConversation(
       selectedId || "",
       { query: { enabled: !!selectedId, queryKey: ["getConversation", selectedId] } }
     );
   ```

3. Bind the search `<Input>` to the new state. Replace lines 46-49:

   **BEFORE** (lines 46-49):
   ```tsx
           <Input 
             placeholder="Search conversations..." 
             className="pl-9 bg-paper-50 border-paper-200"
           />
   ```

   **AFTER**:
   ```tsx
           <Input
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             placeholder="Search conversations..."
             className="pl-9 bg-paper-50 border-paper-200"
           />
   ```

4. Replace the thread-list body so it (a) renders an `<ErrorState onRetry>` on query
   failure, (b) distinguishes "no search match" from "inbox empty" via `<EmptyState>`, and
   (c) wraps the rendered previews in `<Stagger>`/`<StaggerItem>`. Replace lines 70-98:

   **BEFORE** (lines 70-98):
   ```tsx
         <div className="flex-1 overflow-y-auto">
           {listLoading ? (
             Array.from({ length: 6 }).map((_, i) => (
               <div key={i} className="p-4 border-b border-paper-200 flex gap-3">
                 <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                 <div className="space-y-2 flex-1">
                   <Skeleton className="h-4 w-1/3" />
                   <Skeleton className="h-3 w-full" />
                   <Skeleton className="h-3 w-2/3" />
                 </div>
               </div>
             ))
           ) : conversations.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-ink-400 p-8 text-center">
               <Inbox className="w-12 h-12 mb-4 opacity-20" />
               <p className="text-sm">No conversations match your criteria.</p>
             </div>
           ) : (
             conversations.map(conv => (
               <ConversationThread 
                 key={conv.id} 
                 mode="preview" 
                 conversation={conv} 
                 selected={selectedId === conv.id}
                 onSelect={setSelectedId}
               />
             ))
           )}
         </div>
   ```

   **AFTER**:
   ```tsx
         <div className="flex-1 overflow-y-auto">
           {listLoading ? (
             Array.from({ length: 6 }).map((_, i) => (
               <div key={i} className="p-4 border-b border-paper-200 flex gap-3">
                 <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                 <div className="space-y-2 flex-1">
                   <Skeleton className="h-4 w-1/3" />
                   <Skeleton className="h-3 w-full" />
                   <Skeleton className="h-3 w-2/3" />
                 </div>
               </div>
             ))
           ) : listError ? (
             <ErrorState
               title="Couldn't load conversations"
               description="The inbox failed to load. Check your connection and try again."
               onRetry={() => refetchList()}
             />
           ) : conversations.length === 0 ? (
             search.trim() ? (
               <EmptyState
                 icon={SearchX}
                 title="No matches"
                 description={`No conversations match "${search.trim()}". Try a different search.`}
               />
             ) : (
               <EmptyState
                 icon={Inbox}
                 title="Inbox zero"
                 description="No conversations match this filter. New replies will appear here as they arrive."
               />
             )
           ) : (
             <Stagger>
               {conversations.map((conv) => (
                 <StaggerItem key={conv.id}>
                   <ConversationThread
                     mode="preview"
                     conversation={conv}
                     selected={selectedId === conv.id}
                     onSelect={setSelectedId}
                   />
                 </StaggerItem>
               ))}
             </Stagger>
           )}
         </div>
   ```

5. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. The `Inbox` import is still used (empty state), `SearchX` is newly
   used, and `Search` (the magnifier inside the input wrapper, line 45) is unchanged — no
   unused-import error.

6. **Visual verify:** start the dev server, navigate to `/conversations`, and with Playwright
   `browser_type` into the "Search conversations…" box. Confirm the thread list filters live
   to matching leads/subjects, and that an unmatched query shows the `<EmptyState>` "No
   matches" card (not the generic empty). Screenshot light **and** dark (toggle via the
   topbar). Compare against `baseline/conversations.png`.
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```

7. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Conversations.tsx && \
     git commit -m "feat(conversations): bind search filter + Stagger list + Empty/ErrorState

   Binds the previously-decorative search box to a client-side filter over
   leadName/subject/lastMessagePreview, staggers the thread list in, and replaces
   the hand-rolled empty with EmptyState (distinct no-match vs inbox-zero) plus an
   ErrorState retry on list-query failure.

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-conversations-2: Premium preview card + sanitized full thread in the v2 component

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/v2/ConversationThread.tsx`
  - imports (lines 1-10)
  - preview card root (lines 43-49)
  - full-thread message body sink (lines 153-156)

**Steps:**

1. Add the `sanitizeHtml` import. Replace lines 7-10:

   **BEFORE** (lines 7-10):
   ```tsx
   import { formatDistanceToNow, format } from "date-fns";
   import { cn } from "@/lib/utils";
   import { Sparkles, Bot, AlertTriangle } from "lucide-react";
   import { toast } from "sonner";
   ```

   **AFTER**:
   ```tsx
   import { formatDistanceToNow, format } from "date-fns";
   import { cn } from "@/lib/utils";
   import { sanitizeHtml } from "@/lib/sanitize";
   import { Sparkles, Bot, AlertTriangle } from "lucide-react";
   import { toast } from "sonner";
   ```

   (`AlertTriangle` is currently imported but unused in this file; leave it — removing it is
   out of scope and the hygiene section owns dead-import cleanup.)

2. Give the preview card a press/hover micro-interaction and selected-state depth. The card
   is the inbox's primary interactive object, so it lifts on hover and presses on active via
   the foundation `.hover-elevate`/`.active-elevate-2` utilities, plus a left rust rail when
   selected. Replace lines 43-49:

   **BEFORE** (lines 43-49):
   ```tsx
       return (
         <div 
           className={cn(
             "p-4 border-b border-paper-200 cursor-pointer hover:bg-paper-100 transition-colors flex gap-3 relative",
             selected && "bg-paper-100"
           )}
           onClick={() => onSelect?.(conversation.id)}
         >
   ```

   **AFTER**:
   ```tsx
       return (
         <div
           role="button"
           tabIndex={0}
           aria-pressed={selected}
           className={cn(
             "hover-elevate active-elevate-2 p-4 pl-5 border-b border-paper-200 cursor-pointer transition-colors flex gap-3 relative",
             "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust-500/40 focus-visible:ring-inset",
             selected
               ? "bg-paper-100 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-rust-500"
               : "hover:bg-paper-100/60"
           )}
           onClick={() => onSelect?.(conversation.id)}
           onKeyDown={(e) => {
             if (e.key === "Enter" || e.key === " ") {
               e.preventDefault();
               onSelect?.(conversation.id);
             }
           }}
         >
   ```

   > The unread dot at line 50-52 (`absolute left-2`) still reads fine against the new
   > `pl-5`; the selected rail sits at `left-0` so the two never collide.

3. Sanitize the full-thread message body. Replace lines 153-156:

   **BEFORE** (lines 153-156):
   ```tsx
                   <div 
                     className="prose prose-sm prose-ink max-w-none text-ink-700 leading-relaxed"
                     dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                   />
   ```

   **AFTER**:
   ```tsx
                   <div
                     className="prose prose-sm prose-ink max-w-none text-ink-700 leading-relaxed"
                     dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.bodyHtml) }}
                   />
   ```

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `sanitizeHtml` resolves from `@/lib/sanitize` (PRIMITIVES P5).

5. **Visual verify:** dev server up at `/conversations`, select a thread. Confirm the preview
   cards lift on hover (warm elevate overlay) and show the rust left-rail when selected, and
   that the full thread renders message bodies unchanged for benign HTML (DOMPurify keeps
   `<p>`/`<a>`/lists). Tab through the list to confirm the focus ring appears. Screenshot
   light **and** dark.

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/v2/ConversationThread.tsx && \
     git commit -m "feat(conversations): premium preview card + sanitize thread HTML sink

   Adds hover-elevate/active-elevate-2 press micro-interaction, a selected rust
   left-rail, and keyboard focus affordances to the preview card, and wraps the
   full-thread dangerouslySetInnerHTML body in sanitizeHtml.

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-conversations-3: Premium split view + EmptyState for the unselected detail pane

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Conversations.tsx`
  - inbox header surface (line 42)
  - detail pane (lines 101-120)

**Steps:**

1. Raise the inbox header onto a warm-shadowed surface so the split is visually anchored.
   Replace line 42:

   **BEFORE** (line 42):
   ```tsx
           <div className="p-4 border-b border-paper-200 space-y-4 shrink-0 bg-white">
   ```

   **AFTER**:
   ```tsx
           <div className="p-4 border-b border-paper-200 space-y-4 shrink-0 bg-ink-0 shadow-sm z-10">
   ```

   (`bg-white` → `bg-ink-0` so the surface flips in dark mode; `shadow-sm` is the warm
   ink-tinted token from FOUNDATION F3; `z-10` keeps the shadow above the scrolling list.)

2. Replace the unselected / loading / loaded detail pane so the "no conversation selected"
   message uses `<EmptyState>` and the loaded thread fades in via `cardEnter`. Replace lines
   101-120:

   **BEFORE** (lines 101-120):
   ```tsx
         {/* Detail View (Right) */}
         <div className="hidden md:flex flex-col flex-1 bg-paper-50 min-w-0">
           {!selectedId ? (
             <div className="flex flex-col items-center justify-center h-full text-ink-400">
               <Inbox className="w-16 h-16 mb-4 opacity-10" />
               <h3 className="font-serif text-xl text-ink-900 mb-2">No conversation selected</h3>
               <p className="text-sm max-w-sm text-center">Select a thread from the list to view the full message history and AI analysis.</p>
             </div>
           ) : detailLoading || !detailData ? (
             <div className="p-6 space-y-6 h-full flex flex-col">
               <Skeleton className="h-16 w-full" />
               <div className="flex-1 space-y-4">
                 <Skeleton className="h-32 w-[80%] ml-auto" />
                 <Skeleton className="h-24 w-[70%]" />
               </div>
             </div>
           ) : (
             <ConversationThread mode="full" detail={detailData} />
           )}
         </div>
   ```

   **AFTER**:
   ```tsx
         {/* Detail View (Right) */}
         <div className="hidden md:flex flex-col flex-1 bg-paper-50 min-w-0">
           {!selectedId ? (
             <EmptyState
               icon={MessageSquareText}
               title="No conversation selected"
               description="Select a thread from the list to view the full message history and AI analysis."
             />
           ) : detailLoading || !detailData ? (
             <div className="p-6 space-y-6 h-full flex flex-col">
               <Skeleton className="h-16 w-full" />
               <div className="flex-1 space-y-4">
                 <Skeleton className="h-32 w-[80%] ml-auto" />
                 <Skeleton className="h-24 w-[70%]" />
               </div>
             </div>
           ) : (
             <motion.div
               key={selectedId}
               variants={reduced ? undefined : cardEnter}
               initial={reduced ? false : "hidden"}
               animate={reduced ? false : "visible"}
               className="flex flex-col h-full min-w-0"
             >
               <ConversationThread mode="full" detail={detailData} />
             </motion.div>
           )}
         </div>
   ```

3. Wire the new imports + the reduced-motion guard this pane now uses. The detail pane needs
   `motion`, `cardEnter`, `useReducedMotionSafe`, and the `MessageSquareText` icon. Extend
   the import block from R-conversations-1 (lines 1-11). Replace the motion/icon lines:

   **BEFORE** (the two lines added/kept in R-conversations-1):
   ```tsx
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { Search, Inbox, SearchX } from "lucide-react";
   ```

   **AFTER**:
   ```tsx
   import { Stagger, StaggerItem } from "@/components/motion/Stagger";
   import { motion } from "framer-motion";
   import { cardEnter, useReducedMotionSafe } from "@/lib/motion";
   import { Search, Inbox, SearchX, MessageSquareText } from "lucide-react";
   ```

   Then add the guard at the top of the component body, immediately after the `const [search,
   setSearch] = useState("")` line from R-conversations-1:

   **BEFORE**:
   ```tsx
     const [search, setSearch] = useState("");
   ```

   **AFTER**:
   ```tsx
     const [search, setSearch] = useState("");
     const reduced = useReducedMotionSafe();
   ```

4. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. `Inbox` is still used by the inbox-zero `<EmptyState>` from
   R-conversations-1; `MessageSquareText` is newly used by the detail-pane empty.

5. **Visual verify:** dev server up at `/conversations`. With no thread selected, confirm the
   right pane shows the editorial `<EmptyState>` (rounded `MessageSquareText` chip, serif
   title) instead of the old faint `<Inbox>`. Click a thread and confirm the full thread
   fades/scales in (`cardEnter`); switch threads and confirm the re-mount animates (keyed on
   `selectedId`). Screenshot light **and** dark; verify the header `shadow-sm` reads warm in
   light and the split surfaces flip correctly in dark.

6. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Conversations.tsx && \
     git commit -m "feat(conversations): premium split view + EmptyState detail pane + cardEnter

   Raises the inbox header onto a warm shadow-sm surface, replaces the unselected
   detail-pane placeholder with EmptyState, and animates the loaded thread in with
   the cardEnter variant (reduced-motion safe, keyed on selection).

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task R-conversations-4 — moved to section 50 (convothread)

> The standalone `/conversations/:id` route (`pages/ConversationThread.tsx`) is owned in full by
> section **50-route-convothread** (tasks R-convothread-1..4: sanitize, bubble depth, message-enter
> motion, ErrorState). To avoid two sections editing the same file with contradictory edits, the
> original R-conversations-4 task was removed here. Section 45 owns only `pages/Conversations.tsx`
> (inbox list + split view) and `components/v2/ConversationThread.tsx` (the preview/full renderer).

---

### Section dependencies & ordering

- **R-conversations-1 → R-conversations-3** both edit `pages/Conversations.tsx`; do 1 first
  (it establishes the import block and the `search`/`reduced` state that 3 extends). Running
  3 before 1 would leave the `<Stagger>` import unreferenced and `motion`/`cardEnter` would
  collide with a not-yet-added import block.
- **R-conversations-2** is independent (only `components/v2/ConversationThread.tsx`) and may
  run any time after PRIMITIVES P5 (`sanitizeHtml`).
- **R-conversations-4** was moved to section 50 (convothread); `pages/ConversationThread.tsx` is owned there.
- All three remaining tasks require FOUNDATION (warm shadow tokens, `.hover-elevate`/`.active-elevate-2`) and
  PRIMITIVES (motion lib P1/P2, states P3, sanitize P5) to be merged first. No symbol is
  renamed; every imported name matches the SHARED CONTRACT.
