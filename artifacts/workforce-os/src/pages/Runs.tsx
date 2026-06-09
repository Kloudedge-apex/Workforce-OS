import React from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useListRuns, useTriggerRun } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Play, ChevronRight, Loader2, Inbox } from "lucide-react";
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
  AWAITING_APPROVAL: "bg-rust-100 text-rust-800 border-rust-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

export default function Runs() {
  const [, navigate] = useLocation();
  const reduced = useReducedMotionSafe();
  const { data, isLoading, isError, refetch } = useListRuns(
    { page: 1, limit: 50 },
    { query: { queryKey: ["listRuns"], refetchInterval: 10000 } }
  );

  const { mutate: triggerRun, isPending: triggering } = useTriggerRun({
    mutation: {
      onSuccess: (d) => { toast.success(`Run started — ${d.runId}`); refetch(); },
      onError: () => toast.error("Failed to start run"),
    },
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-paper-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif font-semibold text-ink-900 text-lg">Run History</h1>
          <p className="text-xs text-ink-400 mt-0.5">
            <CountUp value={(data?.items ?? []).length} /> agent pipeline executions
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
          <div className="bg-white border border-paper-200 rounded-lg shadow-sm">
            <ErrorState
              title="Couldn't load run history"
              description="We hit a snag fetching your pipeline runs. Please try again."
              onRetry={() => refetch()}
            />
          </div>
        ) : (data?.items ?? []).length === 0 ? (
          <div className="bg-white border border-paper-200 rounded-lg shadow-sm">
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
          <div className="bg-white border border-paper-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Agents</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Leads</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Drafts</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Duration</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Cost</th>
                  <th className="px-4 py-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Triggered by</th>
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
                    className="group cursor-pointer transition-all duration-200 hover:bg-paper-50 hover:shadow-sm hover:[transform:translateY(-1px)]"
                    onClick={() => navigate(`/runs/${run.id}`)}
                  >
                    <td className="px-4 py-3">
                      <Badge className={cn("text-xs border", STATUS_STYLES[run.status] ?? "bg-paper-100 text-ink-600")}>
                        {run.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {((run.agentsInvolved ?? []) as string[]).join(", ")}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink-700">{run.leadsSourced}</td>
                    <td className="px-4 py-3 font-mono text-ink-700">{run.artifactsGenerated}</td>
                    <td className="px-4 py-3 font-mono text-ink-600">{formatMs(run.durationMs)}</td>
                    <td className="px-4 py-3 font-mono text-ink-600">${run.costUsd.toFixed(3)}</td>
                    <td className="px-4 py-3 text-ink-600 capitalize">{run.triggeredBy}</td>
                    <td className="px-4 py-3 text-ink-400 text-xs">
                      {new Date(run.startedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-ink-300">
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-rust-400" />
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
