# Workforce OS v2

AI workforce platform that runs autonomous agents (Sales Development, Content, Operations) on a customer's behalf — with a human-in-the-loop approval queue at the center.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at /api)
- `pnpm --filter @workspace/workforce-os run dev` — run the frontend (served at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter routing + TanStack Query + Radix UI + Tailwind v4
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Fonts: Lora (serif headlines) + Inter (sans body)

## Where things live

- `lib/api-spec/openapi.yaml` — Single source of truth for all API contracts
- `lib/db/src/schema/index.ts` — All Drizzle table definitions
- `artifacts/api-server/src/routes/` — Express route handlers (one file per domain)
- `artifacts/workforce-os/src/` — React frontend
  - `src/index.css` — Design tokens (paper/ink/rust/ember palette)
  - `src/App.tsx` — Router setup + shell layout
  - `src/components/v2/` — The 6 core components (ApprovalCard, AgentActivityStream, LeadCard, ConversationThread, PolicyBadge, EvidenceTimeline)
  - `src/pages/` — Today, Pipeline, Outbound, Conversations, Settings

## Architecture decisions

- Demo org hardcoded as `org_demo` — multi-tenancy is auth-gated in production (Clerk not yet wired in v2 build)
- API routes are mounted at `/api` by Express middleware, so route handlers use paths without `/api` prefix (e.g., `/artifacts/pending` not `/api/artifacts/pending`)
- All 15 v1 dashboard routes consolidated into 5 jobs: Today · Pipeline · Outbound · Conversations · Settings
- Paper+ink color system: warm off-white backgrounds, near-black text, rust/ember for signals. No blue, no gradients.
- Polling cadence: activity at 5s, KPIs at 15s, pending artifacts at 8s

## Product

Workforce OS v2 is an AI workforce platform for 50-500 person B2B companies. Founders, heads of growth, and RevOps leads use it to:
- **Review and approve** AI-drafted outbound messages before they send
- **Monitor agent activity** in a live evidence-event feed
- **Manage pipeline** — view, filter, score, and trigger outbound for leads
- **Handle conversations** — inbox with AI-powered reply intelligence and sentiment analysis
- **Configure compliance** — suppression list, postal address, allowlisted domains, live-send policy

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing DB schema, run `pnpm --filter @workspace/db run push` then `pnpm run typecheck:libs` before restarting api-server
- Route handlers must NOT include the `/api` prefix — the Express app already mounts them at `/api`
- After codegen changes, do not read generated files — they are large. Grep for export names instead.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Demo data seed is baked into the DB — org_demo org with 6 leads, 5 artifacts (3 pending), 10 activity events, 4 conversations
