import { Router, type NextFunction, type Request, type Response } from "express";
import {
  ListLeadsQueryParams,
  GetLeadParams,
  TriggerOutboundParams,
  BulkSuppressLeadsBody,
} from "@workspace/api-zod";
import { apex, UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";

const router = Router();

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
  score: number;
  stage: string;
  geo: string;
  country: string | null;
  industry: string | null;
  headcountEstimate: string | null;
  cohort: "A" | "B";
  emailStatus: "DELIVERABLE" | "HIGH_PROBABILITY" | "CATCH_ALL";
  intentSignals: IntentSignal[];
  lastContactedAt: string | null;
  sendPolicy: SendPolicy | null;
  createdAt: string;
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
  researchBrief: string;
  scoreBreakdown: ScoreBreakdown;
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
  score: number;
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

/**
 * Cohort is NOT modelled in apex-gtm-api. We synthesize it from score so the
 * FE's A/B grouping is stable and deterministic: score >= 70 → "A", else "B".
 */
export function cohortFromScore(score: number): "A" | "B" {
  return score >= 70 ? "A" : "B";
}

/**
 * apex-gtm-api emits lowercase send-state (`not_sent`/`sent`/...). The FE
 * contract is a deliverability enum it does NOT model. listLeadsForUi never
 * returns per-email verification, so we default to HIGH_PROBABILITY (the
 * honest "unverified but plausible" bucket). Synthesized — see audit.
 */
export function emailStatusForLead(
  _upstream: "not_sent" | "sent" | "opened" | "replied" | "bounced",
): "DELIVERABLE" | "HIGH_PROBABILITY" | "CATCH_ALL" {
  return "HIGH_PROBABILITY";
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
    score: Math.trunc(u.score ?? 0),
    stage: u.stage,
    // No geo source in listLeadsForUi.
    geo: "",
    country: null,
    industry: emptyToNull(u.industry),
    // Company.employeeRange → headcountEstimate.
    headcountEstimate: emptyToNull(u.companySize),
    cohort: cohortFromScore(u.score ?? 0),
    emailStatus: emailStatusForLead(u.emailStatus),
    // No intent-signal source upstream — default [].
    intentSignals: [],
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
  u: UpstreamPersonDetail,
): ScoreBreakdown {
  const total =
    u.scoreBreakdown.find((b) => b.category.toLowerCase() === "total")?.points ??
    u.score ??
    0;
  return {
    fit: Math.trunc(total),
    intent: 0,
    engagement: 0,
    timing: 0,
  };
}

/** Map upstream person detail → the openapi Lead embedded in LeadDetail. */
export function shapePersonAsLead(u: UpstreamPersonDetail): Lead {
  const score = u.score ?? 0;
  return {
    id: u.id,
    name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
    title: u.title ?? "",
    email: u.bestEmail ?? "",
    company: u.company ?? "",
    domain: emptyToNull(u.companyDomain),
    companyLogoUrl: null,
    avatarUrl: null,
    score: Math.trunc(score),
    // getPersonDetail does not derive a stage; "qualified" iff qualifiedAt set.
    stage: u.qualifiedAt ? "qualified" : "enriched",
    geo: "",
    country: null,
    // industry is not returned by getPersonDetail.
    industry: null,
    headcountEstimate: null,
    cohort: cohortFromScore(score),
    emailStatus: emailStatusForLead("not_sent"),
    intentSignals: [],
    lastContactedAt: null,
    // Same honesty rule as shapeLead: no real policy source → null.
    sendPolicy: null,
    // getPersonDetail does not return createdAt — default to empty ISO.
    createdAt: "",
  };
}

/**
 * Compose the full LeadDetail. researchBrief + recentEvidenceEvents have no
 * source on release/go-live-2026-06-01 (getPersonDetail returns neither), so
 * they degrade honestly to a default brief and an empty event list.
 */
export function shapeLeadDetail(u: UpstreamPersonDetail): LeadDetail {
  return {
    lead: shapePersonAsLead(u),
    researchBrief: "",
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
    const stage = parsed.success ? parsed.data.stage : undefined;

    // FE query → apex-gtm-api query: q→search, limit→per_page, minScore→min_score.
    // geo/cohort/industry/intentSignal/sort are NOT honored upstream (audit).
    const search = new URLSearchParams();
    search.set("page", String(page));
    search.set("per_page", String(limit));
    if (q) search.set("search", q);
    if (minScore !== undefined) search.set("min_score", String(minScore));
    if (stage) search.set("stage", stage);

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
    const parsed = TriggerOutboundParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    gapResponse(res, "lead-trigger-outbound");
  },
);

// GAP: no public bulk-suppress route on apex-gtm-api. OutreachSuppression +
// SuppressionService.suppress() exist but key on email (not person id) and are
// only reachable via the signed-token unsubscribe flow — no HTTP batch endpoint
// and no id→email resolution is wired on release (audit). Surface as unavailable.
router.post("/leads/bulk-suppress", (req: Request, res: Response): void => {
  const parsed = BulkSuppressLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  gapResponse(res, "lead-bulk-suppress");
});

export default router;
