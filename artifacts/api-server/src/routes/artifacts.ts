import { Router } from "express";
import { apex } from "../upstream/apex-client";
import { UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";

const router = Router();

/**
 * Raw OutreachArtifact row as returned by apex-gtm-api
 * (GET /api/outreach-artifacts[/:id]). Dates arrive as ISO strings over HTTP.
 * Mirrors the deployed prisma model (schema.prisma OutreachArtifact). The FE
 * OutreachArtifact nested objects are mapped from the persisted `payload` Json
 * (brief_facts / groundedness_self_check / refusal / langsmith_run_id) where
 * real data exists, and are `null` where it does not — see shapeArtifact.
 */
export interface UpstreamArtifact {
  id: string;
  orgId?: string;
  graphRunId?: string | null;
  toolName?: string;
  channel?: string;
  recipientRef?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  payload?: unknown;
  status: string;
  reviewerNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  sentAt?: string | null;
  sendReceiptId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

/**
 * One citation row, derived from the persisted research brief
 * (payload.brief_facts on the upstream OutreachArtifact row).
 * `cited` is true when the drafter declared this fact id in its
 * groundedness self-check (payload.groundedness_self_check) —
 * the FE highlights those rows. `date` is present only when the
 * fact carried an ISO date (dated signals).
 */
export interface ShapedCitation {
  factId: string;
  claim: string;
  source: string;
  date?: string;
  cited: boolean;
}

export interface ShapedEvaluatorScores {
  pii: number;
  hallucination: number;
  citationCoverage: number;
  toxicity: number;
}

export interface ShapedSendPolicy {
  liveSendEnabled: boolean;
  postalAddressSet: boolean;
  unsubscribeConfigured: boolean;
  recipientSuppressed: boolean;
}

/** Drafter refusal surfaced for the FE refusal banner. */
export interface ShapedRefusal {
  refused: boolean;
  reason: string | null;
}

/**
 * FE OutreachArtifact shape (lib/api-spec/openapi.yaml #/components/schemas/OutreachArtifact).
 * HONESTY contract: evaluatorScores/sendPolicy are `null` whenever the backend
 * has no real value to report — the FE hides those surfaces. We never invent
 * zeros or all-false policy verdicts.
 */
export interface ShapedArtifact {
  id: string;
  status: string;
  channel: "EMAIL" | "LINKEDIN" | "HUBSPOT_NOTE" | "UNKNOWN";
  recipient: {
    id: string;
    name: string;
    email: string;
    title: string;
    company: string;
    avatarUrl: string | null;
  };
  subject: string;
  bodyHtml: string;
  citations: ShapedCitation[];
  evaluatorScores: ShapedEvaluatorScores | null;
  sendPolicy: ShapedSendPolicy | null;
  refusal: ShapedRefusal;
  langsmithRunId: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  rejectionReason: string | null;
  statusReason: string | null;
  sendReceiptId: string | null;
  graphRunId: string | null;
  cohort: string | null;
}

export interface PaginatedArtifacts {
  items: ShapedArtifact[];
  total: number;
  page: number;
  limit: number;
}

export interface UpstreamArtifactPage {
  items: UpstreamArtifact[];
  total: number;
  page: number;
  limit: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function payloadString(payload: unknown, key: string): string | undefined {
  const rec = asRecord(payload);
  if (!rec) return undefined;
  const v = rec[key];
  return typeof v === "string" ? v : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * PURE: payload.brief_facts (+ payload.groundedness_self_check) → citations.
 *
 * The SDR subgraph persists the structured research brief the drafter actually
 * saw as `brief_facts: [{ id, category, source, text, date? }]`, and the
 * drafter's self-check as `groundedness_self_check`. The self-check is stored
 * with camelCase keys (`citedFactIds`) — the parsed TS object — but we also
 * accept the LLM wire-format key (`cited_fact_ids`) defensively. Facts without
 * a string id and text are dropped (never invented).
 */
export function shapeCitations(payload: unknown): ShapedCitation[] {
  const rec = asRecord(payload);
  if (!rec) return [];
  const rawFacts = rec["brief_facts"];
  if (!Array.isArray(rawFacts)) return [];

  const selfCheck = asRecord(rec["groundedness_self_check"]);
  const citedIds = new Set<string>([
    ...stringArray(selfCheck?.["citedFactIds"]),
    ...stringArray(selfCheck?.["cited_fact_ids"]),
  ]);

  const citations: ShapedCitation[] = [];
  for (const rawFact of rawFacts) {
    const fact = asRecord(rawFact);
    if (!fact) continue;
    const factId = fact["id"];
    const claim = fact["text"];
    if (typeof factId !== "string" || typeof claim !== "string") continue;
    const source = typeof fact["source"] === "string" ? (fact["source"] as string) : "";
    const date = fact["date"];
    citations.push({
      factId,
      claim,
      source,
      ...(typeof date === "string" && date ? { date } : {}),
      cited: citedIds.has(factId),
    });
  }
  return citations;
}

/**
 * PURE: payload.refusal → FE refusal banner data.
 *
 * The drafter persists `refusal: { reason, missing[] }` when it deliberately
 * declined to draft (e.g. no grounded evidence). `missing` items are appended
 * to the reason so the reviewer sees the full persisted signal — both parts
 * are real upstream data, nothing is synthesized.
 */
export function shapeRefusal(payload: unknown): ShapedRefusal {
  const refusal = asRecord(asRecord(payload)?.["refusal"]);
  if (!refusal || typeof refusal["reason"] !== "string") {
    return { refused: false, reason: null };
  }
  const missing = stringArray(refusal["missing"]);
  const reason = missing.length > 0
    ? `${refusal["reason"] as string} (missing: ${missing.join(", ")})`
    : (refusal["reason"] as string);
  return { refused: true, reason };
}

/**
 * PURE: evaluator scores — only when actually persisted on the payload.
 *
 * Today the deployed pipeline does NOT persist per-artifact evaluator scores
 * (they live in LangSmith), so this returns null and the FE hides the score
 * strip. If a future image writes `evaluator_scores: { pii, hallucination,
 * citationCoverage, toxicity }` into the payload, the real numbers flow
 * through. We NEVER fabricate zeros — a 0 PII score is a claim, not a gap.
 */
export function shapeEvaluatorScores(payload: unknown): ShapedEvaluatorScores | null {
  const scores = asRecord(asRecord(payload)?.["evaluator_scores"]);
  if (!scores) return null;
  const pii = scores["pii"];
  const hallucination = scores["hallucination"];
  const citationCoverage = scores["citationCoverage"];
  const toxicity = scores["toxicity"];
  if (
    typeof pii !== "number" ||
    typeof hallucination !== "number" ||
    typeof citationCoverage !== "number" ||
    typeof toxicity !== "number"
  ) {
    return null;
  }
  return { pii, hallucination, citationCoverage, toxicity };
}

/**
 * PURE: map a raw apex-gtm-api OutreachArtifact row → the FE OutreachArtifact shape.
 *
 * Scalars map 1:1. Nested objects:
 *  - recipient: best-effort from scalar `recipientRef` + captured `payload` Json
 *    (no Person FK exists). name/company/title fall back from payload then to ''.
 *  - citations: REAL — mapped from the persisted research brief
 *    (payload.brief_facts) with `cited` flags from the drafter's
 *    groundedness self-check. [] only when the payload has no brief.
 *  - refusal: REAL — payload.refusal surfaced as { refused, reason } so the
 *    FE can render a refusal banner instead of presenting a refusal as a draft.
 *  - evaluatorScores: null unless the payload actually persists scores. We do
 *    NOT fabricate zeros (a zero score is a verdict, not a gap).
 *  - sendPolicy: null — no upstream endpoint reachable from this route reports
 *    the real policy (liveSendEnabled is the env gate OUTREACH_LIVE_FOR_ORGS,
 *    unsubscribe config has no API; /orgs/me only covers postal address). A
 *    partial object would paint fake red "No Postal Address" badges on every
 *    card, so the FE hides the badge until a real org-compliance endpoint
 *    ships. The SUPPRESSED signal still flows through `status`.
 * approvedAt preserves the original review timestamp after later delivery
 * transitions. statusReason carries the persisted reviewer/worker note so an
 * operator can inspect a DELIVERY_UNKNOWN quarantine without guessing.
 */
export function shapeArtifact(a: UpstreamArtifact): ShapedArtifact {
  const recipientRef = a.recipientRef ?? "";
  const channel =
    a.channel === "EMAIL" || a.channel === "LINKEDIN" || a.channel === "HUBSPOT_NOTE"
      ? a.channel
      : "UNKNOWN";
  return {
    id: a.id,
    status: a.status,
    channel,
    recipient: {
      id: recipientRef,
      name: payloadString(a.payload, "name") ?? recipientRef,
      email: recipientRef,
      title: payloadString(a.payload, "title") ?? "",
      company: payloadString(a.payload, "company") ?? "",
      avatarUrl: null,
    },
    subject: a.subject ?? "",
    bodyHtml: a.bodyHtml ?? a.bodyText ?? "",
    citations: shapeCitations(a.payload),
    evaluatorScores: shapeEvaluatorScores(a.payload),
    sendPolicy: null,
    refusal: shapeRefusal(a.payload),
    langsmithRunId: payloadString(a.payload, "langsmith_run_id") ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt ?? a.createdAt,
    approvedAt: a.reviewedAt ?? null,
    sentAt: a.sentAt ?? null,
    rejectionReason: a.status === "REJECTED" ? (a.reviewerNote ?? null) : null,
    statusReason: a.reviewerNote ?? null,
    sendReceiptId: a.sendReceiptId ?? null,
    graphRunId: a.graphRunId ?? null,
    cohort: payloadString(a.payload, "cohort") ?? null,
  };
}

/**
 * PURE: map either the pagination-aware backend envelope or the legacy bare
 * array into the FE PaginatedArtifacts envelope.
 *
 * The array branch is retained during a rolling deploy; its total remains
 * bounded by that legacy backend's 100-row cap. New backends return a real
 * tenant-scoped total and already-sliced items.
 */
export function shapePaginatedArtifacts(
  upstream: UpstreamArtifact[] | UpstreamArtifactPage,
  page: number,
  limit: number,
): PaginatedArtifacts {
  if (!Array.isArray(upstream)) {
    return {
      items: upstream.items.map(shapeArtifact),
      total: upstream.total,
      page: upstream.page,
      limit: upstream.limit,
    };
  }
  const total = upstream.length;
  const offset = (page - 1) * limit;
  const items = upstream.slice(offset, offset + limit).map(shapeArtifact);
  return { items, total, page, limit };
}

function toInt(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function artifactSuppressionPath(id: string): string {
  return `/outreach/suppression/artifacts/${encodeURIComponent(id)}`;
}

// GET /artifacts/pending — REAL via GET /api/outreach-artifacts?status=PENDING_REVIEW.
router.get("/artifacts/pending", async (req, res, next) => {
  const page = toInt(req.query["page"], 1);
  const limit = toInt(req.query["limit"], 5);
  try {
    const upstream = (await apex.get(
      `/outreach-artifacts?status=PENDING_REVIEW&page=${page}&limit=${limit}`,
      { req },
    )) as UpstreamArtifact[] | UpstreamArtifactPage;
    res.json(shapePaginatedArtifacts(upstream, page, limit));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

// GET /artifacts — REAL via GET /api/outreach-artifacts (optional ?status=).
router.get("/artifacts", async (req, res, next) => {
  const page = toInt(req.query["page"], 1);
  const limit = toInt(req.query["limit"], 20);
  const status = typeof req.query["status"] === "string" ? (req.query["status"] as string) : undefined;
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) query.set("status", status);
  const path = `/outreach-artifacts?${query.toString()}`;
  try {
    const upstream = (await apex.get(path, { req })) as UpstreamArtifact[] | UpstreamArtifactPage;
    res.json(shapePaginatedArtifacts(upstream, page, limit));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    next(err);
  }
});

// GET /artifacts/:id — REAL via GET /api/outreach-artifacts/:id.
router.get("/artifacts/:id", async (req, res, next) => {
  try {
    const upstream = (await apex.get(
      `/outreach-artifacts/${encodeURIComponent(req.params["id"]!)}`,
      { req },
    )) as UpstreamArtifact;
    res.json(shapeArtifact(upstream));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    if (err instanceof UpstreamError && err.status === 404) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next(err);
  }
});

// POST /artifacts/:id/approve — REAL via POST /api/outreach-artifacts/:id/approve.
// Backend REQUIRES { reviewedBy } (400 without it); FE schema omits it, so the
// BFF injects reviewedBy from the authenticated Clerk user.
router.post("/artifacts/:id/approve", async (req, res, next) => {
  try {
    const upstream = (await apex.post(
      `/outreach-artifacts/${encodeURIComponent(req.params["id"]!)}/approve`,
      { req },
      { reviewedBy: req.clerkUserId ?? "bff" },
    )) as UpstreamArtifact;
    res.json(shapeArtifact(upstream));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    if (err instanceof UpstreamError && err.status === 404) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next(err);
  }
});

// POST /artifacts/:id/reject — REAL via POST /api/outreach-artifacts/:id/reject.
// FE sends { reason }; backend wants { reviewedBy (REQUIRED), reviewerNote }.
router.post("/artifacts/:id/reject", async (req, res, next) => {
  const reason = typeof req.body?.reason === "string" ? (req.body.reason as string) : undefined;
  try {
    const upstream = (await apex.post(
      `/outreach-artifacts/${encodeURIComponent(req.params["id"]!)}/reject`,
      { req },
      { reviewedBy: req.clerkUserId ?? "bff", reviewerNote: reason },
    )) as UpstreamArtifact;
    res.json(shapeArtifact(upstream));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    if (err instanceof UpstreamError && err.status === 404) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next(err);
  }
});

// POST /artifacts/:id/suppress — server derives org, actor, and recipient from
// the authenticated artifact. The upstream response intentionally separates
// the durable suppression from the artifact CAS: an in-flight/already-sent
// artifact can remain unchanged while every future send is blocked.
router.post("/artifacts/:id/suppress", async (req, res, next) => {
  try {
    const result = await apex.post(
      artifactSuppressionPath(req.params["id"]!),
      { req },
    );
    res.json(result);
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    if (err instanceof UpstreamError && err.status === 404) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (err instanceof UpstreamError && err.status === 400) {
      res.status(400).json(err.body);
      return;
    }
    next(err);
  }
});

// POST /artifacts/bulk-approve — GAP. No bulk-approve controller/service method,
// and no queryable per-artifact evaluator score in the DB to gate on (the
// "approve artifacts that pass evaluators" semantics cannot be honored).
router.post("/artifacts/bulk-approve", (_req, res) => {
  return gapResponse(res, "artifact-bulk-approve");
});

export default router;
