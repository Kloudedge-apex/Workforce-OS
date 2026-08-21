import React from "react";
import { useGetLead } from "@workspace/api-client-react";
import type { Lead } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  Sparkles,
  Clock,
  Target,
  Search,
  MessageSquare,
  UserX,
  ExternalLink,
} from "lucide-react";
import { ScoreRing } from "@/components/v2/ScoreRing";
import { EmailStatusBadge } from "@/components/v2/EmailStatusBadge";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function LeadDetail() {
  const [, params] = useRoute("/pipeline/:id");
  const [, setLocation] = useLocation();
  const id = params?.id || "";

  const {
    data: detailData,
    isLoading,
    isError,
    refetch,
  } = useGetLead(id, {
    query: { enabled: !!id, queryKey: ["getLead", id] },
  });

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

  if (isError) {
    return (
      <div className="flex h-full flex-col bg-paper-50">
        <ErrorState
          title="Couldn't load this lead"
          description="The lead detail failed to load. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className="flex h-full flex-col bg-paper-50">
        <EmptyState
          icon={UserX}
          title="Lead not found"
          description="This lead may have been suppressed or removed from the pipeline."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/pipeline")}
              className="hover-elevate active-elevate-2 border-paper-200"
            >
              Back to Pipeline
            </Button>
          }
        />
      </div>
    );
  }

  const { lead, researchBrief, scoreBreakdown, recentEvidenceEvents } =
    detailData;

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
        <p className="text-xs text-ink-400">
          Outbound starts from the canonical Runs workflow.
        </p>
      </div>

      <Stagger className="max-w-6xl mx-auto w-full p-6 md:p-10 space-y-8">
        {/* Hero Card */}
        <StaggerItem>
          <Card className="p-8 bg-ink-0 border-paper-200 shadow-sm transition-shadow duration-200 hover:shadow-md overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8">
              {lead.score == null ? (
                <span className="rounded-full border border-paper-200 bg-paper-50 px-3 py-1.5 text-xs font-medium text-ink-400">
                  Not scored
                </span>
              ) : (
                <ScoreRing score={lead.score} size={80} strokeWidth={6} />
              )}
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="h-20 w-20 rounded-full bg-paper-100 border border-paper-200 flex items-center justify-center text-3xl font-serif text-ink-900 dark:text-paper-50">
                {lead.name.charAt(0)}
              </div>
              <div>
                <h1 className="font-serif text-3xl font-semibold text-ink-900 dark:text-paper-50">
                  {lead.name}
                </h1>
                <p className="text-lg text-ink-700 mt-1 dark:text-paper-200">
                  {lead.title} @ {lead.company}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  {lead.emailStatus && (
                    <EmailStatusBadge status={lead.emailStatus} />
                  )}
                  <div className="h-1 w-1 rounded-full bg-paper-200" />
                  <span className="text-xs text-ink-400 font-mono uppercase tracking-wider">
                    {lead.domain}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </StaggerItem>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <StaggerItem>
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-rust-500" />
                  <h3 className="font-serif text-xl font-semibold text-ink-900">
                    Research Brief
                  </h3>
                </div>
                <Card className="p-6 border-paper-200 bg-ink-0 prose prose-ink max-w-none text-ink-700 dark:text-paper-200 shadow-sm transition-shadow duration-200 hover:shadow-md leading-relaxed">
                  {researchBrief ??
                    "Research brief not available on this lead record."}
                </Card>
              </section>
            </StaggerItem>

            <StaggerItem>
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-5 w-5 text-ink-900" />
                  <h3 className="font-serif text-xl font-semibold text-ink-900">
                    Score Breakdown
                  </h3>
                </div>
                <Card className="p-6 border-paper-200 bg-ink-0 shadow-sm transition-shadow duration-200 hover:shadow-md space-y-6">
                  {scoreBreakdown ? (
                    <>
                      <ScoreBar
                        label="Firmographic Fit"
                        score={scoreBreakdown.fit}
                      />
                      <ScoreBar
                        label="Intent Signals"
                        score={scoreBreakdown.intent}
                      />
                      <ScoreBar
                        label="Reachability"
                        score={scoreBreakdown.engagement}
                      />
                      <ScoreBar
                        label="Timing / Urgency"
                        score={scoreBreakdown.timing}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-ink-500">
                      Only the aggregate lead score is recorded; a category
                      breakdown is not available.
                    </p>
                  )}
                </Card>
              </section>
            </StaggerItem>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <StaggerItem>
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Search className="h-5 w-5 text-ink-400" />
                  <h3 className="font-serif text-lg font-semibold text-ink-900">
                    Recent Evidence
                  </h3>
                </div>
                <div className="space-y-4">
                  {recentEvidenceEvents.length === 0 && (
                    <p className="text-sm text-ink-500">
                      No per-lead evidence timeline is available.
                    </p>
                  )}
                  {recentEvidenceEvents.map((evt) => (
                    <div key={evt.id} className="relative pl-6 pb-4 last:pb-0">
                      <div className="absolute left-0 top-1.5 bottom-0 w-px bg-paper-200" />
                      <div className="absolute left-[-3px] top-1.5 h-1.5 w-1.5 rounded-full bg-rust-500" />
                      <div className="text-xs font-semibold text-ink-900 mb-1">
                        {evt.eventType}
                      </div>
                      <p className="text-xs text-ink-700 leading-snug mb-1">
                        {evt.description}
                      </p>
                      <div className="text-[10px] text-ink-400 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {formatDistanceToNow(new Date(evt.timestamp), {
                          addSuffix: true,
                        })}
                      </div>
                      <EvidenceSourceLink sourceUrl={evt.sourceUrl} />
                    </div>
                  ))}
                </div>
              </section>
            </StaggerItem>

            <StaggerItem>
              <Card className="p-6 bg-rust-50 border-rust-100 shadow-sm transition-shadow duration-200 hover:shadow-md">
                <h4 className="font-serif font-semibold text-rust-900 dark:text-rust-300 mb-2">
                  {(lead.intentSignals?.length ?? 0) > 0
                    ? "Intent Detected"
                    : "Intent evidence unavailable"}
                </h4>
                <p className="text-sm text-rust-700 dark:text-rust-200 mb-4 leading-snug">
                  {intentBlurb(lead.intentSignals)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(lead.intentSignals ?? []).map((sig, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-1 bg-white border border-rust-200 rounded text-rust-600 font-medium"
                    >
                      {sig.label}
                      <span className="ml-1 text-rust-500 font-tabular">
                        {Math.round(sig.confidence * 100)}%
                      </span>
                    </span>
                  ))}
                </div>
              </Card>
            </StaggerItem>

            {lead.lastContactedAt && (
              <StaggerItem>
                <div className="flex items-center gap-3 p-4 bg-paper-100 rounded-lg border border-paper-200">
                  <MessageSquare className="h-4 w-4 text-ink-400" />
                  <div className="text-xs">
                    <span className="text-ink-400 block uppercase tracking-wider font-mono">
                      Last Contact
                    </span>
                    <span className="text-ink-900 font-medium">
                      {formatDistanceToNow(new Date(lead.lastContactedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
              </StaggerItem>
            )}
          </div>
        </div>
      </Stagger>
    </div>
  );
}

export function evidenceSourceHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return value;
  } catch {
    return null;
  }
}

export function EvidenceSourceLink({
  sourceUrl,
}: {
  sourceUrl: string | null;
}) {
  const href = evidenceSourceHref(sourceUrl);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rust-600 hover:text-rust-700 hover:underline"
    >
      View source
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score > 80 ? "bg-rust-500" : score > 60 ? "bg-ember-400" : "bg-paper-200";
  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <span className="text-xs font-medium text-ink-700 dark:text-paper-200">
          {label}
        </span>
        <span className="text-xs font-tabular font-bold text-ink-900 dark:text-paper-50">
          {score}%
        </span>
      </div>
      <div className="h-2 w-full bg-paper-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            color,
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Build a human sentence from the lead's real intent signals (confidence is 0–1).
 * Falls back to neutral copy when the lead has no signals.
 */
function intentBlurb(signals: Lead["intentSignals"]): string {
  if (!signals?.length) {
    return "This lead record does not include attributable intent signals.";
  }
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  const pct = Math.round(top.confidence * 100);
  const rest = sorted.slice(1, 3).map((s) => s.label);
  const restPhrase =
    rest.length === 0
      ? ""
      : rest.length === 1
        ? `, alongside ${rest[0]}`
        : `, alongside ${rest[0]} and ${rest[1]}`;
  return `Strongest signal: ${top.label} (${pct}% confidence)${restPhrase}.`;
}
