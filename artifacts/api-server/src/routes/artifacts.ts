import { Router } from "express";
import { apex } from "../upstream/apex-client";
import { UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";

const router = Router();

/**
 * Raw OutreachArtifact row as returned by apex-gtm-api
 * (GET /api/outreach-artifacts[/:id]). Dates arrive as ISO strings over HTTP.
 * Mirrors the deployed prisma model (schema.prisma OutreachArtifact). The FE
 * OutreachArtifact schema demands rich nested objects (recipient/citations/
 * evaluatorScores/sendPolicy) that DO NOT exist on this model — they are
 * synthesized/stubbed in shapeArtifact (see Phase-2 release audit).
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

/** FE OutreachArtifact shape (lib/api-spec/openapi.yaml #/components/schemas/OutreachArtifact). */
export interface ShapedArtifact {
  id: string;
  status: string;
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
  citations: Array<{ factId: string; claim: string; source: string }>;
  evaluatorScores: {
    pii: number;
    hallucination: number;
    citationCoverage: number;
    toxicity: number;
  };
  sendPolicy: {
    liveSendEnabled: boolean;
    postalAddressSet: boolean;
    unsubscribeConfigured: boolean;
    recipientSuppressed: boolean;
  };
  createdAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  rejectionReason: string | null;
  graphRunId: string | null;
  cohort: string | null;
}

export interface PaginatedArtifacts {
  items: ShapedArtifact[];
  total: number;
  page: number;
  limit: number;
}

function payloadString(payload: unknown, key: string): string | undefined {
  if (payload && typeof payload === "object" && key in payload) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

/**
 * PURE: map a raw apex-gtm-api OutreachArtifact row → the FE OutreachArtifact shape.
 *
 * Scalars map 1:1. The four nested objects required by the FE schema have NO
 * backing store on the deployed model and are SYNTHESIZED/STUBBED:
 *  - recipient: best-effort from scalar `recipientRef` + captured `payload` Json
 *    (no Person FK exists). name/company/title fall back from payload then to ''.
 *  - citations: [] — not persisted (evaluator output is LangSmith-only).
 *  - evaluatorScores: zeros — not persisted (no EvaluatorFact DB table).
 *  - sendPolicy: conservative false defaults; recipientSuppressed mirrors the
 *    SUPPRESSED status (the only SUPPRESSED signal queryable here).
 * approvedAt/rejectionReason are derived from reviewedAt/reviewerNote gated on status.
 */
export function shapeArtifact(a: UpstreamArtifact): ShapedArtifact {
  const recipientRef = a.recipientRef ?? "";
  return {
    id: a.id,
    status: a.status,
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
    citations: [],
    evaluatorScores: {
      pii: 0,
      hallucination: 0,
      citationCoverage: 0,
      toxicity: 0,
    },
    sendPolicy: {
      liveSendEnabled: false,
      postalAddressSet: false,
      unsubscribeConfigured: false,
      recipientSuppressed: a.status === "SUPPRESSED",
    },
    createdAt: a.createdAt,
    approvedAt: a.status === "APPROVED" ? (a.reviewedAt ?? null) : null,
    sentAt: a.sentAt ?? null,
    rejectionReason: a.status === "REJECTED" ? (a.reviewerNote ?? null) : null,
    graphRunId: a.graphRunId ?? null,
    cohort: payloadString(a.payload, "cohort") ?? null,
  };
}

/**
 * PURE: wrap a full upstream array into the FE PaginatedArtifacts envelope.
 *
 * The backend returns a bare array capped at 100 newest rows with NO server-side
 * count/offset, so pagination is BFF-side: slice by (page,limit). `total` is the
 * size of the returned array (accurate only up to the 100-row cap).
 */
export function shapePaginatedArtifacts(
  upstream: UpstreamArtifact[],
  page: number,
  limit: number,
): PaginatedArtifacts {
  const total = upstream.length;
  const offset = (page - 1) * limit;
  const items = upstream.slice(offset, offset + limit).map(shapeArtifact);
  return { items, total, page, limit };
}

function toInt(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// GET /artifacts/pending — REAL via GET /api/outreach-artifacts?status=PENDING_REVIEW.
router.get("/artifacts/pending", async (req, res, next) => {
  const page = toInt(req.query["page"], 1);
  const limit = toInt(req.query["limit"], 5);
  try {
    const upstream = (await apex.get(
      "/outreach-artifacts?status=PENDING_REVIEW",
      { req },
    )) as UpstreamArtifact[];
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
  const path = status
    ? `/outreach-artifacts?status=${encodeURIComponent(status)}`
    : "/outreach-artifacts";
  try {
    const upstream = (await apex.get(path, { req })) as UpstreamArtifact[];
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

// POST /artifacts/:id/suppress — GAP. No authenticated per-artifact suppress
// endpoint exists on the release; SuppressionService is only reachable via the
// public unsubscribe flow and nothing flips an artifact to SUPPRESSED on demand.
router.post("/artifacts/:id/suppress", (_req, res) => {
  return gapResponse(res, "artifact-suppress");
});

// POST /artifacts/bulk-approve — GAP. No bulk-approve controller/service method,
// and no queryable per-artifact evaluator score in the DB to gate on (the
// "approve artifacts that pass evaluators" semantics cannot be honored).
router.post("/artifacts/bulk-approve", (_req, res) => {
  return gapResponse(res, "artifact-bulk-approve");
});

export default router;
