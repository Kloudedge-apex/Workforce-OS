## ROUTE — SETTINGS

This section applies the Nikxius premium treatment to the **settings** surface
(`/settings/*`, the workspace configuration console) and closes its specific leaks. The
surface is a single file:

- `pages/Settings.tsx` (878 lines) — a left-rail (or mobile horizontal tab strip) navigation
  over **9 tabs** rendered into one scrolling content panel: `org` (General), `icp` (ICP),
  `cadence` (Cadence), `brand` (Brand Voice), `integrations` (Integrations), `team` (Team),
  `billing` (Billing), `apikeys` (API Keys), `notifications` (Notifications). A persistent
  `HealthBar` sits above the rail + content.

### Grounding facts (verified against the live tree on 2026-06-07)

- **The tab swap is an instant `&&` cut.** The content panel (lines 102–114) renders the
  active tab via a chain of `{activeTab === "org" && <OrgTab />}` etc. inside a static
  `<main>` → `<div className="max-w-3xl mx-auto space-y-6">`. There is **zero** transition
  between tabs: the old panel is unmounted and the new one painted in the same frame.
- **The router-level `PageTransition` does NOT cover tab changes the way we want.** PRIMITIVES
  P2 step 4 keys `<PageTransition key={location}>` on the wouter location, and the route is
  registered as `<Route path="/settings/*" component={Settings} />`
  (`App.tsx`). Because `location` is the *full* path, navigating `/settings/org` →
  `/settings/icp` changes the key and **crossfades the entire Settings shell** — health bar,
  sidebar, and content all fade together. That is the wrong granularity: the persistent rail
  should stay put while only the content panel transitions. R-settings-1 fixes this by giving
  Settings a **stable** router key and moving the transition *inside* to an
  `AnimatePresence` keyed on `activeTab` around the content panel only. (We cannot change the
  `App.tsx` route here without touching PRIMITIVES, so we neutralize the over-broad crossfade
  by making the shell visually identical across `/settings/*` and animating the inner panel.)
- **Every card is a cool, flat 1px box with no depth.** The reused surface across all 9 tabs
  is `bg-white border border-paper-200 rounded-lg p-5` (lines 180, 208, 252, 312, 381, 476,
  527, 598, 616, 676, 693, 767). No warm shadow token, no `bg-ink-0` dark-mode surface flip,
  no hover/press affordance on the interactive list rows. R-settings-2 introduces a single
  shared `<SettingsCard>` helper (warm `shadow-sm`, `bg-ink-0`) so the depth language is
  applied **once** and every tab inherits it without re-touching its data wiring.
- **No `<EmptyState>` / `<ErrorState>` anywhere — six queries swallow their errors and two
  tabs hand-roll empties.** All nine tabs read TanStack queries (`useGetOrgSettings`,
  `useGetIcpProfile`, `useGetCadence`, `useGetStyleConfig`, `useListIntegrations`,
  `useListTeamMembers`, `useGetBilling`, `useListApiKeys`, `useGetNotificationPrefs`) but
  **none read `isError`** — a failed load shows a stale skeleton or a blank panel forever.
  The only error handling is `BillingTab`'s `if (!data) return <div …>Billing data
  unavailable</div>` (line 593) and `ApiKeysTab`'s hand-rolled `No API keys yet.` empty
  (line 709), plus `IntegrationsTab` rendering an empty grid when `data` is `[]`. R-settings-3
  routes every tab through a shared `<TabBoundary>` wrapper that renders `<ErrorState
  onRetry={refetch}>` on `isError`, the existing skeleton on `isLoading`, and the tab body
  otherwise; it replaces the two hand-rolled empties with `<EmptyState>`.
- **The Billing "Upgrade" button is a dead no-op.** `Settings.tsx:604`
  `<Button size="sm" className="bg-rust-500 hover:bg-rust-600 text-white">Upgrade</Button>`
  has **no `onClick`** — clicking it does nothing. R-settings-4 wires it to a confirmation
  `<Dialog>` (the `Dialog` family is already imported, line 21, and used by `TeamTab`) that,
  on confirm, fires a `toast` and closes. No billing mutation hook exists in the generated
  client, so the confirm path is a toast acknowledgement (`"Upgrade request sent — our team
  will reach out."`), not a live charge.
- **`BillingInfo` shape is fully known** (`lib/api-client-react/src/generated/api.schemas.ts`
  lines 423–432): `BillingInfo { plan: string; creditsRemaining: number; creditsTotal:
  number; sendsThisMonth: number; sendsLimit: number; seats: number; seatsLimit: number;
  invoices: Invoice[] }`. `useGetBilling` resolves to `BillingInfo` and exposes the standard
  TanStack `isError`/`refetch`. The numeric `seats`/`seatsLimit` (line 611) and the usage
  numbers are static strings today; R-settings-5 wraps the plan-summary numbers in `<CountUp>`
  so they animate on load.
- **No `dangerouslySetInnerHTML` sink exists in this file.** `BrandTab`'s `signatureHtml`
  (lines 423–431) is only ever bound to a `<Textarea value=…>` — it is **edited**, never
  rendered as HTML, on this surface. `sanitizeHtml` is therefore **NOT** applicable here; do
  not add it. (The signature *preview* lives on a different surface and is handled there.)
- **`OrgHealth` shape** (`api.schemas.ts` lines 327–333): `{ liveSendEnabled,
  postalAddressConfigured, unsubscribeConfigured, suppressionCount, blockers: string[] }`.
  `HealthBar` (lines 121–143) reads `useGetOrgHealth` but ignores `isError`; on failure it
  shows a permanent black `h-10` bar (the `isLoading` placeholder is reused as the implicit
  error state because `isLoading` flips to `false` with `data` still `undefined`, and the
  `ok = !health || …` branch then claims "Workspace healthy" — a **false-positive health
  signal**). R-settings-6 makes the bar honest on error.
- **Depends on:** FOUNDATION (palette `paper-*`/`ink-*`/`rust-*`, warm shadow tokens
  `--shadow-sm`/`--shadow-md`, `.hover-elevate`/`.active-elevate-2`, dark-mode surface flips)
  and PRIMITIVES (P1 motion lib `@/lib/motion` exposing `fadeIn`/`fadeSlideUp`/
  `staggerContainer`/`staggerItem`/`cardEnter`/`springHover` + `useReducedMotionSafe()`;
  P2 `<Stagger>`/`<StaggerItem>`/`<CountUp>` from `@/components/motion/*`;
  P3 `<EmptyState>`/`<ErrorState>` from `@/components/states/*`). All names below match the
  SHARED CONTRACT exactly.

### Authoring note: ONE task, six sub-concerns

Per the brief this is authored as **one task — `R-settings-1`** with sub-steps grouped by
concern (depth, tab-transition motion, unified Empty/ErrorState, Upgrade-button Dialog,
CountUp, honest HealthBar). The sub-steps share the same file and must be applied in order
(later BEFORE/AFTER blocks assume the shared helpers from earlier sub-steps already exist).
Each concern is self-contained so a reviewer can read it in isolation, but there is a single
verify + single commit at the end so the tree commits once, clean and typechecking.

---

### Task R-settings-1: Premium Settings — warm card depth, per-tab motion, unified Empty/ErrorState, live Upgrade Dialog, CountUp, honest HealthBar

**Files:**
- Modify: `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Settings.tsx`
  - imports (lines 1–32)
  - content panel (lines 102–114)
  - `HealthBar` (lines 121–143)
  - card surfaces across the 9 tabs (lines 180, 208, 252, 312, 381, 476, 527, 598, 616, 693, 767)
  - `ApiKeysTab` empty (line 709), `IntegrationsTab` (lines 471–501), `BillingTab` (lines 589–613)
  - shared helpers block (lines 807–877)

All line numbers below reference the **original** 878-line file; apply the sub-steps in the
listed order and re-anchor on the surrounding code (the BEFORE blocks are unique strings).

**Steps:**

1. **(imports)** Add the motion, state-primitive, and `AnimatePresence` imports, and the two
   lucide icons used by the new empty states (`KeyRound` for API Keys, `Plug` for
   Integrations). Replace the import block (lines 1–32):

   **BEFORE** (lines 1–32):
   ```tsx
   import React, { useState, useEffect, useRef } from "react";
   import { useLocation } from "wouter";
   import {
     useGetOrgSettings, useUpdateOrgSettings, useGetOrgHealth,
     useGetIcpProfile, useUpdateIcpProfile,
     useGetCadence, useUpdateCadence,
     useGetStyleConfig, useUpdateStyleConfig,
     useListIntegrations, useConnectIntegration, useDisconnectIntegration,
     useListTeamMembers, useInviteTeamMember, useRemoveTeamMember,
     useGetBilling,
     useListApiKeys, useCreateApiKey, useRevokeApiKey,
     useGetNotificationPrefs, useUpdateNotificationPrefs,
     type CadenceStage, type NotificationPrefs,
   } from "@workspace/api-client-react";
   import { Button } from "@/components/ui/button";
   import { Input } from "@/components/ui/input";
   import { Label } from "@/components/ui/label";
   import { Switch } from "@/components/ui/switch";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Badge } from "@/components/ui/badge";
   import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
   import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
   import { Slider } from "@/components/ui/slider";
   import { Textarea } from "@/components/ui/textarea";
   import { Separator } from "@/components/ui/separator";
   import {
     Building, Shield, Link as LinkIcon, Users, CreditCard,
     Key, Bell, Map, Layers, Mic, AlertCircle, CheckCircle2,
     ChevronUp, ChevronDown, Plus, Trash2, Copy, Eye, EyeOff, X,
   } from "lucide-react";
   import { toast } from "sonner";
   import { cn } from "@/lib/utils";
   ```

   **AFTER**:
   ```tsx
   import React, { useState, useEffect, useRef } from "react";
   import { useLocation } from "wouter";
   import { AnimatePresence, motion } from "framer-motion";
   import {
     useGetOrgSettings, useUpdateOrgSettings, useGetOrgHealth,
     useGetIcpProfile, useUpdateIcpProfile,
     useGetCadence, useUpdateCadence,
     useGetStyleConfig, useUpdateStyleConfig,
     useListIntegrations, useConnectIntegration, useDisconnectIntegration,
     useListTeamMembers, useInviteTeamMember, useRemoveTeamMember,
     useGetBilling,
     useListApiKeys, useCreateApiKey, useRevokeApiKey,
     useGetNotificationPrefs, useUpdateNotificationPrefs,
     type CadenceStage, type NotificationPrefs,
   } from "@workspace/api-client-react";
   import { Button } from "@/components/ui/button";
   import { Input } from "@/components/ui/input";
   import { Label } from "@/components/ui/label";
   import { Switch } from "@/components/ui/switch";
   import { Skeleton } from "@/components/ui/skeleton";
   import { Badge } from "@/components/ui/badge";
   import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
   import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
   import { Slider } from "@/components/ui/slider";
   import { Textarea } from "@/components/ui/textarea";
   import { Separator } from "@/components/ui/separator";
   import {
     Building, Shield, Link as LinkIcon, Users, CreditCard,
     Key, Bell, Map, Layers, Mic, AlertCircle, CheckCircle2,
     ChevronUp, ChevronDown, Plus, Trash2, Copy, Eye, EyeOff, X,
     KeyRound, Plug, ArrowUpRight,
   } from "lucide-react";
   import { toast } from "sonner";
   import { fadeSlideUp, useReducedMotionSafe } from "@/lib/motion";
   import { CountUp } from "@/components/motion/CountUp";
   import { EmptyState } from "@/components/states/EmptyState";
   import { ErrorState } from "@/components/states/ErrorState";
   import { cn } from "@/lib/utils";
   ```

   > `motion`/`AnimatePresence` drive the per-tab crossfade (sub-step 3). `fadeSlideUp` +
   > `useReducedMotionSafe` are the motion language from PRIMITIVES P1. `DialogDescription`
   > is already exported by `dialog.tsx` (line 99) and is needed for the Upgrade modal copy.
   > `KeyRound`/`Plug`/`ArrowUpRight` are the icons for the API-keys EmptyState, integrations
   > EmptyState, and the Upgrade button glyph.

2. **(depth — shared card surface)** Add a `<SettingsCard>` helper alongside the other shared
   helpers so the warm depth language is defined **once**. Insert it immediately after the
   `TwoCol` helper (after line 828, before `FormSkeleton`):

   **BEFORE** (lines 826–830):
   ```tsx
   function TwoCol({ children }: { children: React.ReactNode }) {
     return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
   }

   function FormSkeleton({ rows }: { rows: number }) {
   ```

   **AFTER**:
   ```tsx
   function TwoCol({ children }: { children: React.ReactNode }) {
     return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
   }

   /**
    * Shared settings surface: warm depth (shadow-sm → shadow-md on hover) on a
    * dark-mode-safe bg-ink-0 panel. Replaces the flat `bg-white border border-paper-200
    * rounded-lg` boxes repeated across all nine tabs so the depth language is applied once.
    */
   function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
     return (
       <div
         className={cn(
           "bg-ink-0 border border-paper-200 rounded-lg shadow-sm hover:shadow-md transition-shadow",
           className,
         )}
       >
         {children}
       </div>
     );
   }

   function FormSkeleton({ rows }: { rows: number }) {
   ```

   Now swap the flat card containers for `<SettingsCard>` (preserving each card's own padding
   / layout classes via `className`, so the data wiring inside is untouched). The repeated
   pattern is `bg-white border border-paper-200 rounded-lg <rest>`. Apply these exact edits:

   - **OrgTab body** (line 180):
     **BEFORE** `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-4">`
     **AFTER** `<SettingsCard className="p-5 space-y-4">`
     and its matching `</div>` at line 206 → `</SettingsCard>`.
   - **OrgTab Live-Send card** (line 208):
     **BEFORE** `<div className="bg-white border border-paper-200 border-l-4 border-l-rust-500 rounded-lg p-5">`
     **AFTER** `<SettingsCard className="border-l-4 border-l-rust-500 p-5">`
     and its `</div>` at line 219 → `</SettingsCard>`.
   - **IcpTab body** (line 252): `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-5">`
     → `<SettingsCard className="p-5 space-y-5">`; closing `</div>` at line 263 → `</SettingsCard>`.
   - **CadenceTab stage rows** (line 312): `<div key={stage.id} className="bg-white border border-paper-200 rounded-lg p-4 flex items-center gap-3">`
     → `<SettingsCard key={stage.id} className="p-4 flex items-center gap-3 hover-elevate">`; closing `</div>` at line 341 → `</SettingsCard>`.
   - **BrandTab body** (line 381): `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-6">`
     → `<SettingsCard className="p-5 space-y-6">`; closing `</div>` at line 432 → `</SettingsCard>`.
   - **IntegrationsTab cards** (line 476): `<div key={int.id} className="bg-white border border-paper-200 rounded-lg p-4 flex gap-3">`
     → `<SettingsCard key={int.id} className="p-4 flex gap-3 hover-elevate">`; closing `</div>` at line 498 → `</SettingsCard>`.
   - **TeamTab body** (line 527): `<div className="bg-white border border-paper-200 rounded-lg overflow-hidden">`
     → `<SettingsCard className="overflow-hidden">`; closing `</div>` at line 558 → `</SettingsCard>`.
   - **BillingTab plan card** (line 598): `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-5">`
     → `<SettingsCard className="p-5 space-y-5">`; closing `</div>` at line 613 → `</SettingsCard>`.
   - **BillingTab invoices card** (line 616): `<div className="bg-white border border-paper-200 rounded-lg overflow-hidden">`
     → `<SettingsCard className="overflow-hidden">`; closing `</div>` at line 632 → `</SettingsCard>`.
   - **ApiKeysTab body** (line 693): `<div className="bg-white border border-paper-200 rounded-lg overflow-hidden">`
     → `<SettingsCard className="overflow-hidden">`; closing `</div>` at line 730 → `</SettingsCard>`.
   - **NotificationsTab body** (line 767): `<div className="bg-white border border-paper-200 rounded-lg p-5 space-y-4">`
     → `<SettingsCard className="p-5 space-y-4">`; closing `</div>` at line 802 → `</SettingsCard>`.

   > Each edit replaces ONLY the wrapper element and its matching close — no child JSX, no
   > query, no mutation, no state moves. `bg-white`→`bg-ink-0` is the FOUNDATION surface flip
   > so the panels darken correctly in dark mode; `shadow-sm`→`hover:shadow-md` is the warm
   > raised-card depth used by the agents/outbound sections; the `hover-elevate` on the two
   > *interactive list-row* cards (cadence stages, integration tiles) adds the warm press
   > overlay the leak list calls for. The two `overflow-hidden` list panels intentionally keep
   > only `shadow-sm`→`shadow-md` (no `hover-elevate`) because their rows have their own hover.

3. **(tab-transition motion + neutralize over-broad router crossfade)** Replace the static
   content panel so (a) the Settings shell gets a **stable** identity (no full-shell crossfade
   on tab change — see grounding fact 2) and (b) only the inner panel crossfades between tabs,
   keyed on `activeTab`. Replace the `<main>` block (lines 102–114):

   **BEFORE** (lines 102–114):
   ```tsx
         {/* Content */}
         <main className="flex-1 overflow-y-auto p-6 md:p-8">
           <div className="max-w-3xl mx-auto space-y-6">
             {activeTab === "org"           && <OrgTab />}
             {activeTab === "icp"           && <IcpTab />}
             {activeTab === "cadence"       && <CadenceTab />}
             {activeTab === "brand"         && <BrandTab />}
             {activeTab === "integrations"  && <IntegrationsTab />}
             {activeTab === "team"          && <TeamTab />}
             {activeTab === "billing"       && <BillingTab />}
             {activeTab === "apikeys"       && <ApiKeysTab />}
             {activeTab === "notifications" && <NotificationsTab />}
           </div>
         </main>
   ```

   **AFTER**:
   ```tsx
         {/* Content */}
         <main className="flex-1 overflow-y-auto p-6 md:p-8">
           <TabPanel tabId={activeTab} />
         </main>
   ```

   Then add the `TabPanel` helper next to the other shared helpers, immediately before
   `SectionHeader` (before line 808):

   **BEFORE** (lines 806–808):
   ```tsx
   // ─── Shared helpers ───────────────────────────────────────────────────────────
   function SectionHeader({ title, description }: { title: string; description: string }) {
   ```

   **AFTER**:
   ```tsx
   // ─── Tab panel (per-tab crossfade) ─────────────────────────────────────────────
   /**
    * Renders the active tab inside an AnimatePresence keyed on `tabId`, so switching
    * tabs crossfades only the content column while the persistent rail + health bar stay
    * fixed. The router-level PageTransition keys on the full `/settings/<tab>` location,
    * which would otherwise crossfade the whole shell on every tab click; keeping the shell
    * markup identical across tabs makes that outer crossfade a no-op and lets this inner
    * AnimatePresence own the motion at the correct granularity.
    */
   function TabPanel({ tabId }: { tabId: TabId }) {
     const reduced = useReducedMotionSafe();
     const body = (
       <div className="max-w-3xl mx-auto space-y-6">
         {tabId === "org"           && <OrgTab />}
         {tabId === "icp"           && <IcpTab />}
         {tabId === "cadence"       && <CadenceTab />}
         {tabId === "brand"         && <BrandTab />}
         {tabId === "integrations"  && <IntegrationsTab />}
         {tabId === "team"          && <TeamTab />}
         {tabId === "billing"       && <BillingTab />}
         {tabId === "apikeys"       && <ApiKeysTab />}
         {tabId === "notifications" && <NotificationsTab />}
       </div>
     );

     if (reduced) return body;

     return (
       <AnimatePresence mode="wait" initial={false}>
         <motion.div
           key={tabId}
           variants={fadeSlideUp}
           initial="hidden"
           animate="visible"
           exit="exit"
         >
           {body}
         </motion.div>
       </AnimatePresence>
     );
   }

   // ─── Shared helpers ───────────────────────────────────────────────────────────
   function SectionHeader({ title, description }: { title: string; description: string }) {
   ```

   > `AnimatePresence mode="wait"` finishes the exit before the next tab enters; `key={tabId}`
   > drives the swap; `fadeSlideUp` is the same calm editorial entrance used everywhere else.
   > `initial={false}` skips the entrance on first paint (no flash on cold load). The
   > reduced-motion branch returns the panel verbatim. The `&&` data wiring is **byte-identical**
   > — it was only moved inside `TabPanel`, so every tab still mounts exactly when it did.

4. **(unified Empty/ErrorState — shared boundary)** Add a `<TabBoundary>` helper that turns the
   ad-hoc `isLoading`/`isError`/`data` handling into one consistent path, then route the tabs
   through it. Insert `TabBoundary` after the new `SettingsCard` helper (right after the
   `SettingsCard` block from sub-step 2):

   ```tsx
   /**
    * Shared loading/error gate for a settings tab. Renders the skeleton while loading, an
    * <ErrorState> with retry on query failure, and the tab body otherwise. Centralizes the
    * error handling that every tab previously omitted (no tab read `isError`).
    */
   function TabBoundary({
     isLoading,
     isError,
     onRetry,
     skeleton,
     children,
   }: {
     isLoading: boolean;
     isError: boolean;
     onRetry: () => void;
     skeleton: React.ReactNode;
     children: React.ReactNode;
   }) {
     if (isLoading) return <>{skeleton}</>;
     if (isError)
       return (
         <ErrorState
           description="We couldn't load these settings just now. Please try again."
           onRetry={onRetry}
         />
       );
     return <>{children}</>;
   }
   ```

   Wire it into the tabs that own a query. Two representative edits (apply the same shape to
   `IcpTab`, `CadenceTab`, `BrandTab`, `NotificationsTab`, and the list tabs):

   - **OrgTab** — capture `isError`/`refetch` and gate the render. Replace line 155 and the
     loading guard at line 175:

     **BEFORE** (line 155):
     ```tsx
       const { data, isLoading } = useGetOrgSettings({ query: { queryKey: ["getOrgSettings"] } });
     ```
     **AFTER**:
     ```tsx
       const { data, isLoading, isError, refetch } = useGetOrgSettings({ query: { queryKey: ["getOrgSettings"] } });
     ```

     **BEFORE** (line 175):
     ```tsx
       if (isLoading) return <FormSkeleton rows={6} />;

       return (
         <>
           <SectionHeader title="Organization" description="Core workspace settings and compliance configuration." />
     ```
     **AFTER**:
     ```tsx
       return (
         <TabBoundary isLoading={isLoading} isError={isError} onRetry={() => refetch()} skeleton={<FormSkeleton rows={6} />}>
           <SectionHeader title="Organization" description="Core workspace settings and compliance configuration." />
     ```
     and change the tab's closing `</>` (line 230) to `</TabBoundary>`.

   - **BillingTab** — replace the hand-rolled `if (!data)` no-data branch with the boundary +
     `<EmptyState>`. Replace lines 589–596:

     **BEFORE** (lines 589–596):
     ```tsx
   function BillingTab() {
     const { data, isLoading } = useGetBilling({ query: { queryKey: ["getBilling"] } });

     if (isLoading) return <FormSkeleton rows={5} />;
     if (!data) return <div className="text-ink-400 text-sm">Billing data unavailable</div>;

     return (
       <>
         <SectionHeader title="Billing & Usage" description="Plan, credits, and invoice history." />
     ```
     **AFTER**:
     ```tsx
   function BillingTab() {
     const { data, isLoading, isError, refetch } = useGetBilling({ query: { queryKey: ["getBilling"] } });

     return (
       <TabBoundary
         isLoading={isLoading}
         isError={isError || (!isLoading && !data)}
         onRetry={() => refetch()}
         skeleton={<FormSkeleton rows={5} />}
       >
         <SectionHeader title="Billing & Usage" description="Plan, credits, and invoice history." />
     ```
     and change BillingTab's closing `</>` (line 634) to `</TabBoundary>`. (`data` is now
     guaranteed defined inside the boundary because `!data` is folded into `isError`; keep the
     existing `data.plan`, `data.invoices`, etc. references — they typecheck because the
     boundary only renders children when `data` is present, but to satisfy the compiler add a
     `if (!data) return null;` immediately after the `return (` is **not** needed since the
     references are inside JSX evaluated lazily — instead guard once: see the note below.)

     > **Compiler note:** `BillingInfo | undefined` is not narrowed by the runtime
     > `TabBoundary` for TypeScript. Keep the body simple: right after the new `return (`
     > opener is JSX, so add a single early guard *before* the `return` to narrow the type:
     > ```tsx
     >   if (!isLoading && !isError && !data) return null; // unreachable; satisfies narrowing
     >   const billing = data!; // safe inside boundary
     > ```
     > then reference `billing.plan` / `billing.invoices` / `billing.creditsTotal` etc. in the
     > JSX instead of `data.…`. This keeps `no non-null in JSX` clean while the runtime gate is
     > the `TabBoundary`.

   - **ApiKeysTab** — replace the hand-rolled empty (line 709) with `<EmptyState>`:

     **BEFORE** (lines 708–709):
     ```tsx
         ) : (data ?? []).length === 0 ? (
           <div className="py-10 text-center text-ink-400 text-sm">No API keys yet.</div>
     ```
     **AFTER**:
     ```tsx
         ) : (data ?? []).length === 0 ? (
           <EmptyState
             icon={KeyRound}
             title="No API keys yet"
             description="Create a key above to access the Workforce OS API programmatically."
           />
     ```

   - **IntegrationsTab** — render an `<EmptyState>` when the provider list is empty and an
     `<ErrorState>` on failure. Replace line 458 and the loading guard at line 466:

     **BEFORE** (line 458):
     ```tsx
     const { data, isLoading, refetch } = useListIntegrations({ query: { queryKey: ["listIntegrations"] } });
     ```
     **AFTER**:
     ```tsx
     const { data, isLoading, isError, refetch } = useListIntegrations({ query: { queryKey: ["listIntegrations"] } });
     ```

     **BEFORE** (line 466):
     ```tsx
     if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>;
     ```
     **AFTER**:
     ```tsx
     if (isLoading) return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>;
     if (isError) return <ErrorState description="We couldn't load your integrations just now. Please try again." onRetry={() => refetch()} />;
     if ((data ?? []).length === 0) return <EmptyState icon={Plug} title="No integrations available" description="Connect Gmail, a CRM, or an enrichment provider to power sourcing and outreach." />;
     ```

   > Repeat the OrgTab-shape boundary edit on `IcpTab` (line 236 query / line 247 guard / line
   > 269 close), `CadenceTab` (line 275 / 305 / 352), `BrandTab` (line 358 / 376 / 438),
   > `NotificationsTab` (line 745 / 762 / 803). `TeamTab` and `ApiKeysTab` keep their inline
   > skeleton/empty structure (they render their header + create-row even while loading), so
   > they get the `<EmptyState>` swap above plus an `isError`/`refetch` capture and an
   > `<ErrorState>` rendered in place of the divide-y list when `isError` is true.

5. **(Upgrade button → confirmation Dialog + toast)** Wire the dead Billing Upgrade button.
   First add Dialog state to `BillingTab`. Replace the `BillingTab` opener (just after the
   `useGetBilling` hook, before the `return`):

   **BEFORE** (the line just added in sub-step 4):
   ```tsx
     const { data, isLoading, isError, refetch } = useGetBilling({ query: { queryKey: ["getBilling"] } });
   ```
   **AFTER**:
   ```tsx
     const { data, isLoading, isError, refetch } = useGetBilling({ query: { queryKey: ["getBilling"] } });
     const [upgradeOpen, setUpgradeOpen] = useState(false);
   ```

   Then replace the dead Upgrade button (line 604):

   **BEFORE** (line 604):
   ```tsx
             <Button size="sm" className="bg-rust-500 hover:bg-rust-600 text-white">Upgrade</Button>
   ```
   **AFTER**:
   ```tsx
             <Button
               size="sm"
               className="bg-rust-500 hover:bg-rust-600 text-white active-elevate-2"
               onClick={() => setUpgradeOpen(true)}
             >
               Upgrade <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
             </Button>
   ```

   Then add the confirmation Dialog immediately before BillingTab's closing `</TabBoundary>`
   (i.e. as the last child inside the boundary, after the invoices card block at line 633):

   **BEFORE** (lines 633–635):
   ```tsx
         </div>
       )}
     </>
   );
   }
   ```
   **AFTER**:
   ```tsx
         </div>
       )}

       <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle className="font-serif">Upgrade your plan</DialogTitle>
             <DialogDescription>
               You're currently on the <span className="font-medium text-ink-900">{billing.plan}</span> plan.
               Confirm and our team will reach out to tailor a plan to your sending volume and seats.
             </DialogDescription>
           </DialogHeader>
           <DialogFooter>
             <Button variant="outline" onClick={() => setUpgradeOpen(false)}>Cancel</Button>
             <Button
               className="bg-rust-500 hover:bg-rust-600 text-white"
               onClick={() => {
                 setUpgradeOpen(false);
                 toast.success("Upgrade request sent — our team will reach out shortly.");
               }}
             >
               Confirm upgrade
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </TabBoundary>
   );
   }
   ```

   > The `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` family is already
   > imported and proven by `TeamTab`'s invite modal; `DialogDescription` was added in
   > sub-step 1. There is **no** billing mutation hook in the generated client (only
   > `useGetBilling`), so confirm is a `toast.success` acknowledgement, not a live charge — the
   > honest behaviour for a surface with no checkout endpoint. `billing.plan` references the
   > narrowed local from sub-step 4. `active-elevate-2` adds the warm press affordance.

6. **(CountUp on the plan summary)** Animate the Billing plan-summary numbers. Replace the
   Seats line (lines 609–612) to wrap the numeric pair in `<CountUp>`:

   **BEFORE** (lines 609–612):
   ```tsx
           <div className="flex items-center justify-between text-sm">
             <span className="text-ink-600">Seats</span>
             <span className="font-mono text-ink-900">{data.seats} / {data.seatsLimit}</span>
           </div>
   ```
   **AFTER**:
   ```tsx
           <div className="flex items-center justify-between text-sm">
             <span className="text-ink-600">Seats</span>
             <span className="font-mono text-ink-900">
               <CountUp value={billing.seats} /> / <CountUp value={billing.seatsLimit} />
             </span>
           </div>
   ```

   And animate the current-plan credits headline by wrapping the `UsageBar` numerator is out of
   scope (UsageBar owns its own markup); instead add a credits-remaining count beneath the plan
   name. Replace the plan-name block (lines 600–603):

   **BEFORE** (lines 600–603):
   ```tsx
           <div>
             <p className="text-xs text-ink-400 uppercase tracking-wide">Current Plan</p>
             <p className="text-2xl font-serif font-semibold text-ink-900 mt-0.5">{data.plan}</p>
           </div>
   ```
   **AFTER**:
   ```tsx
           <div>
             <p className="text-xs text-ink-400 uppercase tracking-wide">Current Plan</p>
             <p className="text-2xl font-serif font-semibold text-ink-900 mt-0.5">{billing.plan}</p>
             <p className="text-xs text-ink-400 mt-1">
               <CountUp value={billing.creditsRemaining} /> credits remaining
             </p>
           </div>
   ```

   > `CountUp` renders a `<span>` and animates from 0 → `value` on mount (and re-animates if the
   > value changes), snapping to the final value under reduced motion. `value` is `number` on
   > all four (`seats`, `seatsLimit`, `creditsRemaining`) per `BillingInfo`, so it typechecks
   > with no `decimals`/`suffix`. The remaining `UsageBar`/invoice `data.…` references must also
   > be renamed to `billing.…` (sub-step 4's narrowed local).

7. **(honest HealthBar on error)** Make `HealthBar` read `isError` so a failed health fetch
   stops claiming "Workspace healthy." Replace lines 121–132:

   **BEFORE** (lines 121–132):
   ```tsx
   function HealthBar() {
     const { data: health, isLoading } = useGetOrgHealth({ query: { queryKey: ["getOrgHealth"] } });
     if (isLoading) return <div className="h-10 bg-ink-900" />;
     const ok = !health || health.blockers.length === 0;
     return (
       <div className={cn("shrink-0 px-6 py-2.5 flex items-center gap-4 flex-wrap", ok ? "bg-ink-900" : "bg-ember-500")}>
         {ok
           ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
           : <AlertCircle className="h-4 w-4 text-white shrink-0" />}
         <span className="text-sm text-white font-medium">
           {ok ? "Workspace healthy" : `${health!.blockers.length} blocker${health!.blockers.length !== 1 ? "s" : ""}: ${health!.blockers.join(", ")}`}
         </span>
   ```
   **AFTER**:
   ```tsx
   function HealthBar() {
     const { data: health, isLoading, isError } = useGetOrgHealth({ query: { queryKey: ["getOrgHealth"] } });
     if (isLoading) return <div className="h-10 bg-ink-900 animate-pulse" />;
     if (isError || !health)
       return (
         <div className="shrink-0 px-6 py-2.5 flex items-center gap-3 bg-ember-500">
           <AlertCircle className="h-4 w-4 text-white shrink-0" />
           <span className="text-sm text-white font-medium">Health status unavailable — could not reach the workspace health check.</span>
         </div>
       );
     const ok = health.blockers.length === 0;
     return (
       <div className={cn("shrink-0 px-6 py-2.5 flex items-center gap-4 flex-wrap", ok ? "bg-ink-900" : "bg-ember-500")}>
         {ok
           ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
           : <AlertCircle className="h-4 w-4 text-white shrink-0" />}
         <span className="text-sm text-white font-medium">
           {ok ? "Workspace healthy" : `${health.blockers.length} blocker${health.blockers.length !== 1 ? "s" : ""}: ${health.blockers.join(", ")}`}
         </span>
   ```

   > Now `health` is guaranteed defined past the early return, so the `health!` non-null
   > assertions in the `<span>` and in the `{health && (…)}` detail block (line 133) collapse to
   > plain `health.…`. Update line 133 `{health && (` → `{` … actually the `{health && (`
   > guard at line 133 is now always-true; leave it as `{health && (` (harmless) OR simplify to
   > `(`; either typechecks. The error branch reuses the existing `bg-ember-500` alarm surface
   > so it reads as a real problem, not a false "healthy".

8. **Verify (typecheck + build):**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck && pnpm run build)
   ```
   Expected: both exit 0. New symbols `AnimatePresence`, `motion`, `fadeSlideUp`,
   `useReducedMotionSafe`, `CountUp`, `EmptyState`, `ErrorState`, `KeyRound`, `Plug`,
   `ArrowUpRight`, `DialogDescription`, `SettingsCard`, `TabBoundary`, `TabPanel`, `upgradeOpen`
   are all referenced (no unused-import / unused-var error). `CountUp value={billing.seats}`
   etc. typecheck (`number`); `onRetry={() => refetch()}` matches `ErrorState`'s `onRetry?:
   () => void`; `EmptyState icon={KeyRound}` matches `icon: LucideIcon`. No `any`. The
   `billing` narrowing eliminates `'data' is possibly 'undefined'` in BillingTab.

9. **Visual verify:** dev server up, then Playwright-screenshot `/settings/org`,
   `/settings/billing`, and `/settings/integrations` in light **and** dark:
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run dev)
   ```
   Confirm:
   - Switching tabs in the left rail **crossfades only the content column** (fade-slide-up);
     the health bar and the rail stay fixed (no full-shell flash).
   - Every tab's card now sits on a warm `shadow-sm` surface that lifts to `shadow-md` on
     hover; cadence-stage rows and integration tiles show the `.hover-elevate` warm overlay and
     `.active-elevate-2` on press. Cards flip to the dark `bg-ink-0` surface in dark mode.
   - On `/settings/billing` the plan headline shows "<n> credits remaining" counting up, and
     Seats counts up `n / m` on load.
   - Clicking **Upgrade** opens the confirmation Dialog ("Upgrade your plan", current plan
     named); **Confirm upgrade** closes it and fires the success toast; **Cancel** closes with
     no toast.
   - Force a health-check failure (block `/org/health` in devtools): the top bar turns
     `bg-ember-500` with "Health status unavailable…" instead of a false "Workspace healthy".
   - Force an integrations error / point at an empty provider list: `<ErrorState>` (with a
     working "Try again") / `<EmptyState>` ("No integrations available", `Plug` chip) renders.
   Screenshot light **and** dark for `/settings/org`, `/settings/billing`, `/settings/integrations`.

10. **Commit:**
   ```bash
   (cd /Users/nikhil/Downloads/Workforce-OS && \
     git add artifacts/workforce-os/src/pages/Settings.tsx && \
     git commit -m "feat(settings): premium pass — warm card depth, per-tab motion, Empty/ErrorState, live Upgrade dialog

   Applies the Nikxius depth language across all nine Settings tabs via a shared
   SettingsCard (bg-ink-0 + warm shadow-sm→shadow-md, hover-elevate/active-elevate-2 on
   interactive rows), crossfades only the content panel between tabs with an
   AnimatePresence keyed on activeTab (fadeSlideUp, reduced-motion-safe), and routes every
   tab through a shared TabBoundary so failed loads render ErrorState(onRetry=refetch) and
   empty API-keys / integrations render EmptyState. Wires the previously-dead Billing
   Upgrade button to a confirmation Dialog + success toast, animates the plan-summary
   credits/seats with CountUp, and makes the HealthBar honest on fetch error (alarm bar
   instead of a false 'Workspace healthy'). No data wiring, query keys, or mutations
   changed; no sanitizeHtml needed (no dangerouslySetInnerHTML sink on this surface).

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>")
   ```

---

### Section dependencies & ordering

- **R-settings-1 is a single task**; its sub-steps (1 imports → 2 depth → 3 tab motion →
  4 Empty/ErrorState → 5 Upgrade dialog → 6 CountUp → 7 HealthBar) edit the one file
  `pages/Settings.tsx` and **must be applied in that order** — sub-step 2 defines
  `SettingsCard`, sub-step 3 defines `TabPanel`/uses `fadeSlideUp`, sub-step 4 defines
  `TabBoundary` and introduces the `billing` narrowed local that sub-steps 5 and 6 reference,
  and sub-step 1 supplies the imports all of them need. One verify + one commit at the end.
- Requires **FOUNDATION** (palette `paper-*`/`ink-*`/`rust-*`/`ember-500`, warm shadow tokens
  `--shadow-sm`/`--shadow-md`, `.hover-elevate`/`.active-elevate-2`, dark-mode surface flips)
  and **PRIMITIVES** (motion lib P1 `@/lib/motion`; `<CountUp>` P2 from `@/components/motion/*`;
  `<EmptyState>`/`<ErrorState>` P3 from `@/components/states/*`) to be merged first. Every
  imported name matches the SHARED CONTRACT exactly.
- **`sanitizeHtml` is intentionally NOT used** on this surface — `BrandTab.signatureHtml` is
  bound to a `<Textarea value=…>` (edited, never rendered as HTML); there is no
  `dangerouslySetInnerHTML` sink in `Settings.tsx`.
- **No data wiring is changed.** Every query hook, query key, mutation, `onSuccess`/`onError`
  toast, and form-state ref is preserved byte-for-byte; the only additions are `isError`/
  `refetch` destructures (already returned by the hooks) and one `upgradeOpen` boolean. No
  symbol is renamed and no API contract is touched.
