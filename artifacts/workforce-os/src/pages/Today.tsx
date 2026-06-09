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
import { ArrowUpRight, ArrowDownRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function Today() {
  const [activeFilter, setActiveFilter] = useState<"all" | "outbound" | "pipeline" | "conversations">("all");
  
  const { data: artifactsData, isLoading: artifactsLoading } = useListPendingArtifacts(
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
      await bulkApproveMut.mutateAsync();
      toast.success("Bulk approval complete");
    } catch (e) {
      toast.error("Bulk approval failed");
    }
  };

  return (
    <div className="flex flex-col h-full bg-paper-50 overflow-hidden">
      {/* Top KPI Grid */}
      <div className="p-6 border-b border-paper-200 bg-white shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiTile 
            label="Pending Approval" 
            value={kpisLoading ? "-" : kpis?.artifactsPending.toString() || "0"} 
            delta="+12%"
            alert={kpis && kpis.artifactsPending > 5}
          />
          <KpiTile 
            label="Sent Today" 
            value={kpisLoading ? "-" : kpis?.artifactsSentToday.toString() || "0"} 
            delta="+8%"
          />
          <KpiTile 
            label="Reply Rate 7d" 
            value={kpisLoading ? "-" : `${((kpis?.replyRate7d || 0) * 100).toFixed(1)}%`} 
            delta="-2%"
          />
          <KpiTile 
            label="Meetings Booked" 
            value={kpisLoading ? "-" : kpis?.qualifiedMeetingsBooked.toString() || "0"} 
            delta="+4%"
            positive={kpis && kpis.qualifiedMeetingsBooked > 0}
          />
          <KpiTile 
            label="Leads Sourced" 
            value={kpisLoading ? "-" : kpis?.leadsSourcedToday?.toString() || "0"} 
            delta="+15%"
          />
          <KpiTile 
            label="Leads Scored" 
            value={kpisLoading ? "-" : kpis?.leadsScored?.toString() || "0"} 
            delta="+20%"
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Left: Activity Stream */}
        <div className="flex-1 flex flex-col border-r border-paper-200 min-w-0">
          <div className="p-4 border-b border-paper-200 bg-paper-50 flex items-center justify-between shrink-0">
            <h3 className="font-serif text-lg text-ink-900">Live Activity</h3>
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
          <div className="p-4 border-b border-paper-200 bg-paper-50 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-serif text-lg text-ink-900">Pending Approval</h3>
              <p className="text-[10px] text-ink-400 uppercase font-mono tracking-wider">
                {artifacts.length} Items remaining
              </p>
            </div>
            {artifacts.length > 0 && (
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8 text-xs bg-white border-rust-200 text-rust-500 hover:bg-rust-50 hover:text-rust-600"
                onClick={handleBulkApprove}
                disabled={bulkApproveMut.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Approve All
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {artifactsLoading ? (
              <>
                <ApprovalCardSkeleton />
                <ApprovalCardSkeleton />
              </>
            ) : artifacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                <CheckCircle2 className="h-12 w-12 text-ink-400 mb-4" />
                <h3 className="font-serif text-lg text-ink-900">Queue Clear</h3>
                <p className="text-xs text-ink-400 max-w-[200px] mt-1">
                  All agent drafts have been reviewed or processed.
                </p>
              </div>
            ) : (
              artifacts.map((a) => (
                <ApprovalCard key={a.id} artifact={a} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, delta, alert, positive }: { label: string; value: string; delta: string; alert?: boolean; positive?: boolean }) {
  const isNegative = delta.startsWith("-");
  return (
    <Card className="p-4 bg-ink-0 border-paper-200 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md hover:border-paper-300 hover:-translate-y-0.5">
      <div>
        <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">{label}</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className={cn(
            "font-tabular text-2xl font-bold tracking-tight",
            alert ? "text-rust-500" : positive ? "text-signal-positive" : "text-ink-900"
          )}>
            {value}
          </span>
          <div className={cn(
            "flex items-center text-[10px] font-medium",
            isNegative ? "text-ink-400" : "text-ink-400"
          )}>
            {isNegative ? <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" /> : <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />}
            {delta}
          </div>
        </div>
      </div>
    </Card>
  );
}
