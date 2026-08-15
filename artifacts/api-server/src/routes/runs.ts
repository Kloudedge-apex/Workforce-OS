import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { ListRunsQueryParams } from "@workspace/api-zod";
import { requireAuthenticatedReviewer } from "../lib/authenticated-reviewer";
import { apex, UpstreamError } from "../upstream/apex-client";

const router = Router();

// ── openapi response shapes this BFF returns ────────────────────────────────

/** The openapi `GraphRun` shape (one item of PaginatedRuns). */
export interface GraphRunShape {
  id: string;
  status: "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  stagesCompleted: string[];
  leadsScored: number | null;
  artifactsGenerated: number | null;
  durationMs: number;
  costUsd: number | null;
  approvedBy: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** The openapi `PaginatedRuns` envelope. */
export interface PaginatedRunsShape {
  items: GraphRunShape[];
  total: number;
  page: number;
  limit: number;
}

/** The openapi `TriggerResult` shape. */
export interface TriggerResultShape {
  runId: string;
  queued: boolean;
  message: string;
}

// ── upstream (apex-gtm-api) shapes ───────────────────────────────────────────

/** The `state` JSON snapshot persisted on a GraphRun (snapshotPublicState). */
export interface UpstreamGraphRunState {
  stagesCompleted?: string[] | null;
  counts?: {
    companies?: number;
    people?: number;
    scored?: number;
    outreach?: number;
  } | null;
  approvedBy?: string | null;
}

/** A GraphRun row from apex-gtm-api `GET /api/graph/runs`. */
export interface UpstreamGraphRun {
  id: string;
  graphName?: string | null;
  status: "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  state?: UpstreamGraphRunState | null;
  approvedBy?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

/** Paginated response returned when the upstream receives page or limit. */
export interface UpstreamGraphRunPage {
  items: UpstreamGraphRun[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** The body apex-gtm-api `POST /api/pipeline/run` returns (202). */
export interface UpstreamTrigger {
  message: string;
  graphRunId: string | null;
}

/**
 * The body apex-gtm-api `POST /api/graph/runs/:id/approve|reject` returns
 * (GraphService.resumePipelineGraph). `status` is always "resuming" — the
 * worker dequeues the resume job and drives the graph async.
 */
export interface UpstreamResumeResult {
  status: string;
}

export type RunDecisionUpstreamClient = Pick<typeof apex, "post">;

/**
 * The GraphRunDetail envelope this BFF can honestly serve today: a REAL run
 * header plus the gap sentinel for the timeline half (the EvidenceEvent rows
 * that would populate `timeline` are exposed by no deployed controller).
 */
export interface RunDetailShape {
  run: GraphRunShape;
  timeline: { unavailable: true; feature: string };
}

// ── pure transforms ──────────────────────────────────────────────────────────

/**
 * Return only the stage names explicitly persisted in the public run state.
 */
function deriveAgents(state: UpstreamGraphRunState | null | undefined): string[] {
  const stages = state?.stagesCompleted;
  if (Array.isArray(stages) && stages.length > 0) return stages;
  return [];
}

/**
 * PURE: map ONE upstream GraphRun row → the openapi GraphRun schema.
 *
 * Derived fields:
 *  - stagesCompleted: state.stagesCompleted (else empty)
 *  - leadsScored: state.counts.scored, null when not recorded
 *  - artifactsGenerated: state.counts.outreach, null when not recorded
 *  - durationMs:     completedAt ? (completedAt-startedAt) : (now-startedAt)
 *  - approvedBy:     persisted approval actor, not mislabelled as trigger actor
 *  - costUsd:        null (no per-run cost column)
 */
export function shapeRun(run: UpstreamGraphRun, now: number = Date.now()): GraphRunShape {
  const state = run.state ?? null;
  const counts = state?.counts ?? {};
  const startedMs = new Date(run.startedAt).getTime();
  const completedMs = run.completedAt ? new Date(run.completedAt).getTime() : null;

  return {
    id: run.id,
    status: run.status,
    stagesCompleted: deriveAgents(state),
    leadsScored: counts.scored ?? null,
    artifactsGenerated: counts.outreach ?? null,
    durationMs: completedMs !== null ? completedMs - startedMs : now - startedMs,
    costUsd: null,
    approvedBy: run.approvedBy ?? state?.approvedBy ?? null,
    startedAt: new Date(run.startedAt).toISOString(),
    completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
  };
}

/**
 * PURE: map either the paginated upstream response or the legacy bare array
 * into the public PaginatedRuns envelope. New callers use the real upstream
 * count; the array branch remains only for rolling-deploy compatibility.
 */
export function shapeRunsList(
  upstream: UpstreamGraphRunPage | UpstreamGraphRun[],
  opts: { page: number; limit: number; status?: string; now?: number },
): PaginatedRunsShape {
  const now = opts.now ?? Date.now();
  const rows = Array.isArray(upstream) ? upstream : upstream.items;
  let items = rows.map((r) => shapeRun(r, now));
  if (opts.status) {
    items = items.filter((i) => i.status === opts.status);
  }
  return {
    items,
    total: Array.isArray(upstream) ? items.length : upstream.total,
    page: Array.isArray(upstream) ? opts.page : upstream.page,
    limit: Array.isArray(upstream) ? opts.limit : upstream.limit,
  };
}

/**
 * PURE: map the upstream POST /api/pipeline/run body → the openapi TriggerResult.
 * queued is true iff a graphRunId came back (the run was actually enqueued).
 */
export function shapeTrigger(upstream: UpstreamTrigger): TriggerResultShape {
  return {
    runId: upstream.graphRunId ?? "",
    queued: upstream.graphRunId != null,
    message: upstream.message,
  };
}

/**
 * PURE: extract the human-readable `message` from an upstream (NestJS) error
 * body, falling back when the body carries none. Nest exception bodies look
 * like `{ statusCode, message, error }`; we pass `message` through VERBATIM so
 * the FE can show the reviewer exactly what the backend said (e.g. the
 * single-flight "A pipeline graph is already awaiting_approval for this org
 * (runId=…)" or the resume conflict "Graph run is COMPLETED, not
 * AWAITING_APPROVAL").
 */
export function upstreamMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return fallback;
}

/**
 * PURE: find one run in the upstream runs LIST and wrap it in the
 * GraphRunDetail envelope. Returns null when the run is not in the window the
 * list exposes (the backend hard-caps the list at the 20 newest rows).
 *
 * The backend provides a dedicated tenant-scoped run read, while the per-run
 * evidence timeline still has no controller. We therefore keep
 * `timeline` as the honest gap sentinel the FE already maps to its
 * "not available" half. Replace with a real per-run proxy once a dedicated
 * upstream endpoint (header + evidence timeline) ships.
 */
export function shapeRunDetail(
  upstream: UpstreamGraphRun[],
  id: string,
  now: number = Date.now(),
): RunDetailShape | null {
  const found = upstream.find((r) => r.id === id);
  if (!found) return null;
  return {
    run: shapeRun(found, now),
    timeline: { unavailable: true, feature: "run-evidence-timeline" },
  };
}

// ── routes ───────────────────────────────────────────────────────────────────

router.get("/runs", async (req, res, next) => {
  const parsed = ListRunsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { page, limit, status } = parsed.data;

  try {
    const search = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) search.set("status", status);
    const upstream = (await apex.get(
      `/graph/runs?${search.toString()}`,
      { req },
    )) as UpstreamGraphRunPage | UpstreamGraphRun[];
    res.json(shapeRunsList(upstream, { page, limit, status }));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
      throw err;
    }
    next(err);
  }
});

router.post("/runs/trigger", async (req, res, next) => {
  try {
    // openapi /runs/trigger has no request body; pipeline/run accepts an
    // optional {stage} we omit so the backend defaults to a full run.
    const upstream = (await apex.post("/pipeline/run", { req })) as UpstreamTrigger;
    res.status(202).json(shapeTrigger(upstream));
  } catch (err) {
    if (err instanceof UpstreamError) {
      if (err.status === 401 || err.status === 403) throw err;
      // Single-flight conflict: a graph is already in-flight for this org.
      // The verbatim upstream message carries the in-flight run's status and
      // id ("… already awaiting_approval for this org (runId=…)"), which the
      // FE parses to point the user at the blocking run.
      if (err.status === 409) {
        const message = upstreamMessage(err.body, "A pipeline run is already in progress");
        res.status(409).json({ runId: "", queued: false, message });
        return;
      }
    }
    next(err);
  }
});

// GET /runs/:id — real tenant-scoped run header, timeline still a gap. The
// `timeline` half stays the honest gap sentinel —
// the EvidenceEvent rows that would populate it are exposed by no deployed
// controller, and the BFF cannot reach the DB directly.
router.get("/runs/:id", async (req, res, next) => {
  try {
    const id = req.params["id"]!;
    const upstream = (await apex.get(
      `/graph/runs/${encodeURIComponent(id)}`,
      { req },
    )) as UpstreamGraphRun;
    const detail = shapeRunDetail([upstream], id);
    if (!detail) throw new Error("Run detail response id did not match the request");
    res.json(detail);
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
    if (err instanceof UpstreamError && err.status === 404) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next(err);
  }
});

// POST /runs/:id/approve and /runs/:id/reject — REAL via the upstream
// POST /api/graph/runs/:id/{approve|reject} (GraphController), which resumes a
// graph paused at the human_approval interrupt with the reviewer's decision.
//
// Mirrors the artifact-approve proxy pattern (artifacts.ts): same auth/org
// scoping (apex-client forwards the caller's Clerk Bearer token + x-org-id so
// the upstream org guard authorizes it), and the upstream body field the FE
// schema omits ({ approvedBy }) is injected from the authenticated Clerk user.
//
// Error passthrough:
//  - 404 → 404 { error: "Not found" } (run does not exist in this org)
//  - 409 → 409 { message } VERBATIM ("Graph run is <STATUS>, not
//    AWAITING_APPROVAL") so the FE can tell the reviewer exactly why the
//    decision didn't apply (e.g. someone else already decided).
export function createRunDecisionRouter(
  upstreamClient: RunDecisionUpstreamClient = apex,
) {
  const decisionRouter = Router();

  function resumeDecisionHandler(decision: "approve" | "reject") {
    return async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
      const reviewerId = requireAuthenticatedReviewer(req, res);
      if (reviewerId === null) return;

      try {
        const upstream = (await upstreamClient.post(
          `/graph/runs/${encodeURIComponent(req.params["id"]!)}/${decision}`,
          { req },
          { approvedBy: reviewerId },
        )) as UpstreamResumeResult;
        res.json(upstream);
      } catch (err) {
        if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
        if (err instanceof UpstreamError && err.status === 404) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        if (err instanceof UpstreamError && err.status === 409) {
          res.status(409).json({
            message: upstreamMessage(err.body, "Run is no longer awaiting approval"),
          });
          return;
        }
        next(err);
      }
    };
  }

  decisionRouter.post("/runs/:id/approve", resumeDecisionHandler("approve"));
  decisionRouter.post("/runs/:id/reject", resumeDecisionHandler("reject"));
  return decisionRouter;
}

router.use(createRunDecisionRouter());

export default router;
