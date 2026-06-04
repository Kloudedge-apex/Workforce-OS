import React from "react";
import { useListPendingArtifacts, useGetTodayKpis } from "@workspace/api-client-react";
import { ApprovalCard, ApprovalCardSkeleton } from "@/components/v2/ApprovalCard";
import { AgentActivityStream } from "@/components/v2/AgentActivityStream";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Today() {
  const { data: artifactsData, isLoading: artifactsLoading } = useListPendingArtifacts(
    { page: 1, limit: 5 },
    { query: { refetchInterval: 8000 } }
  );

  const { data: kpis, isLoading: kpisLoading } = useGetTodayKpis(
    { query: { refetchInterval: 15000 } }
  );

  const artifacts = artifactsData?.items || [];

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Main Column */}
      <div className="flex-1 md:max-w-[720px] border-r border-paper-200 flex flex-col">
        <div className="p-6 pb-2 border-b border-paper-200 bg-paper-50 sticky top-0 z-10 flex-shrink-0">
          <h2 className="font-serif text-2xl text-ink-900">Approval Queue</h2>
          <p className="text-sm text-ink-400 mt-1">Review agent drafts before they are sent.</p>
        </div>
        
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {artifactsLoading ? (
            <>
              <ApprovalCardSkeleton />
              <ApprovalCardSkeleton />
              <ApprovalCardSkeleton />
            </>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="font-serif text-6xl text-paper-200 block mb-4">0</span>
              <h3 className="font-serif text-lg text-ink-900 mb-2">Queue is clear</h3>
              <p className="text-ink-400 text-sm max-w-[250px] mb-6">All agents are idle or waiting on scheduled operations.</p>
              <Button className="bg-rust-500 hover:bg-rust-500/90">Trigger Pipeline</Button>
            </div>
          ) : (
            <>
              {artifacts.map((a) => (
                <ApprovalCard key={a.id} artifact={a} />
              ))}
              {artifactsData?.total && artifactsData.total > 5 && (
                <Button variant="outline" className="w-full bg-paper-50 border-paper-200 text-ink-700">
                  Load 5 more ({artifactsData.total - 5} pending)
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Rail */}
      <div className="hidden md:flex flex-col w-[320px] bg-paper-100 overflow-y-auto">
        <div className="p-4 border-b border-paper-200">
          <h3 className="text-xs font-bold text-ink-400 tracking-wider uppercase mb-3">Today's Pulse</h3>
          <div className="grid grid-cols-2 gap-3">
            <KpiTile 
              label="Pending" 
              value={kpisLoading ? "-" : kpis?.artifactsPending.toString() || "0"} 
              alert={kpis && kpis.artifactsPending > 0} 
            />
            <KpiTile 
              label="Sent Today" 
              value={kpisLoading ? "-" : kpis?.artifactsSentToday.toString() || "0"} 
            />
            <KpiTile 
              label="Reply Rate 7d" 
              value={kpisLoading ? "-" : `${(kpis?.replyRate7d || 0) * 100}%`} 
            />
            <KpiTile 
              label="Meetings" 
              value={kpisLoading ? "-" : kpis?.qualifiedMeetingsBooked.toString() || "0"} 
              positive={kpis && kpis.qualifiedMeetingsBooked > 0}
            />
          </div>
        </div>
        
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-paper-200 bg-paper-100 sticky top-0 z-10 flex items-center gap-2">
            <Activity className="w-4 h-4 text-ink-400" />
            <h3 className="text-xs font-bold text-ink-400 tracking-wider uppercase">Live Activity</h3>
          </div>
          <div className="flex-1">
            <AgentActivityStream filter="all" />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, alert, positive }: { label: string; value: string; alert?: boolean; positive?: boolean }) {
  return (
    <Card className="p-3 bg-paper-50 border-paper-200 flex flex-col justify-between">
      <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{label}</span>
      <span className={cn(
        "font-tabular text-2xl font-bold mt-1",
        alert ? "text-rust-500" : positive ? "text-signal-positive" : "text-ink-900"
      )}>
        {value}
      </span>
    </Card>
  );
}
