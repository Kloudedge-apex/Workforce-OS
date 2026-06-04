import React from "react";
import { TimelineNode } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { 
  Activity, 
  Cpu, 
  ShieldCheck, 
  Wrench, 
  User, 
  ChevronRight 
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const iconMap = {
  agent_run: Activity,
  llm_call: Cpu,
  evaluator: ShieldCheck,
  tool_call: Wrench,
  human_action: User,
};

const colorMap = {
  agent_run: "bg-rust-500",
  llm_call: "bg-signal-info",
  evaluator: "bg-ember-400",
  tool_call: "bg-ink-900",
  human_action: "bg-paper-200 border border-ink-400",
};

export function TimelineTree({ nodes }: { nodes: TimelineNode[] }) {
  return (
    <div className="relative pl-1">
      <div className="absolute top-2 bottom-2 left-2.5 w-px bg-paper-200" />
      <div className="space-y-6">
        {nodes.map((node) => (
          <TimelineNodeItem key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}

function TimelineNodeItem({ node }: { node: TimelineNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const Icon = iconMap[node.nodeType] || Activity;

  return (
    <div className="relative pl-6">
      <div className={cn(
        "absolute left-[-2px] top-1.5 h-3 w-3 rounded-full ring-4 ring-paper-50 flex items-center justify-center overflow-hidden",
        colorMap[node.nodeType] || "bg-ink-400"
      )}>
        <Icon className="h-2 w-2 text-white" />
      </div>
      
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-ink-900">{node.label}</h4>
          <div className="flex items-center gap-2 text-[10px] font-tabular text-ink-400">
            {node.durationMs && <span>{node.durationMs}ms</span>}
            {node.tokensUsed && <span className="bg-paper-200 px-1 rounded">{node.tokensUsed} tk</span>}
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
