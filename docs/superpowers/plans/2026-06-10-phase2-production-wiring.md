# Phase 2 — Workforce-OS Production Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are grouped under `### Task <ID>` — prefixes: **A** auth, **F** BFF-foundation, **R** BFF-endpoint (real/partial), **D** deploy, **X** Phase-2b discovery, **G** Phase-2b gap (backend model+migration+route+BFF-flip).

**Goal:** Make the premium Workforce-OS app the real production frontend — Clerk-authenticated, serving real data on all 42 endpoints (building the ~18 backend gaps), deployed to Azure Container Apps at `workforceos.xyz`.

**Architecture:** One container's Express **api-server becomes a BFF**: it serves the built Vite FE (`dist/public`) and `/api/*`, verifies the Clerk JWT (deriving `orgId` from the `org_id` claim), and calls **apex-gtm-api** (`Bearer JWT` + `x-org-id`) / the prod DB, transforming responses to the fixed `lib/api-spec/openapi.yaml` contract. The premium FE + its orval-generated client are untouched. Backend gaps are built in the real backend repo (`~/Desktop/apex-product/apex-product`, branch `release/go-live-2026-06-01`).

**Tech Stack:** FE: React 18 + Vite + Wouter + TanStack Query + `@clerk/clerk-react`. BFF: Express (`artifacts/api-server`) + `jose` (JWKS JWT verify) + `undici`/fetch. Backend: NestJS + Prisma (apex-gtm-api). Tests: vitest (BFF unit + contract), the FE's existing vitest. Deploy: Docker → ACR `ledgracr` → Container Apps `Ledgr-prod`.

**Source-of-truth references (read these; do NOT re-derive shapes):**
- Contract (exact request/response of all 42 endpoints + entity schemas): `lib/api-spec/openapi.yaml`
- Per-endpoint feasibility + real source + transform: `docs/superpowers/specs/2026-06-10-phase2-capability-audit.json`
- Design: `docs/superpowers/specs/2026-06-10-phase2-production-wiring-design.md`
- Auth recipe + prod URL: the audit JSON `access` block; canonical FE reference `/Users/nikhil/Desktop/workhorse-os`.

**Canonical constants:**
- Clerk publishable key (reuse live instance): `VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsud29ya2ZvcmNlb3MueHl6JA`
- apex-gtm-api prod base: `https://apex-gtm-api.ashysmoke-fd2f7a7f.eastus.azurecontainerapps.io` (global `/api` prefix)
- Backend auth: global `OrgScopeGuard` requires `Authorization: Bearer <Clerk RS256 JWT>` **and** `x-org-id` where `jwt.org_id === orgId`.

**Verify gate (every task unless noted):** `cd /Users/nikhil/Downloads/Workforce-OS && pnpm run typecheck` (exit 0) + the task's vitest. BFF build: `pnpm --filter @workspace/api-server run build`. FE build: `PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run build`. **Commit after every task** (conventional commits + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer).

**Safety (5 paid pilots live on apex-prod-db):** Phase-2b prod-DB migrations follow the DB-safety rule — dry-run + show diff + **explicit user approval** before applying, per migration. Validate every flow on a **fresh non-pilot Clerk org** before any pilot org. Backend changes ship as reviewed PRs via the normal apex-gtm-api pipeline.

---

# PHASE 2a — Real-data core + Clerk + BFF + deploy (ZERO prod-DB change)

This phase makes the app a real authenticated production product for the GTM core (Today / Outbound / Pipeline / Runs / Agents + org/integrations/team/billing settings). Gap endpoints return a typed `{ unavailable: true }` the FE renders as a premium EmptyState. No schema changes; pilots untouched.

## §A — Clerk auth (FE)

### Task A1: Install Clerk + env scaffolding

**Files:**
- Modify: `artifacts/workforce-os/package.json` (add `@clerk/clerk-react`)
- Create: `artifacts/workforce-os/.env.example`
- Modify: `artifacts/workforce-os/vite.config.ts` (no change to proxy; confirm `import.meta.env` passthrough)

- [ ] **Step 1:** Add the dep: `cd /Users/nikhil/Downloads/Workforce-OS && pnpm --filter @workspace/workforce-os add @clerk/clerk-react@^5`
- [ ] **Step 2:** Create `.env.example` with:
```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsud29ya2ZvcmNlb3MueHl6JA
# BFF is same-origin in prod; leave VITE_API_URL unset to use relative /api, or set to the apex-gtm-api URL for direct mode.
VITE_API_URL=
```
- [ ] **Step 3:** Verify: `pnpm run typecheck` exit 0.
- [ ] **Step 4:** Commit: `feat(auth): add @clerk/clerk-react dep + env scaffolding`

### Task A2: Mount ClerkProvider + auth gating in App.tsx

**Files:**
- Modify: `artifacts/workforce-os/src/App.tsx`
- Create: `artifacts/workforce-os/src/pages/SignIn.tsx`

- [ ] **Step 1:** Create `SignIn.tsx` rendering Clerk's `<SignIn routing="hash" />` centered on a `bg-paper-50` page with the `<Logo/>` mark (reuse `@/components/brand/Logo`).
- [ ] **Step 2:** In `App.tsx`, import `{ ClerkProvider }` from `@clerk/clerk-react` and wrap the existing tree (outermost, around `ThemeProvider`) with `<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>`. Inside the router, wrap the authed Shell routes with `<SignedIn>...</SignedIn>` and add `<SignedOut><SignIn/></SignedOut>` (import `SignedIn`/`SignedOut` from `@clerk/clerk-react`). Keep the `/sign-in/*` route public.
- [ ] **Step 3:** Verify typecheck + `PORT=21792 BASE_PATH=/ pnpm --filter @workspace/workforce-os run build` exit 0.
- [ ] **Step 4:** Commit: `feat(auth): mount ClerkProvider + SignedIn/SignedOut gating`

### Task A3: Wire the Clerk session token into the API client

**Files:**
- Create: `artifacts/workforce-os/src/lib/api-auth.tsx` (a `<ApiAuthBridge/>` component)
- Modify: `artifacts/workforce-os/src/App.tsx` (mount the bridge inside ClerkProvider)
- Modify: `artifacts/workforce-os/src/lib/workspace.ts` (swap `useCurrentUser` to Clerk `useUser`)

- [ ] **Step 1: Write the failing test** `artifacts/workforce-os/src/lib/workspace.test.ts` asserting `useCurrentUser`'s exported type still has `{ name; role; initials; avatarUrl? }` (a compile/shape test via a typed object) — see openapi/CurrentUser shape. (Vitest, node env.)
- [ ] **Step 2:** Run it; expect fail.
- [ ] **Step 3:** Create `api-auth.tsx`: a component that calls `useAuth()`/`useUser()` from Clerk and on mount calls `setAuthTokenGetter(() => getToken())` and (if `VITE_API_URL`) `setBaseUrl(import.meta.env.VITE_API_URL)` from `@workspace/api-client-react` (the `custom-fetch.ts` exports). Renders `null`.
- [ ] **Step 4:** In `workspace.ts`, change `useCurrentUser` body to read Clerk's `useUser()` (`user.fullName`→name, `user.publicMetadata.role`→role, derive initials, `user.imageUrl`→avatarUrl) — **signature unchanged**. Keep the static fallback when `!user`.
- [ ] **Step 5:** Mount `<ApiAuthBridge/>` in `App.tsx` directly under `ClerkProvider`.
- [ ] **Step 6:** Run the test + typecheck; expect pass.
- [ ] **Step 7:** Commit: `feat(auth): attach Clerk session token to API client + Clerk-sourced useCurrentUser`

## §F — BFF foundation (api-server)

### Task F1: Clerk JWT verification middleware

**Files:**
- Create: `artifacts/api-server/src/middleware/clerk-auth.ts`
- Create: `artifacts/api-server/src/middleware/clerk-auth.test.ts`
- Modify: `artifacts/api-server/src/app.ts` (mount middleware on `/api`)
- Modify: `artifacts/api-server/package.json` (add `jose`)

- [ ] **Step 1: Write the failing test** verifying: a request with no `Authorization` → 401; a request with a token whose `org_id` is present sets `req.orgId` and `req.clerkUserId`. Mock JWKS verification (inject a fake verifier). Assert deny-by-default.
- [ ] **Step 2:** Run; expect fail.
- [ ] **Step 3:** Implement: add `jose`; `createRemoteJWKSet(new URL(process.env.CLERK_JWKS_URL))`; `jwtVerify`; require `payload.org_id`; set `req.orgId = payload.org_id`, `req.clerkUserId = payload.sub`, `req.clerkToken = raw`. Mirror apex-gtm-api's `verifyClerkToken`. Export a `requireClerkAuth` Express middleware; a `DEV_TRUST_X_ORG_ID` env fallback for local (reads `x-org-id`, no verify) — **off in prod**.
- [ ] **Step 4:** Mount on the `/api` router before route handlers in `app.ts`.
- [ ] **Step 5:** Run test + `pnpm --filter @workspace/api-server run typecheck`; expect pass.
- [ ] **Step 6:** Commit: `feat(bff): Clerk JWT verification middleware (deny-by-default, org from claim)`

### Task F2: apex-gtm-api upstream client

**Files:**
- Create: `artifacts/api-server/src/upstream/apex-client.ts`
- Create: `artifacts/api-server/src/upstream/apex-client.test.ts`

- [ ] **Step 1: Write the failing test** asserting `apex.get('/leads/people', { req })` issues a fetch to `${API_UPSTREAM_URL}/api/leads/people` with headers `Authorization: Bearer <req.clerkToken>` and `x-org-id: <req.orgId>`, and throws a typed `UpstreamError` on non-2xx. (Mock global fetch.)
- [ ] **Step 2:** Run; expect fail.
- [ ] **Step 3:** Implement an `apex` client (`get/post/patch/delete`) that injects the two headers from the request context, prefixes `API_UPSTREAM_URL` + `/api`, parses JSON, maps non-2xx to `UpstreamError{status,body}`.
- [ ] **Step 4:** Run test + typecheck; expect pass.
- [ ] **Step 5:** Commit: `feat(bff): apex-gtm-api upstream client (forwards Clerk JWT + x-org-id)`

### Task F3: Remove mock org + static FE serving + "unavailable" helper

**Files:**
- Modify: `artifacts/api-server/src/app.ts` (serve `dist/public` + SPA fallback)
- Create: `artifacts/api-server/src/lib/unavailable.ts` (typed gap response)
- Modify: routes to read `req.orgId` instead of the hardcoded `ORG_ID="org_mynoted"`

- [ ] **Step 1:** Create `unavailable.ts` exporting `gapResponse(res, feature)` → `200 { unavailable: true, feature }` (the FE maps this to EmptyState; never 500). Add a matching optional field to the openapi component if needed (additive, non-breaking).
- [ ] **Step 2:** In `app.ts`, after `/api`, add `express.static(path.resolve('../workforce-os/dist/public'))` + a `* → index.html` SPA fallback (prod only).
- [ ] **Step 3:** Grep-replace the hardcoded `ORG_ID`/`org_mynoted` usages to `req.orgId` across `artifacts/api-server/src`.
- [ ] **Step 4:** Verify typecheck + BFF build.
- [ ] **Step 5:** Commit: `feat(bff): serve built FE + gapResponse helper + org from auth context`

## §R — BFF endpoints: real/partial data (per audit map)

> Each task: write a contract test (BFF returns the openapi.yaml shape for that endpoint given a mocked upstream), implement the transform per the audit JSON's `real_source`+`transform`, run, commit. Use the audit JSON as the field-level spec; preserve dry-run on writes. Org always from `req.orgId`.

### Task R1: Outbound / approval queue — `/artifacts*`
Implement `/artifacts/pending`, `/artifacts`, `/artifacts/{id}`, `POST approve`, `POST reject` against `OutreachArtifactsService` routes (`GET/POST /api/outreach-artifacts...`). `/artifacts/{id}/suppress` + `/artifacts/bulk-approve` → `gapResponse` for now (built in §G). Steps: contract test per endpoint (mock upstream) → transform `OutreachArtifact`→openapi `Artifact` → run → commit. Preserve approve/reject dry-run semantics from the upstream.

### Task R2: Pipeline — `/leads*`
`/leads` + `/leads/{id}` assemble `Person`+`Company`+`LeadScore` from `GET /api/leads/people[/:id]`; synthesize the contract's `score/stage/cohort/intentSignals/emailStatus` per the audit transform (document each synthesized field). `/leads/{id}/trigger-outbound` → upstream run-trigger; `/leads/bulk-suppress` → `gapResponse`. Contract test each.

### Task R3: Runs + Agents — `/runs*`, `/agents`
Map to `GraphService` (`GET /api/graph-runs`, `POST /api/graph-runs`, `GET /api/graph-runs/:id`) — note these live on the **release** backend; verify route names by live curl in Task X0. `/agents` assembles from `AgentsService.findAll`. Contract test; transform `GraphRun`→openapi `Run`.

### Task R4: Today dashboard — `/today/kpis`, `/activity`
`/today/kpis`: compute the 4 real tiles (`artifactsPending`, `artifactsSentToday`, `leadsSourcedToday`, `leadsScored`) by parallel upstream calls; set `replyRate7d` + `qualifiedMeetingsBooked` to `0`/`null` (built in §G). `/activity`: read `EvidenceEvent`, synthesize `agentName/agentType/action/stage` via a kind→display lookup table (per audit). Contract test the exact 6 keys + the ActivityEvent shape.

### Task R5: Settings (real subset) — org / integrations / team / billing
`/settings/org` (get/put → `OrgsService`), `/settings/integrations` (+connect/disconnect → `IntegrationsService`, the 2 FULL endpoints), `/settings/team` (read → `User`), `/settings/billing` (→ `BillingService`), `/settings/icp` (read/write → `IcpProfile`). The remaining settings tabs (`org/health`, `cadence`, `style`, `api-keys`, `team/invite`, `notifications`) → `gapResponse`. Contract test each real one.

### Task R6: Conversations + Notifications + Welcome → gap responses (interim)
All `/conversations*` (except draft-reply which proxies a run-trigger), all `/notifications*`, `/welcome/status` → `gapResponse` (built in §G). FE renders EmptyStates. Add a contract test asserting these return `{ unavailable: true }` (so the FE path is exercised).

## §D — Deploy (Azure Container Apps)

### Task D1: Dockerfile (FE build + BFF runtime)
**Files:** Create `artifacts/api-server/Dockerfile` (or repo-root) — multi-stage: build FE (`PORT BASE_PATH` set) → copy `dist/public` → build BFF → run `node dist/index.mjs` on `API_PORT`. Local smoke: `docker build` + run with test env, curl `/healthz` + `/` (FE) + an authed `/api/...` (with a dev token). Commit.

### Task D2: Ship to Container Apps
**Files:** none (ops). `az acr build -r ledgracr ...`; `az containerapp update` on RG `Ledgr-prod` with env/secrets (`CLERK_JWKS_URL`, `CLERK_DOMAIN`, `API_UPSTREAM_URL`, `DEV_TRUST_X_ORG_ID=false`). Confirm origin `workforceos.xyz` resolves + Clerk sign-in + a real authed read on a **non-pilot** org. Document the rev. (No git change; record in handoff.)

---

# PHASE 2b — Close the ~18 gaps (gated, in the real backend repo)

Targets `~/Desktop/apex-product/apex-product` on `release/go-live-2026-06-01`. Each gap = new Prisma model(s) (fields **defined by `openapi.yaml`'s component schema** for that entity) + migration (DB-SAFETY GATED) + NestJS module/routes (org-scoped via `OrgScopeGuard`) + flip the BFF endpoint from `gapResponse` to real + a contract test. New routes are confirmed live by curl before the BFF flip.

### Task X0: Release-backend setup + live-route audit (do FIRST)

**Files:** none (discovery).
- [ ] **Step 1:** In `~/Desktop/apex-product/apex-product`: `git fetch && git worktree add /private/tmp/apex-release release/go-live-2026-06-01` (or checkout). Confirm `apps/api/src/graph` + `outreach` present and read the **real** `packages/db/prisma/schema.prisma`.
- [ ] **Step 2:** Live-curl the prod API for the route names the BFF depends on (auth/bootstrap `orgs/me` vs `by-clerk/:clerkId`; `outreach-artifacts`, `graph-runs`, `leads/people`, `integrations`, `billing`) using a real Clerk token + `x-org-id` for a non-pilot org. Record the exact route names + response shapes.
- [ ] **Step 3:** Write `docs/superpowers/specs/phase2b-release-backend-notes.md` capturing the real schema models/enums + confirmed routes. This grounds every §G task. Commit (in Workforce-OS docs).

### Task G1: Conversations inbox (largest — own module)
New `Conversation` + `ConversationMessage` models (fields from openapi `Conversation`/`ConversationMessage`/`replyIntelligence` schemas) materialized from `GmailService.listMessages/getThread`; `ConversationsController` (list/get/draft-reply/archive); migration (GATED). Flip BFF R6 conversations endpoints → real. Per-step TDD authored against the X0 notes. *If sizing warrants, split into its own spec/plan.*

### Task G2: Notifications
`Notification` + `NotificationPreference` models (fields from openapi `Notification`/`NotificationList`/notif-prefs schemas); feed derived from `EvidenceEvent`/`GraphRun` + persisted read-state; routes list/mark-read + `/settings/notifications`. Migration GATED. Flip BFF.

### Task G3: Outreach suppression + bulk
`OutreachSuppression` model; routes for `/artifacts/{id}/suppress`, `/leads/bulk-suppress`; add `bulk-approve` (evaluator-threshold gating per the mock's logic) to `OutreachArtifactsService`. Migration GATED. Flip BFF R1/R2 gap endpoints.

### Task G4: Settings config — cadence / brand-voice / api-keys / compliance / team-invite
`CadenceStage`, `StyleConfig`, `ApiKey` models + `Org` compliance fields (`liveSendEnabled`/`postalAddress`/`unsubscribeUrl`) backing `/settings/org/health`; team-invite via Clerk Invitations. Routes per openapi settings schemas. Migration GATED. Flip BFF R5 gap tabs.

### Task G5: KPI completeness + welcome
Wire `MeetingLedger` query → `qualifiedMeetingsBooked`; `replyRate7d` from the G1 Conversations store; `Org.onboardingStep`/welcome flags (or read existing onboarding side-effects) → `/welcome/status`. Flip BFF R4/R6 remaining fields. Migration GATED (if Org fields added).

### Task G6: Cutover
After parity + soak on non-pilot org, migrate pilots, retire workhorse-os (DNS/route), update `[[workhorse-os-is-canonical-frontend]]` memory.

---

## Self-review notes
- **Spec coverage:** §A↔auth; §F+§R↔BFF/real endpoints; §G↔the 18 gaps; §D↔deploy; safety/phasing↔headers. All spec sections mapped.
- **Grounding:** §R/§G field shapes are defined by `openapi.yaml` + the audit JSON (cited, not inlined, to avoid 42×duplication); X0 grounds §G against the real release schema before any model/migration is written.
- **No silent prod risk:** every §G migration is DB-SAFETY GATED; route names confirmed by live curl (X0) before BFF flips.
