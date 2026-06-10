import { Router } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";

const router = Router();

/**
 * The subset of the apex-gtm-api Org row (GET /api/orgs/me →
 * OrgsService.findByClerkUser) that the BFF reads. The deployed Org model has
 * NO logoUrl/timezone/liveSendEnabled/unsubscribeUrl/allowlistedDomains/
 * creditsRemaining/welcomeComplete columns, so those FE fields are DEFAULTED
 * (synthesized) — see the audit's transform for endpoint 0.
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
}

/**
 * Pure mapper: apex Org row → FE OrgSettings.
 *
 * SYNTHESIZED (no backing Org column on the deployed backend, per audit):
 *   logoUrl=null, timezone='UTC', liveSendEnabled=false (real live-send is the
 *   env OUTREACH_LIVE_FOR_ORGS, not per-row), unsubscribeUrl=null,
 *   allowlistedDomains=[], creditsRemaining=0, welcomeComplete=true.
 *   suppressionCount has no count endpoint upstream → 0 unless caller supplies one.
 */
export function shapeOrgSettings(org: ApexOrg, suppressionCount = 0): OrgSettings {
  return {
    orgId: org.id,
    orgName: org.name,
    slug: org.slug,
    logoUrl: null,
    country: org.country ?? "",
    timezone: "UTC",
    senderName: org.senderName ?? null,
    liveSendEnabled: false,
    postalAddress: org.physicalAddress ?? null,
    unsubscribeUrl: null,
    suppressionCount,
    allowlistedDomains: [],
    plan: org.plan ?? "TRIAL",
    creditsRemaining: 0,
    welcomeComplete: true,
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

router.put("/settings/org", async (req, res, next) => {
  const body = req.body as { name?: string };
  try {
    // PATCH /api/orgs/:id requires :id === caller's resolved orgId, so resolve
    // it via /orgs/me first. The backend DTO only persists name/plan/website —
    // every other FE field (senderName/country/postalAddress/timezone/logoUrl/
    // liveSendEnabled/slug) is silently dropped (audit endpoint 1, GAP).
    const me = (await apex.get("/orgs/me", { req })) as ApexOrg;
    const patchBody: { name?: string } = {};
    if (typeof body.name === "string") patchBody.name = body.name;
    await apex.patch(`/orgs/${me.id}`, { req }, patchBody);
    const updated = (await apex.get("/orgs/me", { req })) as ApexOrg;
    res.json(shapeOrgSettings(updated));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
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
