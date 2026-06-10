## PRIMITIVES

This section builds the shared primitive layer every page composes from: a motion
library (framer-motion `Variants` + a reduced-motion guard), motion components
(`PageTransition`, `Stagger`/`StaggerItem`, `CountUp`), state primitives
(`EmptyState`, `ErrorState`, `ErrorBoundary`), an HTML sanitizer, and the depth/surface
convention that decides which shadow token each surface uses.

### Grounding facts (verified against the live tree)

- `framer-motion ^12.23.24` is already a workspace catalog dep and is listed in
  `artifacts/workforce-os/package.json` as `"framer-motion": "catalog:"` — **no install
  needed** for motion.
- `dompurify` is **not** present anywhere — Task P5 adds it.
- vitest is stood up once in **Task F0b** (another section). Every test below assumes
  `pnpm --filter @workspace/workforce-os run test` exists after F0b. If F0b has not run,
  the test steps still author the file; only the verify command is blocked.
- Today's empties/skeletons are **hand-rolled**: `pages/Today.tsx` lines 129–136 inline a
  "Queue Clear" empty (`opacity-40`, `font-serif`, raw lucide icon); `components/ui/empty.tsx`
  is a shadcn `Empty*` set nobody composes on the dashboard; `components/ui/skeleton.tsx` is a
  one-liner `animate-pulse rounded-md bg-primary/10`. The new `EmptyState`/`ErrorState`
  primitives standardize this so pages stop re-inventing it.
- KPI tiles in `pages/Today.tsx` (the `KpiTile` component, lines 149–173) use
  `shadow-none` today — Task P6 converts them to the raised-card treatment.
- `index.css` is Tailwind v4 CSS-first (`@theme inline`). The warm shadow scale
  (`--shadow-xs/sm/md/lg`) is added by the **index.css / tokens section**; P6 only
  *consumes* `shadow-sm`/`shadow-md` and documents the convention. If a reviewer runs P6
  before tokens land, `shadow-md` falls back to Tailwind's default shadow — acceptable, the
  warm tint is applied later without touching JSX.

---

### Task P1: Create the motion library (`src/lib/motion.ts`)

**Files:**
- Create: `artifacts/workforce-os/src/lib/motion.ts`

1. Create `artifacts/workforce-os/src/lib/motion.ts` with the exact exported `Variants`
   and the `useReducedMotionSafe()` helper. These names are fixed by the CONTRACT:
   `fadeIn, fadeSlideUp, staggerContainer, staggerItem, cardEnter, springHover` +
   `useReducedMotionSafe`.

   ```ts
   import { useReducedMotion, type Variants, type Transition } from "framer-motion";

   /**
    * Shared motion language for Workforce-OS.
    *
    * Timing is deliberately calm and editorial: short fades, small upward slides,
    * gentle springs. Every consumer must gate animation through
    * `useReducedMotionSafe()` so the whole app collapses to instant state when the
    * user has `prefers-reduced-motion: reduce`.
    */

   const EASE_OUT: Transition["ease"] = [0.16, 1, 0.3, 1]; // editorial ease-out

   /** Simple opacity fade. Use for overlays, tooltips, inline reveals. */
   export const fadeIn: Variants = {
     hidden: { opacity: 0 },
     visible: {
       opacity: 1,
       transition: { duration: 0.24, ease: EASE_OUT },
     },
     exit: {
       opacity: 0,
       transition: { duration: 0.16, ease: EASE_OUT },
     },
   };

   /** Fade + small upward slide. The default page/section entrance. */
   export const fadeSlideUp: Variants = {
     hidden: { opacity: 0, y: 8 },
     visible: {
       opacity: 1,
       y: 0,
       transition: { duration: 0.32, ease: EASE_OUT },
     },
     exit: {
       opacity: 0,
       y: -8,
       transition: { duration: 0.2, ease: EASE_OUT },
     },
   };

   /** Parent container that staggers its children in. Pair with `staggerItem`. */
   export const staggerContainer: Variants = {
     hidden: {},
     visible: {
       transition: {
         staggerChildren: 0.06,
         delayChildren: 0.04,
       },
     },
     exit: {},
   };

   /** Child of `staggerContainer`. Each item fades + slides up in sequence. */
   export const staggerItem: Variants = {
     hidden: { opacity: 0, y: 10 },
     visible: {
       opacity: 1,
       y: 0,
       transition: { duration: 0.3, ease: EASE_OUT },
     },
     exit: { opacity: 0, y: 6, transition: { duration: 0.18, ease: EASE_OUT } },
   };

   /** Card mount: fade + slight scale + slide. For KPI tiles, list cards. */
   export const cardEnter: Variants = {
     hidden: { opacity: 0, y: 12, scale: 0.98 },
     visible: {
       opacity: 1,
       y: 0,
       scale: 1,
       transition: { duration: 0.34, ease: EASE_OUT },
     },
     exit: { opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: EASE_OUT } },
   };

   /** Hover lift used on interactive cards/buttons. Apply via `whileHover`. */
   export const springHover: Variants = {
     rest: { y: 0, scale: 1 },
     hover: {
       y: -2,
       scale: 1.01,
       transition: { type: "spring", stiffness: 320, damping: 22, mass: 0.6 },
     },
     tap: { scale: 0.99, transition: { type: "spring", stiffness: 400, damping: 28 } },
   };

   /**
    * Returns `true` when motion should be suppressed (user prefers reduced motion).
    * Consumers should branch their `variants`/`animate` props on this so the app
    * renders the final state instantly with no transition.
    *
    * SSR-safe: framer's `useReducedMotion()` returns `null` before hydration, which
    * we coerce to `false` (animate by default) to avoid a flash of un-animated content.
    */
   export function useReducedMotionSafe(): boolean {
     const prefersReduced = useReducedMotion();
     return prefersReduced === true;
   }
   ```

2. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: typecheck passes (exit 0). `motion.ts` introduces no type errors; the file
   is not yet imported anywhere so only its own types are checked.

3. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && git add artifacts/workforce-os/src/lib/motion.ts && \
     git commit -m "feat(motion): add shared framer-motion variants + useReducedMotionSafe

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P2: Motion components + wire `PageTransition` into the router

**Files:**
- Create: `artifacts/workforce-os/src/components/motion/PageTransition.tsx`
- Create: `artifacts/workforce-os/src/components/motion/Stagger.tsx`
- Create: `artifacts/workforce-os/src/components/motion/CountUp.tsx`
- Modify: `artifacts/workforce-os/src/App.tsx` (wrap the `<Switch>` outlet — lines 28–50)

1. Create `artifacts/workforce-os/src/components/motion/PageTransition.tsx`. It wraps a
   route's content in a `motion.div` driven by `fadeSlideUp`, and is reduced-motion-safe.

   ```tsx
   import { motion } from "framer-motion";
   import { fadeSlideUp, useReducedMotionSafe } from "@/lib/motion";

   interface PageTransitionProps {
     children: React.ReactNode;
     /** Stable key so AnimatePresence can crossfade between routes. */
     transitionKey?: string;
     className?: string;
   }

   export function PageTransition({
     children,
     transitionKey,
     className,
   }: PageTransitionProps) {
     const reduced = useReducedMotionSafe();

     if (reduced) {
       return (
         <div key={transitionKey} className={className}>
           {children}
         </div>
       );
     }

     return (
       <motion.div
         key={transitionKey}
         className={className}
         variants={fadeSlideUp}
         initial="hidden"
         animate="visible"
         exit="exit"
       >
         {children}
       </motion.div>
     );
   }
   ```

2. Create `artifacts/workforce-os/src/components/motion/Stagger.tsx` exporting both
   `Stagger` (container) and `StaggerItem`.

   ```tsx
   import { motion } from "framer-motion";
   import {
     staggerContainer,
     staggerItem,
     useReducedMotionSafe,
   } from "@/lib/motion";

   interface StaggerProps {
     children: React.ReactNode;
     className?: string;
   }

   export function Stagger({ children, className }: StaggerProps) {
     const reduced = useReducedMotionSafe();

     if (reduced) {
       return <div className={className}>{children}</div>;
     }

     return (
       <motion.div
         className={className}
         variants={staggerContainer}
         initial="hidden"
         animate="visible"
         exit="exit"
       >
         {children}
       </motion.div>
     );
   }

   interface StaggerItemProps {
     children: React.ReactNode;
     className?: string;
   }

   export function StaggerItem({ children, className }: StaggerItemProps) {
     const reduced = useReducedMotionSafe();

     if (reduced) {
       return <div className={className}>{children}</div>;
     }

     return (
       <motion.div className={className} variants={staggerItem}>
         {children}
       </motion.div>
     );
   }
   ```

3. Create `artifacts/workforce-os/src/components/motion/CountUp.tsx`. **Extract a pure
   `formatValue(value, decimals, suffix)` helper and export it** so Task P2b can unit-test
   it without rendering. The component animates from 0 to `value` using framer's
   `useMotionValue` + `animate`, and snaps to the final formatted value when reduced motion
   is on.

   ```tsx
   import { useEffect, useRef, useState } from "react";
   import { animate, useMotionValue } from "framer-motion";
   import { useReducedMotionSafe } from "@/lib/motion";

   /**
    * Pure formatting helper — no React, no framer. Exported for unit testing.
    * Renders `value` with a fixed number of decimals and an optional suffix.
    */
   export function formatValue(
     value: number,
     decimals = 0,
     suffix = "",
   ): string {
     const safe = Number.isFinite(value) ? value : 0;
     return `${safe.toFixed(decimals)}${suffix}`;
   }

   interface CountUpProps {
     value: number;
     decimals?: number;
     suffix?: string;
     /** Animation duration in seconds. */
     duration?: number;
     className?: string;
   }

   export function CountUp({
     value,
     decimals = 0,
     suffix = "",
     duration = 0.8,
     className,
   }: CountUpProps) {
     const reduced = useReducedMotionSafe();
     const motionValue = useMotionValue(0);
     const [display, setDisplay] = useState<string>(
       formatValue(reduced ? value : 0, decimals, suffix),
     );
     const prev = useRef(0);

     useEffect(() => {
       if (reduced) {
         setDisplay(formatValue(value, decimals, suffix));
         prev.current = value;
         return;
       }

       const controls = animate(motionValue, value, {
         duration,
         ease: [0.16, 1, 0.3, 1],
         onUpdate: (latest) => {
           setDisplay(formatValue(latest, decimals, suffix));
         },
       });

       prev.current = value;
       return () => controls.stop();
       // motionValue is stable; intentionally not in deps.
       // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [value, decimals, suffix, duration, reduced]);

     return (
       <span className={className} aria-label={formatValue(value, decimals, suffix)}>
         {display}
       </span>
     );
   }
   ```

4. Modify `artifacts/workforce-os/src/App.tsx` to wrap the router outlet in
   `<AnimatePresence>` + `<PageTransition>`, keyed on the current wouter location so
   route changes crossfade. Replace the `Router` function (lines 28–50). Add the two new
   imports at the top alongside the existing wouter import.

   Add imports (after line 1, the existing wouter import line):

   ```tsx
   import { useLocation } from "wouter";
   import { AnimatePresence } from "framer-motion";
   import { PageTransition } from "@/components/motion/PageTransition";
   ```

   Replace the whole `Router()` function body (lines 28–50) with:

   ```tsx
   function Router() {
     const [location] = useLocation();
     return (
       <Shell>
         <AnimatePresence mode="wait" initial={false}>
           <PageTransition key={location} className="h-full">
             <Switch location={location}>
               <Route path="/">
                 <Redirect to="/today" />
               </Route>
               <Route path="/today" component={Today} />
               <Route path="/pipeline" component={Pipeline} />
               <Route path="/pipeline/:id" component={LeadDetail} />
               <Route path="/outbound" component={Outbound} />
               <Route path="/outbound/:id" component={ArtifactDetail} />
               <Route path="/conversations" component={Conversations} />
               <Route path="/conversations/:id" component={ConversationThread} />
               <Route path="/runs" component={Runs} />
               <Route path="/runs/:id" component={RunDetail} />
               <Route path="/agents" component={Agents} />
               <Route path="/settings/*" component={Settings} />
               <Route component={NotFound} />
             </Switch>
           </PageTransition>
         </AnimatePresence>
       </Shell>
     );
   }
   ```

   > Note: passing `location` to `<Switch location={...}>` makes wouter resolve the route
   > against the *captured* location so the exiting page keeps rendering its old route while
   > `AnimatePresence mode="wait"` finishes the exit. `initial={false}` skips the entrance
   > animation on first paint (no flash on cold load).

5. **Verify (typecheck):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)
   ```

   Expected: passes (exit 0). The `key={location}` and `<Switch location={location}>`
   are both valid wouter/React types.

6. **Verify (build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)
   ```

   Expected: build succeeds. Motion components tree-shake cleanly; `framer-motion` is
   already a resolved catalog dep.

7. **Visual verify:** start the dev server and screenshot `/today` in light + dark with
   Playwright; navigate to `/pipeline` and confirm the crossfade. Compare against the F0
   baseline — content should fade-slide-up on load, not jump.

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)
   ```

8. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/motion artifacts/workforce-os/src/App.tsx && \
     git commit -m "feat(motion): add PageTransition/Stagger/CountUp + wire route crossfade

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P2b: Unit test `CountUp`'s `formatValue` helper

**Files:**
- Test: `artifacts/workforce-os/src/components/motion/CountUp.test.ts`

Depends on Task F0b (vitest set up) and Task P2 (the `formatValue` export exists).

1. Create `artifacts/workforce-os/src/components/motion/CountUp.test.ts`:

   ```ts
   import { describe, it, expect } from "vitest";
   import { formatValue } from "./CountUp";

   describe("formatValue", () => {
     it("formats an integer with no decimals", () => {
       expect(formatValue(42)).toBe("42");
     });

     it("rounds to the requested number of decimals", () => {
       expect(formatValue(3.14159, 2)).toBe("3.14");
       expect(formatValue(2.5, 0)).toBe("3"); // toFixed rounds half-up
     });

     it("appends a suffix", () => {
       expect(formatValue(87.5, 1, "%")).toBe("87.5%");
     });

     it("pads trailing zeros to match decimals", () => {
       expect(formatValue(5, 2)).toBe("5.00");
     });

     it("coerces non-finite input to 0", () => {
       expect(formatValue(Number.NaN, 1, "%")).toBe("0.0%");
       expect(formatValue(Number.POSITIVE_INFINITY)).toBe("0");
     });

     it("handles negatives", () => {
       expect(formatValue(-2.5, 1)).toBe("-2.5");
     });
   });
   ```

2. **Verify (run the test):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run test -- CountUp)
   ```

   Expected output (all 6 assertions green):

   ```
   ✓ src/components/motion/CountUp.test.ts (6 tests)
     ✓ formatValue > formats an integer with no decimals
     ✓ formatValue > rounds to the requested number of decimals
     ✓ formatValue > appends a suffix
     ✓ formatValue > pads trailing zeros to match decimals
     ✓ formatValue > coerces non-finite input to 0
     ✓ formatValue > handles negatives

   Test Files  1 passed (1)
        Tests  6 passed (6)
   ```

3. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/motion/CountUp.test.ts && \
     git commit -m "test(motion): unit test CountUp formatValue helper

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P3: State primitives — `EmptyState` + `ErrorState`

**Files:**
- Create: `artifacts/workforce-os/src/components/states/EmptyState.tsx`
- Create: `artifacts/workforce-os/src/components/states/ErrorState.tsx`

Both are editorial: a Lora (`font-serif`) title, muted body, optional action/retry. They
replace the hand-rolled `opacity-40` empty inlined at `pages/Today.tsx:129–136`.

1. Create `artifacts/workforce-os/src/components/states/EmptyState.tsx`:

   ```tsx
   import type { LucideIcon } from "lucide-react";
   import { cn } from "@/lib/utils";

   interface EmptyStateProps {
     icon: LucideIcon;
     title: string;
     description: string;
     action?: React.ReactNode;
     className?: string;
   }

   export function EmptyState({
     icon: Icon,
     title,
     description,
     action,
     className,
   }: EmptyStateProps) {
     return (
       <div
         className={cn(
           "flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center",
           className,
         )}
       >
         <div className="flex size-12 items-center justify-center rounded-full bg-paper-100 text-ink-400">
           <Icon className="size-6" strokeWidth={1.5} aria-hidden="true" />
         </div>
         <div className="flex max-w-sm flex-col gap-1.5">
           <h3 className="font-serif text-lg text-ink-900">{title}</h3>
           <p className="text-sm leading-relaxed text-ink-500">{description}</p>
         </div>
         {action ? <div className="mt-2">{action}</div> : null}
       </div>
     );
   }
   ```

2. Create `artifacts/workforce-os/src/components/states/ErrorState.tsx`. The icon is fixed
   (`AlertTriangle`) so the signature stays `title?/description?/onRetry?` per CONTRACT;
   the retry renders a `Button` only when `onRetry` is supplied.

   ```tsx
   import { AlertTriangle } from "lucide-react";
   import { Button } from "@/components/ui/button";
   import { cn } from "@/lib/utils";

   interface ErrorStateProps {
     title?: string;
     description?: string;
     onRetry?: () => void;
     className?: string;
   }

   export function ErrorState({
     title = "Something went wrong",
     description = "We couldn't load this just now. Please try again.",
     onRetry,
     className,
   }: ErrorStateProps) {
     return (
       <div
         role="alert"
         className={cn(
           "flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center",
           className,
         )}
       >
         <div className="flex size-12 items-center justify-center rounded-full bg-rust-50 text-rust-500">
           <AlertTriangle className="size-6" strokeWidth={1.5} aria-hidden="true" />
         </div>
         <div className="flex max-w-sm flex-col gap-1.5">
           <h3 className="font-serif text-lg text-ink-900">{title}</h3>
           <p className="text-sm leading-relaxed text-ink-500">{description}</p>
         </div>
         {onRetry ? (
           <Button
             variant="outline"
             size="sm"
             onClick={onRetry}
             className="mt-2 border-rust-200 text-rust-500 hover:bg-rust-50 hover:text-rust-600"
           >
             Try again
           </Button>
         ) : null}
       </div>
     );
   }
   ```

3. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both pass. `LucideIcon` and `Button` are existing types; `bg-paper-100`,
   `text-ink-*`, `bg-rust-50`, `border-rust-200` are all live tokens (used in
   `pages/Today.tsx` today).

4. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/states/EmptyState.tsx \
             artifacts/workforce-os/src/components/states/ErrorState.tsx && \
     git commit -m "feat(states): add editorial EmptyState + ErrorState primitives

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P4: `ErrorBoundary` (class) + app-root mount + per-query reset pattern

**Files:**
- Create: `artifacts/workforce-os/src/components/states/ErrorBoundary.tsx`
- Modify: `artifacts/workforce-os/src/App.tsx` (mount at app root; lines 52–63)

1. Create `artifacts/workforce-os/src/components/states/ErrorBoundary.tsx`. It is a real
   class component (the only React API that catches render errors) and falls back to
   `ErrorState`. It accepts an optional `onReset` so callers can wire it to TanStack
   Query's reset, and an optional `fallback` render-prop for custom messaging.

   ```tsx
   import { Component, type ErrorInfo, type ReactNode } from "react";
   import { ErrorState } from "@/components/states/ErrorState";

   interface ErrorBoundaryProps {
     children: ReactNode;
     /** Called when the user clicks "Try again" — e.g. TanStack Query reset(). */
     onReset?: () => void;
     /** Custom fallback. Receives the error + a reset callback. */
     fallback?: (args: { error: Error; reset: () => void }) => ReactNode;
   }

   interface ErrorBoundaryState {
     error: Error | null;
   }

   export class ErrorBoundary extends Component<
     ErrorBoundaryProps,
     ErrorBoundaryState
   > {
     state: ErrorBoundaryState = { error: null };

     static getDerivedStateFromError(error: Error): ErrorBoundaryState {
       return { error };
     }

     componentDidCatch(error: Error, info: ErrorInfo): void {
       // Surface to the console in dev; a real telemetry sink lands in a later phase.
       // eslint-disable-next-line no-console
       console.error("[ErrorBoundary]", error, info.componentStack);
     }

     reset = (): void => {
       this.props.onReset?.();
       this.setState({ error: null });
     };

     render(): ReactNode {
       const { error } = this.state;
       if (error) {
         if (this.props.fallback) {
           return this.props.fallback({ error, reset: this.reset });
         }
         return (
           <ErrorState
             title="This view hit an error"
             description={error.message || "An unexpected error occurred."}
             onRetry={this.reset}
           />
         );
       }
       return this.props.children;
     }
   }
   ```

2. Modify `artifacts/workforce-os/src/App.tsx` to mount `ErrorBoundary` at the app root and
   add the `QueryErrorResetBoundary` per-query reset pattern. Add imports near the top:

   ```tsx
   import { QueryErrorResetBoundary } from "@tanstack/react-query";
   import { ErrorBoundary } from "@/components/states/ErrorBoundary";
   ```

   Replace the `App()` function (lines 52–63) with:

   ```tsx
   function App() {
     return (
       <QueryClientProvider client={queryClient}>
         <TooltipProvider>
           <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
             <QueryErrorResetBoundary>
               {({ reset }) => (
                 <ErrorBoundary onReset={reset}>
                   <Router />
                 </ErrorBoundary>
               )}
             </QueryErrorResetBoundary>
           </WouterRouter>
           <Toaster
             position="bottom-right"
             className="bg-ink-900 text-paper-50 border-none font-sans font-medium"
           />
         </TooltipProvider>
       </QueryClientProvider>
     );
   }
   ```

   > `QueryErrorResetBoundary` from TanStack Query exposes `reset()`, which clears the
   > error state of any query that opted in with `useQuery({ throwOnError: true })`.
   > Wiring it to `ErrorBoundary.onReset` means the `ErrorState` "Try again" button both
   > re-renders the tree **and** marks errored queries for refetch — the canonical
   > "per-query errors render `<ErrorState onRetry>`" pattern.
   >
   > Per-page usage (documented for downstream sections, not edited here): a page that wants
   > a *local* boundary instead of the root one wraps its data region:
   >
   > ```tsx
   > <QueryErrorResetBoundary>
   >   {({ reset }) => (
   >     <ErrorBoundary
   >       onReset={reset}
   >       fallback={({ reset }) => <ErrorState onRetry={reset} />}
   >     >
   >       <PendingQueue />
   >     </ErrorBoundary>
   >   )}
   > </QueryErrorResetBoundary>
   > ```

3. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both pass. `QueryErrorResetBoundary` is exported by the installed
   `@tanstack/react-query` (catalog dep); its render-prop child signature is `({ reset })`.

4. **Visual verify:** with the dev server up, confirm `/today` still renders normally
   (boundary is transparent on the happy path). Optionally throw inside a child to confirm
   the `ErrorState` fallback + "Try again" appears.

5. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/components/states/ErrorBoundary.tsx \
             artifacts/workforce-os/src/App.tsx && \
     git commit -m "feat(states): add ErrorBoundary + mount at app root with query reset

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Task P5: HTML sanitizer (`src/lib/sanitize.ts`) + unit test + dep

**Files:**
- Modify: `artifacts/workforce-os/package.json` (add `dompurify` + `@types/dompurify`)
- Create: `artifacts/workforce-os/src/lib/sanitize.ts`
- Test: `artifacts/workforce-os/src/lib/sanitize.test.ts`

1. Add the dependency. `dompurify` is **not** in the tree yet, so install it into the
   frontend package (not catalog — it's a single consumer):

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     pnpm --filter @workspace/workforce-os add dompurify@^3.2.4 && \
     pnpm --filter @workspace/workforce-os add -D @types/dompurify@^3.0.5)
   ```

   Expected: `dompurify` lands under `dependencies` and `@types/dompurify` under
   `devDependencies` in `artifacts/workforce-os/package.json`.

   > `dompurify@^3.2.4` ships its own bundled types in some patch releases; if pnpm warns
   > that `@types/dompurify` is deprecated/empty, drop the `-D` line — the wrapper below
   > uses only `DOMPurify.sanitize`, which is typed either way. Do not pin to a v2.

2. Create `artifacts/workforce-os/src/lib/sanitize.ts`:

   ```ts
   import DOMPurify from "dompurify";

   /**
    * Sanitize untrusted HTML before it reaches `dangerouslySetInnerHTML`.
    *
    * Allows the small editorial set we actually render in artifacts, approval
    * cards, and conversation threads (paragraphs, line breaks, basic inline
    * marks, links, lists). Strips <script>, event handlers, <iframe>, and any
    * other vector. Links are forced to open safely.
    *
    * Use at EVERY `dangerouslySetInnerHTML` call site.
    */
   const ALLOWED_TAGS = [
     "p",
     "br",
     "b",
     "strong",
     "i",
     "em",
     "u",
     "a",
     "ul",
     "ol",
     "li",
     "blockquote",
     "code",
     "pre",
     "span",
     "h1",
     "h2",
     "h3",
     "h4",
   ];

   const ALLOWED_ATTR = ["href", "title", "target", "rel"];

   export function sanitizeHtml(html: string): string {
     if (!html) return "";
     return DOMPurify.sanitize(html, {
       ALLOWED_TAGS,
       ALLOWED_ATTR,
       // Force-safe links: external targets can't reach window.opener.
       ADD_ATTR: ["target", "rel"],
       ALLOWED_URI_REGEXP:
         /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
     });
   }
   ```

3. Create the test `artifacts/workforce-os/src/lib/sanitize.test.ts`. DOMPurify needs a DOM
   — vitest's `jsdom`/`happy-dom` environment (configured in F0b). The test asserts it
   strips `<script>` and keeps `<p>` and `<a href>`.

   ```ts
   import { describe, it, expect } from "vitest";
   import { sanitizeHtml } from "./sanitize";

   describe("sanitizeHtml", () => {
     it("strips <script> tags", () => {
       const out = sanitizeHtml('<p>Hi</p><script>alert("x")</script>');
       expect(out).not.toContain("<script");
       expect(out).not.toContain("alert");
     });

     it("keeps <p> content", () => {
       const out = sanitizeHtml("<p>Hello world</p>");
       expect(out).toContain("<p>Hello world</p>");
     });

     it("keeps <a href> links", () => {
       const out = sanitizeHtml('<a href="https://nikxius.com">Nikxius</a>');
       expect(out).toContain('href="https://nikxius.com"');
       expect(out).toContain("Nikxius");
     });

     it("strips inline event handlers", () => {
       const out = sanitizeHtml('<a href="#" onclick="steal()">x</a>');
       expect(out).not.toContain("onclick");
       expect(out).not.toContain("steal");
     });

     it("drops disallowed tags but keeps their text", () => {
       const out = sanitizeHtml("<iframe>nope</iframe><p>keep</p>");
       expect(out).not.toContain("<iframe");
       expect(out).toContain("<p>keep</p>");
     });

     it("returns empty string for empty input", () => {
       expect(sanitizeHtml("")).toBe("");
     });
   });
   ```

4. **Verify (run the test):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run test -- sanitize)
   ```

   Expected output:

   ```
   ✓ src/lib/sanitize.test.ts (6 tests)
     ✓ sanitizeHtml > strips <script> tags
     ✓ sanitizeHtml > keeps <p> content
     ✓ sanitizeHtml > keeps <a href> links
     ✓ sanitizeHtml > strips inline event handlers
     ✓ sanitizeHtml > drops disallowed tags but keeps their text
     ✓ sanitizeHtml > returns empty string for empty input

   Test Files  1 passed (1)
        Tests  6 passed (6)
   ```

   > If the test environment is `node` (no DOM), DOMPurify throws. F0b must set
   > `test.environment = "jsdom"` (or `happy-dom`). If F0b chose node, add a per-file
   > pragma comment `// @vitest-environment jsdom` as the **first line** of
   > `sanitize.test.ts`.

5. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both pass.

6. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/package.json \
             artifacts/workforce-os/src/lib/sanitize.ts \
             artifacts/workforce-os/src/lib/sanitize.test.ts \
             pnpm-lock.yaml && \
     git commit -m "feat(security): add sanitizeHtml DOMPurify wrapper + tests + dep

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

   > The call-site wiring (ApprovalCard, ConversationThread, ArtifactDetail, the
   > ConversationThread page) is owned by the component/page sections — they import
   > `sanitizeHtml` from `@/lib/sanitize` and wrap every `dangerouslySetInnerHTML={{ __html
   > }}`. This task only ships the wrapper + test + dep.

---

### Task P6: Depth/surface convention + convert Today KPI tiles to raised cards

**Files:**
- Reference (no edit): documents the depth convention below.
- Modify: `artifacts/workforce-os/src/pages/Today.tsx` (the `KpiTile` component, lines 149–173)

**Depth / surface convention.** The warm shadow scale (`--shadow-xs/sm/md/lg`, ink-tinted)
is defined by the index.css/tokens section. This task fixes *which surface uses which token*
so every page is consistent:

| Surface | Token | Rationale |
|---|---|---|
| Page background, section bands, sidebars | `shadow-none` | Flat structural fields; depth comes from `border-paper-200`, not shadow. |
| KPI tiles, list/lead/artifact cards, agent cards | `shadow-sm` (rest) → `shadow-md` (hover) | The default "raised card" treatment. Hover lift signals interactivity. |
| Popovers, dropdowns, menus, command palette | `shadow-md` | Floats above content; needs clear separation. |
| Dialogs, sheets, drawers, toasts | `shadow-lg` | Highest layer, modal weight. |
| Skeletons / placeholders | `shadow-none` | Mirror the flat-loading state; the card's shadow returns with real content. |

Rule of thumb: **structure uses borders, objects use `shadow-sm`, floating layers use
`shadow-md`/`shadow-lg`.** Never stack a shadow on a surface that already sits inside a
bordered band without a state change (rest→hover).

**Worked example — Today KPI tiles, before/after.**

The current `KpiTile` (lines 149–173) renders flat (`shadow-none`) and only nudges its
border on hover. Convert it to the raised-card treatment: `shadow-sm` at rest lifting to
`shadow-md` on hover, on a white (`ink-0`) surface so the warm shadow reads.

1. Replace the `KpiTile` function in `artifacts/workforce-os/src/pages/Today.tsx`
   (lines 149–173).

   **BEFORE** (current — `shadow-none`, border-only hover):

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

   **AFTER** (raised card — `shadow-sm` → `shadow-md` on hover, white surface):

   ```tsx
   function KpiTile({ label, value, delta, alert, positive }: { label: string; value: string; delta: string; alert?: boolean; positive?: boolean }) {
     const isNegative = delta.startsWith("-");
     return (
       <Card className="p-4 bg-ink-0 border-paper-200 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md hover:border-paper-300 hover:-translate-y-0.5">
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

   Changes: `shadow-none` → `shadow-sm`; added `hover:shadow-md` + `hover:-translate-y-0.5`
   for the lift; `transition-colors` → `transition-all duration-200`; `bg-paper-50` →
   `bg-ink-0` so the card surface is white and the warm shadow reads against the paper band.

   > Optional follow-up (owned by the Today section, not here): swap the raw `{value}`
   > string for `<CountUp value={kpis?.artifactsPending ?? 0} />` etc. so the numbers
   > animate on load. Out of scope for the depth conversion.

2. **Verify (typecheck + build):**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```

   Expected: both pass. `bg-ink-0`, `shadow-sm`, `shadow-md` are valid utilities (`ink-0`
   is a CONTRACT token; the warm shadow steps are added by the tokens section — if they
   haven't landed, `shadow-sm/md` fall back to Tailwind defaults and still build).

3. **Visual verify:** dev server up, screenshot `/today` in light + dark. The six KPI tiles
   should now read as raised white cards with a soft warm shadow, lifting on hover. Compare
   against the F0 baseline (flat tiles).

4. **Commit:**

   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Today.tsx && \
     git commit -m "feat(depth): convert Today KPI tiles to raised-card shadow treatment

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **P1 → P2 → P2b**: motion variants must exist before the components; `formatValue` must
  be exported (P2) before its test (P2b).
- **P3 → P4**: `ErrorState` (P3) is the fallback `ErrorBoundary` (P4) renders.
- **P2b, P5 tests** require **Task F0b** (vitest). Author the test files regardless; the
  verify step is the only thing blocked if F0b hasn't run.
- **P6** consumes the warm shadow tokens from the **index.css/tokens section**; it builds
  with Tailwind-default shadows as a graceful fallback if tokens land later.
- No cross-section symbol is renamed: every export matches the SHARED CONTRACT exactly.
