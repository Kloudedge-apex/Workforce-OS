import React from "react";
import { ActivityEvent } from "@workspace/api-client-react";
import { useGetActivityStream } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";

interface AgentActivityStreamProps {
  filter?: "all" | "outbound" | "pipeline";
  collapsed?: boolean;
}

const eventColorMap: Record<string, string> = {
  delivery_unknown: "bg-ember-500",
  draft_rejected: "bg-rust-500",
  draft_sent: "bg-signal-positive",
  meeting_confirmed: "bg-signal-positive",
};

function eventLabel(kind: string): string {
  return kind.replace(/_/g, " ");
}

export function AgentActivityStream({ filter = "all", collapsed = false }: AgentActivityStreamProps) {
  const { data: stream, isLoading, isError, refetch } = useGetActivityStream(
    { filter },
    { query: { refetchInterval: 5000, queryKey: ["getActivityStream", filter] } }
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            {!collapsed && (
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    if (collapsed) {
      return (
        <div className="flex items-center justify-center p-8 text-sm text-signal-critical" role="alert">
          <span className="h-2 w-2 rounded-full bg-signal-critical" />
        </div>
      );
    }
    return (
      <ErrorState
        title="Activity feed unavailable"
        description="We couldn't reach the agent activity stream. It will reconnect automatically — or retry now."
        onRetry={() => refetch()}
      />
    );
  }

  if (!stream || stream.length === 0) {
    if (collapsed) {
      return (
        <div className="flex items-center justify-center p-8 text-sm text-ink-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ink-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-ink-400"></span>
          </span>
        </div>
      );
    }
    return (
      <EmptyState
        icon={Activity}
        title="No recorded activity"
        description="Pipeline, review, delivery, and meeting events will appear here when the backend records them."
      />
    );
  }

  return (
    <Stagger className="flex flex-col p-4 gap-4">
      <div aria-live="polite" className="contents">
        {stream.map((event: ActivityEvent) => (
          <StaggerItem key={event.id} className="flex items-start gap-3">
            <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", eventColorMap[event.kind] || "bg-ink-400")} />
            {!collapsed && (
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-900 dark:text-paper-50 truncate">
                    {eventLabel(event.kind)}
                  </span>
                  <span className="text-[10px] text-ink-400 shrink-0 font-tabular">
                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-ink-700 dark:text-ink-300 leading-snug">
                  {event.action}
                </p>
              </div>
            )}
          </StaggerItem>
        ))}
      </div>
    </Stagger>
  );
}
