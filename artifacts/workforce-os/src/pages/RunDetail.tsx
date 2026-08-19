import React from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  useGetOrgSettings,
  useGetRun,
  customFetch,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Bot,
  Zap,
  FlaskConical,
  Wrench,
  User,
  Activity,
  UserCheck,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { motion } from "framer-motion";
import { cardEnter, springHover, useReducedMotionSafe } from "@/lib/motion";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CountUp } from "@/components/motion/CountUp";
import { isUnavailable, UnavailableState } from "@/lib/unavailable";
import { decisionErrorMessage } from "@/lib/decisionError";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED:
    "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
  RUNNING: "bg-ember-400/15 text-ember-500 border-ember-400/30",
  AWAITING_APPROVAL: "bg-rust-100 text-rust-800 border-rust-200",
  FAILED: "bg-rust-500/10 text-rust-500 border-rust-500/20",
  CANCELLED: "bg-paper-100 text-ink-600 border-paper-200",
};

type RunReviewAccess =
  | { allowed: true; reason: null }
  | { allowed: false; reason: string };

export const RUN_DETAIL_POLL_INTERVAL_MS = 2_000;

function runStatusFromData(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("run" in data)) {
    return null;
  }

  const run = (data as { run?: unknown }).run;
  if (typeof run !== "object" || run === null || !("status" in run)) {
    return null;
  }

  return typeof (run as { status?: unknown }).status === "string"
    ? (run as { status: string }).status
    : null;
}

/**
 * Poll only while the view can still change without another user action.
 * AWAITING_APPROVAL is otherwise stable, while RUNNING is worker-owned async
 * progress and a submitted decision must be observed until that status moves.
 */
export function runDetailRefetchInterval(
  data: unknown,
  decisionSettling: boolean,
): number | false {
  const status = runStatusFromData(data);
  if (status === "RUNNING") return RUN_DETAIL_POLL_INTERVAL_MS;
  if (status === "AWAITING_APPROVAL" && decisionSettling) {
    return RUN_DETAIL_POLL_INTERVAL_MS;
  }
  return false;
}

/**
 * The existing `canReviewArtifacts` field is backed by the same upstream
 * AdminOrManagerGuard that protects run approve/reject. Treat every value other
 * than an explicit true as read-only so a missing or failed capability probe
 * can never expose run decision controls.
 */
export function runReviewAccess(value: unknown): RunReviewAccess {
  if (value === true) return { allowed: true, reason: null };
  if (value === false) {
    return {
      allowed: false,
      reason: "Read-only: your workspace role cannot approve or reject runs.",
    };
  }
  return {
    allowed: false,
    reason:
      "Read-only: review capability is unavailable, so run approve and reject actions are disabled.",
  };
}

const NODE_ICONS: Record<string, React.ReactNode> = {
  agent_run: <Bot className="h-3.5 w-3.5" />,
  llm_call: <Zap className="h-3.5 w-3.5" />,
  evaluator: <FlaskConical className="h-3.5 w-3.5" />,
  tool_call: <Wrench className="h-3.5 w-3.5" />,
  human_action: <User className="h-3.5 w-3.5" />,
};

// Type-colored markers for the timeline rail.
const NODE_DOT_COLORS: Record<string, string> = {
  agent_run: "bg-rust-500",
  llm_call: "bg-signal-info",
  evaluator: "bg-ember-400",
  tool_call: "bg-ink-900",
  human_action: "bg-paper-200 border border-ink-400",
};

// ── Run-level HITL (approve / reject) ────────────────────────────────────────

/**
 * POST the reviewer's decision to the BFF run-HITL proxy
 * (POST /api/runs/:id/approve | /reject). These routes are not in the
 * generated client yet (openapi spec regen pending), so we go through the
 * exported customFetch directly — same base-URL + Clerk bearer plumbing as
 * every generated call; the BFF resolves the org server-side from the token.
 *
 * No optimistic flips: the run row (refetched via `onSettled`) is the only
 * source of truth for whether the decision actually applied.
 */
interface RunDecisionLifecycle {
  onError: () => void;
  onSettled: () => void;
}

function useRunDecision(
  id: string,
  decision: "approve" | "reject",
  lifecycle: RunDecisionLifecycle,
) {
  return useMutation({
    mutationFn: () =>
      customFetch<{ status?: string }>(
        `/api/runs/${encodeURIComponent(id)}/${decision}`,
        { method: "POST" },
      ),
    onSuccess: () => {
      // Honest copy: the backend answers { status: "resuming" } — the worker
      // applies the decision async, so we announce the handoff, not completion.
      toast.success(
        decision === "approve"
          ? "Approved — the run is resuming into drafting"
          : "Rejected — the run will wind down without drafting",
      );
    },
    onError: (err: unknown) => {
      lifecycle.onError();
      toast.error(decisionErrorMessage(err));
    },
    onSettled: lifecycle.onSettled,
  });
}

interface TimelineNodeData {
  id: string;
  nodeType: string;
  label: string;
  summary: string;
  reasoning?: string | null;
  tokensUsed?: number | null;
  durationMs?: number | null;
  cost?: number | null;
  score?: number | null;
  timestamp: string;
  children: TimelineNodeData[];
}

function TimelineNode({
  node,
  depth = 0,
}: {
  node: TimelineNodeData;
  depth?: number;
}) {
  const [expanded, setExpanded] = React.useState(depth === 0);
  const hasChildren = (node.children ?? []).length > 0;

  return (
    <div
      className={cn(
        "relative",
        depth > 0 && "ml-3 pl-5 border-l-2 border-paper-200",
      )}
    >
      {/* Type-colored marker pinned on the connector rail. */}
      {depth > 0 && (
        <span
          className={cn(
            "absolute left-[-7px] top-3.5 h-3 w-3 rounded-full ring-4 ring-paper-50",
            NODE_DOT_COLORS[node.nodeType] ?? "bg-ink-400",
          )}
        />
      )}
      <div
        className={cn(
          "flex items-start gap-3 py-2 px-3 rounded-lg transition-colors hover-elevate",
          hasChildren && "cursor-pointer active-elevate-2",
        )}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 text-ink-400" />
            )
          ) : (
            <div className="w-3.5" />
          )}
          <div className="text-ink-500">
            {NODE_ICONS[node.nodeType] ?? <Bot className="h-3.5 w-3.5" />}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink-900 dark:text-paper-50">
              {node.label}
            </span>
            <span className="text-xs text-ink-400 capitalize">
              {node.nodeType.replace(/_/g, " ")}
            </span>
            {node.score != null && (
              <span
                className={cn(
                  "text-xs font-mono px-1.5 py-0.5 rounded font-tabular",
                  node.score >= 0.85
                    ? "text-signal-positive bg-signal-positive/10"
                    : node.score >= 0.7
                      ? "text-ember-500 bg-ember-400/15"
                      : "text-rust-500 bg-rust-500/10",
                )}
              >
                {Math.round(node.score * 100)}%
              </span>
            )}
            {node.durationMs != null && node.durationMs > 0 && (
              <span className="text-xs text-ink-400 font-mono">
                {node.durationMs}ms
              </span>
            )}
            {node.tokensUsed != null && (
              <span className="text-xs text-ink-400 font-mono">
                {node.tokensUsed} tok
              </span>
            )}
            {node.cost != null && (
              <span className="text-xs text-ink-400 font-mono">
                ${node.cost.toFixed(3)}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-600 mt-0.5">{node.summary}</p>
          <p className="text-[11px] text-ink-400 mt-1">
            {new Date(node.timestamp).toLocaleString()}
          </p>
          {node.reasoning && expanded && (
            <p className="text-xs text-ink-400 mt-1 italic">{node.reasoning}</p>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <TimelineNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RunDetail() {
  const reduced = useReducedMotionSafe();
  const [, params] = useRoute("/runs/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";

  const [decisionSettling, setDecisionSettling] = React.useState(false);
  const decisionLock = React.useRef(false);

  const { data, isLoading, isError, refetch } = useGetRun(id, {
    query: {
      queryKey: ["getRun", id],
      enabled: !!id,
      refetchInterval: (query) =>
        runDetailRefetchInterval(query.state.data, decisionSettling),
    },
  });
  const { data: orgSettings } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });
  const reviewAccess = runReviewAccess(orgSettings?.canReviewArtifacts);

  const releaseDecisionLock = React.useCallback(() => {
    decisionLock.current = false;
    setDecisionSettling(false);
  }, []);

  React.useEffect(() => {
    releaseDecisionLock();
  }, [id, releaseDecisionLock]);

  const runStatus = runStatusFromData(data);
  React.useEffect(() => {
    // Unknown data during a refetch must not reopen the controls. Release only
    // after the server reports a concrete status transition (or on error/id
    // change through the explicit lifecycle handlers above).
    if (runStatus !== null && runStatus !== "AWAITING_APPROVAL") {
      releaseDecisionLock();
    }
  }, [releaseDecisionLock, runStatus]);

  const decisionLifecycle: RunDecisionLifecycle = {
    onError: releaseDecisionLock,
    onSettled: () => void refetch(),
  };
  const approve = useRunDecision(id, "approve", decisionLifecycle);
  const reject = useRunDecision(id, "reject", decisionLifecycle);
  const deciding = decisionSettling || approve.isPending || reject.isPending;
  const handleApprove = () => {
    if (!reviewAccess.allowed) {
      toast.error(reviewAccess.reason);
      return;
    }
    if (decisionLock.current || deciding) return;
    decisionLock.current = true;
    setDecisionSettling(true);
    approve.mutate();
  };
  const handleReject = () => {
    if (!reviewAccess.allowed) {
      toast.error(reviewAccess.reason);
      return;
    }
    if (decisionLock.current || deciding) return;
    decisionLock.current = true;
    setDecisionSettling(true);
    reject.mutate();
  };

  if (isLoading)
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  if (isError)
    return (
      <div className="flex h-full items-center justify-center bg-paper-50">
        <ErrorState
          title="Couldn't load this run"
          description="The run service didn't respond. Your data is safe — try again."
          onRetry={() => refetch()}
        />
      </div>
    );

  // Retain compatibility with an older BFF gap sentinel. Current builds serve
  // the real tenant-scoped run header and mark only the timeline unavailable.
  if (isUnavailable(data))
    return (
      <div className="flex flex-col h-full bg-paper-50">
        <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-6 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/runs")}
            className="text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Runs
          </Button>
          <span className="text-ink-300">/</span>
          <span className="text-sm font-mono text-ink-600">{id}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <UnavailableState feature="the run detail view" />
        </div>
      </div>
    );

  if (!data || !data.run)
    return (
      <div className="flex h-full items-center justify-center bg-paper-50">
        <EmptyState
          icon={Activity}
          title="Run not found"
          description="This run may have been deleted or never existed. Head back to your runs to find it."
          action={
            <Button
              variant="outline"
              size="sm"
              className="border-paper-300 hover-elevate active-elevate-2"
              onClick={() => navigate("/runs")}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Runs
            </Button>
          }
        />
      </div>
    );

  const { run, timeline } = data;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-paper-50">
      <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-6 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/runs")}
          className="text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Runs
        </Button>
        <span className="text-ink-300">/</span>
        <span className="text-sm font-mono text-ink-600">{run.id}</span>
        <Badge className={cn("ml-2 text-xs border", STATUS_STYLES[run.status])}>
          {run.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="max-w-4xl mx-auto w-full p-6 space-y-6">
        {/* Run-level HITL: the pipeline pauses at its human checkpoint BEFORE
            drafting, so without this panel the org's only run sits frozen in
            AWAITING_APPROVAL with no UI escape. Honest about what exists at
            this stage: lead counts above are pipeline-reported; drafts don't
            exist yet. */}
        {run.status === "AWAITING_APPROVAL" && (
          <div
            role="alert"
            data-testid="run-approval-panel"
            className="rounded-xl border-2 border-rust-300 bg-rust-500/5 p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-rust-500 shrink-0" />
              <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">
                Approval needed — paused before drafting
              </h2>
            </div>
            <p className="text-sm text-ink-700 mt-2 leading-relaxed">
              This run stopped at its human checkpoint before writing any
              outreach. The counts above are what the pipeline has reported so
              far; no email drafts exist yet, so there is nothing to preview at
              this stage. Approving resumes the run into drafting — every draft
              still gets its own individual review before anything can send.
              Rejecting ends the run here without drafting anything.
            </p>
            {decisionSettling && (
              <p
                className="mt-4 rounded-md border border-rust-200 bg-white/70 px-3 py-2 text-xs text-ink-600"
                role="status"
                data-testid="run-decision-settling"
              >
                {approve.isPending || reject.isPending
                  ? "Submitting the decision…"
                  : "Decision submitted — waiting for the run status to update."}
              </p>
            )}
            {!reviewAccess.allowed ? (
              <p
                className="mt-4 rounded-md border border-paper-200 bg-paper-100 px-3 py-2 text-xs text-ink-500"
                data-testid="run-review-read-only"
              >
                {reviewAccess.reason}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  className="bg-rust-500 hover:bg-rust-600 text-white shadow-sm active-elevate-2"
                  onClick={handleApprove}
                  disabled={deciding}
                  data-testid="approve-run"
                >
                  {approve.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Approve & Continue
                </Button>
                <Button
                  variant="outline"
                  className="border-rust-300 text-rust-700 dark:text-rust-300 hover-elevate active-elevate-2"
                  onClick={handleReject}
                  disabled={deciding}
                  data-testid="reject-run"
                >
                  {reject.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Reject run
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="space-y-4">
          <Stagger className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StaggerItem>
              <motion.div
                className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                variants={reduced ? undefined : springHover}
                initial="rest"
                whileHover="hover"
              >
                <p className="text-xs text-ink-400 uppercase tracking-wide">
                  Leads scored
                </p>
                {run.leadsScored == null ? (
                  <p className="text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1">
                    Not recorded
                  </p>
                ) : (
                  <CountUp
                    value={run.leadsScored}
                    className="block text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1 font-tabular"
                  />
                )}
              </motion.div>
            </StaggerItem>
            <StaggerItem>
              <motion.div
                className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                variants={reduced ? undefined : springHover}
                initial="rest"
                whileHover="hover"
              >
                <p className="text-xs text-ink-400 uppercase tracking-wide">
                  Drafts recorded
                </p>
                {run.artifactsGenerated == null ? (
                  <p className="text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1">
                    Not recorded
                  </p>
                ) : (
                  <CountUp
                    value={run.artifactsGenerated}
                    className="block text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1 font-tabular"
                  />
                )}
              </motion.div>
            </StaggerItem>
            <StaggerItem>
              <motion.div
                className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                variants={reduced ? undefined : springHover}
                initial="rest"
                whileHover="hover"
              >
                <p className="text-xs text-ink-400 uppercase tracking-wide">
                  Duration
                </p>
                {run.durationMs > 0 ? (
                  <CountUp
                    value={run.durationMs / 1000}
                    decimals={1}
                    suffix="s"
                    className="block text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1 font-tabular"
                  />
                ) : (
                  <p className="text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1">
                    —
                  </p>
                )}
              </motion.div>
            </StaggerItem>
            <StaggerItem>
              <motion.div
                className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                variants={reduced ? undefined : springHover}
                initial="rest"
                whileHover="hover"
              >
                <p className="text-xs text-ink-400 uppercase tracking-wide">
                  Cost
                </p>
                <p className="text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1 font-tabular">
                  {run.costUsd == null ? (
                    "Not recorded"
                  ) : (
                    <>
                      $<CountUp value={run.costUsd} decimals={3} />
                    </>
                  )}
                </p>
              </motion.div>
            </StaggerItem>
          </Stagger>
          <div className="flex flex-wrap gap-3 text-xs text-ink-500">
            <span>
              Stages completed:{" "}
              {run.stagesCompleted.join(", ") || "Not recorded"}
            </span>
            <span>Approved by: {run.approvedBy ?? "Not recorded"}</span>
            <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
            {run.completedAt && (
              <span>
                Completed: {new Date(run.completedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Tenant-scoped timeline projected from the persisted GraphRun audit trail. */}
        {isUnavailable(timeline) ? (
          <div className="bg-ink-0 border border-paper-200 rounded-xl p-5 shadow-sm">
            <h2 className="font-serif font-semibold text-ink-900 dark:text-paper-50 mb-4">
              Evidence Timeline
            </h2>
            <UnavailableState feature="the run timeline while this release updates" />
          </div>
        ) : Array.isArray(timeline) && timeline.length > 0 ? (
          <div className="bg-ink-0 border border-paper-200 rounded-xl p-5 shadow-sm">
            <h2 className="font-serif font-semibold text-ink-900 dark:text-paper-50 mb-4">
              Run Timeline
            </h2>
            <Stagger className="space-y-1">
              {(timeline as TimelineNodeData[]).map((node) => (
                <StaggerItem key={node.id}>
                  <TimelineNode node={node} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        ) : null}
      </div>
    </div>
  );
}
