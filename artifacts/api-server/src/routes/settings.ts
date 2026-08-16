import { Router, type Request } from "express";
import {
  CreateSuppressionBody,
  CreateSuppressionResponse,
  ListSuppressionsQueryParams,
  ListSuppressionsResponse,
} from "@workspace/api-zod";
import { apex, UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";
import { fetchWelcomeStatus } from "./welcome";

const router = Router();

/**
 * The subset of the apex-gtm-api Org row (GET /api/orgs/me →
 * OrgsService.findByClerkUser) that the BFF reads. The deployed Org model has
 * NO logoUrl/timezone/unsubscribeUrl/allowlistedDomains/creditsRemaining
 * columns, so unsupported FE fields are defaulted and accounting stays null — see the audit's
 * transform for endpoint 0. Onboarding completion is fetched from the
 * backend's derived status endpoint, never from a mutable/synthetic flag.
 * `sendReadiness` is the GL5
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
  plan?: string | null;
  sendReadiness?: unknown;
}

export interface ApexOnboardingStatus {
  complete: boolean;
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
  countrySet: boolean;
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
export function parseSendReadiness(
  raw: unknown,
  legacyCountry?: string | null,
): SendReadiness | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const hasCountrySet = Object.prototype.hasOwnProperty.call(r, "countrySet");
  // The public June backend predates `countrySet` in the readiness envelope,
  // but its persisted Org.country write already rejects anything other than
  // uppercase ISO-3166 alpha-2. Accept that exact legacy omission only when
  // the caller supplies the persisted country. A present malformed field is
  // never replaced, and an absent/invalid country remains an explicit false.
  const countrySet =
    typeof r["countrySet"] === "boolean"
      ? r["countrySet"]
      : !hasCountrySet && legacyCountry !== undefined
        ? typeof legacyCountry === "string" &&
          /^[A-Z]{2}$/.test(legacyCountry.trim())
        : null;
  if (
    typeof r["liveSendAllowed"] !== "boolean" ||
    typeof r["physicalAddressSet"] !== "boolean" ||
    typeof r["senderNameSet"] !== "boolean" ||
    countrySet === null ||
    typeof r["mailboxConnected"] !== "boolean"
  ) {
    return null;
  }
  const cap = r["dailyCapRemaining"];
  return {
    liveSendAllowed: r["liveSendAllowed"],
    physicalAddressSet: r["physicalAddressSet"],
    senderNameSet: r["senderNameSet"],
    countrySet,
    mailboxConnected: r["mailboxConnected"],
    dailyCapRemaining: typeof cap === "number" && Number.isFinite(cap) ? cap : null,
  };
}

export interface OrgSettings {
  orgId: string;
  orgName: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
  country: string;
  timezone: string;
  senderName: string | null;
  liveSendEnabled: boolean;
  postalAddress: string | null;
  unsubscribeUrl: string | null;
  suppressionCount: number | null;
  allowlistedDomains: string[];
  plan: string | null;
  creditsRemaining: number | null;
  welcomeComplete: boolean;
  /** true = reviewer guard confirmed; false = guard denied; null = unavailable/unknown. */
  canReviewArtifacts: boolean | null;
  /** true = mailbox mutation guard confirmed; false = denied; null = unavailable/unknown. */
  canManageMailbox: boolean | null;
  /** true = organization mutation guard confirmed; false = denied; null = unavailable/unknown. */
  canManageOrg: boolean | null;
  /** true = suppression mutation guard confirmed; false = denied; null = unavailable/unknown. */
  canManageSuppressions: boolean | null;
  /** GL5: forwarded verbatim from upstream; null = backend didn't report it. */
  sendReadiness: SendReadiness | null;
}

export interface OrgCapabilities {
  canReviewArtifacts: boolean | null;
  canManageMailbox: boolean | null;
  canManageOrg: boolean | null;
  canManageSuppressions: boolean | null;
}

interface LegacyAuthUser {
  role: string;
}

function unknownOrgCapabilities(): OrgCapabilities {
  return {
    canReviewArtifacts: null,
    canManageMailbox: null,
    canManageOrg: null,
    canManageSuppressions: null,
  };
}

/**
 * Parse each capability independently and fail closed. Explicit `false` is a
 * known denial and must never be collapsed into "unknown"; absent, non-boolean,
 * or malformed fields become null so the corresponding UI control stays
 * read-only without discarding other valid flags in the same response.
 */
export function parseOrgCapabilities(raw: unknown): OrgCapabilities {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unknownOrgCapabilities();
  }
  const rec = raw as Record<string, unknown>;
  const capability = (key: keyof OrgCapabilities): boolean | null =>
    typeof rec[key] === "boolean" ? (rec[key] as boolean) : null;
  return {
    canReviewArtifacts: capability("canReviewArtifacts"),
    canManageMailbox: capability("canManageMailbox"),
    canManageOrg: capability("canManageOrg"),
    canManageSuppressions: capability("canManageSuppressions"),
  };
}

function normalizeOrgRole(role: unknown): "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toUpperCase().replace(/^ORG:/, "");
  return normalized === "OWNER" ||
    normalized === "ADMIN" ||
    normalized === "MANAGER" ||
    normalized === "MEMBER"
    ? normalized
    : null;
}

/**
 * Compatibility projection for the June backend, which predates the granular
 * capability route but exposes the authenticated user's persisted role at
 * `/auth/me`. Each allow mirrors the legacy write guards. A signed Clerk role,
 * when present, is an additional veto and can never elevate the database role.
 */
export function legacyOrgCapabilities(
  raw: unknown,
  signedClerkRole: unknown,
): OrgCapabilities {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
  const databaseRole = normalizeOrgRole(rec?.["role"]);
  if (!databaseRole) return unknownOrgCapabilities();

  const signedRolePresent =
    typeof signedClerkRole === "string" && signedClerkRole.trim().length > 0;
  const signedRole = signedRolePresent ? normalizeOrgRole(signedClerkRole) : null;
  const permitted = (allowed: readonly string[]): boolean =>
    allowed.includes(databaseRole) &&
    (!signedRolePresent || (signedRole !== null && allowed.includes(signedRole)));

  const canAdministerWork = permitted(["OWNER", "ADMIN", "MANAGER"]);
  const canAdministerOrg = permitted(["OWNER", "ADMIN"]);
  return {
    canReviewArtifacts: canAdministerWork,
    canManageMailbox: canAdministerWork,
    canManageOrg: canAdministerOrg,
    canManageSuppressions: canAdministerOrg,
  };
}

async function fetchLegacyOrgCapabilities(
  req: Request,
  client: Pick<typeof apex, "get">,
): Promise<OrgCapabilities> {
  try {
    const raw = (await client.get("/auth/me", { req })) as LegacyAuthUser;
    return legacyOrgCapabilities(raw, req.clerkOrgRole);
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 401) throw err;
    if (err instanceof UpstreamError && err.status === 403) {
      return {
        canReviewArtifacts: false,
        canManageMailbox: false,
        canManageOrg: false,
        canManageSuppressions: false,
      };
    }
    return unknownOrgCapabilities();
  }
}

/**
 * Pure mapper: apex Org row → FE OrgSettings.
 *
 * REAL: `sendReadiness` is forwarded from the upstream org read (null when the
 * backend doesn't send it), and `liveSendEnabled` is true only when the
 * allowlist, mailbox, sender, country, address, and positive-capacity gates are all
 * reported open; absent/malformed readiness fails closed.
 *
 * SYNTHESIZED (no backing Org column on the deployed backend, per audit):
 *   logoUrl=null, timezone='UTC', unsubscribeUrl=null, allowlistedDomains=[],
 *   creditsRemaining=null (the backend does not expose credit accounting).
 *   suppressionCount has no count endpoint upstream → null unless caller supplies one.
 * `welcomeComplete` is never synthesized: the caller must supply the derived
 * backend onboarding verdict, and a missing/malformed verdict fails closed.
 */
export function shapeOrgSettings(
  org: ApexOrg,
  suppressionCount: number | null = null,
  welcomeComplete = false,
  capabilities: OrgCapabilities = unknownOrgCapabilities(),
): OrgSettings {
  const sendReadiness = parseSendReadiness(
    org.sendReadiness,
    org.country ?? null,
  );
  return {
    orgId: org.id,
    orgName: org.name,
    slug: org.slug,
    website: org.website ?? null,
    logoUrl: null,
    country: org.country ?? "",
    timezone: "UTC",
    senderName: org.senderName ?? null,
    liveSendEnabled:
      sendReadiness?.liveSendAllowed === true &&
      sendReadiness.physicalAddressSet &&
      sendReadiness.senderNameSet &&
      sendReadiness.countrySet &&
      sendReadiness.mailboxConnected &&
      sendReadiness.dailyCapRemaining !== null &&
      sendReadiness.dailyCapRemaining > 0,
    postalAddress: org.physicalAddress ?? null,
    unsubscribeUrl: null,
    suppressionCount,
    allowlistedDomains: [],
    plan:
      typeof org.plan === "string" && org.plan.trim() !== ""
        ? org.plan
        : null,
    creditsRemaining: null,
    welcomeComplete,
    ...capabilities,
    sendReadiness,
  };
}

/**
 * Resolve the backend's guarded artifact-review capability without guessing.
 * A guard denial is a known read-only state; any missing/malformed/failed
 * capability lookup is unknown and therefore also fails closed in the UI.
 */
export async function fetchReviewCapability(
  req: Request,
  client: Pick<typeof apex, "get"> = apex,
): Promise<boolean | null> {
  try {
    const raw = await client.get("/outreach-artifacts/review-capability", { req });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return (raw as Record<string, unknown>)["canReviewArtifacts"] === true ? true : null;
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 401) throw err;
    if (err instanceof UpstreamError && err.status === 403) return false;
    return null;
  }
}

/**
 * Resolve the granular backend capability envelope. Older deployments may not
 * have `/orgs/me/capabilities`; in that case derive the same route permissions
 * from the authenticated `/auth/me` role, with any signed Clerk organization
 * role applied as an additional veto. The review probe remains a final,
 * read-only compatibility source when the legacy user projection is missing.
 */
export async function fetchOrgCapabilities(
  req: Request,
  client: Pick<typeof apex, "get"> = apex,
): Promise<OrgCapabilities> {
  let parsed = unknownOrgCapabilities();
  try {
    parsed = parseOrgCapabilities(
      await client.get("/orgs/me/capabilities", { req }),
    );
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 401) throw err;
    if (err instanceof UpstreamError && err.status === 403) {
      return {
        canReviewArtifacts: false,
        canManageMailbox: false,
        canManageOrg: false,
        canManageSuppressions: false,
      };
    }
  }

  if (Object.values(parsed).some((capability) => capability !== null)) {
    if (parsed.canReviewArtifacts !== null) return parsed;
    return {
      ...parsed,
      canReviewArtifacts: await fetchReviewCapability(req, client),
    };
  }

  const legacy = await fetchLegacyOrgCapabilities(req, client);
  if (Object.values(legacy).some((capability) => capability !== null)) {
    return legacy;
  }

  return {
    ...legacy,
    canReviewArtifacts: await fetchReviewCapability(req, client),
  };
}

// ─── Org settings ──────────────────────────────────────────────────────────

router.get("/settings/org", async (req, res, next) => {
  try {
    // The guarded status read is the clean-tenant bootstrap barrier. Only
    // after it resolves do we call the legacy @SkipOrgGuard /orgs/me lookup,
    // avoiding a race where /orgs/me returns null while provisioning is still
    // in flight.
    const onboarding = (await fetchWelcomeStatus(req)) as ApexOnboardingStatus;
    const [org, capabilities] = await Promise.all([
      apex.get("/orgs/me", { req }) as Promise<ApexOrg>,
      fetchOrgCapabilities(req),
    ]);
    res.json(shapeOrgSettings(org, null, onboarding?.complete === true, capabilities));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

/** Upstream UpdateOrgDto fields the BFF forwards from the FE UpdateOrgInput. */
export interface OrgPatchBody {
  name?: string;
  website?: string;
  senderName?: string;
  country?: string;
  physicalAddress?: string;
}

/**
 * PURE: FE UpdateOrgInput → upstream UpdateOrgDto patch body.
 *
 * Forwards every setup field the upstream DTO accepts (name, website,
 * senderName, country ISO-2, physicalAddress). The FE spec names the address `postalAddress`
 * (OrgSettings read shape), the upstream column is `physicalAddress` — both
 * are accepted, `physicalAddress` winning when both are present. Fields the
 * upstream DTO does NOT accept (slug/timezone/logoUrl/liveSendEnabled/
 * unsubscribeUrl) are still not forwarded — they have no backing column.
 */
export function buildOrgPatchBody(raw: unknown): OrgPatchBody {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const patch: OrgPatchBody = {};
  if (typeof body["name"] === "string") patch.name = body["name"];
  if (typeof body["website"] === "string") patch.website = body["website"];
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
    // Provision/resolve the internal tenant before the chicken-and-egg-safe
    // /orgs/me endpoint is read directly by a fresh user.
    await fetchWelcomeStatus(req);
    // PATCH /api/orgs/:id requires :id === caller's resolved orgId, so resolve
    // it via /orgs/me first. The upstream UpdateOrgDto now accepts the sender
    // identity / CAN-SPAM fields (senderName, country, physicalAddress) in
    // addition to name — buildOrgPatchBody forwards exactly those.
    const me = (await apex.get("/orgs/me", { req })) as ApexOrg;
    await apex.patch(`/orgs/${me.id}`, { req }, buildOrgPatchBody(req.body));
    const [updated, onboarding, capabilities] = await Promise.all([
      apex.get("/orgs/me", { req }) as Promise<ApexOrg>,
      fetchWelcomeStatus(req) as Promise<ApexOnboardingStatus>,
      fetchOrgCapabilities(req),
    ]);
    res.json(shapeOrgSettings(updated, null, onboarding?.complete === true, capabilities));
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

// ─── Authoritative suppression registry ────────────────────────────────────

type SuppressionUpstream = Pick<typeof apex, "get" | "post">;

/**
 * Owner/admin suppression boundary. The upstream derives both tenant and
 * actor from the authenticated request. This BFF intentionally exposes no
 * delete operation: opt-out removal needs a separate, durable re-consent
 * contract before it can be a customer-facing action.
 */
export function createSuppressionSettingsRouter(
  client: SuppressionUpstream = apex,
): Router {
  const suppressionRouter = Router();

  suppressionRouter.get("/settings/suppressions", async (req, res, next) => {
    const parsed = ListSuppressionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid suppression-list query" });
      return;
    }

    const query = new URLSearchParams({ limit: String(parsed.data.limit) });
    if (parsed.data.cursor) query.set("cursor", parsed.data.cursor);

    try {
      const upstream = await client.get(
        `/outreach/suppression?${query.toString()}`,
        { req },
      );
      const shaped = ListSuppressionsResponse.safeParse(upstream);
      if (!shaped.success) {
        res.status(502).json({
          error: "The backend returned an invalid suppression registry",
        });
        return;
      }
      res.json(shaped.data);
    } catch (err) {
      next(err);
    }
  });

  suppressionRouter.post("/settings/suppressions", async (req, res, next) => {
    const parsed = CreateSuppressionBody.safeParse(req.body);
    const recipientRef = parsed.success ? parsed.data.recipientRef.trim() : "";
    if (!parsed.success || recipientRef.length === 0) {
      res.status(400).json({ error: "Invalid suppression request" });
      return;
    }

    try {
      const upstream = await client.post(
        "/outreach/suppression",
        { req },
        { ...parsed.data, recipientRef },
      );
      const shaped = CreateSuppressionResponse.safeParse(upstream);
      if (!shaped.success) {
        res.status(502).json({
          error: "The backend returned an invalid suppression result",
        });
        return;
      }
      res.status(shaped.data.created ? 201 : 200).json(shaped.data);
    } catch (err) {
      next(err);
    }
  });

  return suppressionRouter;
}

router.use(createSuppressionSettingsRouter());

export default router;
