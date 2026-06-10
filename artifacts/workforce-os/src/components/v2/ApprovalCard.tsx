import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { OutreachArtifact, OutreachArtifactStatus } from "@workspace/api-client-react";
import { useApproveArtifact, useRejectArtifact } from "@workspace/api-client-react";
import { cardEnter, useReducedMotionSafe } from "@/lib/motion";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PolicyBadge } from "./PolicyBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Check, X, Edit2, AlertCircle, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import { toast } from "sonner";
import { EvidenceTimeline } from "./EvidenceTimeline";
import { Skeleton } from "../ui/skeleton";

interface ApprovalCardProps {
  artifact: OutreachArtifact;
}

export function ApprovalCard({ artifact }: ApprovalCardProps) {
  const reduced = useReducedMotionSafe();
  const [localStatus, setLocalStatus] = useState<OutreachArtifactStatus>(artifact.status);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const approveMut = useApproveArtifact();
  const rejectMut = useRejectArtifact();

  const handleApprove = async () => {
    setLocalStatus("SENT");
    toast("Artifact approved & sent");
    try {
      await approveMut.mutateAsync({ id: artifact.id });
    } catch (err) {
      setLocalStatus("PENDING_REVIEW");
      toast.error("Failed to approve. Reverting state.");
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) return;
    setLocalStatus("REJECTED");
    toast("Artifact rejected");
    try {
      await rejectMut.mutateAsync({ id: artifact.id, data: { reason: rejectReason } });
    } catch (err) {
      setLocalStatus("PENDING_REVIEW");
      toast.error("Failed to reject. Reverting state.");
    }
  };

  const motionProps = reduced
    ? {}
    : {
        variants: cardEnter,
        initial: "hidden" as const,
        animate: "visible" as const,
        exit: "exit" as const,
      };

  if (localStatus === "SENT") {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="sent" {...motionProps}>
          <Card className="p-4 bg-signal-positive/5 border-signal-positive/20 shadow-sm flex flex-col justify-center items-center text-center">
            <div className="h-10 w-10 bg-signal-positive rounded-full flex items-center justify-center mb-3">
              <Check className="h-5 w-5 text-white" />
            </div>
            <h4 className="font-serif text-lg text-ink-900">Sent to {artifact.recipient.name}</h4>
            <p className="text-sm text-ink-700 mt-1">Approval recorded.</p>
          </Card>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (localStatus === "REJECTED") {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="rejected" {...motionProps}>
          <Card className="p-4 bg-paper-100 border-paper-200 shadow-sm flex flex-col justify-center items-center text-center">
            <div className="h-10 w-10 bg-ink-400 rounded-full flex items-center justify-center mb-3">
              <X className="h-5 w-5 text-white" />
            </div>
            <h4 className="font-serif text-lg text-ink-900">Rejected draft for {artifact.recipient.name}</h4>
          </Card>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <>
      <Card className="p-5 bg-ink-0 border-paper-200 shadow-sm transition-shadow duration-200 hover:shadow-md">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-3 items-center">
            <Avatar className="h-10 w-10 border border-paper-200">
              <AvatarImage src={artifact.recipient.avatarUrl || undefined} />
              <AvatarFallback className="bg-paper-200 text-ink-900 font-serif">
                {artifact.recipient.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-sm font-semibold text-ink-900">{artifact.recipient.name}</h3>
              <p className="text-xs text-ink-700">{artifact.recipient.title} • {artifact.recipient.company}</p>
              <p className="text-xs text-ink-400">{artifact.recipient.email}</p>
            </div>
          </div>
          <PolicyBadge policy={artifact.sendPolicy} />
        </div>

        {/* Content */}
        <div className="mb-4">
          <h4 className="font-serif text-lg text-ink-900 mb-2">{artifact.subject}</h4>
          <div className="relative">
            <div 
              className={cn(
                "prose prose-sm prose-ink max-w-none text-ink-700",
                !bodyExpanded && "max-h-[160px] overflow-hidden"
              )}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(artifact.bodyHtml) }}
            />
            {!bodyExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-paper-50 to-transparent flex items-end justify-center pb-1">
                <button
                  onClick={() => setBodyExpanded(true)}
                  className="text-xs font-semibold text-rust-500 hover:text-rust-500/80 bg-paper-50 px-2 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  Expand
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Citations */}
        {artifact.citations && artifact.citations.length > 0 && (
          <Collapsible className="mb-4 bg-paper-100 rounded-md border border-paper-200 p-2">
            <CollapsibleTrigger className="flex items-center text-xs font-semibold text-ink-700 hover:text-ink-900 w-full">
              <Quote className="h-3 w-3 mr-2 text-ink-400" />
              {artifact.citations.length} Facts Cited
              <ChevronDown className="h-3 w-3 ml-auto text-ink-400" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {artifact.citations.map((cite, i) => (
                <div key={i} className="text-[11px] bg-paper-50 p-2 rounded border border-paper-200">
                  <span className="font-medium text-ink-900 block mb-1">"{cite.claim}"</span>
                  <span className="text-ink-400 font-mono">Source: {cite.source}</span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Evaluator Scores */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant="outline" className={cn(
            "text-xs font-tabular", 
            artifact.evaluatorScores.pii > 0.9 ? "bg-signal-positive/10 text-signal-positive border-signal-positive/30" : "bg-ember-400/10 text-ember-400 border-ember-400/30"
          )}>
            PII: {artifact.evaluatorScores.pii.toFixed(2)}
          </Badge>
          <Badge variant="outline" className={cn(
            "text-xs font-tabular", 
            artifact.evaluatorScores.hallucination > 0.9 ? "bg-signal-positive/10 text-signal-positive border-signal-positive/30" : "bg-rust-500/10 text-rust-500 border-rust-500/30"
          )}>
            Factuality: {artifact.evaluatorScores.hallucination.toFixed(2)}
          </Badge>
          <Badge variant="outline" className="text-xs font-tabular bg-paper-200 text-ink-900 border-paper-200">
            Citation Cov: {artifact.evaluatorScores.citationCoverage.toFixed(2)}
          </Badge>
          {artifact.graphRunId && (
            <button
              onClick={() => setTimelineOpen(true)}
              className="text-[10px] text-ink-400 hover:text-ink-900 uppercase tracking-wider ml-auto font-semibold rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              View Trace
            </button>
          )}
        </div>

        {/* Action Bar */}
        {rejectMode ? (
          <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2">
            <input
              type="text"
              aria-label="Reason for rejection"
              placeholder="Reason for rejection (guides future agent drafts)..."
              className="text-sm border border-paper-200 rounded bg-paper-50 px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-rust-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRejectMode(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={handleRejectSubmit} disabled={!rejectReason.trim()}>
                Confirm Reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button onClick={handleApprove} className="flex-1 bg-rust-500 hover:bg-rust-500/90 text-white">
              Approve
            </Button>
            <Button variant="outline" className="flex-1 bg-paper-50">
              <Edit2 className="w-3 h-3 mr-2" />
              Edit & Approve
            </Button>
            <Button variant="ghost" className="text-ink-400 hover:text-rust-500" onClick={() => setRejectMode(true)}>
              Reject
            </Button>
          </div>
        )}
      </Card>
      
      {artifact.graphRunId && (
        <EvidenceTimeline 
          runId={artifact.graphRunId} 
          open={timelineOpen} 
          onOpenChange={setTimelineOpen} 
        />
      )}
    </>
  );
}

export function ApprovalCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex gap-3 items-start mb-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-10 w-1/3" />
      </div>
    </Card>
  );
}
