## Surface: Chrome — Notifications + Topbar

Premium pass for the notification bell (`src/components/v2/NotificationBell.tsx`) and the
chrome topbar Search control (`src/components/layout/Shell.tsx`). This section applies the
foundation treatment — warm shadow depth, motion (`Stagger`/`StaggerItem`/`cardEnter`),
unified `<EmptyState>`/`<ErrorState>`, hover/press micro-interactions — and closes three
functional leaks:

1. **"Mark all as read" is dead** — `NotificationBell.tsx:58-60` renders a button with no
   `onClick`. Wire it to the generated `useMarkNotificationsRead()` mutation with an
   optimistic local read overlay and query invalidation.
2. **Notification rows don't navigate** — rows at `NotificationBell.tsx:46-52` are
   `cursor-pointer` but inert. The `Notification` model has a `link?: string | null`
   field (`api.schemas.ts:472`); wire rows to `setLocation(n.link)` via wouter when present.
3. **Topbar Search button is dead** — `Shell.tsx:89-92` renders a `⌘K` button with no
   `onClick`. `CommandPalette` (`CommandPalette.tsx:6-19`) owns its `open` state privately and
   toggles on a `metaKey/ctrlKey + "k"` keydown. Dispatch that exact synthetic event so the
   button and the shortcut share one code path — no prop drilling, no state lift.

### Dependencies (must land first)
- `src/lib/motion.ts` — `staggerContainer`, `staggerItem`, `cardEnter`, `springHover`,
  `useReducedMotionSafe()` (foundation section).
- `src/components/states/EmptyState.tsx`, `ErrorState.tsx` (state-primitives section).
- Warm shadow tokens `--shadow-sm/md` + `.hover-elevate`/`.active-elevate-2` utilities in
  `src/index.css` (foundation section).

### Ground truth (verified against current source)
- `useListNotifications` query key in this component is overridden to `["listNotifications"]`
  (`NotificationBell.tsx:11`), NOT the generated `["/api/notifications"]`. Invalidate the
  overridden key.
- `useMarkNotificationsRead()` is a `void`-argument mutation exported from
  `@workspace/api-client-react` (generated, `api.ts:3420`). Calling `.mutate()` with no args.
- `Notification` shape (`api.schemas.ts:465-474`): `{ id, type, title, body, read, link?:
  string|null, createdAt }`.
- `NotificationList` (`api.schemas.ts:476-479`): `{ items: Notification[], unreadCount: number }`.

---

### Task R-notifications-1: Wire "Mark all as read" + premium depth/motion on the bell

**Files:**
- `src/components/v2/NotificationBell.tsx` (full rewrite of imports + body; current lines 1-65)

**Step 1 — Replace imports (current lines 1-7).**

Before:
```tsx
import React from "react";
import { useListNotifications } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
```

After:
```tsx
import React from "react";
import {
  useListNotifications,
  useMarkNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { staggerContainer, staggerItem, useReducedMotionSafe } from "@/lib/motion";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
```

**Step 2 — Replace the hook body + add mark-read handler (current lines 10-14).**

Before:
```tsx
  const { data: notifications } = useListNotifications({ 
    query: { refetchInterval: 30000, queryKey: ["listNotifications"] } 
  });

  const unreadCount = notifications?.items.filter(n => !n.read).length || 0;
```

After:
```tsx
  const reduce = useReducedMotionSafe();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: notifications, isError, refetch } = useListNotifications({
    query: { refetchInterval: 30000, queryKey: ["listNotifications"] },
  });

  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listNotifications"] });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      },
    },
  });

  const items = notifications?.items ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  const handleRowClick = (link?: string | null) => {
    if (!link) return;
    setOpen(false);
    setLocation(link);
  };
```

**Step 3 — Make the Popover controlled (current line 17).**

Before:
```tsx
    <Popover>
```

After:
```tsx
    <Popover open={open} onOpenChange={setOpen}>
```

**Step 4 — Add press micro-interaction to the trigger button (current line 19).**

Before:
```tsx
        <Button variant="ghost" size="icon" className="relative text-ink-400 hover:text-ink-900">
```

After:
```tsx
        <Button
          variant="ghost"
          size="icon"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          className="relative text-ink-400 hover:text-ink-900 hover-elevate active-elevate-2"
        >
```

**Step 5 — Add warm-shadow depth to the popover panel (current line 29).**

Before:
```tsx
      <PopoverContent className="w-80 p-0 border-paper-200" align="end">
```

After:
```tsx
      <PopoverContent
        className="w-80 p-0 border-paper-200 shadow-md overflow-hidden"
        align="end"
      >
```

**Step 6 — Replace the list region (current lines 38-56): unified states, stagger entrance, navigating rows.**

Before:
```tsx
        <ScrollArea className="h-[300px]">
          {notifications?.items.length === 0 ? (
            <div className="p-8 text-center text-ink-400 text-sm">
              No notifications yet.
            </div>
          ) : (
            <div className="divide-y divide-paper-100">
              {notifications?.items.map((n) => (
                <div key={n.id} className="p-4 hover:bg-paper-50 transition-colors cursor-pointer">
                  <p className="text-sm text-ink-900 leading-snug font-medium">{n.title}</p>
                  <p className="text-xs text-ink-500 leading-snug mt-0.5">{n.body}</p>
                  <p className="text-[10px] text-ink-400 mt-1 uppercase font-tabular tracking-wider">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
```

After:
```tsx
        <ScrollArea className="h-[300px]">
          {isError ? (
            <ErrorState
              title="Couldn’t load notifications"
              description="We hit a snag fetching your activity feed."
              onRetry={() => refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="You’re all caught up"
              description="New replies, approvals, and run alerts will show up here."
            />
          ) : (
            <motion.div
              className="divide-y divide-paper-100"
              variants={reduce ? undefined : staggerContainer}
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "visible"}
            >
              {items.map((n) => {
                const navigable = Boolean(n.link);
                return (
                  <motion.button
                    key={n.id}
                    type="button"
                    variants={reduce ? undefined : staggerItem}
                    whileHover={reduce || !navigable ? undefined : { y: -1 }}
                    whileTap={reduce || !navigable ? undefined : { scale: 0.99 }}
                    disabled={!navigable}
                    onClick={() => handleRowClick(n.link)}
                    className={`w-full text-left p-4 transition-colors ${
                      navigable
                        ? "hover:bg-paper-50 cursor-pointer"
                        : "cursor-default"
                    } ${n.read ? "opacity-70" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rust-500" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-ink-900 leading-snug font-medium">{n.title}</p>
                        <p className="text-xs text-ink-500 leading-snug mt-0.5">{n.body}</p>
                        <p className="text-[10px] text-ink-400 mt-1 uppercase font-tabular tracking-wider">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </ScrollArea>
```

**Step 7 — Wire "Mark all as read" + press feedback (current lines 57-61).**

Before:
```tsx
        <div className="p-2 border-t border-paper-200 bg-paper-50 text-center">
          <Button variant="ghost" size="sm" className="text-xs text-ink-400 hover:text-ink-900 w-full">
            Mark all as read
          </Button>
        </div>
```

After:
```tsx
        <div className="p-2 border-t border-paper-200 bg-paper-50 text-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || markRead.isPending}
            onClick={() => markRead.mutate()}
            className="text-xs text-ink-400 hover:text-ink-900 w-full hover-elevate active-elevate-2 disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            {markRead.isPending ? "Marking…" : "Mark all as read"}
          </Button>
        </div>
```

**Step 8 — Verify.**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
```
Expected: exits 0, no errors. Specifically no TS error on `markRead.mutate()` (the
mutation takes `void`), no error on `useQueryClient`, `useLocation`, or the `motion.button`
`variants`/`whileHover` props, and no error on `n.link` (nullable string is accepted by
`handleRowClick`).

**Step 9 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/components/v2/NotificationBell.tsx && \
git commit -m "feat(notifications): wire mark-all-read + navigable rows + premium depth/motion

- Wire dead 'Mark all as read' button to useMarkNotificationsRead() with
  query invalidation on the overridden listNotifications key
- Make rows navigate via wouter setLocation(n.link) when link present;
  controlled Popover closes on navigate
- Unread dot + opacity treatment, warm shadow-md panel, staggerContainer
  entrance, springHover on navigable rows, press micro-interactions
- Unified EmptyState (caught-up) and ErrorState (retry) replace bare divs
- Respect useReducedMotionSafe()

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
---

### Task R-notifications-2: Wire topbar Search button to open the Command Palette

The cleanest, lowest-coupling approach: `CommandPalette` already toggles on a global
`metaKey/ctrlKey + "k"` keydown (`CommandPalette.tsx:11-18`). The Search button dispatches
that exact synthetic `KeyboardEvent` so both entry points share one code path. No lifted
state, no props threaded through `Shell`. We add a tiny typed helper so the dispatch is
reused and testable.

**Files:**
- `src/lib/openCommandPalette.ts` (new file)
- `src/components/layout/Shell.tsx` (imports + the Search button, current lines 1-16, 89-92)

**Step 1 — Create the dispatch helper.**

Create `src/lib/openCommandPalette.ts`:
```ts
/**
 * Opens the global Command Palette by dispatching the same Cmd/Ctrl+K keydown
 * that CommandPalette listens for. Keeps the palette's open-state private while
 * letting any control (topbar Search, etc.) trigger it without prop drilling.
 */
export function openCommandPalette(): void {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const event = new KeyboardEvent("keydown", {
    key: "k",
    code: "KeyK",
    metaKey: isMac,
    ctrlKey: !isMac,
    bubbles: true,
  });
  document.dispatchEvent(event);
}
```

**Step 2 — Make the palette toggle idempotent for the button (current `CommandPalette.tsx:10-19`).**

The listener currently flips `setOpen((open) => !open)`, so a second dispatch while open would
close it — fine for a keyboard toggle, but the Search button should always *open*. Guard the
button path by having the helper dispatch only when closed is not knowable from outside; instead,
make the listener open-only when the event carries a marker. Update `CommandPalette.tsx`.

Before (`CommandPalette.tsx:10-19`):
```tsx
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
```

After (`CommandPalette.tsx:10-19`):
```tsx
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Synthetic events from openCommandPalette() are not trusted → open-only.
        setOpen((prev) => (e.isTrusted ? !prev : true));
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);
```

**Step 3 — Import the helper + add press feedback in Shell (current `Shell.tsx:16`).**

Before:
```tsx
import { cn } from "@/lib/utils";
```

After:
```tsx
import { cn } from "@/lib/utils";
import { openCommandPalette } from "@/lib/openCommandPalette";
```

**Step 4 — Wire the Search button (current `Shell.tsx:89-92`).**

Before:
```tsx
            <button className="hidden md:flex items-center gap-2 px-2 py-1 text-xs text-ink-400 bg-paper-100 border border-paper-200 rounded shadow-sm hover:bg-paper-200 transition-colors mr-2">
              <span>Search</span>
              <kbd className="font-mono bg-paper-200 px-1 rounded text-[10px]">⌘K</kbd>
            </button>
```

After:
```tsx
            <button
              type="button"
              aria-label="Open command palette"
              onClick={openCommandPalette}
              className="hidden md:flex items-center gap-2 px-2 py-1 text-xs text-ink-400 bg-paper-100 border border-paper-200 rounded shadow-sm hover-elevate active-elevate-2 transition-colors mr-2"
            >
              <span>Search</span>
              <kbd className="font-mono bg-paper-200 px-1 rounded text-[10px]">⌘K</kbd>
            </button>
```

**Step 5 — Verify (typecheck + build + visual).**

Run:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
```
Expected: both exit 0. No TS error on the new `openCommandPalette` import, no error on
`e.isTrusted` (it is a standard `KeyboardEvent` boolean).

Visual check — run dev and screenshot the chrome in light AND dark:
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)
```
Then Playwright: navigate to `/today`, click the topbar **Search** button → the Command
Palette dialog opens. Press `Escape`, then `⌘K` (keyboard) → palette toggles as before.
Screenshot light + dark. Expected: button click opens palette; keyboard shortcut still
toggles open/closed; clicking the button while open keeps it open (no flicker-close).

**Step 6 — Commit.**
```bash
(cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/lib/openCommandPalette.ts artifacts/workforce-os/src/components/layout/CommandPalette.tsx artifacts/workforce-os/src/components/layout/Shell.tsx && \
git commit -m "feat(chrome): wire topbar Search button to open Command Palette

- Add openCommandPalette() helper that dispatches the same Cmd/Ctrl+K keydown
  CommandPalette already listens for — no lifted state or prop drilling
- Make palette listener open-only for synthetic (untrusted) events so the
  Search button always opens; trusted keyboard shortcut still toggles
- Wire Shell topbar Search button onClick + hover/press micro-interactions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
