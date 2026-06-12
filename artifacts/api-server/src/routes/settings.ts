import { Router } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";

const router = Router();

/**
 * The subset of the apex-gtm-api Org row (GET /api/orgs/me →
 * OrgsService.findByClerkUser) that the BFF reads. The deployed Org model has
 * NO logoUrl/timezone/unsubscribeUrl/allowlistedDomains/creditsRemaining/
 * welcomeComplete columns, so those FE fields are DEFAULTED (synthesized) —
 * see the audit's transform for endpoint 0. `sendReadiness` is the GL5
 * contract the backend now attaches to the org read; it is typed `unknown`
 * here because the BFF must runtime-guard it (older backends omit it).
 */
export interface ApexOrg {
  id: string;
  name: string;
  slug: string;
  website?: string | null;
  physicalAddress?: string | null;
  country?: string | null;
  senderName?: string | null;
  plan?: string;
  sendReadiness?: unknown;
}

/**
 * GL5 send-readiness contract (mirrors the apex-gtm-api org read). The FE
 * renders each precondition as a check/cross row and derives the overall
 * "LIVE for this workspace" vs "Dry-run mode" state from `liveSendAllowed`.
 */
export interface SendReadiness {
  liveSendAllowed: boolean;
  physicalAddressSet: boolean;
  senderNameSet: boolean;
  mailboxConnected: boolean;
  dailyCapRemaining: number | null;
}

/**
 * PURE: tolerant runtime guard for the upstream `sendReadiness` envelope.
 *
 * Returns null when the field is absent or malformed (e.g. the deployed
 * backend predates GL5) — the caller then treats live state as UNKNOWN and
 * the workspace as dry-run. NEVER fabricates a readiness verdict. A missing
 * or non-finite `dailyCapRemaining` degrades to null ("no cap reported")
 * without discarding the rest of the envelope.
 */
export function parseSendReadiness(raw: unknown): SendReadiness | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r["liveSendAllowed"] !== "boolean" ||
    typeof r["physicalAddressSet"] !== "boolean" ||
    typeof r["senderNameSet"] !== "boolean" ||
    typeof r["mailboxConnected"] !== "boolean"
  ) {
    return null;
  }
  const cap = r["dailyCapRemaining"];
  return {
    liveSendAllowed: r["liveSendAllowed"],
    physicalAddressSet: r["physicalAddressSet"],
    senderNameSet: r["senderNameSet"],
    mailboxConnected: r["mailboxConnected"],
    dailyCapRemaining: typeof cap === "number" && Number.isFinite(cap) ? cap : null,
  };
}

export interface OrgSettings {
  orgId: string;
  orgName: string;
  slug: string;
  logoUrl: string | null;
  country: string;
  timezone: string;
  senderName: string | null;
  liveSendEnabled: boolean;
  postalAddress: string | null;
  unsubscribeUrl: string | null;
  suppressionCount: number;
  allowlistedDomains: string[];
  plan: string;
  creditsRemaining: number;
  welcomeComplete: boolean;
  /** GL5: forwarded verbatim from upstream; null = backend didn't report it. */
  sendReadiness: SendReadiness | null;
}

/**
 * Pure mapper: apex Org row → FE OrgSettings.
 *
 * REAL: `sendReadiness` is forwarded from the upstream org read (null when the
 * backend doesn't send it), and `liveSendEnabled` is derived from
 * `sendReadiness.liveSendAllowed` — true ONLY when the backend explicitly says
 * live sending is allowed; absent/malformed readiness means dry-run (false),
 * never a fabricated "live".
 *
 * SYNTHESIZED (no backing Org column on the deployed backend, per audit):
 *   logoUrl=null, timezone='UTC', unsubscribeUrl=null, allowlistedDomains=[],
 *   creditsRemaining=0, welcomeComplete=true.
 *   suppressionCount has no count endpoint upstream → 0 unless caller supplies one.
 */
export function shapeOrgSettings(org: ApexOrg, suppressionCount = 0): OrgSettings {
  const sendReadiness = parseSendReadiness(org.sendReadiness);
  return {
    orgId: org.id,
    orgName: org.name,
    slug: org.slug,
    logoUrl: null,
    country: org.country ?? "",
    timezone: "UTC",
    senderName: org.senderName ?? null,
    liveSendEnabled: sendReadiness?.liveSendAllowed === true,
    postalAddress: org.physicalAddress ?? null,
    unsubscribeUrl: null,
    suppressionCount,
    allowlistedDomains: [],
    plan: org.plan ?? "TRIAL",
    creditsRemaining: 0,
    welcomeComplete: true,
    sendReadiness,
  };
}

// ─── Org settings ──────────────────────────────────────────────────────────

router.get("/settings/org", async (req, res, next) => {
  try {
    const org = (await apex.get("/orgs/me", { req })) as ApexOrg;
    res.json(shapeOrgSettings(org));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

/** Upstream UpdateOrgDto fields the BFF forwards from the FE UpdateOrgInput. */
export interface OrgPatchBody {
  name?: string;
  senderName?: string;
  country?: string;
  physicalAddress?: string;
}

/**
 * PURE: FE UpdateOrgInput → upstream UpdateOrgDto patch body.
 *
 * Forwards every field the upstream DTO accepts (name, senderName, country
 * ISO-2, physicalAddress). The FE spec names the address `postalAddress`
 * (OrgSettings read shape), the upstream column is `physicalAddress` — both
 * are accepted, `physicalAddress` winning when both are present. Fields the
 * upstream DTO does NOT accept (slug/timezone/logoUrl/liveSendEnabled/
 * unsubscribeUrl) are still not forwarded — they have no backing column.
 */
export function buildOrgPatchBody(raw: unknown): OrgPatchBody {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const patch: OrgPatchBody = {};
  if (typeof body["name"] === "string") patch.name = body["name"];
  if (typeof body["senderName"] === "string") patch.senderName = body["senderName"];
  if (typeof body["country"] === "string") patch.country = body["country"];
  const address =
    typeof body["physicalAddress"] === "string"
      ? body["physicalAddress"]
      : typeof body["postalAddress"] === "string"
        ? body["postalAddress"]
        : undefined;
  if (address !== undefined) patch.physicalAddress = address;
  return patch;
}

/**
 * PURE: extract a human-readable message from an upstream NestJS error body
 * ({ statusCode, message: string | string[], error }). Falls back to null when
 * the body carries nothing usable — the caller then sends a generic message.
 */
export function upstreamErrorMessage(body: unknown): string | null {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const message = rec?.["message"];
  if (typeof message === "string" && message.trim() !== "") return message;
  if (Array.isArray(message)) {
    const parts = message.filter((m): m is string => typeof m === "string" && m.trim() !== "");
    if (parts.length > 0) return parts.join("; ");
  }
  const error = rec?.["error"];
  if (typeof error === "string" && error.trim() !== "") return error;
  return null;
}

router.put("/settings/org", async (req, res, next) => {
  try {
    // PATCH /api/orgs/:id requires :id === caller's resolved orgId, so resolve
    // it via /orgs/me first. The upstream UpdateOrgDto now accepts the sender
    // identity / CAN-SPAM fields (senderName, country, physicalAddress) in
    // addition to name — buildOrgPatchBody forwards exactly those.
    const me = (await apex.get("/orgs/me", { req })) as ApexOrg;
    await apex.patch(`/orgs/${me.id}`, { req }, buildOrgPatchBody(req.body));
    const updated = (await apex.get("/orgs/me", { req })) as ApexOrg;
    res.json(shapeOrgSettings(updated));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    // Surface upstream validation failures honestly (e.g. country must be
    // ISO-2) instead of collapsing them into a generic 502 "upstream" blob —
    // the FE shows this message verbatim in its save-error state.
    if (err instanceof UpstreamError && (err.status === 400 || err.status === 422)) {
      res.status(err.status).json({
        error: "validation",
        message: upstreamErrorMessage(err.body) ?? "The backend rejected these settings.",
      });
      return;
    }
    next(err);
  }
});

// ─── Org health (GAP) ────────────────────────────────────────────────────────
// No org compliance/health route exists upstream (audit endpoint 2). The signals
// (liveSendEnabled / unsubscribeConfigured) have no source of truth, so we degrade
// honestly rather than synthesize a misleading compliance verdict.

router.get("/settings/org/health", (_req, res) => {
  return gapResponse(res, "org-health");
});

export default router;
