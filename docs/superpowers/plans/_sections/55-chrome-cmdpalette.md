## Surface: Chrome — Command Palette

Premium pass for the global Command Palette (`src/components/layout/CommandPalette.tsx`).
This section applies the foundation treatment — warm shadow depth on the dialog panel, motion
(`cardEnter` / `staggerItem`-style entrance via the motion lib), and hover/press
micro-interactions on items — and closes the palette's functional leaks:

1. **Four dead "Actions" just `console.log`** (`CommandPalette.tsx:54-66`):
   - **Trigger Pipeline** → `console.log("Trigger Pipeline")` → wire `useTriggerRun()` and
     navigate `/runs` on success.
   - **Approve Next Draft** → `console.log("Approve Next")` → approve the first
     `PENDING_REVIEW` artifact via `useApproveArtifact()`, sourcing it from
     `useListArtifacts({ status: "PENDING_REVIEW", limit: 1 })`.
   - **Add Suppression** → `console.log("Add Suppression")` → navigate to the Settings
     suppression surface. **The only suppression-management surface inside Settings is the
     ICP tab's "Exclusion Domains" field (`Settings.tsx` ICP tab, `/settings/icp`)** — there
     is no `/settings/suppression` route (verified: `TABS` in `Settings.tsx:35-45` has no
     suppression entry). We navigate `/settings/icp`.
   - **Invite Teammate** → `console.log("Invite Teammate")` → navigate `/settings/team`
     (the Team tab, `Settings.tsx:41`, `513`, owns the Invite dialog).
2. **Missing Navigation entries** — the Navigation group (`CommandPalette.tsx:31-52`) lists
   Today, Pipeline, Outbound, Conversations, Settings. The app also routes `/runs`
   (`App.tsx:42`) and `/agents` (`App.tsx:44`) but neither is reachable from the palette.
   Add **Runs** and **Agents**. (Outbound is *already present* at
   `CommandPalette.tsx:40-43`; the brief's "Outbound, Runs, Agents" list is satisfied by
   verifying Outbound stays and adding the two missing ones.)

### Dependencies (must land first)
- `src/lib/motion.ts` — `staggerContainer`, `staggerItem`, `cardEnter`, `springHover`,
  `useReducedMotionSafe()` (foundation section).
- Warm shadow tokens `--shadow-md` + `.hover-elevate` / `.active-elevate-2` utilities in
  `src/index.css` (foundation section).
- **Ordering note:** section `56-chrome-notifications.md` (Task R-notifications-2) also edits
  `CommandPalette.tsx`, but only the `useEffect` keydown listener at **lines 10-19**. This
  section edits **lines 1-4 (imports), 6-9 + 21-24 (hooks/handlers), and 31-70 (the
  CommandList body)** — no overlapping lines. If both have landed, the listener edit and these
  edits coexist; apply this section's edits against whatever the listener body currently is.

### Ground truth (verified against current source)
- `useTriggerRun()` is a **`void`-argument** mutation (`api.ts:1589`) returning
  `TriggerResult = { runId: string }` (`api.schemas.ts:206-207`). Pattern already used in
  `Runs.tsx:31-36`: `const { mutate, isPending } = useTriggerRun({ mutation: { onSuccess, onError } })`.
- `useApproveArtifact()` takes **`{ id: string }`** (`api.ts:459-468`,
  `mutationFn` destructures `{ id }`). Pattern already used in `ApprovalCard.tsx:34`
  (`approveMut.mutateAsync({ id: artifact.id })`) and `ArtifactDetail.tsx:126`.
- `useListArtifacts(params, { query })` → `PaginatedArtifacts = { items: OutreachArtifact[], total, page }`
  (`api.ts:257`, `api.schemas.ts:76`). `params.status` is `ListArtifactsStatus`, whose
  `PENDING_REVIEW` member exists (`api.schemas.ts:604-610`). Pattern used in
  `Outbound.tsx:109-112`.
- `toast` is imported from `"sonner"` everywhere (`Runs.tsx:8`, `Outbound.tsx:17`,
  `ApprovalCard.tsx:12`).
- Routes exist: `/runs` (`App.tsx:42`), `/agents` (`App.tsx:44`), `/settings/team`
  + `/settings/icp` (catch-all `/settings/*`, `App.tsx:45`; resolved by
  `Settings.tsx:52-53`).
- The `CommandDialog` primitive wraps a shadcn `DialogContent` (`command.tsx:29`); adding
  `shadow-md` to items / depth is done via `className` on `CommandItem`s and the
  `cardEnter`/`staggerItem` motion variants on wrapping `motion` elements.

---

### Task R-cmdpalette-1: Wire the four Actions to real hooks + navigation

**Files:**
- `src/components/layout/CommandPalette.tsx` (imports lines 1-4; hook/handler region lines 6-24; Actions group lines 53-70)

**Step 1 — Replace imports (current lines 1-4).**

Before:
```tsx
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus } from "lucide-react";
```

After:
```tsx
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useTriggerRun,
  useApproveArtifact,
  useListArtifacts,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus, History, Bot } from "lucide-react";
```

**Step 2 — Add hooks + action handlers (current lines 6-24).**

Before:
```tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };
```

After:
```tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { mutate: triggerRun, isPending: triggering } = useTriggerRun({
    mutation: {
      onSuccess: (d) => {
        toast.success(`Run started — ${d.runId}`);
        setLocation("/runs");
      },
      onError: () => toast.error("Failed to start run"),
    },
  });

  const { mutate: approveArtifact, isPending: approving } = useApproveArtifact({
    mutation: {
      onSuccess: () => toast.success("Draft approved"),
      onError: () => toast.error("Failed to approve draft"),
    },
  });

  // Lazily fetch the single oldest pending draft so "Approve Next Draft" has a target.
  const { data: pendingDrafts, refetch: refetchPending } = useListArtifacts(
    { status: "PENDING_REVIEW", limit: 1 },
    { query: { queryKey: ["listArtifacts", "PENDING_REVIEW", "cmdk"] } },
  );

  const handleApproveNext = async () => {
    const { data } = await refetchPending();
    const next = data?.items?.[0];
    if (!next) {
      toast("No drafts awaiting review");
      return;
    }
    approveArtifact({ id: next.id });
  };

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };
```

> Note: `triggering` / `approving` are wired now and consumed in the JSX (Step 4) to disable
> their items while in flight; `pendingDrafts` seeds the count badge in Step 4. No unused-var
> lint.

**Step 3 — Replace the Actions group with real wiring (current lines 53-70).**

Before:
```tsx
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => console.log("Trigger Pipeline"))}>
            <PlayCircle className="mr-2 h-4 w-4 text-rust-500" />
            <span>Trigger Pipeline</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Approve Next"))}>
            <CheckCircle className="mr-2 h-4 w-4 text-signal-positive" />
            <span>Approve Next Draft</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Add Suppression"))}>
            <Ban className="mr-2 h-4 w-4 text-ember-400" />
            <span>Add Suppression</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => console.log("Invite Teammate"))}>
            <UserPlus className="mr-2 h-4 w-4 text-signal-info" />
            <span>Invite Teammate</span>
          </CommandItem>
        </CommandGroup>
```

After:
```tsx
        <CommandGroup heading="Actions">
          <CommandItem
            disabled={triggering}
            onSelect={() => runCommand(() => triggerRun())}
          >
            <PlayCircle className="mr-2 h-4 w-4 text-rust-500" />
            <span>Trigger Pipeline</span>
            {triggering && <span className="ml-auto text-xs text-ink-400">Starting…</span>}
          </CommandItem>
          <CommandItem
            disabled={approving}
            onSelect={() => runCommand(() => { void handleApproveNext(); })}
          >
            <CheckCircle className="mr-2 h-4 w-4 text-signal-positive" />
            <span>Approve Next Draft</span>
            {(pendingDrafts?.items?.length ?? 0) > 0 && (
              <span className="ml-auto rounded-full bg-signal-positive/10 px-1.5 py-0.5 text-[10px] font-medium text-signal-positive font-tabular">
                {pendingDrafts!.items.length}
              </span>
            )}
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings/icp"))}>
            <Ban className="mr-2 h-4 w-4 text-ember-400" />
            <span>Add Suppression</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings/team"))}>
            <UserPlus className="mr-2 h-4 w-4 text-signal-info" />
            <span>Invite Teammate</span>
          </CommandItem>
        </CommandGroup>
```

**Step 4 — Verify.**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
```
Expected: exits 0, no errors. Specifically: no TS error on `triggerRun()` (the mutation is
`void`-argument), no error on `d.runId` (it is `TriggerResult.runId: string`), no error on
`approveArtifact({ id: next.id })` (mutation variable is `{ id: string }` and `next.id` is a
`string`), no error on `useListArtifacts({ status: "PENDING_REVIEW", limit: 1 }, ...)` (the
status literal is a member of `ListArtifactsStatus`), and no unused-var error on `triggering`,
`approving`, or `pendingDrafts`.

**Step 5 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/layout/CommandPalette.tsx && \
git commit -m "feat(cmdpalette): wire 4 dead Actions to real hooks + navigation

- Trigger Pipeline -> useTriggerRun(); toast runId + navigate /runs on success
- Approve Next Draft -> fetch first PENDING_REVIEW artifact via useListArtifacts
  and approve it with useApproveArtifact({ id }); toast when queue is empty
- Add Suppression -> navigate /settings/icp (Exclusion Domains is the only
  Settings suppression surface; no /settings/suppression route exists)
- Invite Teammate -> navigate /settings/team (Team tab owns the Invite dialog)
- In-flight disable + pending-draft count badge on the relevant items

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task R-cmdpalette-2: Add missing Navigation entries (Runs, Agents)

The Navigation group lists Today, Pipeline, Outbound, Conversations, Settings — but the app
also routes `/runs` (`App.tsx:42`) and `/agents` (`App.tsx:44`). Outbound is already present
(`CommandPalette.tsx:40-43`); we add the two genuinely missing destinations. Icons
`History` (Runs) and `Bot` (Agents) were imported in Task R-cmdpalette-1, Step 1.

**Files:**
- `src/components/layout/CommandPalette.tsx` (Navigation group, current lines 44-51)

**Step 1 — Insert Runs + Agents after Outbound, before Conversations is fine; we insert
after the Conversations item and before Settings (current lines 44-51).**

Before:
```tsx
          <CommandItem onSelect={() => runCommand(() => setLocation("/conversations"))}>
            <Inbox className="mr-2 h-4 w-4" />
            <span>Conversations</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
```

After:
```tsx
          <CommandItem onSelect={() => runCommand(() => setLocation("/conversations"))}>
            <Inbox className="mr-2 h-4 w-4" />
            <span>Conversations</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/runs"))}>
            <History className="mr-2 h-4 w-4" />
            <span>Runs</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/agents"))}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Agents</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
```

**Step 2 — Verify.**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
```
Expected: exits 0. `History` and `Bot` resolve (imported in Task R-cmdpalette-1, Step 1); no
unused-import error since both are now rendered.

**Step 3 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/layout/CommandPalette.tsx && \
git commit -m "feat(cmdpalette): add Runs + Agents to Navigation group

- /runs and /agents are routed (App.tsx) but were unreachable from the palette
- Use History (Runs) and Bot (Agents) lucide icons, matching existing item style

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task R-cmdpalette-3: Premium depth + motion + hover/press micro-interactions

Apply the foundation treatment: warm `shadow-md` on the dialog panel, a `cardEnter`-driven
panel entrance, a `staggerContainer`/`staggerItem` cascade over the two groups, and
`hover-elevate`/`active-elevate-2` press feedback on every `CommandItem`. All motion respects
`useReducedMotionSafe()`.

**Files:**
- `src/components/layout/CommandPalette.tsx` (imports line 1; `CommandDialog`/`CommandList` body lines 26-72)

**Step 1 — Add motion + React imports (current line 1) and motion-lib import (after the lucide import).**

Before (line 1):
```tsx
import React, { useEffect, useState } from "react";
```

After (line 1):
```tsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
```

Then, immediately after the lucide-react import added in Task R-cmdpalette-1 Step 1, add the
motion-lib import:

Before:
```tsx
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus, History, Bot } from "lucide-react";
```

After:
```tsx
import { LayoutDashboard, Target, Activity, Inbox, Settings, PlayCircle, CheckCircle, Ban, UserPlus, History, Bot } from "lucide-react";
import { staggerContainer, staggerItem, cardEnter, useReducedMotionSafe } from "@/lib/motion";
```

**Step 2 — Read the reduced-motion flag (inside the component, right after `const [, setLocation] = useLocation();`, current line 8).**

Before:
```tsx
  const [, setLocation] = useLocation();
```

After:
```tsx
  const [, setLocation] = useLocation();
  const reduce = useReducedMotionSafe();
```

**Step 3 — Wrap the dialog body in motion + add warm depth and staggered groups (current lines 27-72).**

This wraps the existing `CommandInput`/`CommandList` in a `motion.div` panel that animates with
`cardEnter`, and converts each `CommandGroup`'s children container to a `staggerContainer` so
items cascade in. Item markup is unchanged except for the added `hover-elevate active-elevate-2`
press utilities and `motion` wrappers on each item (shown for the Navigation group; apply the
identical `motion.div`/`staggerItem` wrapper to every `CommandItem` in the Actions group too).

Before (current lines 27-72):
```tsx
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => setLocation("/today"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Today</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/pipeline"))}>
            <Target className="mr-2 h-4 w-4" />
            <span>Pipeline</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setLocation("/outbound"))}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Outbound</span>
          </CommandItem>
```

After (current lines 27-39 region — the rest of the items keep the same `motion.div`+`hover-elevate` wrapper pattern):
```tsx
    <CommandDialog open={open} onOpenChange={setOpen}>
      <motion.div
        variants={reduce ? undefined : cardEnter}
        initial={reduce ? undefined : "hidden"}
        animate={reduce ? undefined : "visible"}
        className="shadow-md"
      >
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <motion.div
              variants={reduce ? undefined : staggerContainer}
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "visible"}
            >
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/today"))}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <span>Today</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/pipeline"))}
                >
                  <Target className="mr-2 h-4 w-4" />
                  <span>Pipeline</span>
                </CommandItem>
              </motion.div>
              <motion.div variants={reduce ? undefined : staggerItem}>
                <CommandItem
                  className="hover-elevate active-elevate-2"
                  onSelect={() => runCommand(() => setLocation("/outbound"))}
                >
                  <Activity className="mr-2 h-4 w-4" />
                  <span>Outbound</span>
                </CommandItem>
              </motion.div>
```

Apply the **same `<motion.div variants={reduce ? undefined : staggerItem}>` wrapper + the
`className="hover-elevate active-elevate-2"` prop** to the remaining Navigation items
(Conversations, Runs, Agents, Settings) and to **all four** Actions items. Then close the
Navigation `staggerContainer` `motion.div` before the Actions `CommandGroup`, wrap the Actions
items in their own `staggerContainer` `motion.div`, and finally close `CommandList`, the
`cardEnter` `motion.div`, and `CommandDialog`:

After (current lines 70-72 region — the closing tags):
```tsx
            </motion.div>
          </CommandGroup>
        </CommandList>
      </motion.div>
    </CommandDialog>
```

> Indentation moves in one level because of the new `motion.div` panel wrapper — re-indent the
> two `CommandGroup`s accordingly. The Actions items keep the `disabled`/badge logic added in
> Task R-cmdpalette-1; only their `className` (add `hover-elevate active-elevate-2`) and the
> `staggerItem` `motion.div` wrapper change here.

**Step 4 — Verify (typecheck + build + visual).**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
```
Expected: both exit 0. No TS error on the `framer-motion` `motion.div` `variants`/`initial`/
`animate` props, no error on the `@/lib/motion` named imports (`staggerContainer`,
`staggerItem`, `cardEnter`, `useReducedMotionSafe`), and no unused-var error on `reduce`.

Visual check — run dev and screenshot the palette in light AND dark:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)
```
Then Playwright: navigate to `/today`, press `⌘K` (or `Ctrl+K`) to open the palette.
Expected (light + dark screenshots): the dialog panel shows a warm `shadow-md` and animates in
via `cardEnter`; Navigation and Actions items cascade in (stagger); hovering an item elevates
it and pressing depresses it (`hover-elevate`/`active-elevate-2`). Selecting **Trigger
Pipeline** fires a toast and routes to `/runs`; **Approve Next Draft** shows the pending count
badge and approves (or toasts "No drafts awaiting review" when the queue is empty); **Add
Suppression** routes to `/settings/icp`; **Invite Teammate** routes to `/settings/team`;
**Runs** routes to `/runs`; **Agents** routes to `/agents`. With OS "Reduce Motion" enabled,
the panel and items appear with no animation (verify `useReducedMotionSafe()` short-circuits
the variants — items still render and remain interactive).

**Step 5 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/layout/CommandPalette.tsx && \
git commit -m "feat(cmdpalette): premium depth + motion + hover/press micro-interactions

- Warm shadow-md on the dialog panel; cardEnter panel entrance
- staggerContainer/staggerItem cascade over Navigation + Actions groups
- hover-elevate/active-elevate-2 press feedback on every CommandItem
- All motion gated on useReducedMotionSafe()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
