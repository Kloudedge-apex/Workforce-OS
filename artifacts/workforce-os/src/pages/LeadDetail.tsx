import React from "react";
import { useGetLead, useTriggerOutbound } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ChevronLeft, 
  Sparkles, 
  Zap, 
  Clock, 
  Target, 
  Search,
  MessageSquare
} from "lucide-react";
import { ScoreRing } from "@/components/v2/ScoreRing";
import { CohortBadge } from "@/components/v2/CohortBadge";
import { EmailStatusBadge } from "@/components/v2/EmailStatusBadge";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function LeadDetail() {
  const [, params] = useRoute("/pipeline/:id");
  const [, setLocation] = useLocation();
  const id = params?.id || "";

  const { data: detailData, isLoading } = useGetLead(id, {
    query: { enabled: !!id, queryKey: ["getLead", id] }
  });

  const triggerMut = useTriggerOutbound();

  const handleTrigger = async () => {
    toast("Triggering outbound agent...");
    try {
      await triggerMut.mutateAsync({ id });
      toast.success("Outbound sequence triggered");
    } catch (e) {
      toast.error("Failed to trigger outbound");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Skeleton className="h-96 col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-ink-400">Lead not found</p>
        <Button variant="link" onClick={() => setLocation("/pipeline")}>Back to Pipeline</Button>
      </div>
    );
  }

  const { lead, researchBrief, scoreBreakdown, recentEvidenceEvents } = detailData;

  return (
    <div className="flex flex-col h-full bg-paper-50 overflow-y-auto">
      {/* Top Bar */}
      <div className="p-4 border-b border-paper-200 bg-white sticky top-0 z-10 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setLocation("/pipeline")}
          className="text-ink-400 hover:text-ink-900"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Pipeline
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="bg-white border-paper-200">Edit Lead</Button>
          <Button onClick={handleTrigger} className="bg-rust-500 hover:bg-rust-600 text-white" disabled={triggerMut.isPending}>
            <Zap className="h-4 w-4 mr-2" />
            Trigger Outbound
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full p-6 md:p-10 space-y-8">
        {/* Hero Card */}
        <Card className="p-8 border-paper-200 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8">
            <ScoreRing score={lead.score} size={80} strokeWidth={6} />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="h-20 w-20 rounded-full bg-paper-100 border border-paper-200 flex items-center justify-center text-3xl font-serif text-ink-900">
              {lead.name.charAt(0)}
            </div>
            <div>
              <h1 className="font-serif text-3xl font-semibold text-ink-900">{lead.name}</h1>
              <p className="text-lg text-ink-700 mt-1">{lead.title} @ {lead.company}</p>
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <CohortBadge cohort={lead.cohort} />
                <EmailStatusBadge status={lead.emailStatus} />
                <div className="h-1 w-1 rounded-full bg-paper-200" />
                <span className="text-xs text-ink-400 font-mono uppercase tracking-wider">{lead.domain}</span>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-rust-500" />
                <h3 className="font-serif text-xl font-semibold text-ink-900">Research Brief</h3>
              </div>
              <Card className="p-6 border-paper-200 bg-white prose prose-ink max-w-none text-ink-700 shadow-sm leading-relaxed">
                {researchBrief}
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-5 w-5 text-ink-900" />
                <h3 className="font-serif text-xl font-semibold text-ink-900">Score Breakdown</h3>
              </div>
              <Card className="p-6 border-paper-200 bg-white shadow-sm space-y-6">
                <ScoreBar label="Firmographic Fit" score={scoreBreakdown.fit} />
                <ScoreBar label="Intent Signals" score={scoreBreakdown.intent} />
                <ScoreBar label="Prior Engagement" score={scoreBreakdown.engagement} />
                <ScoreBar label="Timing / Urgency" score={scoreBreakdown.timing} />
              </Card>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Search className="h-5 w-5 text-ink-400" />
                <h3 className="font-serif text-lg font-semibold text-ink-900">Recent Evidence</h3>
              </div>
              <div className="space-y-4">
                {recentEvidenceEvents.map((evt) => (
                  <div key={evt.id} className="relative pl-6 pb-4 last:pb-0">
                    <div className="absolute left-0 top-1.5 bottom-0 w-px bg-paper-200" />
                    <div className="absolute left-[-3px] top-1.5 h-1.5 w-1.5 rounded-full bg-rust-500" />
                    <div className="text-xs font-semibold text-ink-900 mb-1">{evt.eventType}</div>
                    <p className="text-xs text-ink-700 leading-snug mb-1">{evt.description}</p>
                    <div className="text-[10px] text-ink-400 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatDistanceToNow(new Date(evt.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <Card className="p-6 bg-rust-50 border-rust-100 shadow-sm">
              <h4 className="font-serif font-semibold text-rust-900 mb-2">Intent Detected</h4>
              <p className="text-sm text-rust-700 mb-4 leading-snug">
                Lead recently interacted with your LinkedIn posts and visited your pricing page.
              </p>
              <div className="flex flex-wrap gap-2">
                {lead.intentSignals.map((sig, i) => (
                  <span key={i} className="text-[10px] px-2 py-1 bg-white border border-rust-200 rounded text-rust-600 font-medium">
                    {sig.label}
                  </span>
                ))}
              </div>
            </Card>

            {lead.lastContactedAt && (
              <div className="flex items-center gap-3 p-4 bg-paper-100 rounded-lg border border-paper-200">
                <MessageSquare className="h-4 w-4 text-ink-400" />
                <div className="text-xs">
                  <span className="text-ink-400 block uppercase tracking-wider font-mono">Last Contact</span>
                  <span className="text-ink-900 font-medium">
                    {formatDistanceToNow(new Date(lead.lastContactedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score > 80 ? "bg-rust-500" : score > 60 ? "bg-ember-400" : "bg-paper-200";
  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <span className="text-xs font-medium text-ink-700">{label}</span>
        <span className="text-xs font-tabular font-bold text-ink-900">{score}%</span>
      </div>
      <div className="h-2 w-full bg-paper-100 rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all duration-500", color)} 
          style={{ width: `${score}%` }} 
        />
      </div>
    </div>
  );
}

