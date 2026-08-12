import React, { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useListRuns, useTriggerRun } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Play, ChevronLeft, ChevronRight, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  staggerContainer,
  staggerItem,
  springHover,
  useReducedMotionSafe,
} from "@/lib/motion";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  RUNNING: "bg-amber-100 text-amber-800 border-amber-200 animate-pulse",
  FAILED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-paper-100 text-ink-600 border-paper-200",
};

export interface RunStatusBadge {
  label: string;
  className: string;
}

/**
 * PURE: status → badge. AWAITING_APPROVAL gets a distinct, filled "Needs
 * approval" treatment (it is the one status that blocks the whole org's
 * pipeline until a human acts — see the run-level HITL panel in RunDetail);
 * every other status keeps the soft styles above.
 */
export function runStatusBadge(status: string): RunStatusBadge {
  if (status === "AWAITING_APPROVAL") {
    return {
      label: "Needs approval",
      className: "bg-rust-500 text-white border-rust-600 font-semibold",
    };
  }
  return {
    label: status.replace(/_/g, " "),
    className: STATUS_STYLES[status] ?? "bg-paper-100 text-ink-600",
  };
}

/** What the trigger-failure toast should say, plus the blocking run to point at. */
export interface TriggerErrorToast {
  title: string;
  description?: string;
  /** When set, the toast gets a "Review run" action linking to /runs/<id>. */
  goToRunId: string | null;
}

interface RunRowLike {
  id: string;
  status: string;
}

/**
 * PURE: map a failed POST /runs/trigger into actionable toast copy.
 *
 * The BFF passes the upstream single-flight 409 through as
 * `409 { runId: "", queued: false, message }` where `message` is the verbatim
 * upstream line "A pipeline graph is already <status> for this org
 * (runId=<id>)" — distinguishable, so we parse the blocking run's id and
 * whether it is awaiting approval straight out of it, falling back to the
 * already-loaded runs list when the message shape ever changes. Anything
 * else degrades to generic-but-honest copy that still surfaces the error's
 * own message.
 */
export function describeTriggerError(
  err: unknown,
  items: readonly RunRowLike[],
): TriggerErrorToast {
  const rec = err && typeof err === "object" ? (err as Record<string, unknown>) : null;
  const status = rec && typeof rec["status"] === "number" ? (rec["status"] as number) : null;
  const data =
    rec && typeof rec["data"] === "object" && rec["data"] !== null
      ? (rec["data"] as Record<string, unknown>)
      : null;
  const message =
    data && typeof data["message"] === "string" && (data["message"] as string).trim() !== ""
      ? (data["message"] as string)
      : null;

  if (status === 409) {
    const runIdMatch = message ? /runId=([A-Za-z0-9_-]+)/.exec(message) : null;
    const awaitingRow = items.find((r) => r.status === "AWAITING_APPROVAL");
    // Trust the upstream message first; fall back to the loaded list window.
    const awaiting =
      (message?.includes("awaiting_approval") ?? false) ||
      (!(message?.includes("running") ?? false) && awaitingRow != null);
    if (awaiting) {
      return {
        title: "A run is awaiting your approval",
        description: "Approve or reject the pending run before starting a new one.",
        goToRunId: runIdMatch?.[1] ?? awaitingRow?.id ?? null,
      };
    }
    return {
      title: "A run is already in progress",
      description:
        message ?? "Wait for the current run to finish before starting another.",
      goToRunId: runIdMatch?.[1] ?? null,
    };
  }

  return {
    title: "Failed to start run",
    description: err instanceof Error && err.message ? err.message : undefined,
    goToRunId: null,
  };
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

export default function Runs() {
  const [, navigate] = useLocation();
  const reduced = useReducedMotionSafe();
  const [page, setPage] = useState(1);
  const limit = 20;
  const { data, isLoading, isError, refetch } = useListRuns(
    { page, limit },
    { query: { queryKey: ["listRuns", page, limit], refetchInterval: 10000 } }
  );
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const { mutate: triggerRun, isPending: triggering } = useTriggerRun({
    mutation: {
      // A 202 can still mean "not enqueued" (queued: false) — don't claim a
      // run started when the backend says it didn't.
      onSuccess: (d) => {
        if (d.queued) toast.success(`Run started — ${d.runId}`);
        else toast.error("Run not started", { description: d.message });
        refetch();
      },
      // Single-flight 409s must NOT die as a generic "Failed to start run":
      // the usual cause is a run sitting in AWAITING_APPROVAL, so the toast
      // says so and links straight to the blocking run.
      onError: (err) => {
        const t = describeTriggerError(err, data?.items ?? []);
        toast.error(t.title, {
          ...(t.description ? { description: t.description } : {}),
          ...(t.goToRunId
            ? {
                action: {
                  label: "Review run",
                  onClick: () => navigate(`/runs/${t.goToRunId}`),
                },
              }
            : {}),
        });
      },
    },
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-paper-50 dark:bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif font-semibold text-ink-900 dark:text-paper-50 text-lg">Run History</h1>
          <p className="text-xs text-ink-400 mt-0.5">
            <CountUp value={total} /> executions recorded
          </p>
        </div>
        <motion.div
          variants={reduced ? undefined : springHover}
          initial={reduced ? undefined : "rest"}
          whileHover={reduced ? undefined : "hover"}
          whileTap={reduced ? undefined : "tap"}
          className="inline-flex"
        >
          <Button
            className="bg-rust-500 hover:bg-rust-600 text-white shadow-sm transition-shadow duration-200 hover:shadow-md"
            size="sm"
            onClick={() => triggerRun()}
            disabled={triggering}
          >
            {triggering ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {triggering ? "Starting…" : "Trigger Run"}
          </Button>
        </motion.div>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="bg-white dark:bg-card border border-paper-200 rounded-lg shadow-sm">
            <ErrorState
              title="Couldn't load run history"
              description="We hit a snag fetching your pipeline runs. Please try again."
              onRetry={() => refetch()}
            />
          </div>
        ) : (data?.items ?? []).length === 0 ? (
          <div className="bg-white dark:bg-card border border-paper-200 rounded-lg shadow-sm">
            <EmptyState
              icon={Inbox}
              title="No runs yet"
              description="Trigger your first pipeline run to start sourcing leads and drafting outreach."
              action={
                <Button
                  className="bg-rust-500 hover:bg-rust-600 text-white shadow-sm transition-shadow duration-200 hover:shadow-md"
                  size="sm"
                  onClick={() => triggerRun()}
                  disabled={triggering}
                >
                  {triggering ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {triggering ? "Starting…" : "Trigger Run"}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-card border border-paper-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Stages completed</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Leads scored</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Drafts recorded</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Duration</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Cost</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Approved by</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <motion.tbody
                className="divide-y divide-paper-100"
                variants={reduced ? undefined : staggerContainer}
                initial={reduced ? undefined : "hidden"}
                animate={reduced ? undefined : "visible"}
              >
                {(data?.items ?? []).map((run) => (
                  <motion.tr
                    key={run.id}
                    variants={reduced ? undefined : staggerItem}
                    className="group cursor-pointer transition-all duration-200 hover:bg-paper-50 dark:hover:bg-ink-800 hover:shadow-sm hover:[transform:translateY(-1px)]"
                    onClick={() => navigate(`/runs/${run.id}`)}
                  >
                    <td className="px-4 py-3">
                      {(() => {
                        const badge = runStatusBadge(run.status);
                        return (
                          <Badge className={cn("text-xs border", badge.className)}>
                            {badge.label}
                          </Badge>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-300">
                      {((run.stagesCompleted ?? []) as string[]).join(", ") || "Not recorded"}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink-700 dark:text-ink-300">{run.leadsScored ?? "Not recorded"}</td>
                    <td className="px-4 py-3 font-mono text-ink-700 dark:text-ink-300">{run.artifactsGenerated ?? "Not recorded"}</td>
                    <td className="px-4 py-3 font-mono text-ink-600">{formatMs(run.durationMs)}</td>
                    <td className="px-4 py-3 font-mono text-ink-600">
                      {run.costUsd == null ? "Not recorded" : `$${run.costUsd.toFixed(3)}`}
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      {run.approvedBy ?? "Not recorded"}
                    </td>
                    <td className="px-4 py-3 text-ink-400 text-xs">
                      {new Date(run.startedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-ink-300">
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-rust-500" />
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-paper-200 pt-4">
            <p className="text-xs text-ink-400">
              Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="text-xs text-ink-500">Page {page} of {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
