import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";
import { gapResponse } from "../lib/unavailable";

const router = Router();

// ── openapi response shapes this BFF returns ────────────────────────────────

/** The openapi `GraphRun` shape (one item of PaginatedRuns). */
export interface GraphRunShape {
  id: string;
  status: "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED";
  agentsInvolved: string[];
  leadsSourced: number;
  artifactsGenerated: number;
  durationMs: number;
  costUsd: number;
  triggeredBy: string;
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
 * Default agent roster a pipeline-supervisor graph drives. The GraphRun row
 * does not persist a discrete agentsInvolved list, so we derive it from the
 * stages the run has completed (state.stagesCompleted), falling back to the
 * full supervisor roster when no stage data is present.
 */
const SUPERVISOR_AGENTS = ["supervisor", "sourcing", "enrichment", "scoring", "outreach"];

function deriveAgents(state: UpstreamGraphRunState | null | undefined): string[] {
  const stages = state?.stagesCompleted;
  if (Array.isArray(stages) && stages.length > 0) return stages;
  return SUPERVISOR_AGENTS;
}

/**
 * PURE: map ONE upstream GraphRun row → the openapi GraphRun schema.
 *
 * Synthesized/derived fields (NOT persisted per-run upstream):
 *  - agentsInvolved: derived from state.stagesCompleted (else supervisor roster)
 *  - leadsSourced:   state.counts.scored ?? counts.companies ?? 0
 *  - artifactsGenerated: state.counts.outreach ?? 0
 *  - durationMs:     completedAt ? (completedAt-startedAt) : (now-startedAt)
 *  - triggeredBy:    approvedBy ?? state.approvedBy ?? "system"
 *  - costUsd:        0 (no per-run cost column; only aggregated elsewhere)
 *  - status:         CANCELLED → FAILED (openapi enum omits CANCELLED)
 */
export function shapeRun(run: UpstreamGraphRun, now: number = Date.now()): GraphRunShape {
  const state = run.state ?? null;
  const counts = state?.counts ?? {};
  const startedMs = new Date(run.startedAt).getTime();
  const completedMs = run.completedAt ? new Date(run.completedAt).getTime() : null;

  return {
    id: run.id,
    status: run.status === "CANCELLED" ? "FAILED" : run.status,
    agentsInvolved: deriveAgents(state),
    leadsSourced: counts.scored ?? counts.companies ?? 0,
    artifactsGenerated: counts.outreach ?? 0,
    durationMs: completedMs !== null ? completedMs - startedMs : now - startedMs,
    costUsd: 0,
    triggeredBy: run.approvedBy ?? state?.approvedBy ?? "system",
    startedAt: new Date(run.startedAt).toISOString(),
    completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
  };
}

/**
 * PURE: map the bare upstream `GraphRun[]` (listGraphRuns) → the openapi
 * PaginatedRuns envelope. The backend ignores page/limit/status and hard-caps
 * at 20 with no total count, so we honestly post-filter by status and report
 * total = the number of rows we actually have. (True server-side pagination is
 * a backend gap — see audit notes.)
 */
export function shapeRunsList(
  upstream: UpstreamGraphRun[],
  opts: { page: number; limit: number; status?: string; now?: number },
): PaginatedRunsShape {
  const now = opts.now ?? Date.now();
  let items = upstream.map((r) => shapeRun(r, now));
  if (opts.status) {
    items = items.filter((i) => i.status === opts.status);
  }
  return {
    items,
    total: items.length,
    page: opts.page,
    limit: opts.limit,
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
 * INTERIM by design: there is no dedicated upstream run-detail endpoint this
 * BFF can consume for the full GraphRunDetail (the per-run timeline has no
 * controller), so we serve the REAL run header from the list window and keep
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
  const page = parseInt((req.query.page as string) ?? "1", 10);
  const limit = parseInt((req.query.limit as string) ?? "20", 10);
  const status = req.query.status as string | undefined;

  try {
    const upstream = (await apex.get("/graph/runs", { req })) as UpstreamGraphRun[];
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

// GET /runs/:id — run header REAL (interim), timeline still a gap.
//
// INTERIM until a dedicated upstream run-detail endpoint exists: we fetch the
// upstream runs LIST (newest 20) and look the run up there, so RunDetail can
// render the real status/counts/approval state instead of the unavailable
// state for every run. The `timeline` half stays the honest gap sentinel —
// the EvidenceEvent rows that would populate it are exposed by no deployed
// controller, and the BFF cannot reach the DB directly.
router.get("/runs/:id", async (req, res, next) => {
  try {
    const upstream = (await apex.get("/graph/runs", { req })) as UpstreamGraphRun[];
    const detail = shapeRunDetail(upstream, req.params["id"]!);
    if (!detail) {
      // Not in the 20-row list window. The run may simply be older than the
      // window (NOT necessarily deleted), so degrade to the gap sentinel the
      // FE maps to "not available" rather than 404ing a run that may exist.
      return gapResponse(res, "run-evidence-timeline");
    }
    res.json(detail);
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
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
function resumeDecisionHandler(decision: "approve" | "reject") {
  return async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const upstream = (await apex.post(
        `/graph/runs/${encodeURIComponent(req.params["id"]!)}/${decision}`,
        { req },
        { approvedBy: req.clerkUserId ?? "bff" },
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

router.post("/runs/:id/approve", resumeDecisionHandler("approve"));
router.post("/runs/:id/reject", resumeDecisionHandler("reject"));

export default router;
