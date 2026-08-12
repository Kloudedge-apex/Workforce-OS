import { Router } from "express";
import { apex } from "../upstream/apex-client";
import { UpstreamError } from "../upstream/apex-client";
import { requireAuthenticatedReviewer } from "../lib/authenticated-reviewer";
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
  purpose?: string;
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

export type ShapedArtifactPurpose = "OUTBOUND" | "REPLY" | "FOLLOW_UP";

export interface ShapedArtifactApprovalEligibility {
  eligible: boolean;
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
  purpose: ShapedArtifactPurpose;
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
  bodyText: string;
  bodyHtml: string | null;
  citations: ShapedCitation[];
  evaluatorScores: ShapedEvaluatorScores | null;
  sendPolicy: ShapedSendPolicy | null;
  refusal: ShapedRefusal;
  approvalEligibility: ShapedArtifactApprovalEligibility;
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

export type ArtifactDecisionUpstreamClient = Pick<typeof apex, "post">;

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
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function nonBlankString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function strictStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || candidate.trim().length === 0)
      return null;
    result.push(candidate);
  }
  return result;
}

type ReviewerFactCategory = "firmographic" | "person" | "signal" | "icp_fit";

const REVIEWER_FACT_CATEGORIES = new Set<ReviewerFactCategory>([
  "firmographic",
  "person",
  "signal",
  "icp_fit",
]);

function parseReviewerFacts(
  value: unknown,
): Map<string, { id: string; category: ReviewerFactCategory }> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const facts = new Map<
    string,
    { id: string; category: ReviewerFactCategory }
  >();
  for (const rawFact of value) {
    const fact = asRecord(rawFact);
    const id = nonBlankString(fact?.["id"]);
    const category = nonBlankString(fact?.["category"]);
    const source = nonBlankString(fact?.["source"]);
    const claim = nonBlankString(fact?.["text"]);
    if (
      !fact ||
      !id ||
      !category ||
      !REVIEWER_FACT_CATEGORIES.has(category as ReviewerFactCategory) ||
      !source ||
      !claim ||
      facts.has(id)
    ) {
      return null;
    }
    facts.set(id, { id, category: category as ReviewerFactCategory });
  }
  return facts;
}

function shapeArtifactPurpose(value: unknown): ShapedArtifactPurpose {
  return value === "REPLY" || value === "FOLLOW_UP" ? value : "OUTBOUND";
}

function approvalUnavailable(
  reason: string,
): ShapedArtifactApprovalEligibility {
  return { eligible: false, reason };
}

/**
 * Mirror the upstream dispatch validator over the raw artifact row. The BFF is
 * the last layer that can compare reviewer-visible columns with the verbatim
 * payload, including purpose-specific grounding rules, before the generated
 * client loses that raw payload context.
 */
export function shapeArtifactApprovalEligibility(
  artifact: UpstreamArtifact,
): ShapedArtifactApprovalEligibility {
  if (artifact.status !== "PENDING_REVIEW") {
    return approvalUnavailable(
      `Artifact ${artifact.id} is ${artifact.status}; only PENDING_REVIEW can be approved`,
    );
  }

  if (artifact.channel === "HUBSPOT_NOTE") {
    return approvalUnavailable(
      "HubSpot note approval is unavailable because dispatch is not implemented",
    );
  }
  if (artifact.channel !== "EMAIL") {
    return approvalUnavailable(
      `${artifact.channel ?? "UNKNOWN"} approval is unavailable because only email dispatch is supported in this release`,
    );
  }

  const payload = asRecord(artifact.payload);
  if (!payload) {
    return approvalUnavailable(
      "Artifact cannot be approved because its send payload is invalid",
    );
  }

  const to = nonBlankString(payload["to"]);
  const subject = nonBlankString(payload["subject"]);
  const body = nonBlankString(payload["body"]);
  if (!to || !subject || !body) {
    return approvalUnavailable(
      "Artifact cannot be approved without a recipient, subject, and body",
    );
  }
  if (
    to !== artifact.recipientRef ||
    subject !== artifact.subject ||
    body !== artifact.bodyText
  ) {
    return approvalUnavailable(
      "Artifact cannot be approved because the reviewed content does not match the send payload",
    );
  }

  if (shapeArtifactPurpose(artifact.purpose) !== "OUTBOUND") {
    return { eligible: true, reason: null };
  }

  if (payload["refusal"] !== undefined && payload["refusal"] !== null) {
    const refusal = asRecord(payload["refusal"]);
    const missing = strictStringArray(refusal?.["missing"]);
    if (!refusal || !nonBlankString(refusal["reason"]) || missing === null) {
      return approvalUnavailable(
        "Artifact cannot be approved because its refusal metadata is invalid",
      );
    }
    return approvalUnavailable(
      "Artifact cannot be approved because the agent refused to produce a grounded draft",
    );
  }

  const qaIssues = strictStringArray(payload["qaIssues"]);
  if (qaIssues === null) {
    return approvalUnavailable(
      "Artifact cannot be approved because its draft quality metadata is invalid",
    );
  }
  if (qaIssues.length > 0) {
    return approvalUnavailable(
      "Artifact cannot be approved until all draft quality checks pass",
    );
  }

  const selfCheck = asRecord(payload["groundedness_self_check"]);
  const citedFactIds = strictStringArray(
    selfCheck?.["citedFactIds"] ?? selfCheck?.["cited_fact_ids"],
  );
  const unsupportedClaims = strictStringArray(
    selfCheck?.["unsupportedClaims"] ?? selfCheck?.["unsupported_claims"],
  );
  const briefFacts = parseReviewerFacts(payload["brief_facts"]);

  if (
    !selfCheck ||
    citedFactIds === null ||
    citedFactIds.length === 0 ||
    unsupportedClaims === null ||
    unsupportedClaims.length > 0 ||
    !briefFacts ||
    !citedFactIds.every((factId) => briefFacts.has(factId))
  ) {
    return approvalUnavailable(
      "Artifact cannot be approved without a clean, reviewer-visible grounding check",
    );
  }

  if (
    !citedFactIds.some(
      (factId) => briefFacts.get(factId)?.category === "signal",
    )
  ) {
    return approvalUnavailable(
      "Artifact cannot be approved without citing a fresh, non-mock signal",
    );
  }

  return { eligible: true, reason: null };
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
    const source =
      typeof fact["source"] === "string" ? (fact["source"] as string) : "";
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
  const reason =
    missing.length > 0
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
export function shapeEvaluatorScores(
  payload: unknown,
): ShapedEvaluatorScores | null {
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
  const purpose = shapeArtifactPurpose(a.purpose);
  const channel =
    a.channel === "EMAIL" ||
    a.channel === "LINKEDIN" ||
    a.channel === "HUBSPOT_NOTE"
      ? a.channel
      : "UNKNOWN";
  return {
    id: a.id,
    status: a.status,
    purpose,
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
    bodyText: a.bodyText ?? "",
    bodyHtml: a.bodyHtml ?? null,
    citations: shapeCitations(a.payload),
    evaluatorScores: shapeEvaluatorScores(a.payload),
    sendPolicy: null,
    refusal: shapeRefusal(a.payload),
    approvalEligibility: shapeArtifactApprovalEligibility(a),
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
    if (
      err instanceof UpstreamError &&
      (err.status === 401 || err.status === 403)
    )
      throw err;
    next(err);
  }
});

// GET /artifacts — REAL via GET /api/outreach-artifacts (optional ?status=).
router.get("/artifacts", async (req, res, next) => {
  const page = toInt(req.query["page"], 1);
  const limit = toInt(req.query["limit"], 20);
  const status =
    typeof req.query["status"] === "string"
      ? (req.query["status"] as string)
      : undefined;
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (status) query.set("status", status);
  const path = `/outreach-artifacts?${query.toString()}`;
  try {
    const upstream = (await apex.get(path, { req })) as
      | UpstreamArtifact[]
      | UpstreamArtifactPage;
    res.json(shapePaginatedArtifacts(upstream, page, limit));
  } catch (err) {
    if (
      err instanceof UpstreamError &&
      (err.status === 401 || err.status === 403)
    )
      throw err;
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
    if (
      err instanceof UpstreamError &&
      (err.status === 401 || err.status === 403)
    )
      throw err;
    if (err instanceof UpstreamError && err.status === 404) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next(err);
  }
});

function artifactDecisionMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim() !== "") return body;
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return fallback;
}

function approvalWasSaved(body: unknown): boolean {
  const record = asRecord(body);
  if (record?.["approvalSaved"] === true) return true;
  if (record?.["approvalSaved"] === false) return false;

  // Rolling-deploy compatibility with the immediately preceding backend,
  // whose 503 message stated the durable outcome before the boolean shipped.
  const message = artifactDecisionMessage(body, "").toLowerCase();
  return (
    message.includes("was approved but could not be queued") &&
    message.includes("approval is saved")
  );
}

/**
 * Decision routes are injectable so their actor and conflict boundaries can be
 * exercised without a live upstream. The production router still uses `apex`.
 */
export function createArtifactDecisionRouter(
  upstreamClient: ArtifactDecisionUpstreamClient = apex,
) {
  const decisionRouter = Router();

  // Backend REQUIRES { reviewedBy }; derive it only from authenticated request
  // state and fail closed before making any upstream call when it is absent.
  decisionRouter.post("/artifacts/:id/approve", async (req, res, next) => {
    const reviewerId = requireAuthenticatedReviewer(req, res);
    if (reviewerId === null) return;
    const artifactId = req.params["id"]!;

    try {
      const upstream = (await upstreamClient.post(
        `/outreach-artifacts/${encodeURIComponent(artifactId)}/approve`,
        { req },
        { reviewedBy: reviewerId },
      )) as UpstreamArtifact;
      res.json(shapeArtifact(upstream));
    } catch (err) {
      if (
        err instanceof UpstreamError &&
        (err.status === 401 || err.status === 403)
      )
        throw err;
      if (err instanceof UpstreamError && err.status === 404) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (
        err instanceof UpstreamError &&
        (err.status === 400 || err.status === 409)
      ) {
        res.status(err.status).json({
          message: artifactDecisionMessage(
            err.body,
            "Artifact is no longer awaiting approval",
          ),
        });
        return;
      }
      if (err instanceof UpstreamError && err.status === 503) {
        const upstreamBody = asRecord(err.body);
        const approvalSaved = approvalWasSaved(err.body);
        res.status(503).json({
          ...(upstreamBody ?? {}),
          message: artifactDecisionMessage(
            err.body,
            "Artifact approval could not be confirmed",
          ),
          approvalSaved,
          artifactId,
          ...(approvalSaved ? { status: "APPROVED" } : {}),
        });
        return;
      }
      next(err);
    }
  });

  // FE sends { reason }; backend wants { reviewedBy, reviewerNote }.
  decisionRouter.post("/artifacts/:id/reject", async (req, res, next) => {
    const reviewerId = requireAuthenticatedReviewer(req, res);
    if (reviewerId === null) return;
    const reason =
      typeof req.body?.reason === "string"
        ? (req.body.reason as string)
        : undefined;

    try {
      const upstream = (await upstreamClient.post(
        `/outreach-artifacts/${encodeURIComponent(req.params["id"]!)}/reject`,
        { req },
        { reviewedBy: reviewerId, reviewerNote: reason },
      )) as UpstreamArtifact;
      res.json(shapeArtifact(upstream));
    } catch (err) {
      if (
        err instanceof UpstreamError &&
        (err.status === 401 || err.status === 403)
      )
        throw err;
      if (err instanceof UpstreamError && err.status === 404) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (
        err instanceof UpstreamError &&
        (err.status === 400 || err.status === 409)
      ) {
        res.status(err.status).json({
          message: artifactDecisionMessage(
            err.body,
            "Artifact is no longer awaiting review",
          ),
        });
        return;
      }
      next(err);
    }
  });

  return decisionRouter;
}

router.use(createArtifactDecisionRouter());

// POST /artifacts/:id/suppress — server derives org, actor, and recipient from
// the authenticated artifact. The upstream response intentionally separates
// the durable suppression from the artifact CAS: an in-flight/already-sent
// artifact can remain unchanged while every future send is blocked.
router.post("/artifacts/:id/suppress", async (req, res, next) => {
  try {
    const result = await apex.post(artifactSuppressionPath(req.params["id"]!), {
      req,
    });
    res.json(result);
  } catch (err) {
    if (
      err instanceof UpstreamError &&
      (err.status === 401 || err.status === 403)
    )
      throw err;
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
