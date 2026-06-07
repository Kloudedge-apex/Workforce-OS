## Section 30 — BRAND & DATA-DRIVEN IDENTITY

Replaces the hardcoded "Mynoted Private Limited" / "Nikhil Sood" identity with a
single-source-of-truth workspace/user layer and an on-brand **Nikxius** identity
(logo mark, wordmark, favicon, document title, 404, real integration logos).

### Sourcing decision (READ THIS FIRST — it governs B1)

I inspected the API surface before writing the data layer:

- **Org/workspace IS available from an endpoint.** `GET /settings/org`
  (`/Users/nikhil/Downloads/Workforce-OS/artifacts/api-server/src/routes/settings.ts`)
  resolves to the generated hook `useGetOrgSettings()` in
  `/Users/nikhil/Downloads/Workforce-OS/lib/api-client-react/src/generated/api.ts`.
  Its return type `OrgSettings`
  (`/Users/nikhil/Downloads/Workforce-OS/lib/api-client-react/src/generated/api.schemas.ts:294`)
  contains exactly `orgName: string`, `plan?: string`, `logoUrl?: string | null`.
  → **`useWorkspace()` wires to this endpoint** and maps `orgName→name`,
  `plan→plan`, `logoUrl→logoUrl`, with a static Nikxius fallback while loading or
  on error (so the sidebar never flashes blank or "Mynoted").
- **Current user is NOT available from any endpoint.** There is no `/me` /
  `/auth/whoami` route; `GET /settings/team` returns the member list but nothing
  identifies "the signed-in user." The seed
  (`/Users/nikhil/Downloads/Workforce-OS/scripts/src/seed-mynoted.ts:267`) has a
  user object (`name: "Nikhil Sood"`, `role: "OWNER"`) but it is not exposed.
  → **`useCurrentUser()` uses a static Nikxius app-context constant.** Per the
  CONTRACT, Phase 2 swaps the *source* to Clerk's `useUser()` **without changing
  the signature or any consumer.**

Both hooks keep the CONTRACT signatures verbatim:
`useWorkspace(): { name; plan; logoUrl? }`,
`useCurrentUser(): { name; role; initials; avatarUrl? }`.

> ⚠️ Dependency note: `EmptyState` (used by B5) is created in Task F0's state
> primitives (`/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/states/EmptyState.tsx`).
> This section runs **after** F0. If the import resolves red, F0 has not landed yet —
> do not stub it here.

---

### Task B1: Workspace + current-user data layer (`useWorkspace` / `useCurrentUser`)

**Files:**
- Create `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/lib/workspace.ts`

1. Create the file with the static Nikxius app-context constant and both hooks.
   `useWorkspace` reads the live org endpoint; `useCurrentUser` returns the static
   constant (no endpoint exists). Paste verbatim:

```ts
// /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/lib/workspace.ts
//
// Single source of truth for workspace + current-user identity.
//
// Phase 1 (now):  workspace = live `GET /settings/org`; user = static Nikxius constant.
// Phase 2 (later): swap the *source* to Clerk (`useOrganization` / `useUser`) WITHOUT
//                  changing these return signatures or any consumer.
import { useGetOrgSettings } from "@workspace/api-client-react";

export interface Workspace {
  name: string;
  plan: string;
  logoUrl?: string;
}

export interface CurrentUser {
  name: string;
  role: string;
  initials: string;
  avatarUrl?: string;
}

/**
 * Static Nikxius app context. Used as the workspace fallback (loading/error) and
 * as the sole source for the current user until a `/me` endpoint or Clerk lands.
 */
const NIKXIUS_APP_CONTEXT = {
  workspace: {
    name: "Nikxius",
    plan: "Growth",
  } satisfies Workspace,
  user: {
    name: "Nikhil Sood",
    role: "Owner",
    initials: "NS",
  } satisfies CurrentUser,
} as const;

/** Derive 1–2 letter initials from a display name. */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Title-case a raw plan slug like "growth" -> "Growth". */
function formatPlan(plan: string): string {
  if (!plan) return NIKXIUS_APP_CONTEXT.workspace.plan;
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/**
 * Active workspace identity. Sourced from `GET /settings/org`; falls back to the
 * static Nikxius context while loading or on error so the chrome never flashes
 * blank or a stale tenant name.
 */
export function useWorkspace(): Workspace {
  const { data } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });

  if (!data) return NIKXIUS_APP_CONTEXT.workspace;

  return {
    name: data.orgName || NIKXIUS_APP_CONTEXT.workspace.name,
    plan: formatPlan(data.plan ?? ""),
    logoUrl: data.logoUrl ?? undefined,
  };
}

/**
 * The signed-in user. Static Nikxius constant for now — no current-user endpoint
 * exists. Phase 2 swaps the body to Clerk's `useUser()` with no signature change.
 */
export function useCurrentUser(): CurrentUser {
  const { name, role } = NIKXIUS_APP_CONTEXT.user;
  return {
    name,
    role,
    initials: deriveInitials(name),
  };
}
```

2. **Verify:** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   expect no errors referencing `workspace.ts` (the `useGetOrgSettings` import must
   resolve from `@workspace/api-client-react`).

3. **Commit:**
   ```
   git add artifacts/workforce-os/src/lib/workspace.ts
   git commit -m "feat(brand): add useWorkspace/useCurrentUser identity layer

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task B2: Nikxius logo mark + wordmark component

**Files:**
- Create `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/brand/Logo.tsx`

**Mark design (concrete):** an "N"-derived monogram rendered as a rounded-square
"app icon." A `rust-500` rounded square (`rx` corners) holds a single thick stroke
that traces the diagonal of an **N** — bottom-left up to top-left, diagonal down to
bottom-right, up to top-right — drawn in `ink-0` (paper white) with round caps/joins.
`fill`/`stroke` use `currentColor` semantics via CSS vars so the mark reads correctly
in both themes. The mark is square and scales by a single `size` prop.

1. Create the file. Paste verbatim:

```tsx
// /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/brand/Logo.tsx
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Pixel size of the square mark. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Nikxius mark — a rust rounded-square app icon enclosing an "N" monogram stroke
 * drawn in paper white. Square, theme-stable, scales by `size`.
 */
export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Nikxius"
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rounded-square plate */}
      <rect
        width="32"
        height="32"
        rx="8"
        className="fill-rust-500"
      />
      {/* "N" monogram: up the left, diagonal down, up the right */}
      <path
        d="M9 23 V9 L23 23 V9"
        className="stroke-ink-0"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface WordmarkProps {
  /** Pixel size of the mark; the wordmark text scales with it. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Nikxius wordmark — mark + "Nikxius" set in Lora (the app serif, `font-serif`).
 */
export function Wordmark({ size = 28, className }: WordmarkProps) {
  return (
    <div className={cn("flex items-center gap-2.5 min-w-0", className)}>
      <Logo size={size} />
      <span className="font-serif font-semibold tracking-tight text-ink-900 text-lg leading-none truncate">
        Nikxius
      </span>
    </div>
  );
}
```

> Note: `font-serif` is the app's Lora serif (already wired in `index.css` /
> existing Shell uses `font-serif` for the org title). `fill-rust-500`,
> `stroke-ink-0`, `text-ink-900` are CONTRACT tokens.

2. **Verify:** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   no errors in `Logo.tsx`.

3. **Commit:**
   ```
   git add artifacts/workforce-os/src/components/brand/Logo.tsx
   git commit -m "feat(brand): add Nikxius Logo mark + Wordmark

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task B3: Wire Shell to the identity layer + `<Wordmark/>`

**Files:**
- Modify `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/layout/Shell.tsx`
  (imports ~line 13–16; sidebar header ~line 43–46; avatar/user ~line 67–75;
  mobile topbar brand ~line 83)

1. Add the new imports. Find (lines 13–16):

```tsx
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { NotificationBell } from "@/components/v2/NotificationBell";
import { cn } from "@/lib/utils";
```

Replace with:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { NotificationBell } from "@/components/v2/NotificationBell";
import { Logo, Wordmark } from "@/components/brand/Logo";
import { useWorkspace, useCurrentUser } from "@/lib/workspace";
import { cn } from "@/lib/utils";
```

2. Read the workspace + user at the top of the component. Find:

```tsx
export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
```

Replace with:

```tsx
export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const workspace = useWorkspace();
  const user = useCurrentUser();
```

3. Replace the hardcoded sidebar header. Find (lines 43–46):

```tsx
        <div className="p-4 border-b border-paper-200">
          <h1 className="font-serif font-semibold text-ink-900 text-lg tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">Mynoted Private Limited</h1>
          <p className="text-xs text-ink-400 font-mono uppercase">Workspace</p>
        </div>
```

Replace with:

```tsx
        <div className="p-4 border-b border-paper-200">
          <Wordmark />
          <p className="mt-1 text-xs text-ink-400 font-mono uppercase truncate">{workspace.name}</p>
        </div>
```

4. Replace the hardcoded avatar + user block. Find (lines 67–75):

```tsx
        <div className="p-4 border-t border-paper-200 flex items-center gap-3">
          <Avatar className="h-8 w-8 bg-paper-200 border border-paper-200 text-ink-900">
            <AvatarFallback className="font-serif bg-transparent text-ink-900">NS</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900 truncate">Nikhil Sood</p>
            <p className="text-xs text-ink-400 truncate">Owner</p>
          </div>
        </div>
```

Replace with:

```tsx
        <div className="p-4 border-t border-paper-200 flex items-center gap-3">
          <Avatar className="h-8 w-8 bg-paper-200 border border-paper-200 text-ink-900">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback className="font-serif bg-transparent text-ink-900">{user.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900 truncate">{user.name}</p>
            <p className="text-xs text-ink-400 truncate">{user.role}</p>
          </div>
        </div>
```

5. Replace the mobile topbar brand. Find (line 83):

```tsx
            <span className="md:hidden font-serif font-semibold text-ink-900">Mynoted</span>
```

Replace with:

```tsx
            <Logo size={20} className="md:hidden" />
```

6. **Verify (typecheck):** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   no errors. Then **visual:** run
   `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)`,
   navigate to `/today`, Playwright-screenshot the sidebar in **light and dark**.
   Expect: rust mark + "Nikxius" wordmark in the sidebar header, workspace name
   underneath, `NS` avatar + "Nikhil Sood / Owner" in the footer; no "Mynoted"
   anywhere. Compare against the F0 baseline.

7. **Commit:**
   ```
   git add artifacts/workforce-os/src/components/layout/Shell.tsx
   git commit -m "feat(brand): wire Shell to useWorkspace/useCurrentUser + Wordmark

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

> AvatarImage check: shadcn's avatar exports `AvatarImage`. If the local
> `@/components/ui/avatar` does not export it, drop the `AvatarImage` import and the
> `{user.avatarUrl && <AvatarImage .../>}` line (the fallback already renders
> initials and `avatarUrl` is undefined in Phase 1). Verify with
> `grep -n "AvatarImage" artifacts/workforce-os/src/components/ui/avatar.tsx` before editing.

---

### Task B4: Rebrand `index.html` + favicon asset

**Files:**
- Modify `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/index.html` (lines 5–18)
- Modify `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/public/favicon.svg` (replace contents)

1. Replace the `<head>` title + meta + font block. Find (lines 5–18):

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>Workforce OS v2</title>
    <meta name="description" content="Workforce OS v2 — built on Replit. Update this description to reflect the app." />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Workforce OS v2" />
    <meta property="og:description" content="Workforce OS v2 — built on Replit. Update this description to reflect the app." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Workforce OS v2" />
    <meta name="twitter:description" content="Workforce OS v2 — built on Replit. Update this description to reflect the app." />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Replace with:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>Nikxius</title>
    <meta name="description" content="Nikxius — autonomous AI sales agents that source, draft, and route outbound, with a human in the loop on every send." />
    <meta name="theme-color" content="#FF3C00" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Nikxius" />
    <meta property="og:description" content="Autonomous AI sales agents that source, draft, and route outbound — human-approved on every send." />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Nikxius" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Nikxius" />
    <meta name="twitter:description" content="Autonomous AI sales agents that source, draft, and route outbound — human-approved on every send." />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
```

> Lora is added to the Google Fonts request because the Nikxius wordmark and serif
> headlines use `font-serif` = Lora. If `index.css` already imports Lora via
> `@import`, this is harmless duplication; keep it here so the wordmark renders even
> if CSS is slow.

2. Replace the favicon so it matches the in-app mark (rust plate + white "N"
   monogram). Overwrite `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/public/favicon.svg`
   with verbatim:

```html
<svg width="180" height="180" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="8" fill="#FF3C00"/>
  <path d="M9 23 V9 L23 23 V9" stroke="#FBF9F4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

   (`#FF3C00` = rust-500, `#FBF9F4` = paper/ink-0 white — matches the Logo mark.)

3. **Verify:** run
   `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os run dev)`;
   Playwright-navigate to `/`, then `browser_evaluate` `() => document.title` →
   expect `"Nikxius"`. Screenshot the browser tab/favicon if possible; the favicon
   should be a rust square with a white N.

4. **Commit:**
   ```
   git add artifacts/workforce-os/index.html artifacts/workforce-os/public/favicon.svg
   git commit -m "feat(brand): rebrand index.html + favicon to Nikxius

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Task B5: On-brand 404 page (paper/ink/rust, Lora, EmptyState, "Back to Today")

**Files:**
- Modify (full rewrite) `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/not-found.tsx`

Depends on `EmptyState` from Task F0 and `wouter` routing (CONTRACT).

1. Replace the entire file contents verbatim:

```tsx
// /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/not-found.tsx
import { Link } from "wouter";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/states/EmptyState";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-paper-50 px-4">
      <div className="w-full max-w-md text-center">
        <p className="font-serif text-rust-500 text-6xl font-semibold tracking-tight">404</p>
        <EmptyState
          icon={Compass}
          title="This page wandered off"
          description="The link is broken or the page has moved. Nothing's lost — let's get you back to where the work is."
          action={
            <Button asChild className="bg-rust-500 hover:bg-rust-600 text-white">
              <Link href="/today">Back to Today</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
```

> Copy is human and warm (no "Did you forget to add the page to the router?"),
> uses paper/ink/rust tokens, a Lora (`font-serif`) "404" headline, the CONTRACT
> `EmptyState` primitive, and a "Back to Today" CTA. `Button asChild` wraps the
> wouter `<Link>` so the CTA is a real anchor.

2. **Verify (typecheck):** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   no errors. **Visual:** dev server, Playwright-navigate to a bogus route like
   `/nope`, screenshot **light and dark**. Expect: paper background, rust "404",
   compass icon, warm copy, rust "Back to Today" button that routes to `/today`.

3. **Commit:**
   ```
   git add artifacts/workforce-os/src/pages/not-found.tsx
   git commit -m "feat(brand): rewrite 404 on-brand with EmptyState + Back to Today

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

> If `Button` does not support `asChild` in `@/components/ui/button`, replace the
> action with `<Link href="/today"><Button className="bg-rust-500 hover:bg-rust-600 text-white">Back to Today</Button></Link>`.
> Verify with `grep -n "asChild" artifacts/workforce-os/src/components/ui/button.tsx`.

---

### Task B6: Real integration brand SVGs in Settings (replace emoji)

**Files:**
- Create `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/brand/IntegrationLogo.tsx`
- Modify `/Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/pages/Settings.tsx`
  (`PROVIDER_META` lines ~443–455; integrations render ~line 473 and ~line 477)

The current `PROVIDER_META` ships **11** providers with emoji
(`gmail, outlook, linkedin, hubspot, salesforce, slack, clay, apollo, hunter,
fullenrich, webhooks`). I provide real, simple, brand-correct inline SVGs for the
six "real brand logo" providers in the task (Gmail, HubSpot, LinkedIn, Slack,
Outlook, Salesforce) and a clean neutral Lucide-based glyph fallback for the
data/tooling providers (clay, apollo, hunter, fullenrich, webhooks) so no emoji
remains.

1. Create the logo component. It is a single dispatch component keyed by provider
   id, returning real brand marks (with brand colors) and a neutral fallback. Paste
   verbatim:

```tsx
// /Users/nikhil/Downloads/Workforce-OS/artifacts/workforce-os/src/components/brand/IntegrationLogo.tsx
import { Plug } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntegrationLogoProps {
  provider: string;
  /** Pixel size. Default 28. */
  size?: number;
  className?: string;
}

/**
 * Real brand marks for connectable integrations. Brand-colored, simplified inline
 * SVGs (no external asset fetch). Unknown providers fall back to a neutral plug.
 */
export function IntegrationLogo({ provider, size = 28, className }: IntegrationLogoProps) {
  const common = {
    width: size,
    height: size,
    className: cn("shrink-0", className),
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };

  switch (provider) {
    case "gmail":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#fff" d="M40 6H8a4 4 0 0 0-4 4v28a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4V10a4 4 0 0 0-4-4Z" />
          <path fill="#e53935" d="M8 42V14l16 12L40 14v28H8Z" opacity="0" />
          <path fill="#4caf50" d="M4 38V12.5L4 38a4 4 0 0 0 4 4h4V22L4 38Z" />
          <path fill="#1e88e5" d="M44 38V12.5L44 38a4 4 0 0 1-4 4h-4V22l8-9.5Z" />
          <path fill="#e53935" d="M12 42V22l12 9 12-9v20" opacity="0" />
          <path fill="#c62828" d="M4 12.5 24 27 44 12.5V10a4 4 0 0 0-4-4h-.6L24 18 8.6 6H8a4 4 0 0 0-4 4v2.5Z" />
          <path fill="#fbc02d" d="M12 42H8a4 4 0 0 1-4-4V12.5L12 18v24Z" />
          <path fill="#1565c0" d="M36 42h4a4 4 0 0 0 4-4V12.5L36 18v24Z" />
        </svg>
      );
    case "outlook":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#1976d2" d="M28 13h16v22a2 2 0 0 1-2 2H28V13Z" />
          <path fill="#fff" d="M44 17H28v-4h16v4Zm0 6H28v-3h16v3Zm0 6H28v-3h16v3Zm0 5h-16v-2h16v2Z" opacity=".7" />
          <path fill="#0d47a1" d="M4 9 28 5v38L4 39V9Z" />
          <path fill="#fff" d="M16 17.5c-3.6 0-6 2.7-6 6.6s2.3 6.4 5.9 6.4 6-2.6 6-6.6-2.3-6.4-5.9-6.4Zm-.1 10.4c-1.9 0-3-1.6-3-3.9 0-2.4 1.2-3.9 3-3.9s3 1.5 3 3.8c0 2.5-1.1 4-3 4Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <rect width="42" height="42" x="3" y="3" rx="6" fill="#0a66c2" />
          <path fill="#fff" d="M14.4 36V18.7H9.1V36h5.3ZM11.8 16.4a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM38.9 36v-9.5c0-5.1-2.7-7.4-6.4-7.4-3 0-4.3 1.6-5 2.8v-2.4h-5.3c.07 1.5 0 17.2 0 17.2h5.3v-9.6c0-.5 0-1 .15-1.3.4-1 1.3-2 2.8-2 2 0 2.8 1.5 2.8 3.7V36h5.4Z" />
        </svg>
      );
    case "hubspot":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#ff7a59" d="M33 18.6v-4.4a3.4 3.4 0 1 0-3.3 0v4.4a9.6 9.6 0 0 0-4.6 2l-12-9.4a3.8 3.8 0 1 0-1.8 2.4l11.8 9.2a9.5 9.5 0 0 0 .1 10.8l-3.6 3.6a3.1 3.1 0 1 0 1.7 1.8l3.6-3.6a9.6 9.6 0 1 0 8.1-16.8Zm-2.5 14.4a4.9 4.9 0 1 1 0-9.8 4.9 4.9 0 0 1 0 9.8Z" />
        </svg>
      );
    case "salesforce":
      return (
        <svg viewBox="0 0 48 32" {...common}>
          <path fill="#00a1e0" d="M20 7a7 7 0 0 1 11.6-2.4A8.4 8.4 0 0 1 44 12.6a7.6 7.6 0 0 1-3 14.6 7 7 0 0 1-1.4-.1 7.7 7.7 0 0 1-13.4 1.4 8.7 8.7 0 0 1-3.7.8 8.8 8.8 0 0 1-3.9-.9A8.9 8.9 0 1 1 9.6 12a8.7 8.7 0 0 1 1.7.2A7 7 0 0 1 20 7Z" />
        </svg>
      );
    case "slack":
      return (
        <svg viewBox="0 0 48 48" {...common}>
          <path fill="#36c5f0" d="M19 6a3.5 3.5 0 1 0 0 7h3.5V9.5A3.5 3.5 0 0 0 19 6Z" />
          <path fill="#2eb67d" d="M42 19a3.5 3.5 0 1 0-7 0v3.5h3.5A3.5 3.5 0 0 0 42 19Z" />
          <path fill="#ecb22e" d="M29 42a3.5 3.5 0 1 0 0-7h-3.5v3.5A3.5 3.5 0 0 0 29 42Z" />
          <path fill="#e01e5a" d="M6 29a3.5 3.5 0 1 0 7 0v-3.5H9.5A3.5 3.5 0 0 0 6 29Z" />
          <path fill="#36c5f0" d="M16 19a3.5 3.5 0 0 1 3.5-3.5H29a3.5 3.5 0 0 1 0 7h-9.5A3.5 3.5 0 0 1 16 19Z" opacity="0" />
          <path fill="#2eb67d" d="M22.5 16a3.5 3.5 0 0 1 7 0v9.5a3.5 3.5 0 0 1-7 0V16Z" />
          <path fill="#ecb22e" d="M32 29.5a3.5 3.5 0 0 1-3.5 3.5H19a3.5 3.5 0 0 1 0-7h9.5a3.5 3.5 0 0 1 3.5 3.5Z" />
          <path fill="#e01e5a" d="M25.5 32a3.5 3.5 0 0 1-7 0v-9.5a3.5 3.5 0 0 1 7 0V32Z" />
        </svg>
      );
    default:
      return (
        <div
          className={cn(
            "flex items-center justify-center rounded-md bg-paper-200 text-ink-500",
            className
          )}
          style={{ width: size, height: size }}
          aria-hidden
        >
          <Plug style={{ width: size * 0.55, height: size * 0.55 }} />
        </div>
      );
  }
}
```

2. In `Settings.tsx`, import the new component. Find (the lucide import block ends
   around line 30):

```tsx
import { cn } from "@/lib/utils";
```

Replace with:

```tsx
import { IntegrationLogo } from "@/components/brand/IntegrationLogo";
import { cn } from "@/lib/utils";
```

3. Drop `emoji` from `PROVIDER_META` (it is now unused) and keep `name` +
   `description`. Find (lines 443–455):

```tsx
const PROVIDER_META: Record<string, { name: string; emoji: string; description: string }> = {
  gmail:       { name: "Gmail", emoji: "📧", description: "Send outreach and receive replies via Google Workspace." },
  outlook:     { name: "Outlook", emoji: "📬", description: "Microsoft 365 email sending and inbox sync." },
  linkedin:    { name: "LinkedIn", emoji: "💼", description: "Connect for profile enrichment and InMail sequences." },
  hubspot:     { name: "HubSpot", emoji: "🟠", description: "Sync leads, contacts, and deal stages bidirectionally." },
  salesforce:  { name: "Salesforce", emoji: "☁️", description: "Push qualified leads and activities to your CRM." },
  slack:       { name: "Slack", emoji: "🔔", description: "Get approval alerts and notifications in Slack." },
  clay:        { name: "Clay", emoji: "🏺", description: "Pull enriched lead data from Clay tables." },
  apollo:      { name: "Apollo", emoji: "🚀", description: "Source leads from Apollo.io company and contact database." },
  hunter:      { name: "Hunter.io", emoji: "🔍", description: "Verify email addresses before sending." },
  fullenrich:  { name: "Fullenrich", emoji: "⚡", description: "Waterfall email enrichment for harder-to-find contacts." },
  webhooks:    { name: "Webhooks", emoji: "🔗", description: "Send events to any external endpoint via HTTP POST." },
};
```

Replace with:

```tsx
const PROVIDER_META: Record<string, { name: string; description: string }> = {
  gmail:       { name: "Gmail", description: "Send outreach and receive replies via Google Workspace." },
  outlook:     { name: "Outlook", description: "Microsoft 365 email sending and inbox sync." },
  linkedin:    { name: "LinkedIn", description: "Connect for profile enrichment and InMail sequences." },
  hubspot:     { name: "HubSpot", description: "Sync leads, contacts, and deal stages bidirectionally." },
  salesforce:  { name: "Salesforce", description: "Push qualified leads and activities to your CRM." },
  slack:       { name: "Slack", description: "Get approval alerts and notifications in Slack." },
  clay:        { name: "Clay", description: "Pull enriched lead data from Clay tables." },
  apollo:      { name: "Apollo", description: "Source leads from Apollo.io company and contact database." },
  hunter:      { name: "Hunter.io", description: "Verify email addresses before sending." },
  fullenrich:  { name: "Fullenrich", description: "Waterfall email enrichment for harder-to-find contacts." },
  webhooks:    { name: "Webhooks", description: "Send events to any external endpoint via HTTP POST." },
};
```

4. Update the fallback `meta` and the render to use `IntegrationLogo`. Find
   (lines 473 and 477):

```tsx
          const meta = PROVIDER_META[int.provider] ?? { name: int.provider, emoji: "🔌", description: "" };
```

Replace with:

```tsx
          const meta = PROVIDER_META[int.provider] ?? { name: int.provider, description: "" };
```

Then find:

```tsx
              <div className="text-2xl shrink-0 mt-0.5">{meta.emoji}</div>
```

Replace with:

```tsx
              <IntegrationLogo provider={int.provider} size={28} className="mt-0.5" />
```

5. **Verify (typecheck):** `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` →
   no errors (confirms no lingering `emoji` references). **Visual:** dev server,
   Playwright-navigate to `/settings/integrations`, screenshot **light and dark**.
   Expect: real Gmail / Outlook / LinkedIn / HubSpot / Salesforce / Slack marks; the
   data providers (Clay, Apollo, Hunter, Fullenrich, Webhooks) show a neutral plug
   glyph; no emoji remain.

6. **Commit:**
   ```
   git add artifacts/workforce-os/src/components/brand/IntegrationLogo.tsx artifacts/workforce-os/src/pages/Settings.tsx
   git commit -m "feat(brand): replace emoji integration logos with real brand SVGs

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
   ```

---

### Section verification (after B1–B6)

1. `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck)` → clean.
2. `(cd /Users/nikhil/Downloads/Workforce-OS && pnpm run build)` → succeeds.
3. Dev server + Playwright screenshots (light + dark) of `/today` (sidebar identity),
   a bogus route (404), `/settings/integrations` (logos); browser tab title reads
   "Nikxius". No "Mynoted" / "Workforce OS" string survives in chrome, title, or 404.
   `grep -rn "Mynoted\|Workforce OS v2" artifacts/workforce-os/src artifacts/workforce-os/index.html`
   → only acceptable hits are inside seed/sample *data* (e.g. signature placeholder),
   never UI chrome.
