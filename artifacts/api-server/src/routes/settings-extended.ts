import { Router } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";
import { upstreamErrorMessage } from "./settings";

const router = Router();

// ─── ICP ──────────────────────────────────────────────────────────────────
//
// Backend exposes the historical collection for reads plus a tenant-scoped
// current-profile upsert. The FE deliberately edits only that current ICP.

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
  /** Not yet a Prisma column on every deployed backend — read tolerantly. */
  exclusionDomains?: string[];
}

export interface IcpProfile {
  industries: string[];
  titles: string[];
  geos: string[];
  sizeBand: string;
  techStackSignals: string[];
  intentSignals: string[];
  seedDomains: string[];
  exclusionDomains: string[];
}

const EMPTY_ICP: IcpProfile = {
  industries: [],
  titles: [],
  geos: [],
  sizeBand: "",
  techStackSignals: [],
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
 * exclusionDomains maps from the upstream row when present; backends that
 * don't persist the column yet return rows without it → [] (HONEST: the FE
 * sees exactly what is stored, so a save that silently dropped exclusions
 * reads back empty instead of echoing the user's input). sizeBand is derived
 * from minEmployees/maxEmployees. Empty list → empty-default profile (audit
 * endpoint 3).
 */
export function shapeIcpProfile(profiles: ApexIcpProfile[]): IcpProfile {
  const p = profiles[0];
  if (!p) return { ...EMPTY_ICP };
  return {
    industries: p.targetIndustries ?? [],
    titles: p.targetTitles ?? [],
    geos: p.targetGeos ?? [],
    sizeBand: deriveSizeBand(p.minEmployees, p.maxEmployees),
    techStackSignals: p.techStackSignals ?? [],
    intentSignals: p.intentKeywords ?? [],
    seedDomains: p.seedDomains ?? [],
    exclusionDomains: Array.isArray(p.exclusionDomains) ? p.exclusionDomains : [],
  };
}

/** Parse a FE "200-2000" / "50+" sizeBand into upstream min/max employee bounds. */
class IcpInputError extends Error {}

function parseSizeBand(sizeBand?: string): { minEmployees: number | null; maxEmployees: number | null } {
  const trimmed = sizeBand?.trim() ?? "";
  if (!trimmed) return { minEmployees: null, maxEmployees: null };
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
  if (m) {
    const minEmployees = Number(m[1]);
    const maxEmployees = Number(m[2]);
    if (minEmployees > maxEmployees) {
      throw new IcpInputError("Company size minimum must not exceed the maximum.");
    }
    return { minEmployees, maxEmployees };
  }
  const plus = /^(\d+)\s*\+$/.exec(trimmed);
  if (plus) return { minEmployees: Number(plus[1]), maxEmployees: null };
  throw new IcpInputError('Company size must look like "50-500" or "1000+".');
}

/**
 * Pure mapper: FE IcpProfile input → apex POST /api/leads/icp create body.
 *
 * The release backend has no exclusionDomains column, so that unsupported
 * field is not forwarded or shown in the minimum setup flow.
 */
export function toIcpCreateBody(input: Partial<IcpProfile>): {
  name: string;
  targetTitles: string[];
  targetIndustries: string[];
  targetGeos: string[];
  intentKeywords: string[];
  techStackSignals: string[];
  seedDomains: string[];
  minEmployees: number | null;
  maxEmployees: number | null;
} {
  const { minEmployees, maxEmployees } = parseSizeBand(input.sizeBand);
  return {
    name: "Default ICP",
    targetTitles: input.titles ?? [],
    targetIndustries: input.industries ?? [],
    targetGeos: input.geos ?? [],
    techStackSignals: input.techStackSignals ?? [],
    intentKeywords: input.intentSignals ?? [],
    seedDomains: input.seedDomains ?? [],
    minEmployees,
    maxEmployees,
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
    const persisted = (await apex.patch(
      "/leads/icp/current",
      { req },
      toIcpCreateBody(body),
    )) as ApexIcpProfile;
    res.json(shapeIcpProfile([persisted]));
  } catch (err) {
    if (err instanceof IcpInputError) {
      res.status(400).json({ error: "validation", message: err.message });
      return;
    }
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    // Surface upstream validation failures verbatim instead of a generic 502.
    if (err instanceof UpstreamError && (err.status === 400 || err.status === 422)) {
      res.status(err.status).json({
        error: "validation",
        message: upstreamErrorMessage(err.body) ?? "The backend rejected this ICP profile.",
      });
      return;
    }
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
 * Left-joins only catalog providers explicitly marked available for this
 * release. Deferred and unknown providers never become synthetic "available"
 * cards merely because the backend knows their names or retains a legacy row.
 * accountEmail remains null because encrypted credentials must not be exposed.
 */
export function shapeIntegrations(
  rows: ApexIntegration[],
  catalog: ApexCatalogEntry[] = [],
): Integration[] {
  const byProvider = new Map<string, ApexIntegration>();
  for (const r of rows) byProvider.set(r.provider, r);

  const out: Integration[] = [];
  const seen = new Set<string>();
  for (const c of catalog.filter((entry) => entry.status === "available")) {
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

/**
 * PURE: extract the OAuth authorization URL from the upstream auth-url
 * response ({ authUrl: string }). Returns null when the body carries no
 * usable Google HTTPS authorization URL — the route then answers 502 honestly
 * instead of handing the FE an attacker-controlled location to open.
 */
export function shapeAuthUrl(raw: unknown): string | null {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const authUrl = rec?.["authUrl"];
  if (typeof authUrl !== "string") return null;
  const trimmed = authUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "accounts.google.com" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return null;
  }
  return trimmed;
}

export interface GmailFinalizeInput {
  attemptId: string;
}

/** Keep the opaque attempt server-side and reject missing/ambiguous bodies. */
export function parseGmailFinalizeInput(raw: unknown): GmailFinalizeInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const attemptId = (raw as Record<string, unknown>)["attemptId"];
  if (typeof attemptId !== "string" || attemptId.trim() === "") return null;
  return { attemptId: attemptId.trim() };
}

export type GmailFinalizeClient = Pick<typeof apex, "post">;

/**
 * Authenticated second half of Gmail OAuth. The provider callback carries no
 * Clerk JWT, so it redirects the browser with an opaque one-time attempt ID;
 * the signed-in SPA posts that ID here and the BFF forwards the caller's
 * identity before returning only the public integration shape.
 */
export function createGmailFinalizeRouter(
  client: GmailFinalizeClient = apex,
): Router {
  const gmailRouter = Router();
  gmailRouter.post(
    "/settings/integrations/gmail/finalize",
    async (req, res, next) => {
      const input = parseGmailFinalizeInput(req.body);
      if (!input) {
        res.status(400).json({
          error: "validation",
          message: "A Gmail OAuth attempt ID is required.",
        });
        return;
      }
      try {
        const row = (await client.post(
          "/integrations/gmail/finalize",
          { req },
          input,
        )) as ApexIntegration;
        if (
          !row ||
          typeof row !== "object" ||
          typeof row.id !== "string" ||
          row.provider !== "gmail" ||
          typeof row.status !== "string"
        ) {
          res.status(502).json({
            error: "upstream",
            message: "The backend returned an invalid Gmail integration.",
          });
          return;
        }
        res.json(shapeIntegration(row));
      } catch (err) {
        if (
          err instanceof UpstreamError &&
          (err.status === 401 || err.status === 403)
        ) {
          throw err;
        }
        if (
          err instanceof UpstreamError &&
          err.status >= 400 &&
          err.status < 500
        ) {
          res.status(err.status).json({
            error: "oauth_finalize_failed",
            message:
              upstreamErrorMessage(err.body) ??
              "The Gmail authorization attempt could not be completed.",
          });
          return;
        }
        next(err);
      }
    },
  );
  return gmailRouter;
}

// ─── Gmail OAuth init ────────────────────────────────────────────────────────
// OAuth providers cannot use the synchronous POST /:provider/connect (that is
// the api-key path). Upstream exposes GET /api/integrations/gmail/auth-url
// (Bearer-authenticated, orgId from the JWT) returning { authUrl }; the FE
// opens it and Google redirects to the upstream callback. This proxy uses the
// same org-scoped auth forwarding as every sibling route.

router.get("/settings/integrations/gmail/auth-url", async (req, res, next) => {
  try {
    const raw = await apex.get("/integrations/gmail/auth-url", { req });
    const authUrl = shapeAuthUrl(raw);
    if (!authUrl) {
      res.status(502).json({
        error: "upstream",
        message: "The backend did not return a Gmail authorization URL.",
      });
      return;
    }
    res.json({ authUrl });
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    // Surface upstream config failures verbatim (e.g. Gmail OAuth client not
    // configured) — never collapse them into a fake success.
    if (err instanceof UpstreamError && err.status >= 400 && err.status < 500) {
      res.status(err.status).json({
        error: "upstream",
        message:
          upstreamErrorMessage(err.body) ??
          "The backend could not start the Gmail authorization flow.",
      });
      return;
    }
    next(err);
  }
});

router.use(createGmailFinalizeRouter());

router.post("/settings/integrations/:provider/connect", (req, res) => {
  const { provider } = req.params;
  if (provider === "gmail") {
    res.status(409).json({
      error: "oauth_required",
      message: "Gmail must be connected through the Google authorization flow.",
    });
    return;
  }
  res.status(404).json({
    error: "unsupported_provider",
    message: "This release supports Gmail only.",
  });
});

router.post("/settings/integrations/:provider/disconnect", async (req, res, next) => {
  const { provider } = req.params;
  if (provider !== "gmail") {
    res.status(404).json({
      error: "unsupported_provider",
      message: "This release supports Gmail only.",
    });
    return;
  }
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
// `plan` is real (GET /api/billing returns { plan, subscription:Razorpay|null })
// and `seats` is the real org user count. Usage, credit, seat-limit, and invoice
// accounting have no backend source, so the BFF reports them as unknown.

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  downloadUrl: string;
}

export interface BillingInfo {
  plan: string;
  creditsRemaining: number | null;
  creditsTotal: number | null;
  sendsThisMonth: number | null;
  sendsLimit: number | null;
  seats: number;
  seatsLimit: number | null;
  invoices: Invoice[] | null;
}

/**
 * Pure mapper: apex billing { plan } + org seat count → FE BillingInfo.
 *
 * UNKNOWN (no backend source): creditsRemaining, creditsTotal, sendsThisMonth,
 * sendsLimit, seatsLimit, and invoices are null. `seats` is the caller-supplied
 * real org user count (audit endpoint 15).
 */
export function shapeBilling(billing: { plan: string }, seats: number): BillingInfo {
  if (typeof billing.plan !== "string" || billing.plan.trim() === "") {
    throw new TypeError("Billing plan is missing from the upstream response");
  }
  if (!Number.isInteger(seats) || seats < 0) {
    throw new TypeError("Seat count is invalid");
  }
  return {
    plan: billing.plan,
    creditsRemaining: null,
    creditsTotal: null,
    sendsThisMonth: null,
    sendsLimit: null,
    seats,
    seatsLimit: null,
    invoices: null,
  };
}

router.get("/settings/billing", async (req, res, next) => {
  try {
    const me = (await apex.get("/orgs/me", { req })) as { id: string };
    const [billing, org] = await Promise.all([
      apex.get("/billing", { req }) as Promise<unknown>,
      apex.get(`/orgs/${me.id}`, { req }) as Promise<unknown>,
    ]);
    const billingRecord =
      billing && typeof billing === "object" && !Array.isArray(billing)
        ? (billing as Record<string, unknown>)
        : null;
    const orgRecord =
      org && typeof org === "object" && !Array.isArray(org)
        ? (org as Record<string, unknown>)
        : null;
    const plan = billingRecord?.["plan"];
    const users = orgRecord?.["users"];
    if (typeof plan !== "string" || plan.trim() === "" || !Array.isArray(users)) {
      res.status(502).json({
        error: "upstream",
        message: "The backend did not return a valid billing plan and seat count",
      });
      return;
    }
    res.json(shapeBilling({ plan }, users.length));
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
