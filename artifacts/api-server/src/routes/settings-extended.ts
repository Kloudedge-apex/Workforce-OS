import { Router } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";
import { fetchOrgCapabilities, upstreamErrorMessage } from "./settings";

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
 * exclusionDomains maps from the persisted upstream row. Older backends are
 * read tolerantly as [] during a governed migration. sizeBand is derived from
 * minEmployees/maxEmployees. Empty list → empty-default profile.
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
 * Pure mapper: FE IcpProfile input → apex current-profile upsert body.
 */
export function toIcpCreateBody(input: Partial<IcpProfile>): {
  name: string;
  targetTitles: string[];
  targetIndustries: string[];
  targetGeos: string[];
  intentKeywords: string[];
  techStackSignals: string[];
  seedDomains: string[];
  exclusionDomains: string[];
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
    exclusionDomains: input.exclusionDomains ?? [],
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

export interface GmailMailboxVerification {
  verified: true;
  watchExpiresAt: string;
}

/**
 * Accept only a concrete Gmail users.watch proof. A bare `{ ok: true }` is
 * what the legacy API returns when its Pub/Sub topic is missing, so it must
 * never be presented as reply-sync readiness.
 */
export function shapeGmailMailboxVerification(
  raw: unknown,
  now = Date.now(),
): GmailMailboxVerification | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const historyId = rec["historyId"];
  const expiration = rec["expiration"];
  if (
    rec["ok"] !== true ||
    typeof historyId !== "string" ||
    !/^\d+$/u.test(historyId) ||
    typeof expiration !== "string" ||
    !/^\d+$/u.test(expiration)
  ) {
    return null;
  }
  const expiresAt = Number(expiration);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
  return {
    verified: true,
    watchExpiresAt: new Date(expiresAt).toISOString(),
  };
}

export type GmailVerificationClient = Pick<typeof apex, "get" | "post">;

/**
 * Register and verify the authenticated workspace's Gmail inbound watch.
 * The BFF repeats the mailbox-management capability check because the public
 * legacy API's watch route predates its AdminOrManagerGuard.
 */
export function createGmailVerificationRouter(
  client: GmailVerificationClient = apex,
): Router {
  const gmailRouter = Router();
  gmailRouter.post(
    "/settings/integrations/gmail/verify",
    async (req, res, next) => {
      try {
        const capabilities = await fetchOrgCapabilities(req, client);
        if (capabilities.canManageMailbox !== true) {
          if (capabilities.canManageMailbox === false) {
            res.status(403).json({
              error: "forbidden",
              message: "Gmail verification requires an administrator or manager.",
            });
          } else {
            res.status(503).json({
              error: "unavailable",
              message: "Mailbox management permission could not be verified.",
            });
          }
          return;
        }

        const verification = shapeGmailMailboxVerification(
          await client.post("/integrations/gmail/watch", { req }),
        );
        if (!verification) {
          res.status(502).json({
            error: "upstream",
            message: "Google authorization exists, but the backend could not prove an active Gmail reply watch.",
          });
          return;
        }
        res.json(verification);
      } catch (err) {
        if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
          throw err;
        }
        if (err instanceof UpstreamError && err.status >= 400 && err.status < 500) {
          res.status(err.status).json({
            error: "gmail_verification_failed",
            message:
              upstreamErrorMessage(err.body) ??
              "Gmail could not be verified. Reconnect the mailbox and try again.",
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

export type GmailAuthorizationClient = Pick<typeof apex, "get">;

export function createGmailAuthorizationRouter(
  client: GmailAuthorizationClient = apex,
): Router {
  const gmailRouter = Router();
  gmailRouter.get(
    "/settings/integrations/gmail/auth-url",
    async (req, res, next) => {
      try {
        const raw = await client.get("/integrations/gmail/auth-url", { req });
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
        if (
          err instanceof UpstreamError &&
          (err.status === 401 || err.status === 403)
        ) {
          throw err;
        }
        // Surface upstream config failures verbatim (e.g. Gmail OAuth client
        // not configured) — never collapse them into a fake success.
        if (
          err instanceof UpstreamError &&
          err.status >= 400 &&
          err.status < 500
        ) {
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
    },
  );
  return gmailRouter;
}

router.use(createGmailAuthorizationRouter());
router.use(createGmailFinalizeRouter());
router.use(createGmailVerificationRouter());

export type GmailDisconnectClient = Pick<typeof apex, "post">;

export function createGmailDisconnectRouter(
  client: GmailDisconnectClient = apex,
): Router {
  const gmailRouter = Router();
  gmailRouter.post(
    "/settings/integrations/gmail/disconnect",
    async (req, res, next) => {
      try {
        // Upstream hard-deletes the row and returns it; the integration no
        // longer exists, so force status='available' for the FE.
        const row = (await client.post("/integrations/gmail/disconnect", {
          req,
        })) as ApexIntegration;
        res.json({
          ...shapeIntegration(row),
          status: "available",
          connectedAt: null,
          errorMessage: null,
        });
      } catch (err) {
        if (
          err instanceof UpstreamError &&
          (err.status === 401 || err.status === 403)
        ) {
          throw err;
        }
        next(err);
      }
    },
  );
  return gmailRouter;
}

router.use(createGmailDisconnectRouter());

export default router;
