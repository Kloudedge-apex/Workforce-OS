import { Router } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";

const router = Router();

// ─── ICP ──────────────────────────────────────────────────────────────────
//
// Backend ICP lives under leads/ as a COLLECTION (GET/POST /api/leads/icp) with
// different field names; the FE treats it as a singleton. We map the most-recent
// profile on read and create-a-new-profile on "update" (no upstream PUT exists).

/** apex IcpProfile row (Prisma model, GET /api/leads/icp → newest-first list). */
export interface ApexIcpProfile {
  id: string;
  name?: string;
  targetTitles?: string[];
  targetIndustries?: string[];
  targetGeos?: string[];
  minEmployees?: number | null;
  maxEmployees?: number | null;
  techStackSignals?: string[];
  intentKeywords?: string[];
  seedDomains?: string[];
}

export interface IcpProfile {
  industries: string[];
  titles: string[];
  geos: string[];
  sizeBand: string;
  intentSignals: string[];
  seedDomains: string[];
  exclusionDomains: string[];
}

const EMPTY_ICP: IcpProfile = {
  industries: [],
  titles: [],
  geos: [],
  sizeBand: "",
  intentSignals: [],
  seedDomains: [],
  exclusionDomains: [],
};

/** Derive the FE "sizeBand" string from min/max employee bounds. */
function deriveSizeBand(min?: number | null, max?: number | null): string {
  if (min != null && max != null) return `${min}-${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `0-${max}`;
  return "";
}

/**
 * Pure mapper: apex IcpProfile list → FE IcpProfile (singleton = most recent).
 *
 * SYNTHESIZED: exclusionDomains=[] (no backend column). sizeBand is derived from
 * minEmployees/maxEmployees. Empty list → empty-default profile (audit endpoint 3).
 */
export function shapeIcpProfile(profiles: ApexIcpProfile[]): IcpProfile {
  const p = profiles[0];
  if (!p) return { ...EMPTY_ICP };
  return {
    industries: p.targetIndustries ?? [],
    titles: p.targetTitles ?? [],
    geos: p.targetGeos ?? [],
    sizeBand: deriveSizeBand(p.minEmployees, p.maxEmployees),
    intentSignals: p.intentKeywords ?? [],
    seedDomains: p.seedDomains ?? [],
    exclusionDomains: [],
  };
}

/** Parse a FE "200-2000" / "50+" sizeBand into upstream min/max employee bounds. */
function parseSizeBand(sizeBand?: string): { minEmployees?: number; maxEmployees?: number } {
  if (!sizeBand) return {};
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(sizeBand);
  if (m) return { minEmployees: Number(m[1]), maxEmployees: Number(m[2]) };
  const plus = /^(\d+)\s*\+$/.exec(sizeBand);
  if (plus) return { minEmployees: Number(plus[1]) };
  return {};
}

/** Pure mapper: FE IcpProfile input → apex POST /api/leads/icp create body. */
export function toIcpCreateBody(input: Partial<IcpProfile>): {
  name: string;
  targetTitles: string[];
  targetIndustries: string[];
  targetGeos: string[];
  intentKeywords: string[];
  seedDomains: string[];
  minEmployees?: number;
  maxEmployees?: number;
} {
  const { minEmployees, maxEmployees } = parseSizeBand(input.sizeBand);
  return {
    name: "Default ICP",
    targetTitles: input.titles ?? [],
    targetIndustries: input.industries ?? [],
    targetGeos: input.geos ?? [],
    intentKeywords: input.intentSignals ?? [],
    seedDomains: input.seedDomains ?? [],
    ...(minEmployees != null ? { minEmployees } : {}),
    ...(maxEmployees != null ? { maxEmployees } : {}),
  };
}

router.get("/settings/icp", async (req, res, next) => {
  try {
    const profiles = (await apex.get("/leads/icp", { req })) as ApexIcpProfile[];
    res.json(shapeIcpProfile(Array.isArray(profiles) ? profiles : []));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

router.put("/settings/icp", async (req, res, next) => {
  const body = req.body as Partial<IcpProfile>;
  try {
    // No upstream PUT — each save creates a NEW profile; the GET singleton
    // mapper then reads the most-recent (this one) back (audit endpoint 4).
    const created = (await apex.post("/leads/icp", { req }, toIcpCreateBody(body))) as ApexIcpProfile;
    res.json(shapeIcpProfile([created]));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

// ─── Integrations ────────────────────────────────────────────────────────────

/** apex Integration row (Prisma model, GET /api/integrations). */
export interface ApexIntegration {
  id: string;
  provider: string;
  status: "PENDING" | "CONNECTED" | "ERROR" | "REVOKED" | string;
  lastSyncAt?: string | null;
  lastErrorMessage?: string | null;
  createdAt?: string | null;
}

/** apex catalog entry (GET /api/integrations/catalog). */
export interface ApexCatalogEntry {
  provider: string;
  name: string;
  category: string;
  authType: "oauth" | "api_key" | "system" | string;
  status: "available" | "coming_soon" | string;
}

export interface Integration {
  id: string;
  provider: string;
  status: "connected" | "available" | "errored";
  accountEmail: string | null;
  connectedAt: string | null;
  errorMessage: string | null;
}

function mapIntegrationStatus(status: string): "connected" | "available" | "errored" {
  if (status === "CONNECTED") return "connected";
  if (status === "ERROR" || status === "REVOKED") return "errored";
  return "available"; // PENDING / anything else
}

/** Pure mapper: a single apex Integration row → FE Integration. */
export function shapeIntegration(i: ApexIntegration): Integration {
  return {
    id: i.id,
    provider: i.provider,
    status: mapIntegrationStatus(i.status),
    accountEmail: null, // never expose decrypted credentials
    connectedAt: i.lastSyncAt ?? i.createdAt ?? null,
    errorMessage: i.lastErrorMessage ?? null,
  };
}

/**
 * Pure mapper: apex Integration rows + catalog → FE Integration[].
 *
 * Left-joins the catalog so every known provider appears: connected rows map to
 * their real status; un-connected catalog providers surface as 'available' with
 * a synthetic `cat_<provider>` id (audit endpoint 5). accountEmail is always null
 * (no backend column; credentials are encrypted and must not be exposed).
 */
export function shapeIntegrations(
  rows: ApexIntegration[],
  catalog: ApexCatalogEntry[] = [],
): Integration[] {
  const byProvider = new Map<string, ApexIntegration>();
  for (const r of rows) byProvider.set(r.provider, r);

  const out: Integration[] = [];
  const seen = new Set<string>();
  for (const c of catalog) {
    seen.add(c.provider);
    const row = byProvider.get(c.provider);
    if (row) {
      out.push(shapeIntegration(row));
    } else {
      out.push({
        id: `cat_${c.provider}`,
        provider: c.provider,
        status: "available",
        accountEmail: null,
        connectedAt: null,
        errorMessage: null,
      });
    }
  }
  // Connected rows for providers not in the catalog still surface.
  for (const r of rows) {
    if (!seen.has(r.provider)) out.push(shapeIntegration(r));
  }
  return out;
}

router.get("/settings/integrations", async (req, res, next) => {
  try {
    const [rows, catalog] = await Promise.all([
      apex.get("/integrations", { req }) as Promise<ApexIntegration[]>,
      apex.get("/integrations/catalog", { req }) as Promise<ApexCatalogEntry[]>,
    ]);
    res.json(
      shapeIntegrations(
        Array.isArray(rows) ? rows : [],
        Array.isArray(catalog) ? catalog : [],
      ),
    );
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

router.post("/settings/integrations/:provider/connect", async (req, res, next) => {
  const { provider } = req.params;
  const body = req.body as { apiKey?: string };
  try {
    // api-key providers (apollo/clay/elevenlabs) connect synchronously and return
    // the upserted Integration row. OAuth providers (gmail/outlook/hubspot) need a
    // redirect+callback dance the FE drives via /:provider/auth-url, so a synchronous
    // "connect returns a connected Integration" is only FULL for api-key providers
    // (audit endpoint 6).
    const row = (await apex.post(
      `/integrations/${provider}/connect`,
      { req },
      { apiKey: body.apiKey ?? "" },
    )) as ApexIntegration;
    res.json(shapeIntegration(row));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

router.post("/settings/integrations/:provider/disconnect", async (req, res, next) => {
  const { provider } = req.params;
  try {
    // Upstream hard-deletes the row and returns it; the integration no longer
    // exists, so force status='available' for the FE (audit endpoint 7, FULL).
    const row = (await apex.post(
      `/integrations/${provider}/disconnect`,
      { req },
    )) as ApexIntegration;
    res.json({ ...shapeIntegration(row), status: "available", connectedAt: null, errorMessage: null });
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

// ─── Cadence (GAP) ────────────────────────────────────────────────────────────
// No cadence model/route upstream; follow-up timing lives inside WorkflowTemplate
// config + graph code (audit endpoints 8-9). Degrade honestly rather than serve a
// fake editable cadence that won't persist.

router.get("/settings/cadence", (_req, res) => gapResponse(res, "cadence"));
router.put("/settings/cadence", (_req, res) => gapResponse(res, "cadence"));

// ─── Style (GAP) ──────────────────────────────────────────────────────────────
// No style/brand-voice model/route upstream; voice lives in Agent/WorkflowTemplate
// config (audit endpoints 10-11).

router.get("/settings/style", (_req, res) => gapResponse(res, "style"));
router.put("/settings/style", (_req, res) => gapResponse(res, "style"));

// ─── Team ──────────────────────────────────────────────────────────────────
//
// No first-class team route upstream; the member list is derivable from the org's
// User rows. GET /api/orgs/:id (OrgsService.findOne) includes { users }, while
// /orgs/me does NOT — so resolve the org id via /orgs/me, then read /orgs/:id.users.

/** apex User row (Org.users include). */
export interface ApexUser {
  id: string;
  email: string;
  name?: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER" | string;
  createdAt?: string | null;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  status: string;
  invitedAt: string;
  joinedAt: string | null;
}

/**
 * Pure mapper: apex User rows → FE TeamMember[].
 *
 * SYNTHESIZED: status='active' (no invite-pending concept upstream); invitedAt and
 * joinedAt both = createdAt (no separate timestamps). apiKey/passwordHash are never
 * read here (audit endpoint 12). role passes through (already OWNER/ADMIN/MEMBER).
 */
export function shapeTeamMembers(users: ApexUser[]): TeamMember[] {
  return users.map((u) => {
    const ts = u.createdAt ?? new Date(0).toISOString();
    const role = (["OWNER", "ADMIN", "MEMBER"].includes(u.role) ? u.role : "MEMBER") as
      | "OWNER"
      | "ADMIN"
      | "MEMBER";
    return {
      id: u.id,
      email: u.email,
      name: u.name ?? "",
      role,
      status: "active",
      invitedAt: ts,
      joinedAt: ts,
    };
  });
}

router.get("/settings/team", async (req, res, next) => {
  try {
    const me = (await apex.get("/orgs/me", { req })) as { id: string };
    const org = (await apex.get(`/orgs/${me.id}`, { req })) as { users?: ApexUser[] };
    res.json(shapeTeamMembers(Array.isArray(org.users) ? org.users : []));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

// ─── Team invite / remove (GAP) ─────────────────────────────────────────────
// Membership is a Clerk concern (no invite/remove route in apex-gtm-api); only
// whole-org deletion exists. Inviting/removing would require calling Clerk's
// backend API directly, not this NestJS API (audit endpoints 13-14).

router.post("/settings/team/invite", (_req, res) => gapResponse(res, "team-invite"));
router.delete("/settings/team/:userId", (_req, res) => gapResponse(res, "team-remove"));

// ─── Billing ──────────────────────────────────────────────────────────────
//
// Only `plan` is real (GET /api/billing returns { plan, subscription:Razorpay|null }).
// Usage/credits/seats/invoices have no backend source, so they are synthesized from
// a static per-plan limits table + the org's user count (audit endpoint 15).

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  downloadUrl: string;
}

export interface BillingInfo {
  plan: string;
  creditsRemaining: number;
  creditsTotal: number;
  sendsThisMonth: number;
  sendsLimit: number;
  seats: number;
  seatsLimit: number;
  invoices: Invoice[];
}

const PLAN_LIMITS: Record<string, { creditsTotal: number; sendsLimit: number; seatsLimit: number }> = {
  TRIAL: { creditsTotal: 100, sendsLimit: 100, seatsLimit: 3 },
  STARTER: { creditsTotal: 1000, sendsLimit: 500, seatsLimit: 5 },
  GROWTH: { creditsTotal: 5000, sendsLimit: 5000, seatsLimit: 20 },
  ENTERPRISE: { creditsTotal: 50000, sendsLimit: 50000, seatsLimit: 100 },
};

/**
 * Pure mapper: apex billing { plan } + org seat count → FE BillingInfo.
 *
 * SYNTHESIZED (no backend source): creditsTotal/sendsLimit/seatsLimit from a static
 * per-plan table; creditsRemaining defaults to creditsTotal; sendsThisMonth=0 (no
 * usage count endpoint); invoices=[] (no invoice listing). seats = caller-supplied
 * user count (audit endpoint 15).
 */
export function shapeBilling(billing: { plan?: string }, seats = 0): BillingInfo {
  const plan = billing.plan ?? "TRIAL";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS["TRIAL"]!;
  return {
    plan,
    creditsRemaining: limits.creditsTotal,
    creditsTotal: limits.creditsTotal,
    sendsThisMonth: 0,
    sendsLimit: limits.sendsLimit,
    seats,
    seatsLimit: limits.seatsLimit,
    invoices: [],
  };
}

router.get("/settings/billing", async (req, res, next) => {
  try {
    const me = (await apex.get("/orgs/me", { req })) as { id: string };
    const [billing, org] = await Promise.all([
      apex.get("/billing", { req }) as Promise<{ plan?: string }>,
      apex.get(`/orgs/${me.id}`, { req }) as Promise<{ users?: ApexUser[] }>,
    ]);
    const seats = Array.isArray(org.users) ? org.users.length : 0;
    res.json(shapeBilling(billing, seats));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

// ─── API Keys (GAP) ─────────────────────────────────────────────────────────
// No ApiKey model/management routes upstream — only a single User.apiKey column
// with no name/prefix/lastUsedAt and no multi-key support (audit endpoints 16-18).

router.get("/settings/api-keys", (_req, res) => gapResponse(res, "api-keys"));
router.post("/settings/api-keys", (_req, res) => gapResponse(res, "api-keys"));
router.delete("/settings/api-keys/:id", (_req, res) => gapResponse(res, "api-keys"));

// ─── Notification Prefs (GAP) ────────────────────────────────────────────────
// No NotificationPref model/route upstream (audit endpoints 19-20).

router.get("/settings/notifications", (_req, res) => gapResponse(res, "notification-prefs"));
router.put("/settings/notifications", (_req, res) => gapResponse(res, "notification-prefs"));

export default router;
