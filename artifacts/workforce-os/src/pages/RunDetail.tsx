import React from "react";
import { useRoute, useLocation } from "wouter";
import { useGetRun } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon, Bot, Zap, FlaskConical, Wrench, User, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { motion } from "framer-motion";
import { cardEnter, springHover, useReducedMotionSafe } from "@/lib/motion";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { CountUp } from "@/components/motion/CountUp";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
  RUNNING: "bg-ember-400/15 text-ember-500 border-ember-400/30",
  AWAITING_APPROVAL: "bg-rust-100 text-rust-800 border-rust-200",
  FAILED: "bg-rust-500/10 text-rust-500 border-rust-500/20",
};

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

function TimelineNode({ node, depth = 0 }: { node: TimelineNodeData; depth?: number }) {
  const [expanded, setExpanded] = React.useState(depth === 0);
  const hasChildren = (node.children ?? []).length > 0;

  return (
    <div className={cn("relative", depth > 0 && "ml-3 pl-5 border-l-2 border-paper-200")}>
      {/* Type-colored marker pinned on the connector rail. */}
      {depth > 0 && (
        <span
          className={cn(
            "absolute left-[-7px] top-3.5 h-3 w-3 rounded-full ring-4 ring-paper-50",
            NODE_DOT_COLORS[node.nodeType] ?? "bg-ink-400"
          )}
        />
      )}
      <div
        className={cn(
          "flex items-start gap-3 py-2 px-3 rounded-lg transition-colors hover-elevate",
          hasChildren && "cursor-pointer active-elevate-2"
        )}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5 text-ink-400" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-ink-400" />
          ) : (
            <div className="w-3.5" />
          )}
          <div className="text-ink-500">{NODE_ICONS[node.nodeType] ?? <Bot className="h-3.5 w-3.5" />}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink-900 dark:text-paper-50">{node.label}</span>
            <span className="text-xs text-ink-400 capitalize">{node.nodeType.replace(/_/g, " ")}</span>
            {node.score != null && (
              <span
                className={cn(
                  "text-xs font-mono px-1.5 py-0.5 rounded font-tabular",
                  node.score >= 0.85
                    ? "text-signal-positive bg-signal-positive/10"
                    : node.score >= 0.7
                      ? "text-ember-500 bg-ember-400/15"
                      : "text-rust-500 bg-rust-500/10"
                )}
              >
                {Math.round(node.score * 100)}%
              </span>
            )}
            {node.durationMs != null && node.durationMs > 0 && (
              <span className="text-xs text-ink-400 font-mono">{node.durationMs}ms</span>
            )}
            {node.tokensUsed != null && (
              <span className="text-xs text-ink-400 font-mono">{node.tokensUsed} tok</span>
            )}
            {node.cost != null && (
              <span className="text-xs text-ink-400 font-mono">${node.cost.toFixed(3)}</span>
            )}
          </div>
          <p className="text-xs text-ink-600 mt-0.5">{node.summary}</p>
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

  const { data, isLoading, isError, refetch } = useGetRun(id, {
    query: { queryKey: ["getRun", id], enabled: !!id },
  });

  if (isLoading) return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (isError) return (
    <div className="flex h-full items-center justify-center bg-paper-50">
      <ErrorState
        title="Couldn't load this run"
        description="The run service didn't respond. Your data is safe — try again."
        onRetry={() => refetch()}
      />
    </div>
  );

  if (!data) return (
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
        <Button variant="ghost" size="sm" onClick={() => navigate("/runs")} className="text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4 mr-1" /> Runs
        </Button>
        <span className="text-ink-300">/</span>
        <span className="text-sm font-mono text-ink-600">{run.id}</span>
        <Badge className={cn("ml-2 text-xs border", STATUS_STYLES[run.status])}>
          {run.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="max-w-4xl mx-auto w-full p-6 space-y-6">
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
                <p className="text-xs text-ink-400 uppercase tracking-wide">Leads sourced</p>
                <CountUp
                  value={run.leadsSourced}
                  className="block text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1 font-tabular"
                />
              </motion.div>
            </StaggerItem>
            <StaggerItem>
              <motion.div
                className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                variants={reduced ? undefined : springHover}
                initial="rest"
                whileHover="hover"
              >
                <p className="text-xs text-ink-400 uppercase tracking-wide">Drafts generated</p>
                <CountUp
                  value={run.artifactsGenerated}
                  className="block text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1 font-tabular"
                />
              </motion.div>
            </StaggerItem>
            <StaggerItem>
              <motion.div
                className="bg-ink-0 border border-paper-200 rounded-xl p-4 shadow-sm transition-shadow hover:shadow-md"
                variants={reduced ? undefined : springHover}
                initial="rest"
                whileHover="hover"
              >
                <p className="text-xs text-ink-400 uppercase tracking-wide">Duration</p>
                {run.durationMs > 0 ? (
                  <CountUp
                    value={run.durationMs / 1000}
                    decimals={1}
                    suffix="s"
                    className="block text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1 font-tabular"
                  />
                ) : (
                  <p className="text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1">—</p>
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
                <p className="text-xs text-ink-400 uppercase tracking-wide">Cost</p>
                <p className="text-xl font-mono font-semibold text-ink-900 dark:text-paper-50 mt-1 font-tabular">
                  $<CountUp value={run.costUsd} decimals={3} />
                </p>
              </motion.div>
            </StaggerItem>
          </Stagger>
          <div className="flex flex-wrap gap-3 text-xs text-ink-500">
            <span>Agents: {run.agentsInvolved.join(", ")}</span>
            <span>Triggered by: {run.triggeredBy}</span>
            <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
            {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
          </div>
        </div>

        {/* Timeline */}
        {(timeline ?? []).length > 0 && (
          <div className="bg-ink-0 border border-paper-200 rounded-xl p-5 shadow-sm">
            <h2 className="font-serif font-semibold text-ink-900 dark:text-paper-50 mb-4">Evidence Timeline</h2>
            <Stagger className="space-y-1">
              {(timeline as TimelineNodeData[]).map((node) => (
                <StaggerItem key={node.id}>
                  <TimelineNode node={node} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}
      </div>
    </div>
  );
}
