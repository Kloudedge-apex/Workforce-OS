import React from "react";
import { TimelineNode } from "@workspace/api-client-react";
import { useGetGraphRunTimeline } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { isUnavailable, UnavailableState } from "@/lib/unavailable";

interface EvidenceTimelineProps {
  runId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeColors = {
  agent_run: "bg-rust-500",
  llm_call: "bg-signal-info",
  evaluator: "bg-ember-400",
  tool_call: "bg-ink-900",
  human_action: "bg-paper-200 border border-ink-400",
};

export function EvidenceTimeline({ runId, open, onOpenChange }: EvidenceTimelineProps) {
  const { data: timeline, isLoading } = useGetGraphRunTimeline(
    runId || "",
    { query: { enabled: !!runId && open, queryKey: ["getGraphRunTimeline", runId] } }
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto bg-paper-50 border-paper-200">
        <SheetHeader className="mb-6">
          <SheetTitle className="font-serif text-xl text-ink-900">Reasoning Trace</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : isUnavailable(timeline) ? (
          <UnavailableState feature="the reasoning trace" />
        ) : !timeline || timeline.length === 0 ? (
          <div className="text-center py-12 text-ink-400">
            <p>No trace available for this operation.</p>
          </div>
        ) : (
          <div className="relative pl-1">
            <div className="absolute top-2 bottom-2 left-2.5 w-px bg-paper-200" />
            <div className="space-y-6">
              {timeline.map((node) => (
                <TimelineNodeItem key={node.id} node={node} />
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TimelineNodeItem({ node }: { node: TimelineNode }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative pl-6">
      <div className={cn(
        "absolute left-[-2px] top-1.5 h-3 w-3 rounded-full ring-4 ring-paper-50",
        typeColors[node.nodeType] || "bg-ink-400"
      )} />
      
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-ink-900">{node.label}</h4>
          <div className="flex items-center gap-2 text-[10px] font-tabular text-ink-400">
            {node.durationMs && <span>{node.durationMs}ms</span>}
            {node.tokensUsed && <span className="bg-paper-200 px-1 rounded">{node.tokensUsed} tk</span>}
            {node.score !== undefined && node.score !== null && (
              <span className={cn(
                "px-1.5 py-0.5 rounded font-medium",
                node.score > 0.8 ? "bg-signal-positive/10 text-signal-positive" : "bg-rust-100 text-rust-500"
              )}>
                {node.score.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        
        <p className="text-xs text-ink-700">{node.summary}</p>

        {node.reasoning && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
            <CollapsibleTrigger className="flex items-center text-xs text-ink-400 hover:text-ink-900 transition-colors">
              <ChevronRight className={cn("h-3 w-3 mr-1 transition-transform", isOpen && "rotate-90")} />
              {isOpen ? "Hide reasoning" : "View raw reasoning"}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-paper-100 border border-paper-200 rounded-md p-3 text-[11px] font-mono text-ink-700 whitespace-pre-wrap overflow-x-auto">
                {node.reasoning}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {node.children && node.children.length > 0 && (
          <div className="mt-4 space-y-4 relative">
            <div className="absolute top-0 bottom-0 left-[-16px] w-px bg-paper-200" />
            {node.children.map(child => (
              <TimelineNodeItem key={child.id} node={child} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
