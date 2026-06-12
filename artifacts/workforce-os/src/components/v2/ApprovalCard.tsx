import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { OutreachArtifact } from "@workspace/api-client-react";
import { useApproveArtifact, useRejectArtifact } from "@workspace/api-client-react";
import { cardEnter, useReducedMotionSafe } from "@/lib/motion";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PolicyBadge } from "./PolicyBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Check, X, Edit2, Quote, Send, FlaskConical, Ban, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import { toast } from "sonner";
import { isUnavailable } from "@/lib/unavailable";
import { ArtifactUiStatus, artifactStatusBadge } from "@/lib/artifactStatus";
import { getArtifactRefusal, uiCitations, citedCount } from "@/lib/artifactContract";
import { EvidenceTimeline } from "./EvidenceTimeline";
import { Skeleton } from "../ui/skeleton";

interface ApprovalCardProps {
  artifact: OutreachArtifact;
}

/**
 * Non-actionable statuses render as a compact state card. Copy is honest:
 * only SENT claims delivery; APPROVED/SENDING say queued/in-flight;
 * SIMULATED is explicitly a dry-run.
 */
interface ResolvedCardConfig {
  icon: React.ReactNode;
  cardClass: string;
  iconWrapClass: string;
  title: (name: string) => string;
  detail: string;
}

const RESOLVED_CARDS: Partial<Record<ArtifactUiStatus, ResolvedCardConfig>> = {
  APPROVED: {
    icon: <Check className="h-5 w-5 text-white" />,
    cardClass: "bg-signal-info/5 border-signal-info/20",
    iconWrapClass: "bg-signal-info",
    title: (name) => `Approved — queued to send to ${name}`,
    detail: "Nothing has been sent yet. The send worker will pick this up.",
  },
  SENDING: {
    icon: <Loader2 className="h-5 w-5 text-white animate-spin" />,
    cardClass: "bg-signal-info/5 border-signal-info/20",
    iconWrapClass: "bg-signal-info",
    title: (name) => `Sending to ${name}…`,
    detail: "The send worker has claimed this draft. Delivery is in flight.",
  },
  SENT: {
    icon: <Send className="h-5 w-5 text-white" />,
    cardClass: "bg-signal-positive/5 border-signal-positive/20",
    iconWrapClass: "bg-signal-positive",
    title: (name) => `Sent to ${name}`,
    detail: "Delivery confirmed by the server.",
  },
  SIMULATED: {
    icon: <FlaskConical className="h-5 w-5 text-white" />,
    cardClass: "bg-ember-400/10 border-ember-400/30",
    iconWrapClass: "bg-ember-500",
    title: (name) => `Simulated send for ${name}`,
    detail: "Dry-run only — no real email was sent. Enable live sending to deliver.",
  },
  REJECTED: {
    icon: <X className="h-5 w-5 text-white" />,
    cardClass: "bg-paper-100 border-paper-200",
    iconWrapClass: "bg-ink-400",
    title: (name) => `Rejected draft for ${name}`,
    detail: "The rejection reason guides future agent drafts.",
  },
  SUPPRESSED: {
    icon: <Ban className="h-5 w-5 text-white" />,
    cardClass: "bg-rust-500/5 border-rust-500/20",
    iconWrapClass: "bg-rust-500",
    title: (name) => `Suppressed — will not send to ${name}`,
    detail: "This recipient is on the suppression list.",
  },
};

/**
 * Evaluator score chip. `null`/`undefined`/non-finite means the score is NOT
 * AVAILABLE (the BFF sends null when nothing is persisted) — render muted,
 * never a red 0.00 that fakes a failing evaluation.
 */
function ScorePill({
  label,
  value,
  classForValue,
}: {
  label: string;
  value: number | null | undefined;
  classForValue?: (v: number) => string;
}) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <Badge variant="outline" className="text-xs font-tabular bg-paper-100 text-ink-400 border-paper-200">
        {label}: not available
      </Badge>
    );
  }
  const cls = classForValue ? classForValue(value) : "bg-paper-200 text-ink-900 border-paper-200";
  return (
    <Badge variant="outline" className={cn("text-xs font-tabular", cls)}>
      {label}: {value.toFixed(2)}
    </Badge>
  );
}

export function ApprovalCard({ artifact }: ApprovalCardProps) {
  const reduced = useReducedMotionSafe();
  const [localStatus, setLocalStatus] = useState<ArtifactUiStatus>(artifact.status);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // The server is the source of truth: polling refetches update the artifact
  // prop, and the rendered status must follow it (e.g. APPROVED → SENDING →
  // SENT/SIMULATED transitions made by the send worker).
  React.useEffect(() => {
    setLocalStatus(artifact.status);
  }, [artifact.status]);

  const approveMut = useApproveArtifact();
  const rejectMut = useRejectArtifact();

  const handleApprove = async () => {
    try {
      const updated = await approveMut.mutateAsync({ id: artifact.id });
      if (isUnavailable(updated)) {
        toast("Approval isn't available yet — coming soon");
        return;
      }
      // Follow whatever status the server actually assigned — approving
      // queues the email, it does NOT send it.
      setLocalStatus(updated.status as ArtifactUiStatus);
      toast.success("Approved — queued to send");
    } catch (err) {
      toast.error("Failed to approve.");
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) return;
    try {
      const updated = await rejectMut.mutateAsync({ id: artifact.id, data: { reason: rejectReason } });
      if (isUnavailable(updated)) {
        toast("Rejection isn't available yet — coming soon");
        return;
      }
      setLocalStatus(updated.status as ArtifactUiStatus);
      toast("Draft rejected");
    } catch (err) {
      toast.error("Failed to reject.");
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

  const resolved = RESOLVED_CARDS[localStatus];
  if (resolved) {
    const badge = artifactStatusBadge(localStatus);
    return (
      <AnimatePresence mode="wait">
        <motion.div key={localStatus} {...motionProps}>
          <Card className={cn("p-4 shadow-sm flex flex-col justify-center items-center text-center", resolved.cardClass)}>
            <div className={cn("h-10 w-10 rounded-full flex items-center justify-center mb-3", resolved.iconWrapClass)}>
              {resolved.icon}
            </div>
            <h4 className="font-serif text-lg text-ink-900">{resolved.title(artifact.recipient.name)}</h4>
            <p className="text-sm text-ink-700 mt-1">{resolved.detail}</p>
            <Badge variant="outline" className={cn("text-xs mt-3 border", badge.className)}>
              {badge.label}
            </Badge>
          </Card>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Runtime-nullable even though the generated client type lags the contract
  // (evaluatorScores: null | { pii, hallucination, citationCoverage, toxicity }).
  const scores = artifact.evaluatorScores ?? null;

  // Drafter refusal: when refused, subject/body may be empty and must NOT
  // present as a normal draft — banner instead of preview, no approve action.
  const refusal = getArtifactRefusal(artifact);
  const refused = refusal?.refused === true;

  const citations = uiCitations(artifact.citations);
  const citedFacts = citedCount(artifact.citations);
  const hasCitedFlags = citations.some((c) => typeof c.cited === "boolean");

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

        {/* Content — a refusal renders a banner, never an (empty) draft preview */}
        {refused ? (
          <div
            role="alert"
            data-testid="refusal-banner"
            className="mb-4 rounded-lg border border-rust-500/30 bg-rust-500/5 p-4"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rust-500 shrink-0" />
              <h4 className="font-serif text-lg text-ink-900">Refused to draft — no grounded evidence</h4>
            </div>
            <p className="text-sm text-ink-700 mt-2">
              {refusal?.reason ??
                "The agent declined to write this email because it couldn't ground it in real, dated evidence."}
            </p>
          </div>
        ) : (
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
        )}

        {/* Citations — `cited` rows are the facts the drafter actually used */}
        {citations.length > 0 && (
          <Collapsible className="mb-4 bg-paper-100 rounded-md border border-paper-200 p-2">
            <CollapsibleTrigger className="flex items-center text-xs font-semibold text-ink-700 hover:text-ink-900 w-full">
              <Quote className="h-3 w-3 mr-2 text-ink-400" />
              {hasCitedFlags
                ? `${citedFacts} of ${citations.length} facts cited`
                : `${citations.length} Facts Cited`}
              <ChevronDown className="h-3 w-3 ml-auto text-ink-400" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {citations.map((cite, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-[11px] p-2 rounded border",
                    cite.cited
                      ? "bg-signal-positive/5 border-signal-positive/30"
                      : "bg-paper-50 border-paper-200"
                  )}
                >
                  <span className="font-medium text-ink-900 block mb-1">"{cite.claim}"</span>
                  <span className="text-ink-400 font-mono">
                    Source: {cite.source}
                    {cite.date ? ` · ${cite.date}` : ""}
                  </span>
                  {cite.cited && (
                    <span className="block mt-1 text-[10px] font-semibold uppercase tracking-wide text-signal-positive">
                      Cited in draft
                    </span>
                  )}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Evaluator Scores — the BFF sends evaluatorScores: null when no
            scores are persisted; render "not available" rather than fake 0.00s. */}
        <div className="flex flex-wrap gap-2 mb-6">
          {scores ? (
            <>
              <ScorePill
                label="PII"
                value={scores.pii}
                classForValue={(v) =>
                  v > 0.9
                    ? "bg-signal-positive/10 text-signal-positive border-signal-positive/30"
                    : "bg-ember-400/10 text-ember-400 border-ember-400/30"
                }
              />
              <ScorePill
                label="Factuality"
                value={scores.hallucination}
                classForValue={(v) =>
                  v > 0.9
                    ? "bg-signal-positive/10 text-signal-positive border-signal-positive/30"
                    : "bg-rust-500/10 text-rust-500 border-rust-500/30"
                }
              />
              <ScorePill label="Citation Cov" value={scores.citationCoverage} />
            </>
          ) : (
            <Badge variant="outline" className="text-xs bg-paper-100 text-ink-400 border-paper-200">
              Evaluator scores not available
            </Badge>
          )}
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
              <Button variant="destructive" size="sm" onClick={handleRejectSubmit} disabled={!rejectReason.trim() || rejectMut.isPending}>
                {rejectMut.isPending ? "Rejecting…" : "Confirm Reject"}
              </Button>
            </div>
          </div>
        ) : refused ? (
          // No approve path for a refusal — there is no draft to send.
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs text-ink-500">
              Approval disabled — the agent refused to draft this email.
            </p>
            <Button variant="ghost" className="text-ink-400 hover:text-rust-500" onClick={() => setRejectMode(true)}>
              Reject
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button onClick={handleApprove} disabled={approveMut.isPending} className="flex-1 bg-rust-500 hover:bg-rust-500/90 text-white">
              {approveMut.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Approving…
                </>
              ) : (
                "Approve"
              )}
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
