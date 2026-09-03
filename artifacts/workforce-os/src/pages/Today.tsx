import React, { useState } from "react";
import {
  type GraphRun,
  type TodayKpis,
  useListPendingArtifacts,
  useGetTodayKpis,
  useListRuns,
  useTriggerRun,
  useGetOrgSettings,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  ApprovalCard,
  ApprovalCardSkeleton,
} from "@/components/v2/ApprovalCard";
import { AgentActivityStream } from "@/components/v2/AgentActivityStream";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { toast } from "sonner";
import { showTriggerError } from "@/lib/runTrigger";
import {
  canManageWorkflow,
  workflowAuthorityMessage,
} from "@/lib/workflowAuthority";

const FUNNEL_STEPS = [
  { key: "leadsSourced", label: "Sourced" },
  { key: "verifiedEmails", label: "Verified" },
  { key: "leadsQualified", label: "Qualified" },
  { key: "artifactsPending", label: "In review" },
  { key: "qualifiedMeetingsBooked", label: "Meetings" },
] as const;

const STATUS_ORDER = [
  ["COMPLETED", "Completed", "bg-signal-positive"],
  ["RUNNING", "Running", "bg-rust-500"],
  ["AWAITING_APPROVAL", "Needs review", "bg-ember-400"],
  ["FAILED", "Failed", "bg-signal-critical"],
] as const;

export function summarizeRunStatuses(runs: GraphRun[]) {
  return STATUS_ORDER.map(([status, label, color]) => ({
    status,
    label,
    color,
    count: runs.filter((run) => run.status === status).length,
  }));
}

function formatStartedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function runTask(run: GraphRun) {
  if (run.status === "AWAITING_APPROVAL") return "Review outreach drafts";
  if (run.status === "COMPLETED") return "Run completed";
  if (run.status === "FAILED") return "Needs attention";
  if (run.status === "CANCELLED") return "Run cancelled";
  const stage = run.stagesCompleted.at(-1)?.replaceAll("_", " ");
  return stage ? `Completed ${stage}` : "Researching prospects";
}

export default function Today() {
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState<
    "all" | "outbound" | "pipeline"
  >("all");

  const {
    data: artifactsData,
    isLoading: artifactsLoading,
    isError: artifactsError,
    refetch: refetchArtifacts,
  } = useListPendingArtifacts(
    { page: 1, limit: 10 },
    { query: { refetchInterval: 8000, queryKey: ["listPendingArtifacts"] } },
  );

  const {
    data: kpis,
    isLoading: kpisLoading,
    isError: kpisError,
  } = useGetTodayKpis({
    query: { refetchInterval: 15000, queryKey: ["getTodayKpis"] },
  });

  const {
    data: runs,
    isLoading: runsLoading,
    isError: runsError,
    refetch: refetchRuns,
  } = useListRuns(
    { page: 1, limit: 20 },
    { query: { queryKey: ["listRuns", 1, 20], refetchInterval: 10000 } },
  );
  const { mutate: triggerRun, isPending: triggeringRun } = useTriggerRun({
    mutation: {
      onSuccess: (result) => {
        if (result.queued) {
          toast.success(`Run started — ${result.runId}`);
          void refetchRuns();
        } else {
          toast.error("Run not started", { description: result.message });
        }
      },
      onError: (err) => showTriggerError(err, runs?.items ?? [], navigate),
    },
  });
  const { data: orgSettings } = useGetOrgSettings({
    query: { queryKey: ["getOrgSettings"] },
  });

  const artifacts = artifactsData?.items || [];
  const awaitingRun = runs?.items.find(
    (run) => run.status === "AWAITING_APPROVAL",
  );
  const runningRun = runs?.items.find((run) => run.status === "RUNNING");

  return (
    <TodayLayout
      approvalQueue={
        <>
          <div className="p-4 sm:p-6 border-b border-paper-200 bg-paper-50 dark:bg-card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
            <div>
              <h1 className="font-serif text-xl text-ink-900 dark:text-paper-50">
                Approval Queue
              </h1>
              <p className="text-[10px] text-ink-400 uppercase font-mono tracking-wider">
                {artifactsData?.total ?? artifacts.length} Items remaining
              </p>
            </div>
            <span className="text-[10px] text-ink-400 uppercase font-mono tracking-wider">
              Review each draft individually
            </span>
          </div>
          <div className="flex-1 lg:overflow-y-auto p-4 sm:p-6">
            {artifactsLoading ? (
              <div className="mx-auto max-w-3xl space-y-4">
                <ApprovalCardSkeleton />
                <ApprovalCardSkeleton />
              </div>
            ) : artifactsError ? (
              <ErrorState
                title="Couldn't load the queue"
                description="The pending-approval queue failed to load. Your drafts are safe — try again."
                onRetry={() => refetchArtifacts()}
              />
            ) : artifacts.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Queue clear"
                description="All agent drafts have been reviewed or processed. New drafts will appear here as agents work."
              />
            ) : (
              <Stagger className="mx-auto max-w-3xl space-y-4">
                {artifacts.map((a) => (
                  <StaggerItem key={a.id}>
                    <ApprovalCard artifact={a} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </>
      }
      overviewRail={
        <>
          <TodayRunAction
            awaitingRunId={awaitingRun?.id ?? null}
            runningRunId={runningRun?.id ?? null}
            isLoading={runsLoading}
            isError={runsError && !runs}
            isStarting={triggeringRun}
            workflowCapability={orgSettings?.canManageWorkflow ?? null}
            onOpenRun={(runId) => navigate(`/runs/${runId}`)}
            onOpenRuns={() => navigate("/runs")}
            onStart={() => triggerRun()}
          />
          <div className="p-4 border-b border-paper-200 bg-white dark:bg-card shrink-0">
            <h2 className="font-serif text-lg text-ink-900 dark:text-paper-50 mb-3">
              Today at a glance
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <KpiTile
                label="Leads sourced · All time"
                value={
                  kpisLoading ? (
                    "-"
                  ) : kpisError || !kpis ? (
                    "Unavailable"
                  ) : (
                    <CountUp value={kpis.leadsSourced} />
                  )
                }
              />
              <KpiTile
                label="Verified emails · All time"
                value={
                  kpisLoading ? (
                    "-"
                  ) : kpisError || !kpis ? (
                    "Unavailable"
                  ) : (
                    <CountUp value={kpis.verifiedEmails} />
                  )
                }
              />
              <KpiTile
                label="Qualified leads · All time"
                value={
                  kpisLoading ? (
                    "-"
                  ) : kpisError || !kpis ? (
                    "Unavailable"
                  ) : (
                    <CountUp value={kpis.leadsQualified} />
                  )
                }
              />
              <KpiTile
                label="Drafts in review · 24h"
                value={
                  kpisLoading ? (
                    "-"
                  ) : kpisError || !kpis ? (
                    "Unavailable"
                  ) : (
                    <CountUp value={kpis.artifactsPending} />
                  )
                }
                alert={!!kpis && kpis.artifactsPending > 5}
              />
              <KpiTile
                label="Confirmed sends · 24h"
                value={
                  kpisLoading ? (
                    "-"
                  ) : kpisError || !kpis ? (
                    "Unavailable"
                  ) : (
                    <CountUp value={kpis.artifactsSentToday} />
                  )
                }
              />
              <KpiTile
                label="Confirmed meetings · All time"
                value={
                  kpisLoading ? (
                    "-"
                  ) : kpisError || !kpis ? (
                    "Unavailable"
                  ) : (
                    <CountUp value={kpis.qualifiedMeetingsBooked} />
                  )
                }
                positive={!!kpis && kpis.qualifiedMeetingsBooked > 0}
              />
            </div>
          </div>

          <OperationsPanel
            kpis={kpis}
            kpisLoading={kpisLoading}
            kpisError={kpisError}
            runs={runs?.items ?? []}
            runsLoading={runsLoading}
            runsError={runsError}
            onOpenPipeline={() => navigate("/pipeline")}
            onOpenRun={(runId) => navigate(`/runs/${runId}`)}
            onOpenRuns={() => navigate("/runs")}
          />

          <div className="min-h-[26rem] flex-1 flex flex-col">
            <div className="p-4 border-b border-paper-200 bg-paper-50 dark:bg-card flex items-center justify-between gap-3 shrink-0">
              <h2 className="font-serif text-lg text-ink-900 dark:text-paper-50">
                Recorded Activity
              </h2>
              <Tabs
                value={activeFilter}
                onValueChange={(v: any) => setActiveFilter(v)}
                className="h-8"
              >
                <TabsList className="bg-paper-100 h-8">
                  <TabsTrigger value="all" className="text-[10px] px-2 h-6">
                    All
                  </TabsTrigger>
                  <TabsTrigger
                    value="outbound"
                    className="text-[10px] px-2 h-6"
                  >
                    Outbound
                  </TabsTrigger>
                  <TabsTrigger
                    value="pipeline"
                    className="text-[10px] px-2 h-6"
                  >
                    Pipeline
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex-1 lg:overflow-y-auto">
              <AgentActivityStream filter={activeFilter} />
            </div>
          </div>
        </>
      }
    />
  );
}

export interface TodayRunActionProps {
  awaitingRunId: string | null;
  runningRunId: string | null;
  isLoading: boolean;
  isError: boolean;
  isStarting: boolean;
  workflowCapability: boolean | null;
  onOpenRun: (runId: string) => void;
  onOpenRuns: () => void;
  onStart: () => void;
}

export function TodayRunAction({
  awaitingRunId,
  runningRunId,
  isLoading,
  isError,
  isStarting,
  workflowCapability,
  onOpenRun,
  onOpenRuns,
  onStart,
}: TodayRunActionProps) {
  const activeRunId = awaitingRunId ?? runningRunId;
  const workflowAllowed = canManageWorkflow(workflowCapability);
  const workflowUnavailable = workflowAuthorityMessage(workflowCapability);
  const startDisabled = !activeRunId && !isError && !workflowAllowed;
  return (
    <div
      className="border-b border-paper-200 bg-paper-100 p-4"
      data-testid="today-run-action"
    >
      <div className="flex items-start gap-3">
        {awaitingRunId ? (
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-rust-500" />
        ) : activeRunId || isError ? (
          <History className="mt-0.5 h-4 w-4 shrink-0 text-ember-500" />
        ) : (
          <Play className="mt-0.5 h-4 w-4 shrink-0 text-rust-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-900">
            {isLoading
              ? "Checking pipeline runs…"
              : isError
                ? "Run status unavailable"
                : awaitingRunId
                  ? "A pipeline run needs approval"
                  : runningRunId
                    ? "A pipeline run is in progress"
                    : workflowAllowed
                      ? "Ready for the next pipeline run"
                      : workflowCapability === false
                        ? "Run start restricted"
                        : "Run start unavailable"}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {isError
              ? "Open Runs to inspect the current pipeline state."
              : awaitingRunId
                ? "Review the blocking run before another can start."
                : runningRunId
                  ? "Open Runs to follow its current state."
                  : workflowAllowed
                    ? "Start sourcing and scoring when your team is ready."
                    : workflowUnavailable}
          </p>
          {!isLoading && (
            <Button
              size="sm"
              variant={awaitingRunId ? "default" : "outline"}
              className={cn(
                "mt-3 h-7 text-xs",
                awaitingRunId && "bg-rust-500 text-white hover:bg-rust-600",
              )}
              disabled={isStarting || startDisabled}
              title={startDisabled ? workflowUnavailable : undefined}
              onClick={() => {
                if (activeRunId) onOpenRun(activeRunId);
                else if (isError) onOpenRuns();
                else if (workflowAllowed) onStart();
              }}
            >
              {isStarting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {isError
                ? "Open Runs"
                : awaitingRunId
                  ? "Review run"
                  : runningRunId
                    ? "View run"
                    : isStarting
                      ? "Starting…"
                      : workflowAllowed
                        ? "Start run"
                        : workflowCapability === false
                          ? "Admin or manager required"
                          : "Permission unavailable"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface TodayLayoutProps {
  approvalQueue: React.ReactNode;
  overviewRail: React.ReactNode;
}

/**
 * Approval decisions intentionally come first in source order so the primary
 * workflow stays first on small screens as well as visually dominant on desktop.
 */
export function TodayLayout({ approvalQueue, overviewRail }: TodayLayoutProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-paper-50 dark:bg-background">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <section
          aria-label="Pending approval queue"
          data-testid="pending-approval-panel"
          className="order-first flex min-h-[60vh] min-w-0 flex-col bg-paper-100 lg:min-h-0 lg:flex-1"
        >
          {approvalQueue}
        </section>
        <aside
          aria-label="Today overview"
          data-testid="today-overview-rail"
          className="flex w-full shrink-0 flex-col border-t border-paper-200 bg-paper-50 lg:w-[23rem] lg:overflow-y-auto lg:border-l lg:border-t-0 xl:w-[25rem]"
        >
          {overviewRail}
        </aside>
      </div>
    </div>
  );
}

function OperationsPanel({
  kpis,
  kpisLoading,
  kpisError,
  runs,
  runsLoading,
  runsError,
  onOpenPipeline,
  onOpenRun,
  onOpenRuns,
}: {
  kpis: TodayKpis | undefined;
  kpisLoading: boolean;
  kpisError: boolean;
  runs: GraphRun[];
  runsLoading: boolean;
  runsError: boolean;
  onOpenPipeline: () => void;
  onOpenRun: (runId: string) => void;
  onOpenRuns: () => void;
}) {
  const statuses = summarizeRunStatuses(runs);
  const maxStatusCount = Math.max(1, ...statuses.map(({ count }) => count));
  const funnelMax = Math.max(1, kpis?.leadsSourced ?? 0);

  return (
    <div className="border-b border-paper-200 bg-paper-50">
      <section
        className="border-b border-paper-200 p-4"
        aria-label="Lead funnel"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-ink-900 dark:text-paper-50">
              Lead funnel
            </h2>
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">
              Verified pipeline progress
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenPipeline}
            className="flex items-center gap-1 text-xs font-medium text-rust-600 hover:text-rust-700"
          >
            View leads <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {kpisError ? (
          <p className="py-4 text-center text-xs text-ink-500">
            Funnel data unavailable.
          </p>
        ) : (
          <div className="space-y-3">
            {FUNNEL_STEPS.map((step) => {
              const value = kpis?.[step.key] ?? 0;
              return (
                <div key={step.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink-500">{step.label}</span>
                    <span className="font-tabular font-semibold text-ink-900 dark:text-paper-50">
                      {kpisLoading ? "-" : value}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper-200">
                    <div
                      className="h-full rounded-full bg-rust-500 transition-[width] duration-500"
                      style={{ width: `${(value / funnelMax) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="border-b border-paper-200 p-4"
        aria-label="Run status"
      >
        <h2 className="font-serif text-lg text-ink-900 dark:text-paper-50">
          Run status
        </h2>
        <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">
          Last {runs.length} agent runs
        </p>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {statuses.map((item) => (
            <div key={item.status}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-ink-500">{item.label}</span>
                <span className="font-tabular font-semibold text-ink-900 dark:text-paper-50">
                  {runsLoading || runsError ? "-" : item.count}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-paper-200">
                <div
                  className={cn("h-full rounded-full", item.color)}
                  style={{ width: `${(item.count / maxStatusCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="p-4" aria-label="Recent SDR agent runs">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-ink-900 dark:text-paper-50">
              SDR agent runs
            </h2>
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">
              Autonomous research and drafting
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenRuns}
            className="flex items-center gap-1 text-xs font-medium text-rust-600 hover:text-rust-700"
          >
            View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {runsLoading ? (
          <p className="py-4 text-center text-xs text-ink-400">Loading runs…</p>
        ) : runsError ? (
          <p className="py-4 text-center text-xs text-ink-500">
            Run data unavailable.
          </p>
        ) : runs.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-500">
            No agent runs yet.
          </p>
        ) : (
          <div className="divide-y divide-paper-200 rounded-lg border border-paper-200 bg-ink-0">
            {runs.slice(0, 4).map((run) => (
              <button
                type="button"
                key={run.id}
                onClick={() => onOpenRun(run.id)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-paper-50"
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    run.status === "COMPLETED"
                      ? "bg-signal-positive"
                      : run.status === "RUNNING"
                        ? "bg-rust-500"
                        : run.status === "AWAITING_APPROVAL"
                          ? "bg-ember-400"
                          : "bg-ink-400",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-ink-900 dark:text-paper-50">
                    {runTask(run)}
                  </span>
                  <span className="block text-[10px] text-ink-400">
                    {formatStartedAt(run.startedAt)}
                  </span>
                </span>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-ink-300"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiTile({
  label,
  value,
  alert,
  positive,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  alert?: boolean;
  positive?: boolean;
}) {
  return (
    <Card className="p-4 bg-ink-0 border-paper-200 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md hover:border-paper-300 hover:-translate-y-0.5">
      <div>
        <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">
          {label}
        </span>
        <div className="flex items-baseline gap-2 mt-1">
          <span
            className={cn(
              "font-tabular text-2xl font-bold tracking-tight",
              alert
                ? "text-rust-500"
                : positive
                  ? "text-signal-positive"
                  : "text-ink-900 dark:text-paper-50",
            )}
          >
            {value}
          </span>
        </div>
      </div>
    </Card>
  );
}
