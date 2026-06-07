## HYGIENE, A11Y & VERIFICATION

This is the final section of the plan. It assumes every prior section (palette/tokens,
elevate system, warm shadows, motion library, state primitives, brand/identity, sanitize)
has already landed. Its job is to remove dead code, collapse duplication, prove every token
resolves, close the a11y gaps in the bespoke SVGs and clickable `<div>`/icon rows, verify
reduced-motion, and run the full typecheck + build + before/after screenshot sweep against
the spec's Definition of Done (§8).

**Source root for all paths below:** `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src`
(referred to as `<SRC>`). Run all `pnpm` commands from the monorepo root
`/Users/nikhil/Downloads/Workforce-OS`.

---

### Task H1: Delete dead component TimelineTree.tsx

`<SRC>/components/v2/TimelineTree.tsx` is never imported anywhere. The live evidence-timeline
UI is `<SRC>/components/v2/EvidenceTimeline.tsx` (confirmed in use across pages). Deleting
TimelineTree removes ~93 lines of dead surface that otherwise drags along an unused
`TimelineNode` type import and a stale `colorMap`/`iconMap`.

**Files:**
- Delete: `<SRC>/components/v2/TimelineTree.tsx`

**Steps:**

1. Confirm zero imports with grep. Run exactly:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rn "TimelineTree" src/
   ```
   Expected output is ONLY the self-declaration line (no import sites):
   ```
   src/components/v2/TimelineTree.tsx:30:export function TimelineTree({ nodes }: { nodes: TimelineNode[] }) {
   ```
   If any line other than that one self-reference appears (e.g. an `import { TimelineTree }`),
   STOP — the component is live; do not delete it, and flag this in your handoff instead.

2. Delete the file:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     git rm src/components/v2/TimelineTree.tsx
   ```

3. Verify nothing else referenced it (the grep should now return nothing at all):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rn "TimelineTree" src/ || echo "CLEAN: no TimelineTree references"
   ```
   Expected: `CLEAN: no TimelineTree references`.

4. Typecheck to prove the removal broke nothing:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit code 0, no errors. (If `TimelineNode` was ONLY imported by this file, the
   unused-export warning, if any, is benign — the type still lives in `@workspace/api-client-react`.)

5. Commit:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "chore: delete dead TimelineTree component (zero imports)

EvidenceTimeline is the live timeline UI; TimelineTree was never imported.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H2: Make SentimentBadge the single source of truth

`<SRC>/components/v2/SentimentBadge.tsx` exports a `<SentimentBadge>` with a canonical
sentiment→color map, but it is **never imported** — `ConversationThread.tsx` duplicates the
exact same `sentimentColors` map inline (preview mode, lines 35–40) and re-implements the
badge by hand (lines 71–73). We keep `SentimentBadge` as the single source of truth and
delete the inline duplication. One important nuance: `SentimentBadge`'s prop type is
`"positive" | "objection" | "neutral" | "negative"`, but the inline call site renders the
raw API value `conversation.replyIntelligence.sentiment` (type `ReplyIntelligenceSentiment`).
We type the badge prop to `ReplyIntelligenceSentiment` so the two stay aligned and add a
typed fallback so an unknown enum value renders as `neutral` instead of an unstyled badge.

**Files:**
- Modify: `<SRC>/components/v2/SentimentBadge.tsx` (full rewrite, 21 lines)
- Modify: `<SRC>/components/v2/ConversationThread.tsx` (lines 1–9 imports; 34–40 delete inline map; 70–79 use component)

**Steps:**

1. Confirm the duplication and zero imports before editing:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rn "SentimentBadge" src/ ; \
     grep -rn "sentimentColors" src/
   ```
   Expected: `SentimentBadge` appears only as its own declaration; `sentimentColors` appears
   only inside `src/components/v2/ConversationThread.tsx`. This proves H2 is a safe consolidation.

2. Rewrite `<SRC>/components/v2/SentimentBadge.tsx` so its prop matches the API enum and it
   degrades gracefully. Replace the **entire file** with:
   ```tsx
   import React from "react";
   import { ReplyIntelligenceSentiment } from "@workspace/api-client-react";
   import { Badge } from "@/components/ui/badge";
   import { cn } from "@/lib/utils";

   const sentimentColors: Record<ReplyIntelligenceSentiment, string> = {
     positive: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
     objection: "bg-ember-400/10 text-ember-400 border-ember-400/20",
     neutral: "bg-paper-200 text-ink-700 border-paper-200",
     negative: "bg-rust-500/10 text-rust-500 border-rust-500/20",
   };

   interface SentimentBadgeProps {
     sentiment: ReplyIntelligenceSentiment;
     /** Compact preview variant used in the conversation list row. */
     dense?: boolean;
     className?: string;
   }

   export function SentimentBadge({ sentiment, dense, className }: SentimentBadgeProps) {
     const colors = sentimentColors[sentiment] ?? sentimentColors.neutral;
     return (
       <Badge
         variant="outline"
         className={cn(
           "capitalize font-medium",
           dense && "text-[10px] px-1.5 py-0 h-4",
           colors,
           className,
         )}
       >
         {sentiment}
       </Badge>
     );
   }
   ```
   > NOTE: if `ReplyIntelligenceSentiment` is a string union that does NOT include
   > `"objection"`, drop that key from the `Record` literal so typecheck passes — the
   > runtime `?? sentimentColors.neutral` fallback still covers any stray value. Verify the
   > exact union before editing:
   > ```bash
   > cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
   >   grep -rn "ReplyIntelligenceSentiment" packages*/ node_modules/@workspace/api-client-react/ 2>/dev/null | head
   > ```

3. In `<SRC>/components/v2/ConversationThread.tsx`, add the import. Change the import block
   (line 6 imports `Badge` — keep it; full-mode still uses `Badge` for the "Needs Reply" and
   action chips). After the existing `Sparkles, Bot, AlertTriangle` lucide import line, add:
   ```tsx
   import { SentimentBadge } from "@/components/v2/SentimentBadge";
   ```

4. In the same file, delete the inline `sentimentColors` map. Remove these lines entirely
   (currently lines 35–40 inside the `mode === "preview"` branch):
   ```tsx
       const sentimentColors = {
         positive: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
         objection: "bg-ember-400/10 text-ember-400 border-ember-400/20",
         neutral: "bg-paper-200 text-ink-700 border-paper-200",
         negative: "bg-rust-500/10 text-rust-500 border-rust-500/20",
       };
   ```

5. In the same file, replace the hand-rolled preview badge (currently lines 70–79) with the
   component. Replace:
   ```tsx
             <div className="flex items-center gap-2">
               <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 font-medium", sentimentColors[conversation.replyIntelligence.sentiment])}>
                 {conversation.replyIntelligence.sentiment}
               </Badge>
               {conversation.needsReply && (
   ```
   with:
   ```tsx
             <div className="flex items-center gap-2">
               <SentimentBadge sentiment={conversation.replyIntelligence.sentiment} dense />
               {conversation.needsReply && (
   ```
   Leave the `Needs Reply` badge below it unchanged.

6. Verify no `sentimentColors` references remain and the import landed:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rn "sentimentColors" src/ && echo "FAIL: inline map still present" || echo "CLEAN: inline map removed" ; \
     grep -rn "SentimentBadge" src/components/v2/ConversationThread.tsx
   ```
   Expected: `CLEAN: inline map removed`, and `ConversationThread.tsx` now shows both the
   import line and the `<SentimentBadge ... dense />` usage.

7. Typecheck:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0, no errors.

8. Commit:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "refactor: SentimentBadge is single source of truth for sentiment colors

Delete the duplicated inline sentiment color map in ConversationThread
preview mode and render <SentimentBadge dense> instead. Type the badge
prop to ReplyIntelligenceSentiment with a neutral fallback.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H3: Post-palette token audit — no undefined token refs

After the palette/token section landed, every `*-ink-N`, `*-paper-N`, `*-rust-N`,
`*-ember-N`, and `*-signal-*` utility must resolve to a real `@theme inline` token in
`<SRC>/index.css`. This task is a sweep for **stragglers**: classes that reference a ramp
step that was never added (the contract calls out `ink-0` specifically — "ink-0 = pure white
surface accent"). The grep also catches typos like `ember-600` (only `ember-300/400/500`
exist) or `ink-200` (only `ink-0/300/400/500/600/700/800/900` exist).

> IMPORTANT — false positive: a naive `grep ink-0` matches the Tailwind utility `shrink-0`
> and `flex-shrink-0` everywhere. Use the boundary-anchored grep below so only genuine
> `*-ink-0` color utilities match.

**Files:**
- Modify (only if stragglers found): the offending page/component file(s), and/or
  `<SRC>/index.css` to add a missing ramp step.

**Steps:**

1. List every color token actually defined in the theme (the allowed set):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -oE -- "--color-(ink|paper|rust|ember|signal)[a-z0-9-]*" src/index.css | sort -u
   ```
   Keep this list as the source of truth.

2. Genuine `ink-0` usage audit (boundary-anchored so `shrink-0` cannot match — note the
   leading delimiter class `[ "'`(:>-]` is required before `ink-0`, and `shrink`/`flex-shrink`
   are excluded because their preceding char is `r`/`-shr`):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rnE "(bg|text|border|stroke|ring|from|via|to|fill)-ink-0([ \"'\`)]|$)" src/ \
       || echo "NO genuine *-ink-0 utility usages"
   ```
   - If this returns `NO genuine *-ink-0 utility usages`, then `--color-ink-0` is defined for
     contract completeness but unused — that is acceptable, no action.
   - If it returns hits, each is a real consumer; confirm `--color-ink-0` is in step 1's list.
     If the token is present, the class resolves — done. If absent, add it (step 4).

3. Full straggler sweep — every ramp utility, cross-checked against step 1's allowed set.
   Run this to enumerate every step used, then eyeball for any not in the defined list:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rhoE -- "(bg|text|border|stroke|ring|from|via|to|fill|ring-offset)-(ink|paper|rust|ember)-[0-9]+" src/ \
       | sort -u
   ```
   For each printed `<prefix>-<ramp>-<step>`, confirm `--color-<ramp>-<step>` appears in
   step 1's output. Known real consumers to verify resolve (from the current tree):
   - `bg-ember-500` in `src/pages/Settings.tsx:126` → requires `--color-ember-500`.
     The contract only guarantees `--color-ember-300/400/500`, so `ember-500` IS defined — OK.
   - `text-ink-300`, `text-ink-600`, `hover:text-ink-700` across Settings/ArtifactDetail →
     require `--color-ink-300/600/700` — all in the contract's ink ramp.
   Also sweep `signal`:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     grep -rhoE -- "(bg|text|border|stroke|ring|fill)-signal-(positive|info|critical)" src/ | sort -u
   ```
   Each must map to `--color-signal-positive|info|critical` (all three in the contract).

4. Fix any straggler. There are two legitimate fix shapes:
   - **Missing ramp step that SHOULD exist** → add it to `<SRC>/index.css`. Add the raw HSL
     to BOTH `:root` and `.dark` with a perceptually-even value anchored to the hue (ink ~20°,
     paper ~40–42°, rust ~15°, ember ~28°), then expose it in `@theme inline`. Example for a
     hypothetical missing `--color-ink-200`:
     ```css
     /* in :root */
     --ink-200: hsl(20 8% 82%);
     /* in .dark */
     --ink-200: hsl(20 6% 30%);
     /* in @theme inline */
     --color-ink-200: var(--ink-200);
     ```
   - **Typo / wrong step in a consumer** (e.g. a stray `ember-600` where `ember-500` was
     intended) → fix the class string in the offending file to the nearest defined step.
     Prefer this when the design clearly meant an existing token.

5. Re-run the sweep from steps 2–3 and confirm every printed step now has a matching
   `--color-*` in step 1's list. There must be zero unresolved refs.

6. Build to prove Tailwind v4 emits no "unknown utility" warnings for these classes:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build) 2>&1 | tee /tmp/h3-build.log ; \
     grep -i "could not\|unknown\|cannot resolve\|no such" /tmp/h3-build.log && echo "FAIL: unresolved token" || echo "CLEAN: no unresolved-token warnings"
   ```
   Expected: build exits 0 and `CLEAN: no unresolved-token warnings`.

7. Commit (only if a fix was applied; if the audit was clean, note "no stragglers — audit
   only" in your handoff and skip the commit):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "fix: resolve straggler color-token refs after palette migration

Audit confirms every *-ink/paper/rust/ember/signal utility maps to a
defined --color-* token in index.css.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H4: A11y pass — label bespoke SVGs, clickable divs, and focus rings

Three a11y gaps remain after the visual work:
1. **Bespoke SVGs** (`ScoreRing`, `SparklineChart`) render as unlabeled graphics — a screen
   reader announces nothing or "image".
2. **Clickable `<div>` / icon rows** — the conversation preview row in
   `ConversationThread.tsx` is a `<div onClick>` with no `role`, `tabIndex`, or keyboard
   handler, so it is invisible to keyboard and AT users. Same shape recurs in the agent
   activity stream rows.
3. **Raw `<input>` / `<button>`** in `Settings.tsx` and `ApprovalCard.tsx` bypass the
   design-system focus ring (`focus-visible:ring-1 focus-visible:ring-ring`), so keyboard
   focus is invisible on them.

This task does representative edits for each category; apply the same pattern to siblings.

**Files:**
- Modify: `<SRC>/components/v2/ScoreRing.tsx` (svg element, lines 22–43)
- Modify: `<SRC>/components/v2/SparklineChart.tsx` (svg element, lines 9–31)
- Modify: `<SRC>/components/v2/ConversationThread.tsx` (preview clickable div, lines 43–49)
- Modify: `<SRC>/pages/Settings.tsx` (raw `<input>` line 866; representative)
- Modify: `<SRC>/components/v2/ApprovalCard.tsx` (raw `<input>` line 170; representative)

**Steps:**

1. `ScoreRing` — give the SVG an `img` role and a dynamic label. In
   `<SRC>/components/v2/ScoreRing.tsx`, replace the opening `<svg>` tag (line 23):
   ```tsx
       <svg className="transform -rotate-90" width={size} height={size}>
   ```
   with:
   ```tsx
       <svg
         className="transform -rotate-90"
         width={size}
         height={size}
         role="img"
         aria-label={`Lead score ${score} out of 100`}
       >
   ```
   The centered numeric `<span>` (line 44) is decorative for AT once the svg is labeled; mark
   it `aria-hidden` to avoid a double-read. Replace:
   ```tsx
         <span className="absolute font-tabular text-sm font-bold text-ink-900">
   ```
   with:
   ```tsx
         <span aria-hidden="true" className="absolute font-tabular text-sm font-bold text-ink-900">
   ```

2. `SparklineChart` — purely decorative trend graphic; the surrounding metric already carries
   the number, so the chart should be hidden from AT (announcing 7 unlabeled bars is noise).
   In `<SRC>/components/v2/SparklineChart.tsx`, replace the opening `<svg>` (line 14):
   ```tsx
     return (
       <svg width={width} height={height} className="overflow-visible">
   ```
   with:
   ```tsx
     return (
       <svg
         width={width}
         height={height}
         className="overflow-visible"
         role="img"
         aria-label={`Trend sparkline, latest value ${data[data.length - 1] ?? 0}`}
       >
   ```
   (If the parent already provides an accessible label for the metric, prefer
   `aria-hidden="true"` instead of `role="img"` — choose per call site; default to the labeled
   `role="img"` shown here so the component is self-describing.)

3. Clickable `<div>` in `ConversationThread.tsx` preview — make it a real button-like target.
   Replace the opening clickable div (lines 43–49):
   ```tsx
         <div
           className={cn(
             "p-4 border-b border-paper-200 cursor-pointer hover:bg-paper-100 transition-colors flex gap-3 relative",
             selected && "bg-paper-100"
           )}
           onClick={() => onSelect?.(conversation.id)}
         >
   ```
   with:
   ```tsx
         <div
           role="button"
           tabIndex={0}
           aria-pressed={selected}
           aria-label={`Open conversation with ${conversation.leadName}: ${conversation.subject}`}
           className={cn(
             "p-4 border-b border-paper-200 cursor-pointer hover:bg-paper-100 transition-colors flex gap-3 relative",
             "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
             selected && "bg-paper-100"
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

4. Raw `<input>` in `Settings.tsx` (line 866, representative) — add the DS focus ring. Read
   the element first to capture its exact existing `className`, then append the focus-ring
   utilities to it (do NOT remove existing classes). The utilities to ensure are present:
   ```
   focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
   ```
   For example, if the input currently reads:
   ```tsx
           <input
             className="... existing classes ..."
   ```
   change the className to:
   ```tsx
           <input
             className="... existing classes ... focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
   ```
   Prefer swapping any bespoke raw `<input>` for the design-system `<Input>` from
   `@/components/ui/input` where the markup allows — it carries the ring for free. Apply the
   same focus-ring append to the raw `<input>` in `ApprovalCard.tsx:170`.

5. Raw `<button>` rows in `Settings.tsx` (e.g. lines 314–315, 338, 386, 682–689) — these
   icon-only buttons have no accessible name and no focus ring. For each, add an
   `aria-label` describing the action and the focus-ring utilities. Representative edit for
   the move-up control (line 314):
   ```tsx
             <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-ink-300 hover:text-ink-700 disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5" /></button>
   ```
   →
   ```tsx
             <button aria-label="Move stage up" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-ink-300 hover:text-ink-700 disabled:opacity-20 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><ChevronUp className="h-3.5 w-3.5" /></button>
   ```
   Apply the same `aria-label` + focus-ring pattern to the sibling icon buttons (move down,
   remove stage, remove member, reveal/copy/dismiss key).

6. Run an automated a11y smoke with Playwright + axe after the dev server is up (full
   server-start commands are in Task H6 step 1). Once the server is running at
   `http://localhost:$PORT/today`:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     pnpm dlx @axe-core/cli "http://localhost:${PORT}/conversations" \
       --rules image-alt,button-name,label,aria-roles,color-contrast --exit
   ```
   Expected: zero `image-alt`, `button-name`, and `label` violations on the conversations
   route (the page exercises ScoreRing, the clickable preview rows, and sentiment badges).
   `color-contrast` is informational; record any findings but do not block on borderline AA
   ratios for decorative chips.

7. Typecheck (the new handlers/attrs must compile under strict mode, no `any`):
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0.

8. Commit:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "a11y: label bespoke SVGs, make clickable rows keyboard-operable, add DS focus rings

- ScoreRing/SparklineChart get role=img + aria-label (decorative span aria-hidden)
- Conversation preview row becomes role=button + tabIndex + Enter/Space handler
- Raw inputs/icon-buttons in Settings/ApprovalCard get focus-visible ring + aria-label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H5: Reduced-motion verification

The motion library (`<SRC>/lib/motion.ts`) gates every animation through
`useReducedMotionSafe()`. This task does not write feature code — it **proves** the gate
actually collapses motion everywhere, and documents the manual + automated test procedure so
QA and the assembler can re-run it.

**Files:**
- No source changes expected. If a regression is found (a motion component that ignores the
  hook), fix that component to honor `useReducedMotionSafe()` and note it.

**Steps:**

1. Confirm every motion component routes through the hook (no raw framer `animate`/`initial`
   that skips it):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     echo "=== components using motion ===" && \
     grep -rln "framer-motion\|from \"@/lib/motion\"\|from \"@/components/motion" src/ && \
     echo "=== of those, which call useReducedMotionSafe ===" && \
     grep -rln "useReducedMotionSafe" src/
   ```
   Every file in the first list that drives an animation (PageTransition, Stagger, CountUp,
   and any consumer using `cardEnter`/`springHover`/`fadeSlideUp` with hardcoded values)
   must either appear in the second list OR consume a variant from `motion.ts` that itself is
   already reduced-motion-aware. Inspect any file in list 1 but not list 2 to confirm it only
   imports pre-gated variants; if it sets its own `transition`/`animate` props raw, that is a
   regression — fix it to branch on `useReducedMotionSafe()`.

2. Confirm `motion.ts` short-circuits when reduced motion is requested. Read
   `<SRC>/lib/motion.ts` and verify the helper returns the OS/user preference and that the
   exported variants (or the components consuming them) swap to zero-duration / no-transform
   when it is `true`. Spot-check `CountUp` specifically — with reduced motion it must render
   the final `value` immediately (no tween), not count from 0.

3. **Manual test procedure (document this verbatim in your handoff so QA can repeat it):**
   - macOS: System Settings → Accessibility → Display → enable "Reduce motion".
   - OR per-page via Chrome DevTools: Cmd-Shift-P → "Show Rendering" → set
     **Emulate CSS media feature `prefers-reduced-motion`** to `reduce`.
   - With the dev server running (Task H6 step 1), reload `/today` and `/pipeline`.
     Expected with reduce ON:
     * `<PageTransition>` route changes are instant (no fade/slide).
     * `<Stagger>`/`<StaggerItem>` lists appear at once (no cascade).
     * `<CountUp>` metrics show their final number immediately (no roll-up).
     * `springHover` cards do not scale/lift on hover.
   - Toggle reduce OFF and reload: animations return. The visual diff between the two states
     is the proof the gate is wired.

4. **Automated assertion** (deterministic, no human toggle) — emulate the media feature in
   Playwright and assert a CountUp metric equals its final value on first paint:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     pnpm exec playwright screenshot \
       --reduced-motion=reduce \
       "http://localhost:${PORT}/today" \
       /tmp/h5-reduced-motion-today.png
   ```
   Compare `/tmp/h5-reduced-motion-today.png` against a normal-motion capture of `/today`:
   the reduced-motion frame must already show final metric numbers and fully-rendered lists
   (a normal capture taken mid-animation would show partial/0 values). If the reduced-motion
   shot still shows an in-progress animation, the gate is leaking — fix the offending
   component.

5. Commit (only if a regression was fixed; otherwise record "reduced-motion verified, no
   regressions" in handoff and skip):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
     git commit -m "fix: honor useReducedMotionSafe in <component>

Reduced-motion audit found <component> animating regardless of preference;
now collapses to zero-duration when prefers-reduced-motion is reduce.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task H6: Final verification — typecheck + build green, full before/after screenshot sweep, DoD checklist

This is the gate for the whole plan. It runs the full typecheck and build, captures "after"
Playwright screenshots of **all 12 routes** in **both light and dark**, and produces a
before/after checklist mapped to the spec's Definition of Done (§8).

**The 12 routes** (from `<SRC>/App.tsx`; `/` redirects to `/today`):

| # | Path | Page component | Needs a seeded `:id`? |
|---|------|----------------|------------------------|
| 1 | `/today` | Today | no |
| 2 | `/pipeline` | Pipeline | no |
| 3 | `/pipeline/:id` | LeadDetail | yes |
| 4 | `/outbound` | Outbound | no |
| 5 | `/outbound/:id` | ArtifactDetail | yes |
| 6 | `/conversations` | Conversations | no |
| 7 | `/conversations/:id` | ConversationThread | yes |
| 8 | `/runs` | Runs | no |
| 9 | `/runs/:id` | RunDetail | yes |
| 10 | `/agents` | Agents | no |
| 11 | `/settings` | Settings | no |
| 12 | `/__not-found__` (any unmatched path, e.g. `/zzz`) | NotFound | no |

> For the 4 detail routes, pick a real id from the seeded fixtures: navigate to the parent
> list route first, read the first card's href via Playwright, and reuse that id. Do NOT
> hardcode an id — it may not exist in the seed.

**Files:**
- Create: `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/` (screenshot output dir; ~24 PNGs)
- No source changes (verification only).

**Steps:**

1. **Start the dev server.** It requires `PORT` and `BASE_PATH` env vars (vite.config.ts
   throws without them). Run in the background:
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS && \
     PORT=5173 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev
   ```
   Wait until vite prints `Local: http://localhost:5173/`. Set `export PORT=5173` in the
   screenshot shell so the H4/H5 commands above resolve `${PORT}`.

2. **Typecheck — must be green:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```
   Expected: exit 0, zero errors. (Strict mode, no `any` — per CLAUDE.md rules.)

3. **Build — must be green:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)
   ```
   Expected: exit 0. Note: root `build` = `typecheck && pnpm -r build`, so this also re-runs
   typecheck across the workspace.

4. **Create the after/ directory:**
   ```bash
   mkdir -p /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after
   ```

5. **Resolve the 4 detail ids** (do this via the Playwright MCP browser, not a hardcoded
   list). For each of `/pipeline`, `/outbound`, `/conversations`, `/runs`: navigate, snapshot,
   read the first list item's link, and record its `:id`. Build a route list of 12 concrete
   URLs (e.g. `/pipeline/lead_abc`, `/outbound/art_def`, ...).

6. **Capture all 24 screenshots** (12 routes × light + dark). Theme is toggled by the `.dark`
   class on `<html>` (Tailwind v4 dark variant). Drive the Playwright MCP browser:
   for each route URL:
   - `browser_navigate` to `http://localhost:5173{route}`
   - `browser_resize` to `1440 × 900` (desktop) for a consistent frame
   - **Light:** ensure `<html>` has NO `.dark` class via
     `browser_evaluate`: `() => document.documentElement.classList.remove('dark')`,
     then `browser_take_screenshot` →
     `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/<NN>-<name>-light.png`
   - **Dark:** `browser_evaluate`: `() => document.documentElement.classList.add('dark')`,
     then `browser_take_screenshot` →
     `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/<NN>-<name>-dark.png`

   Use the route table's `#` and component name for `<NN>-<name>`, e.g.
   `01-today-light.png`, `01-today-dark.png`, … `12-notfound-dark.png`. End state: 24 PNGs.

   If the app exposes a theme toggle in the Shell header instead of relying on a manual class
   write, click it via `browser_click` rather than `browser_evaluate` — but the class write
   above is the robust fallback that does not depend on finding the toggle.

7. **Verify the capture is complete:**
   ```bash
   ls -1 /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/*.png | wc -l
   ```
   Expected: `24`. Then confirm both themes exist for every route:
   ```bash
   ls -1 /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/ | \
     grep -c "light\.png$" ; \
   ls -1 /Users/nikhil/Downloads/Workforce-OS/docs/superpowers/after/ | \
     grep -c "dark\.png$"
   ```
   Expected: `12` and `12`.

8. **Produce the before/after Definition-of-Done checklist.** Compare each `after/` shot to
   the corresponding `before/` baseline captured in Task F0 (same `<NN>-<name>-<theme>.png`
   naming under `/Users/nikhil/Downloads/Workforce-OS/docs/superpowers/before/`). Fill in this checklist
   (DoD items from spec §8) and include it verbatim in your handoff:

   ```markdown
   ## Definition of Done (spec §8) — before/after

   | DoD item (§8) | Before | After | Evidence (screenshot / command) |
   |---|---|---|---|
   | Warm paper/ink/rust/ember palette applied across all routes | ☐ | ☐ | after/*-light.png vs before/*-light.png |
   | Dark mode renders correctly on all 12 routes | ☐ | ☐ | after/*-dark.png (12 files) |
   | Elevate hover/active overlays on buttons & badges | ☐ | ☐ | after/02-pipeline-light.png (cards) |
   | Warm ink-tinted shadow scale (no gray box-shadows) | ☐ | ☐ | after/01-today-light.png |
   | Motion (fade/slide/stagger/countup) on entry | ☐ | ☐ | manual + H5 reduced-motion proof |
   | prefers-reduced-motion collapses all motion | ☐ | ☐ | /tmp/h5-reduced-motion-today.png |
   | Empty/Error/ErrorBoundary states wired | ☐ | ☐ | after/08-runs-* (empty), after error route |
   | Brand = "Nikxius" (no "Mynoted"/"Nikhil Sood") | ☐ | ☐ | grep clean (step 9) |
   | All dangerouslySetInnerHTML go through sanitizeHtml | ☐ | ☐ | grep clean (step 9) |
   | A11y: SVGs labeled, clickable rows keyboard-operable, DS focus rings | ☐ | ☐ | H4 axe report (0 image-alt/button-name/label) |
   | No dead components (TimelineTree removed) | ☐ | ☐ | H1 grep CLEAN |
   | Single source of truth for sentiment colors (SentimentBadge) | ☐ | ☐ | H2 grep CLEAN |
   | Every color utility resolves to a defined --color-* token | ☐ | ☐ | H3 build CLEAN |
   | typecheck green | ☐ | ☐ | step 2 exit 0 |
   | build green | ☐ | ☐ | step 3 exit 0 |
   ```
   Mark each "After" box checked only when its evidence confirms it. Any unchecked "After"
   box is a blocker the assembler must resolve before merge.

9. **Final regression greps** (these back several DoD rows):
   ```bash
   cd /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os && \
     echo "=== brand leftovers (must be empty) ===" && \
     grep -rn "Mynoted\|Nikhil Sood" src/ && echo "FAIL: brand leftover" || echo "CLEAN: no old brand" ; \
     echo "=== unsanitized dangerouslySetInnerHTML (each __html must be sanitizeHtml(...)) ===" && \
     grep -rn "dangerouslySetInnerHTML" src/
   ```
   For the second grep, every hit at the 4 content call sites (ApprovalCard.tsx,
   v2/ConversationThread.tsx, pages/ArtifactDetail.tsx, pages/ConversationThread.tsx) must
   read `__html: sanitizeHtml(...)`. The `chart.tsx` hit is a shadcn-internal style injection
   of a static CSS string (not user content) — leave it. If any content site is NOT wrapped,
   that is a blocker owned by the sanitize section; flag it.

10. Commit the after/ screenshots and checklist artifact:
    ```bash
    cd /Users/nikhil/Downloads/Workforce-OS && git add -A && \
      git commit -m "test: capture after/ screenshots for all 12 routes (light+dark) + DoD checklist

Full typecheck + build green. 24 before/after frames captured; every
spec §8 Definition-of-Done item verified.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
    ```

11. **Stop the dev server** (kill the background process from step 1) once captures are done.

---

#### Section notes for the assembler

- **Ordering:** H1→H2→H3 are independent cleanups and can run in any order. H4 and H5 should
  run before H6 (H6's axe + reduced-motion + DoD checklist depend on their fixes landing).
  H6 is always last — it is the whole-plan gate.
- **Dev server env:** vite **throws** without `PORT` and `BASE_PATH`. Always launch with
  `PORT=5173 BASE_PATH=/`. Every `${PORT}` in H4/H5/H6 assumes `5173`.
- **Token additions are NOT in scope here** — H3 only audits and fixes stragglers. The
  authoritative ramp is owned by the palette section; if a whole ramp is missing, that is a
  prior-section bug, not an H3 fix.
- **`ReplyIntelligenceSentiment` union:** H2 assumes it includes `objection`. Verify before
  editing (H2 step 2 note); drop the key from the `Record` literal if the enum differs — the
  runtime fallback still covers it.
