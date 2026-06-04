import React, { useState } from "react";
import { useListLeads, useGetLead, useTriggerOutbound, useBulkSuppressLeads } from "@workspace/api-client-react";
import { LeadCard } from "@/components/v2/LeadCard";
import { EvidenceTimeline } from "@/components/v2/EvidenceTimeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Zap, Ban, PlayCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function Pipeline() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string | undefined>();
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const { data: leadsData, isLoading: listLoading } = useListLeads(
    { q: search || undefined, stage, limit: 20 },
    { query: { queryKey: ["listLeads", search, stage] } }
  );

  const leads = leadsData?.items || [];

  const { data: detailData, isLoading: detailLoading } = useGetLead(
    selectedLeadId || "",
    { query: { enabled: !!selectedLeadId, queryKey: ["getLead", selectedLeadId] } }
  );

  const triggerMut = useTriggerOutbound();
  const suppressMut = useBulkSuppressLeads();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(leads.map(l => l.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleTriggerOutbound = async () => {
    if (!selectedLeadId) return;
    toast("Triggering outbound agent...");
    try {
      const res = await triggerMut.mutateAsync({ leadId: selectedLeadId, campaignId: "default" });
      toast.success(res.message);
      setActiveRunId(res.runId);
      setTimelineOpen(true);
    } catch (e) {
      toast.error("Failed to trigger outbound");
    }
  };

  const handleBulkSuppress = async () => {
    if (selectedIds.size === 0) return;
    toast(`Suppressing ${selectedIds.size} leads...`);
    try {
      await suppressMut.mutateAsync({ ids: Array.from(selectedIds) });
      toast.success("Leads suppressed");
      setSelectedIds(new Set());
    } catch (e) {
      toast.error("Failed to suppress leads");
    }
  };

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      {/* Master List (Left) */}
      <div className="w-full md:w-[40%] md:min-w-[360px] md:max-w-[480px] border-r border-paper-200 bg-paper-50 flex flex-col h-full shrink-0">
        
        {/* Filters Header */}
        <div className="p-4 border-b border-paper-200 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
              <Input 
                placeholder="Search leads..." 
                className="pl-9 bg-white"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" className="shrink-0 bg-white">
              <Filter className="h-4 w-4 text-ink-700" />
            </Button>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-7 text-xs bg-white border-paper-200 w-auto shrink-0">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="researching">Researching</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="h-7 whitespace-nowrap bg-paper-200 text-ink-700 hover:bg-paper-200">Score &gt; 80</Badge>
            <Badge variant="secondary" className="h-7 whitespace-nowrap bg-paper-200 text-ink-700 hover:bg-paper-200">High Intent</Badge>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
          {listLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] w-full rounded-lg" />
            ))
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-ink-400">
              <p>No leads match your filters</p>
            </div>
          ) : (
            leads.map(lead => (
              <div key={lead.id} className="relative group">
                <div className="absolute left-2 top-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Checkbox 
                    checked={selectedIds.has(lead.id)}
                    onCheckedChange={() => handleToggleSelect(lead.id)}
                    className="bg-white"
                  />
                </div>
                <div className={cn(selectedIds.has(lead.id) && "opacity-80")}>
                  <LeadCard 
                    lead={lead} 
                    mode="compact" 
                    selected={selectedLeadId === lead.id}
                    onSelect={setSelectedLeadId}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="absolute bottom-4 left-4 right-4 bg-ink-900 text-white rounded-lg shadow-lg p-3 flex items-center justify-between animate-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3">
              <Checkbox 
                checked={selectedIds.size === leads.length} 
                onCheckedChange={handleSelectAll}
                className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-ink-900"
              />
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-8 text-white hover:bg-white/20 hover:text-white" onClick={handleBulkSuppress}>
                <Ban className="h-4 w-4 mr-2" /> Suppress
              </Button>
              <Button size="sm" className="h-8 bg-white text-ink-900 hover:bg-paper-100">
                <Plus className="h-4 w-4 mr-2" /> Campaign
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail View (Right) */}
      <div className="hidden md:flex flex-col flex-1 bg-paper-100 border-l border-paper-200 overflow-y-auto">
        {!selectedLeadId ? (
          <div className="flex flex-col items-center justify-center h-full text-ink-400">
            <TargetIcon className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">Select a lead to view details</p>
          </div>
        ) : detailLoading || !detailData ? (
          <div className="p-8 space-y-8">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="p-8 max-w-4xl mx-auto w-full">
            <LeadCard lead={detailData.lead} mode="detailed" />

            <div className="mt-8 grid grid-cols-3 gap-8">
              {/* Left Col: Brief & Breakdown */}
              <div className="col-span-2 space-y-8">
                <section>
                  <h3 className="font-serif text-lg font-semibold text-ink-900 mb-3 flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-rust-500" />
                    Research Brief
                  </h3>
                  <div className="bg-white p-5 rounded-lg border border-paper-200 shadow-sm prose prose-sm prose-ink text-ink-700">
                    <p>{detailData.researchBrief}</p>
                  </div>
                </section>

                <section>
                  <h3 className="font-serif text-lg font-semibold text-ink-900 mb-3">Score Breakdown</h3>
                  <div className="bg-white p-5 rounded-lg border border-paper-200 shadow-sm space-y-4">
                    <ScoreBar label="Firmographic Fit" score={detailData.scoreBreakdown.fit} />
                    <ScoreBar label="Intent Signals" score={detailData.scoreBreakdown.intent} />
                    <ScoreBar label="Prior Engagement" score={detailData.scoreBreakdown.engagement} />
                    <ScoreBar label="Timing" score={detailData.scoreBreakdown.timing} />
                  </div>
                </section>
              </div>

              {/* Right Col: Actions & Timeline */}
              <div className="space-y-8">
                <section className="bg-white p-5 rounded-lg border border-paper-200 shadow-sm flex flex-col items-center text-center">
                  <div className="h-12 w-12 rounded-full bg-rust-100 flex items-center justify-center mb-3">
                    <Zap className="h-6 w-6 text-rust-500" />
                  </div>
                  <h4 className="font-medium text-ink-900 mb-1">Ready for Outreach</h4>
                  <p className="text-xs text-ink-400 mb-4">Research complete, high intent detected.</p>
                  <Button 
                    className="w-full bg-rust-500 hover:bg-rust-500/90 text-white"
                    onClick={handleTriggerOutbound}
                    disabled={triggerMut.isPending}
                  >
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Trigger Agent
                  </Button>
                </section>

                <section>
                  <h3 className="font-serif text-sm font-semibold text-ink-900 mb-3">Recent Evidence</h3>
                  <div className="space-y-4">
                    {detailData.recentEvidenceEvents.map(evt => (
                      <div key={evt.id} className="relative pl-4 border-l-2 border-paper-200">
                        <div className="absolute left-[-5px] top-1 h-2 w-2 rounded-full bg-signal-info ring-4 ring-paper-100" />
                        <p className="text-xs font-medium text-ink-900 mb-0.5">{evt.eventType}</p>
                        <p className="text-[11px] text-ink-700 mb-1 leading-snug">{evt.description}</p>
                        <p className="text-[10px] text-ink-400 font-tabular">
                          {formatDistanceToNow(new Date(evt.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <EvidenceTimeline 
        runId={activeRunId} 
        open={timelineOpen} 
        onOpenChange={setTimelineOpen} 
      />
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score > 80 ? "bg-signal-positive" : score > 60 ? "bg-ember-400" : "bg-rust-500";
  return (
    <div>
      <div className="flex justify-between items-end mb-1.5">
        <span className="text-xs font-medium text-ink-700">{label}</span>
        <span className="text-xs font-tabular font-bold text-ink-900">{score.toFixed(0)}</span>
      </div>
      <div className="h-2 w-full bg-paper-200 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

// Simple icons to avoid missing imports
function TargetIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
}
function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3v3"/><path d="M18.5 5.5l-2 2"/><path d="M21 12h-3"/><path d="M18.5 18.5l-2-2"/><path d="M12 21v-3"/><path d="M5.5 18.5l2-2"/><path d="M3 12h3"/><path d="M5.5 5.5l2 2"/></svg>;
}
