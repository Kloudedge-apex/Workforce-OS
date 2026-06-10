import { Router } from "express";
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
      if (err.status === 409) {
        const message =
          err.body && typeof err.body === "object" && "message" in err.body
            ? String((err.body as { message: unknown }).message)
            : "A pipeline run is already in progress";
        res.status(409).json({ runId: "", queued: false, message });
        return;
      }
    }
    next(err);
  }
});

// GAP: there is no deployed endpoint that serves a per-run evidence timeline
// (TimelineNode[]). GET /api/graph/runs/:id returns only the `run` half; the
// EvidenceEvent rows that would populate `timeline` are read-only-internal and
// exposed by no controller. The BFF cannot reach the DB directly, so we degrade
// honestly rather than return a run with a fabricated/empty timeline.
router.get("/runs/:id", (_req, res) => {
  return gapResponse(res, "run-evidence-timeline");
});

export default router;
