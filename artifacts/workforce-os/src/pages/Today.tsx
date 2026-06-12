import React, { useState } from "react";
import { 
  useListPendingArtifacts, 
  useGetTodayKpis, 
  useBulkApproveArtifacts 
} from "@workspace/api-client-react";
import { ApprovalCard, ApprovalCardSkeleton } from "@/components/v2/ApprovalCard";
import { AgentActivityStream } from "@/components/v2/AgentActivityStream";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion/CountUp";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { toast } from "sonner";
import { isUnavailable } from "@/lib/unavailable";

export default function Today() {
  const [activeFilter, setActiveFilter] = useState<"all" | "outbound" | "pipeline" | "conversations">("all");
  
  const { data: artifactsData, isLoading: artifactsLoading, isError: artifactsError, refetch: refetchArtifacts } = useListPendingArtifacts(
    { page: 1, limit: 10 },
    { query: { refetchInterval: 8000, queryKey: ["listPendingArtifacts"] } }
  );

  const { data: kpis, isLoading: kpisLoading } = useGetTodayKpis(
    { query: { refetchInterval: 15000, queryKey: ["getTodayKpis"] } }
  );

  const bulkApproveMut = useBulkApproveArtifacts();

  const artifacts = artifactsData?.items || [];

  const handleBulkApprove = async () => {
    toast("Bulk approving all pending drafts...");
    try {
      const res = await bulkApproveMut.mutateAsync();
      if (isUnavailable(res)) { toast("Not available yet — coming soon"); return; }
      toast.success("Bulk approval complete");
    } catch (e) {
      toast.error("Bulk approval failed");
    }
  };

  return (
    <div className="flex flex-col h-full bg-paper-50 dark:bg-background overflow-hidden">
      {/* Top KPI Grid */}
      <div className="p-6 border-b border-paper-200 bg-white dark:bg-card shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* HONESTY: no delta badges — there is no real prior-period baseline
              yet. Deltas return when the backend serves one. Values are live. */}
          <KpiTile
            label="Pending Approval"
            value={kpisLoading ? "-" : <CountUp value={kpis?.artifactsPending ?? 0} />}
            alert={!!kpis && kpis.artifactsPending > 5}
          />
          <KpiTile
            label="Sent Today"
            value={kpisLoading ? "-" : <CountUp value={kpis?.artifactsSentToday ?? 0} />}
          />
          <KpiTile
            label="Reply Rate 7d"
            value={kpisLoading ? "-" : <CountUp value={(kpis?.replyRate7d ?? 0) * 100} decimals={1} suffix="%" />}
          />
          <KpiTile
            label="Meetings Booked"
            value={kpisLoading ? "-" : <CountUp value={kpis?.qualifiedMeetingsBooked ?? 0} />}
            positive={!!kpis && kpis.qualifiedMeetingsBooked > 0}
          />
          <KpiTile
            label="Leads Sourced"
            value={kpisLoading ? "-" : <CountUp value={kpis?.leadsSourcedToday ?? 0} />}
          />
          <KpiTile
            label="Leads Scored"
            value={kpisLoading ? "-" : <CountUp value={kpis?.leadsScored ?? 0} />}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Left: Activity Stream */}
        <div className="flex-1 flex flex-col border-r border-paper-200 min-w-0">
          <div className="p-4 border-b border-paper-200 bg-paper-50 dark:bg-card flex items-center justify-between shrink-0">
            <h3 className="font-serif text-lg text-ink-900 dark:text-paper-50">Live Activity</h3>
            <Tabs value={activeFilter} onValueChange={(v: any) => setActiveFilter(v)} className="h-8">
              <TabsList className="bg-paper-100 h-8">
                <TabsTrigger value="all" className="text-[10px] px-2 h-6">All</TabsTrigger>
                <TabsTrigger value="outbound" className="text-[10px] px-2 h-6">Outbound</TabsTrigger>
                <TabsTrigger value="pipeline" className="text-[10px] px-2 h-6">Pipeline</TabsTrigger>
                <TabsTrigger value="conversations" className="text-[10px] px-2 h-6">Inbound</TabsTrigger>
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
                {artifacts.length} Items remaining
              </p>
            </div>
            {artifacts.length > 0 && (
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8 text-xs bg-white dark:bg-card border-rust-200 text-rust-500 hover:bg-rust-50 hover:text-rust-600"
                onClick={handleBulkApprove}
                disabled={bulkApproveMut.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Approve All
              </Button>
            )}
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
