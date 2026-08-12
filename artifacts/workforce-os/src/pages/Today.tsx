import React, { useState } from "react";
import { 
  useListPendingArtifacts, 
  useGetTodayKpis,
} from "@workspace/api-client-react";
import { ApprovalCard, ApprovalCardSkeleton } from "@/components/v2/ApprovalCard";
import { AgentActivityStream } from "@/components/v2/AgentActivityStream";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

export default function Today() {
  const [activeFilter, setActiveFilter] = useState<"all" | "outbound" | "pipeline">("all");
  
  const { data: artifactsData, isLoading: artifactsLoading, isError: artifactsError, refetch: refetchArtifacts } = useListPendingArtifacts(
    { page: 1, limit: 10 },
    { query: { refetchInterval: 8000, queryKey: ["listPendingArtifacts"] } }
  );

  const { data: kpis, isLoading: kpisLoading, isError: kpisError } = useGetTodayKpis(
    { query: { refetchInterval: 15000, queryKey: ["getTodayKpis"] } }
  );

  const artifacts = artifactsData?.items || [];

  return (
    <div className="flex flex-col h-full bg-paper-50 dark:bg-background overflow-hidden">
      {/* Top KPI Grid */}
      <div className="p-6 border-b border-paper-200 bg-white dark:bg-card shrink-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* HONESTY: no delta badges — there is no real prior-period baseline
              yet. Deltas return when the backend serves one. Values are live. */}
          <KpiTile
            label="New Review Items · 24h"
            value={kpisLoading ? "-" : kpisError || !kpis ? "Unavailable" : <CountUp value={kpis.artifactsPending} />}
            alert={!!kpis && kpis.artifactsPending > 5}
          />
          <KpiTile
            label="Confirmed Sends · 24h"
            value={kpisLoading ? "-" : kpisError || !kpis ? "Unavailable" : <CountUp value={kpis.artifactsSentToday} />}
          />
          <KpiTile
            label="Confirmed Meetings · All time"
            value={kpisLoading ? "-" : kpisError || !kpis ? "Unavailable" : <CountUp value={kpis.qualifiedMeetingsBooked} />}
            positive={!!kpis && kpis.qualifiedMeetingsBooked > 0}
          />
          <KpiTile
            label="Leads Scored · All time"
            value={kpisLoading ? "-" : kpisError || !kpis ? "Unavailable" : <CountUp value={kpis.leadsScored} />}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Left: Activity Stream */}
        <div className="flex-1 flex flex-col border-r border-paper-200 min-w-0">
          <div className="p-4 border-b border-paper-200 bg-paper-50 dark:bg-card flex items-center justify-between shrink-0">
            <h3 className="font-serif text-lg text-ink-900 dark:text-paper-50">Recorded Activity</h3>
            <Tabs value={activeFilter} onValueChange={(v: any) => setActiveFilter(v)} className="h-8">
              <TabsList className="bg-paper-100 h-8">
                <TabsTrigger value="all" className="text-[10px] px-2 h-6">All</TabsTrigger>
                <TabsTrigger value="outbound" className="text-[10px] px-2 h-6">Outbound</TabsTrigger>
                <TabsTrigger value="pipeline" className="text-[10px] px-2 h-6">Pipeline</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex-1 overflow-y-auto">
            <AgentActivityStream filter={activeFilter} />
          </div>
        </div>

        {/* Right: Pending Queue */}
        <div className="w-full md:w-[400px] flex flex-col bg-paper-100 shrink-0 border-l border-paper-200">
          <div className="p-4 border-b border-paper-200 bg-paper-50 dark:bg-card flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-serif text-lg text-ink-900 dark:text-paper-50">Pending Approval</h3>
              <p className="text-[10px] text-ink-400 uppercase font-mono tracking-wider">
                {artifactsData?.total ?? artifacts.length} Items remaining
              </p>
            </div>
            <span className="text-[10px] text-ink-400 uppercase font-mono tracking-wider">
              Review each draft individually
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {artifactsLoading ? (
              <div className="space-y-4">
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
              <Stagger className="space-y-4">
                {artifacts.map((a) => (
                  <StaggerItem key={a.id}>
                    <ApprovalCard artifact={a} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, alert, positive }: { label: React.ReactNode; value: React.ReactNode; alert?: boolean; positive?: boolean }) {
  return (
    <Card className="p-4 bg-ink-0 border-paper-200 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md hover:border-paper-300 hover:-translate-y-0.5">
      <div>
        <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">{label}</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className={cn(
            "font-tabular text-2xl font-bold tracking-tight",
            alert ? "text-rust-500" : positive ? "text-signal-positive" : "text-ink-900 dark:text-paper-50"
          )}>
            {value}
          </span>
        </div>
      </div>
    </Card>
  );
}
