import React, { useState } from "react";
import {
  useListPendingArtifacts,
  useGetTodayKpis,
  useListRuns,
  useTriggerRun,
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
import { CheckCircle2, Clock3, History, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { toast } from "sonner";
import { showTriggerError } from "@/lib/runTrigger";

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
            onOpenRun={(runId) => navigate(`/runs/${runId}`)}
            onOpenRuns={() => navigate("/runs")}
            onStart={() => triggerRun()}
          />
          <div className="p-4 border-b border-paper-200 bg-white dark:bg-card shrink-0">
            <h2 className="font-serif text-lg text-ink-900 dark:text-paper-50 mb-3">
              Today at a glance
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {/* HONESTY: no delta badges — there is no real prior-period baseline
                  yet. Deltas return when the backend serves one. Values are live. */}
              <KpiTile
                label="New Review Items · 24h"
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
                label="Confirmed Sends · 24h"
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
                label="Confirmed Meetings · All time"
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
              <KpiTile
                label="Leads Scored · All time"
                value={
                  kpisLoading ? (
                    "-"
                  ) : kpisError || !kpis ? (
                    "Unavailable"
                  ) : (
                    <CountUp value={kpis.leadsScored} />
                  )
                }
              />
            </div>
          </div>

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
  onOpenRun,
  onOpenRuns,
  onStart,
}: TodayRunActionProps) {
  const activeRunId = awaitingRunId ?? runningRunId;
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
                    : "Ready for the next pipeline run"}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {isError
              ? "Open Runs to inspect the current pipeline state."
              : awaitingRunId
                ? "Review the blocking run before another can start."
                : runningRunId
                  ? "Open Runs to follow its current state."
                  : "Start sourcing and scoring when your team is ready."}
          </p>
          {!isLoading && (
            <Button
              size="sm"
              variant={awaitingRunId ? "default" : "outline"}
              className={cn(
                "mt-3 h-7 text-xs",
                awaitingRunId && "bg-rust-500 text-white hover:bg-rust-600",
              )}
              disabled={isStarting}
              onClick={() => {
                if (activeRunId) onOpenRun(activeRunId);
                else if (isError) onOpenRuns();
                else onStart();
              }}
            >
              {isStarting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isError
                ? "Open Runs"
                : awaitingRunId
                  ? "Review run"
                  : runningRunId
                    ? "View run"
                    : isStarting
                      ? "Starting…"
                      : "Start run"}
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
          className="flex w-full shrink-0 flex-col border-t border-paper-200 bg-paper-50 lg:w-[23rem] lg:border-l lg:border-t-0 xl:w-[25rem]"
        >
          {overviewRail}
        </aside>
      </div>
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
