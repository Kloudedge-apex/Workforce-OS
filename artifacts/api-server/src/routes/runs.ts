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
  status:
    | "RUNNING"
    | "AWAITING_APPROVAL"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";
  stagesCompleted: string[];
  leadsScored: number | null;
  artifactsGenerated: number | null;
  durationMs: number;
  costUsd: number | null;
  approvedBy: string | null;
  failureReason: string | null;
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
  stageStatuses?: Record<string, string> | null;
  counts?: {
    companies?: number;
    people?: number;
    scored?: number;
    outreach?: number;
  } | null;
  approvedBy?: string | null;
  messages?: Array<{
    node?: string;
    ts?: string;
    level?: "info" | "warn" | "error";
    text?: string;
  }> | null;
}

/** A GraphRun row from apex-gtm-api `GET /api/graph/runs`. */
export interface UpstreamGraphRun {
  id: string;
  graphName?: string | null;
  status:
    | "RUNNING"
    | "AWAITING_APPROVAL"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED";
  state?: UpstreamGraphRunState | null;
  currentNode?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  startedAt: string;
  lastActivityAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
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

export interface TimelineNodeShape {
  id: string;
  nodeType:
    | "agent_run"
    | "llm_call"
    | "evaluator"
    | "tool_call"
    | "human_action";
  label: string;
  summary: string;
  reasoning?: string | null;
  tokensUsed?: number | null;
  durationMs?: number | null;
  cost?: number | null;
  score?: number | null;
  timestamp: string;
  children: TimelineNodeShape[];
}

/** The public run header and its safe projection of persisted stage history. */
export interface RunDetailShape {
  run: GraphRunShape;
  timeline: TimelineNodeShape[];
}

// ── pure transforms ──────────────────────────────────────────────────────────

/**
 * Return only the stage names explicitly persisted in the public run state.
 */
function deriveAgents(
  state: UpstreamGraphRunState | null | undefined,
): string[] {
  const stages = state?.stagesCompleted;
  if (Array.isArray(stages) && stages.length > 0) return stages;
  return [];
}

/**
 * Convert internal worker failures into bounded, operator-safe guidance. Raw
 * provider, database, and runtime errors can contain tenant data or secret
 * identifiers, so they never cross the BFF boundary.
 */
export function safeRunFailureReason(run: UpstreamGraphRun): string | null {
  if (run.status !== "FAILED") return null;

  const error = run.error?.trim() ?? "";
  if (/Received no input writes for ["']__start__["']/.test(error)) {
    return "The pipeline could not initialize its workflow state. Start a new run.";
  }
  if (error.startsWith("auto-failed:")) {
    return "The pipeline stopped after its automatic retries were exhausted. Start a new run.";
  }

  const failedStage = Object.entries(run.state?.stageStatuses ?? {}).find(
    ([, status]) => status === "FAILED",
  )?.[0];
  const presentation = failedStage
    ? Object.values(STAGE_PRESENTATION).find(
        (item) => item.stage === failedStage,
      )
    : undefined;
  return presentation
    ? `The pipeline failed during ${presentation.label.toLowerCase()}. Start a new run.`
    : "The pipeline failed before it could complete. Start a new run.";
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
export function shapeRun(
  run: UpstreamGraphRun,
  now: number = Date.now(),
): GraphRunShape {
  const state = run.state ?? null;
  const counts = state?.counts ?? {};
  const startedMs = new Date(run.startedAt).getTime();
  const completedMs = run.completedAt
    ? new Date(run.completedAt).getTime()
    : null;

  return {
    id: run.id,
    status: run.status,
    stagesCompleted: deriveAgents(state),
    leadsScored: counts.scored ?? null,
    artifactsGenerated: counts.outreach ?? null,
    durationMs:
      completedMs !== null ? completedMs - startedMs : now - startedMs,
    costUsd: null,
    approvedBy: run.approvedBy ?? state?.approvedBy ?? null,
    failureReason: safeRunFailureReason(run),
    startedAt: new Date(run.startedAt).toISOString(),
    completedAt: run.completedAt
      ? new Date(run.completedAt).toISOString()
      : null,
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

const STAGE_PRESENTATION: Record<
  string,
  { label: string; stage: string; nodeType: TimelineNodeShape["nodeType"] }
> = {
  sourcing_agent: {
    label: "Lead sourcing",
    stage: "sourcing",
    nodeType: "tool_call",
  },
  enrichment_agent: {
    label: "Lead enrichment",
    stage: "enrichment",
    nodeType: "tool_call",
  },
  scoring_agent: {
    label: "Lead scoring",
    stage: "scoring",
    nodeType: "evaluator",
  },
  research_agent: {
    label: "Lead research",
    stage: "research",
    nodeType: "llm_call",
  },
  human_approval: {
    label: "Human approval",
    stage: "approval",
    nodeType: "human_action",
  },
  outreach_agent: {
    label: "Outreach drafting",
    stage: "outreach",
    nodeType: "llm_call",
  },
};

function safeIso(value: string | null | undefined, fallback: string): string {
  const candidate = value ? new Date(value) : null;
  return candidate && Number.isFinite(candidate.getTime())
    ? candidate.toISOString()
    : new Date(fallback).toISOString();
}

function safeStageText(value: string | undefined): string {
  const oneLine = (value ?? "Stage activity recorded")
    .replace(/\s+/g, " ")
    .trim();
  return oneLine.slice(0, 240) || "Stage activity recorded";
}

function fallbackPresentation(node: string) {
  const safeNode = node.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const label = safeNode
    .replace(/_agent$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return {
    label: label || "Pipeline activity",
    stage: safeNode.replace(/_agent$/, ""),
    nodeType: "agent_run" as const,
  };
}

function runSummary(run: UpstreamGraphRun): string {
  if (run.status === "AWAITING_APPROVAL") {
    return "Pipeline paused before drafting and awaits an authorized reviewer.";
  }
  if (run.status === "COMPLETED") return "Pipeline completed.";
  if (run.status === "CANCELLED") return "Pipeline was cancelled.";
  if (run.status === "FAILED") {
    const failedStage = Object.entries(run.state?.stageStatuses ?? {}).find(
      ([, status]) => status === "FAILED",
    )?.[0];
    const presentation = failedStage
      ? Object.values(STAGE_PRESENTATION).find(
          (item) => item.stage === failedStage,
        )
      : undefined;
    return presentation
      ? `Pipeline failed during ${presentation.label.toLowerCase()}.`
      : "Pipeline failed before it could complete.";
  }
  const current = run.currentNode
    ? (
        STAGE_PRESENTATION[run.currentNode] ??
        fallbackPresentation(run.currentNode)
      ).label
    : null;
  return current ? `Pipeline is running: ${current}.` : "Pipeline is running.";
}

/**
 * Project a GraphRun's timestamped public audit messages into a stable UI
 * timeline. Raw provider errors, prompts, recipient data, and evidence payloads
 * are deliberately excluded. Older runs with no messages still receive an
 * authoritative root event instead of an empty or fabricated stage history.
 */
export function shapeRunTimeline(
  upstream: UpstreamGraphRun,
  now: number = Date.now(),
): TimelineNodeShape[] {
  const run = shapeRun(upstream, now);
  const state = upstream.state ?? null;
  const children: TimelineNodeShape[] = [];

  for (const [index, message] of (state?.messages ?? []).entries()) {
    if (!message || typeof message.node !== "string") continue;
    const presentation =
      STAGE_PRESENTATION[message.node] ?? fallbackPresentation(message.node);
    const status = state?.stageStatuses?.[presentation.stage];
    const detail = safeStageText(message.text);
    children.push({
      id: `${upstream.id}:stage:${index}`,
      nodeType: presentation.nodeType,
      label: presentation.label,
      summary: status ? `${detail} · ${status.toLowerCase()}` : detail,
      timestamp: safeIso(message.ts, upstream.startedAt),
      children: [],
    });
  }

  if (
    upstream.status === "AWAITING_APPROVAL" &&
    !children.some((node) => node.nodeType === "human_action")
  ) {
    children.push({
      id: `${upstream.id}:approval-required`,
      nodeType: "human_action",
      label: "Approval required",
      summary:
        "Run paused before outreach drafting; an authorized reviewer must continue or reject it.",
      timestamp: safeIso(upstream.lastActivityAt, upstream.startedAt),
      children: [],
    });
  }

  return [
    {
      id: `${upstream.id}:run`,
      nodeType: "agent_run",
      label: "Pipeline run",
      summary: runSummary(upstream),
      durationMs: run.durationMs,
      timestamp: run.startedAt,
      children,
    },
  ];
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
 * PURE: find one run in the supplied upstream rows and wrap its tenant-scoped
 * header and persisted public stage audit trail in the GraphRunDetail envelope.
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
    timeline: shapeRunTimeline(found, now),
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
    const search = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (status) search.set("status", status);
    const upstream = (await apex.get(`/graph/runs?${search.toString()}`, {
      req,
    })) as UpstreamGraphRunPage | UpstreamGraphRun[];
    res.json(shapeRunsList(upstream, { page, limit, status }));
  } catch (err) {
    if (
      err instanceof UpstreamError &&
      (err.status === 401 || err.status === 403)
    ) {
      throw err;
    }
    next(err);
  }
});

router.post("/runs/trigger", async (req, res, next) => {
  try {
    // openapi /runs/trigger has no request body; pipeline/run accepts an
    // optional {stage} we omit so the backend defaults to a full run.
    const upstream = (await apex.post("/pipeline/run", {
      req,
    })) as UpstreamTrigger;
    res.status(202).json(shapeTrigger(upstream));
  } catch (err) {
    if (err instanceof UpstreamError) {
      if (err.status === 401 || err.status === 403) throw err;
      // Single-flight conflict: a graph is already in-flight for this org.
      // The verbatim upstream message carries the in-flight run's status and
      // id ("… already awaiting_approval for this org (runId=…)"), which the
      // FE parses to point the user at the blocking run.
      if (err.status === 409) {
        const message = upstreamMessage(
          err.body,
          "A pipeline run is already in progress",
        );
        res.status(409).json({ runId: "", queued: false, message });
        return;
      }
    }
    next(err);
  }
});

// GET /runs/:id — the upstream read is tenant-scoped by the authenticated org;
// the BFF exposes only the public run header and safe persisted stage history.
router.get("/runs/:id", async (req, res, next) => {
  try {
    const id = req.params["id"]!;
    const upstream = (await apex.get(`/graph/runs/${encodeURIComponent(id)}`, {
      req,
    })) as UpstreamGraphRun;
    const detail = shapeRunDetail([upstream], id);
    if (!detail)
      throw new Error("Run detail response id did not match the request");
    res.json(detail);
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
    return async (
      req: Request<{ id: string }>,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
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
        if (
          err instanceof UpstreamError &&
          (err.status === 401 || err.status === 403)
        )
          throw err;
        if (err instanceof UpstreamError && err.status === 404) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        if (err instanceof UpstreamError && err.status === 409) {
          res.status(409).json({
            message: upstreamMessage(
              err.body,
              "Run is no longer awaiting approval",
            ),
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
