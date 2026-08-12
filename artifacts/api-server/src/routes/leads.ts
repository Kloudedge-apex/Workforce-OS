import { Router, type NextFunction, type Request, type Response } from "express";
import {
  ListLeadsQueryParams,
  GetLeadParams,
} from "@workspace/api-zod";
import { apex, UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";

const router = Router();

export const BULK_PERSON_SUPPRESSION_PATH = "/outreach/suppression/people/bulk";
const MAX_BULK_PERSON_IDS = 200;
const MAX_PERSON_ID_LENGTH = 256;

/** Strict mirror of the upstream safety contract; Zod strips unknown keys. */
export function parseBulkPersonSuppressionBody(
  raw: unknown,
): { personIds: string[] } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !("personIds" in record)) return null;
  if (
    !Array.isArray(record.personIds) ||
    record.personIds.length < 1 ||
    record.personIds.length > MAX_BULK_PERSON_IDS
  ) {
    return null;
  }
  const personIds: string[] = [];
  for (const value of record.personIds) {
    if (typeof value !== "string") return null;
    const personId = value.trim();
    if (personId.length < 1 || personId.length > MAX_PERSON_ID_LENGTH) return null;
    personIds.push(personId);
  }
  return { personIds };
}

// ─── OpenAPI response shapes (the FE contract we must satisfy) ──────────────

export interface IntentSignal {
  label: string;
  confidence: number;
}

export interface SendPolicy {
  liveSendEnabled: boolean;
  postalAddressSet: boolean;
  unsubscribeConfigured: boolean;
  recipientSuppressed: boolean;
}

/**
 * HONESTY contract (same convention as routes/artifacts.ts): sendPolicy is
 * `null` whenever the backend has no real per-recipient policy to report —
 * the FE falls back to its neutral badge for null. We never fabricate an
 * all-false policy: that painted fake red "No Postal Address" badges on
 * every lead card.
 */

export interface Lead {
  id: string;
  name: string;
  title: string;
  email: string;
  company: string;
  domain: string | null;
  companyLogoUrl: string | null;
  avatarUrl: string | null;
  score: number | null;
  stage: string;
  geo: string | null;
  country: string | null;
  industry: string | null;
  headcountEstimate: string | null;
  cohort: "A" | "B" | null;
  emailStatus: "DELIVERABLE" | "HIGH_PROBABILITY" | "CATCH_ALL" | null;
  intentSignals: IntentSignal[] | null;
  lastContactedAt: string | null;
  sendPolicy: SendPolicy | null;
  createdAt: string | null;
}

export interface PaginatedLeads {
  items: Lead[];
  total: number;
  page: number;
  limit: number;
}

export interface ScoreBreakdown {
  fit: number;
  intent: number;
  engagement: number;
  timing: number;
}

export interface EvidenceEventSummary {
  id: string;
  eventType: string;
  description: string;
  timestamp: string;
}

export interface LeadDetail {
  lead: Lead;
  researchBrief: string | null;
  scoreBreakdown: ScoreBreakdown | null;
  recentEvidenceEvents: EvidenceEventSummary[];
}

// ─── Upstream shapes (from apex-gtm-api LeadsService — see release audit) ────

/** One lead from GET /api/leads → LeadsService.listLeadsForUi. */
export interface UpstreamUiLead {
  id: string;
  name: string;
  title: string;
  company: string;
  domain: string;
  email: string;
  industry: string;
  companySize: string;
  techStack: string[];
  score: number | null;
  scoreBreakdown: Array<{ label: string; value: number }>;
  stage: string;
  source: string;
  emailStatus: "not_sent" | "sent" | "opened" | "replied" | "bounced";
  timeline: Array<{ stage: string; at: string }>;
  createdAt: string;
}

export interface UpstreamLeadsList {
  leads: UpstreamUiLead[];
  total: number;
}

/** One person from GET /api/leads/people/:id → LeadsService.getPersonDetail. */
export interface UpstreamPersonDetail {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  seniority: string | null;
  department: string | null;
  linkedinUrl: string | null;
  location: null;
  bio: null;
  bestEmail: string | null;
  score: number | null;
  qualifiedAt: string | null;
  emails: Array<{
    email: string;
    pattern: string | null;
    source: string | null;
    confidence: number | null;
    verified: boolean | null;
    verificationResult: string | null;
  }>;
  scoreBreakdown: Array<{ category: string; points: number }>;
}

// ─── Pure transforms (unit-tested; no req/res) ──────────────────────────────

/** Map only explicit persisted verification results; absence stays unknown. */
export function verifiedEmailStatus(
  email: UpstreamPersonDetail["emails"][number] | undefined,
): Lead["emailStatus"] {
  if (!email) return null;
  const result = email.verificationResult?.trim().toLowerCase();
  if (email.verified === true || result === "valid" || result === "deliverable") {
    return "DELIVERABLE";
  }
  if (result === "catch_all" || result === "catch-all" || result === "accept_all") {
    return "CATCH_ALL";
  }
  return null;
}

function emptyToNull(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/** Map one upstream UI lead → the openapi Lead shape. */
export function shapeLead(u: UpstreamUiLead): Lead {
  return {
    id: u.id,
    name: u.name,
    title: u.title ?? "",
    email: u.email ?? "",
    company: u.company ?? "",
    domain: emptyToNull(u.domain),
    // Not modelled upstream — synthesized as null (no logo/avatar source).
    companyLogoUrl: null,
    avatarUrl: null,
    score: u.score == null ? null : Math.trunc(u.score),
    stage: u.stage,
    // No geo source in listLeadsForUi.
    geo: null,
    country: null,
    industry: emptyToNull(u.industry),
    // Company.employeeRange → headcountEstimate.
    headcountEstimate: emptyToNull(u.companySize),
    // No cohort, verification, or intent-evidence source exists on this list
    // endpoint. Unknown is not a low-confidence business verdict.
    cohort: null,
    emailStatus: null,
    intentSignals: null,
    // timeline is always [] upstream and sentAt is not surfaced.
    lastContactedAt: null,
    // No per-recipient send-policy source upstream (liveSendEnabled is the
    // env gate OUTREACH_LIVE_FOR_ORGS, unsubscribe config has no API, postal
    // address only lives on /orgs/me) — null, never a fabricated all-false.
    sendPolicy: null,
    createdAt: u.createdAt,
  };
}

/** Map the upstream {leads,total} envelope → openapi PaginatedLeads. */
export function shapeLeadsList(
  u: UpstreamLeadsList,
  page: number,
  limit: number,
): PaginatedLeads {
  return {
    items: (u.leads ?? []).map(shapeLead),
    total: u.total ?? 0,
    page,
    limit,
  };
}

/**
 * apex-gtm-api's getPersonDetail returns at most a single
 * {category:'Total',points} breakdown row (LeadScore.breakdown is not decomposed
 * into fit/intent/engagement/timing). We map the available total into `fit`
 * and zero the rest — lossy, see audit. researchBrief + recentEvidenceEvents
 * have no source on release and are returned as a default brief + [].
 */
export function shapePersonScoreBreakdown(
  _u: UpstreamPersonDetail,
): ScoreBreakdown | null {
  // Upstream exposes only an aggregate total. Assigning that total to "fit"
  // and zero to the other categories would invent a decomposition.
  return null;
}

/** Map upstream person detail → the openapi Lead embedded in LeadDetail. */
export function shapePersonAsLead(u: UpstreamPersonDetail): Lead {
  return {
    id: u.id,
    name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
    title: u.title ?? "",
    email: u.bestEmail ?? "",
    company: u.company ?? "",
    domain: emptyToNull(u.companyDomain),
    companyLogoUrl: null,
    avatarUrl: null,
    score: u.score == null ? null : Math.trunc(u.score),
    // Derive only from persisted qualification/email evidence.
    stage: u.qualifiedAt ? "qualified" : u.bestEmail ? "enriched" : "sourced",
    geo: null,
    country: null,
    // industry is not returned by getPersonDetail.
    industry: null,
    headcountEstimate: null,
    cohort: null,
    emailStatus: verifiedEmailStatus(
      u.emails.find((email) => email.email === u.bestEmail) ?? u.emails[0],
    ),
    intentSignals: null,
    lastContactedAt: null,
    // Same honesty rule as shapeLead: no real policy source → null.
    sendPolicy: null,
    createdAt: null,
  };
}

/**
 * Compose the full LeadDetail. researchBrief + recentEvidenceEvents have no
 * source on release/go-live-2026-06-01 (getPersonDetail returns neither), so
 * they remain unavailable rather than becoming empty or zero-valued claims.
 */
export function shapeLeadDetail(u: UpstreamPersonDetail): LeadDetail {
  return {
    lead: shapePersonAsLead(u),
    researchBrief: null,
    scoreBreakdown: shapePersonScoreBreakdown(u),
    recentEvidenceEvents: [],
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

router.get(
  "/leads",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = ListLeadsQueryParams.safeParse(req.query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 25;
    const minScore = parsed.success ? parsed.data.minScore : undefined;
    const q = parsed.success ? parsed.data.q : undefined;

    // FE query → apex-gtm-api query: q→search, limit→per_page, minScore→min_score.
    // geo/cohort/industry/intentSignal/sort are NOT honored upstream (audit).
    const search = new URLSearchParams();
    search.set("page", String(page));
    search.set("per_page", String(limit));
    if (q) search.set("search", q);
    if (minScore !== undefined) search.set("min_score", String(minScore));

    try {
      const upstream = (await apex.get(
        `/leads?${search.toString()}`,
        { req },
      )) as UpstreamLeadsList;
      res.json(shapeLeadsList(upstream, page, limit));
    } catch (err) {
      if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      next(err);
    }
  },
);

router.get(
  "/leads/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = GetLeadParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }

    // FE GET /leads/{id} → apex-gtm-api GET /api/leads/people/{id} (audit).
    try {
      const upstream = (await apex.get(
        `/leads/people/${encodeURIComponent(parsed.data.id)}`,
        { req },
      )) as UpstreamPersonDetail;
      res.json(shapeLeadDetail(upstream));
    } catch (err) {
      if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      // getPersonDetail uses findFirstOrThrow → upstream 404 on a missing id.
      if (err instanceof UpstreamError && err.status === 404) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      next(err);
    }
  },
);

// GAP: no per-lead outbound trigger exists on apex-gtm-api. The only
// orchestration entry is POST /api/pipeline/run, which is org-wide / all-ICP
// and single-flight — aliasing it to one lead id is semantically wrong and
// dangerous (audit). Surface honestly as unavailable.
router.post(
  "/leads/:id/trigger-outbound",
  (req: Request, res: Response): void => {
    const parsed = GetLeadParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    gapResponse(res, "lead-trigger-outbound");
  },
);

// Resolve Person ids on the tenant-scoped backend. The browser never submits
// recipient email or org identity, preventing a caller from suppressing an
// arbitrary address/cross-tenant row through this BFF.
router.post("/leads/bulk-suppress", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const body = parseBulkPersonSuppressionBody(req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const result = await apex.post(
      BULK_PERSON_SUPPRESSION_PATH,
      { req },
      body,
    );
    res.json(result);
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    if (err instanceof UpstreamError && err.status === 400) {
      res.status(400).json(err.body);
      return;
    }
    next(err);
  }
});

export default router;
