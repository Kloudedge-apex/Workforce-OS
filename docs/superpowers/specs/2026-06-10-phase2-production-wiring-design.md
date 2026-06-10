# Phase 2 — Workforce-OS → Production FE (Clerk auth + real backend, full 42-endpoint parity)

**Status:** design for review (brainstormed 2026-06-10). Supersedes the Phase-1 "mock backend" posture.
**Goal:** make the premium **Workforce-OS** app the real production frontend — Clerk-authenticated, serving **real data on all 42 endpoints**, with the backend gaps the audit found **built**, not faked. No seed/demo data anywhere.
**Audit (source of truth for per-endpoint feasibility):** `docs/superpowers/specs/2026-06-10-phase2-capability-audit.json` (6 domains + auth/access recipe).

---

## 1. Architecture

One container on **Azure Container Apps** (RG `Ledgr-prod`, ACR `ledgracr`), origin `https://workforceos.xyz` (already in apex-gtm-api CORS allow-list, commit `d93c8f2`):

```
Browser ──Clerk session (pk_live_…workforceos.xyz)──▶ [ container: api-server (BFF) ]
                                                         ├─ serves dist/public (premium Vite FE, unchanged)
                                                         └─ /api/* — implements the 42 openapi.yaml endpoints
                                                              │ verifies the Clerk JWT, derives orgId from org_id claim,
                                                              │ then per endpoint either:
                                                              │   • PARTIAL → call apex-gtm-api (Bearer JWT + x-org-id) and/or prod DB, transform to the contract
                                                              │   • GAP     → call NEW apex-gtm-api routes (built in §4) backed by NEW prisma models
                                                              ▼
                                          apex-gtm-api (NestJS, eastus) + apex-prod-db (Postgres)
```

**Why a BFF (not direct FE→apex-gtm-api):** several endpoints are aggregations/transforms with no 1:1 real route (`/today/kpis`, `/activity`), and the FE's generated client is fixed to the openapi.yaml contract. The BFF owns translation + keeps the premium FE and its generated client untouched. (CORS already allows the FE origin, so direct calls are *possible* for 1:1 routes, but the BFF keeps one consistent contract + one auth path.)

**Canonical backend source (CRITICAL):** the real go-live backend is **`~/Desktop/apex-product/apex-product`** (has `apps/api/src/graph` + `outreach`, `OutreachArtifact`/`GraphRun` in `packages/db/prisma/schema.prisma`); prod runs from branch **`release/go-live-2026-06-01`** (apex-gtm-api rev 0000109). The `apps/api` under this Workforce-OS sibling checkout is **legacy** — do NOT build against it. All backend (§4) work targets the release tree; verify live route names against the prod URL via curl, not against `master`/`feat/reply-schema-1`.

---

## 2. Auth (Clerk) — sub-project A

- Add `@clerk/clerk-react` to `artifacts/workforce-os`; `<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>` at the app root (inside/around the existing `ThemeProvider`). Reuse the **existing** live instance: `VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsud29ya2ZvcmNlb3MueHl6JA` (clerk.workforceos.xyz). Add `.env.example` placeholder.
- Sign-in/up + route guards (Wouter): unauthenticated → `<SignIn>`/`<SignUp>`; gate the Shell routes behind `<SignedIn>`. Mirror the workhorse-os flow (canonical reference: `/Users/nikhil/Desktop/workhorse-os`).
- Wire the session token into the FE's existing hook: `custom-fetch.ts` already exposes `setAuthTokenGetter(getter)` and `setBaseUrl(url)`. On mount, `setAuthTokenGetter(() => clerk.session?.getToken())` and `setBaseUrl(VITE_API_URL)` (or leave relative `/api` since the BFF is same-origin). Every request then carries `Authorization: Bearer <jwt>`.
- `useCurrentUser()` (identity hook from B1) swaps its body to Clerk's `useUser()` — **signature unchanged, zero consumer edits**. `useWorkspace()` reads the real `/settings/org`.
- **org context:** the BFF derives `orgId` from the verified Clerk `org_id` claim and forwards `x-org-id` + `Authorization` to apex-gtm-api (its global `OrgScopeGuard` requires `payload.org_id === orgId`). The FE never sends a hardcoded org (the mock's `org_mynoted` is removed).

---

## 3. BFF — evolve `artifacts/api-server` (sub-project B)

The Express api-server already implements all 42 routes against Drizzle-mock. Evolve in place:
1. **Auth middleware:** verify the Clerk RS256 JWT in-process (mirror apex-gtm-api's `verifyClerkToken` / JWKS), extract `org_id` → `req.orgId`. Deny by default if absent. (Same posture as the backend's `OrgScopeGuard`.)
2. **apex-gtm-api client:** a thin server-side client (base `VITE_API_URL`/`API_UPSTREAM_URL`, attaches the caller's Bearer JWT + `x-org-id`).
3. **Per-endpoint:** replace each mock body with the real source from the audit map — **PARTIAL** = call apex-gtm-api/prod-DB + transform to the openapi.yaml response shape; **GAP** = call the new apex-gtm-api route built in §4. The Drizzle mock + seed are deleted at the end (no seed in prod).
4. **Write-path safety:** approve/reject/trigger-outbound preserve the existing **dry-run + fail-closed** defaults; the BFF never widens what apex-gtm-api permits.
5. **Static serving:** add `express.static(dist/public)` + SPA fallback so one container serves FE + `/api`.

The 42 endpoints classify (full detail in the audit JSON):
- **Real-now (PARTIAL/FULL, no schema change):** `/today/kpis` (4 of 6 tiles), `/activity` (synthesized from `EvidenceEvent`), `/artifacts*` (list/pending/get/approve/reject via `OutreachArtifactsService`), `/leads*` (composite of `Person`+`Company`+`LeadScore`; list/detail/trigger), `/runs*`+`/agents` (`GraphService`), `/settings/org` (get/put via `OrgsService`), `/settings/integrations` (+connect/disconnect, FULL), `/settings/icp`, `/settings/team` (read), `/settings/billing`.
- **GAP — need new backend (§4):** all `/notifications*`, most `/conversations*` (no Conversation model), `/artifacts/{id}/suppress`, `/artifacts/bulk-approve`, `/leads/bulk-suppress`, `/settings/org/health` (compliance), `/settings/cadence`, `/settings/style`, `/settings/api-keys*`, `/settings/team/invite`, `/settings/notifications`, plus `/today/kpis` `replyRate7d`+`qualifiedMeetingsBooked` and `/welcome/status`.

---

## 4. Backend extensions for the gaps (sub-project B-backend, in `apex-product/apex-product` on the release branch)

Each gap becomes a real NestJS module + Prisma model + **prod-DB migration** (gated — see §6). New models/routes (org-scoped, `OrgScopeGuard`):
- **Conversations inbox** (largest): `Conversation` + `ConversationMessage` (+ sentiment/replyIntelligence fields) sourced from the Gmail integration (`GmailService.listMessages/getThread`) materialized into a real store; controller for list/get/draft-reply/archive. *This is itself a substantial sub-project; may phase as its own spec.*
- **Notifications:** `Notification` (+ `NotificationPreference`) model; derive feed from `EvidenceEvent`/`GraphRun` + persisted read-state; routes for list/mark-read; `/settings/notifications` prefs.
- **Outreach suppression:** `OutreachSuppression` model + routes for `/artifacts/{id}/suppress`, `/leads/bulk-suppress`; add `bulk-approve` (+ evaluator-threshold gating) to `OutreachArtifactsService`.
- **Settings config:** `CadenceStage`, `StyleConfig` (brand voice), `ApiKey` (multi-key issuance/revoke) models + routes; `Org` compliance fields (`liveSendEnabled`, `postalAddress`, `unsubscribeUrl`) backing `/settings/org/health`; team-invite flow (Clerk invitations).
- **KPI/meetings:** wire `MeetingLedger` query for `qualifiedMeetingsBooked`; `replyRate7d` depends on the Conversations store (inbound replies) — lands with Conversations.
- **Welcome:** `Org.onboardingStep`/`welcomeComplete` (or read the existing `signup/onboarding/complete` side-effects) for `/welcome/status`.

Each new route is verified to exist on the **deployed** apex-gtm-api (curl) before the BFF calls it; until a gap's backend ships, that endpoint returns a structured "not-available-yet" the FE renders as a premium **EmptyState** (never fake data).

---

## 5. Deploy (sub-project D)

Single container (Dockerfile: build FE → `dist/public`, run api-server). `az acr build` → `ledgracr`, `containerapp update` on `Ledgr-prod`, env/secrets (Clerk JWKS/domain, `API_UPSTREAM_URL`, `DATABASE_URL` if BFF queries prod DB directly) via the Container App. Origin `workforceos.xyz` (CORS already allowed). Mirrors the apex-gtm-api ship procedure.

---

## 6. Safety & phasing (non-negotiable — 5 paid pilots are live on apex-gtm-api + apex-prod-db)

- **DB-safety:** every prod-DB migration in §4 follows the established workflow — **dry-run + show the diff + explicit user approval** before applying — applied per-migration, never batched blind. (Captured as a project rule.)
- **Target the release tree** (`release/go-live-2026-06-01`), verify live routes by curl against the prod URL; never assume master/feat shapes.
- **Validate on a non-pilot org first** (a fresh Clerk org), confirm read paths + dry-run writes, before any pilot org touches it.
- **Backend changes are reviewed PRs** into the apex-product release line, deployed via the normal apex-gtm-api pipeline — not hot-patched.

**Phasing (ship value fast without risking prod):**
- **Phase 2a — real-data core + Clerk + BFF, ZERO prod-DB change (fast, parallelizable):** Clerk in FE; BFF for all PARTIAL/FULL endpoints (Today/Outbound/Pipeline/Runs/Agents + org/integrations/team/billing settings); gap endpoints → EmptyState; deploy to Azure. Result: a real, authenticated, production app for the core GTM loop, no schema changes, pilots untouched.
- **Phase 2b — close the gaps (gated, staged):** build the §4 backend models/routes (Conversations inbox likely its own spec) with db-safety migrations; flip each BFF gap endpoint from EmptyState → real as its backend ships.
- **Phase 2c — cutover:** retire workhorse-os once parity + soak are confirmed.

---

## 7. Open items to confirm during planning
- Exact **prod** auth/bootstrap route names (`orgs/me` + `orgs` vs `by-clerk/:clerkId`) via live curl against the release deploy.
- Whether the BFF reaches data via apex-gtm-api only, or also direct prod-DB reads (for aggregations) — prefer apex-gtm-api; direct DB only where no route exists and a new one isn't yet built.
- Conversations: materialize-from-Gmail vs. a new first-class store (sizing its own spec).
