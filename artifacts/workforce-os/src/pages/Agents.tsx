import React from "react";
import { useListAgents } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function SparklineChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const H = 24;
  const W = 80;
  const barW = Math.floor(W / data.length) - 1;
  return (
    <svg width={W} height={H} className="shrink-0">
      {data.map((val, i) => {
        const h = Math.max(1, Math.round((val / max) * H));
        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={H - h}
            width={barW}
            height={h}
            className="fill-rust-300"
            rx="1"
          />
        );
      })}
    </svg>
  );
}

const STATUS_CONFIG = {
  running: { dot: "bg-amber-400 animate-pulse", label: "Running" },
  idle: { dot: "bg-paper-300", label: "Idle" },
  error: { dot: "bg-red-400", label: "Error" },
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  sdr: "Sources new leads matching ICP, enriches signals, and scores for outbound readiness.",
  content: "Drafts personalised outreach using research briefs and brand voice config.",
  reply: "Analyses inbound replies, detects sentiment, and suggests next best action.",
  reporting: "Compiles pipeline and outreach metrics into weekly reports.",
  ops: "Handles compliance checks, suppression management, and send-policy validation.",
  pipeline: "Orchestrates the end-to-end pipeline: source → enrich → score → draft → evaluate.",
};

export default function Agents() {
  const { data: agents, isLoading } = useListAgents({
    query: { queryKey: ["listAgents"], refetchInterval: 10000 },
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-paper-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-paper-100 border-b border-paper-200 px-6 py-4">
        <h1 className="font-serif font-semibold text-ink-900 text-lg">Agent Roster</h1>
        <p className="text-xs text-ink-400 mt-0.5">Autonomous agents running on your behalf</p>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(agents ?? []).map((agent) => {
              const statusCfg = STATUS_CONFIG[agent.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.idle;
              return (
                <div key={agent.id} className="bg-white border border-paper-200 rounded-lg p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", statusCfg.dot)} />
                      <h3 className="font-serif font-semibold text-ink-900">{agent.name}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <SparklineChart data={(agent.sparklineData ?? []) as number[]} />
                      <div className="text-right">
                        <p className="text-xs font-mono text-rust-600 font-semibold">{agent.recentActivityCount}</p>
                        <p className="text-xs text-ink-400">events</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-ink-500 mb-3 leading-relaxed">
                    {AGENT_DESCRIPTIONS[agent.type] ?? "AI agent handling automated tasks."}
                  </p>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-ink-400">
                        {statusCfg.label}
                        {agent.lastActionAt && (
                          <span className="ml-1 text-ink-300">
                            · {new Date(agent.lastActionAt).toLocaleTimeString()}
                          </span>
                        )}
                      </p>
                      {agent.lastAction && (
                        <p className="text-xs text-ink-600 mt-0.5 truncate max-w-[200px]">
                          {agent.lastAction}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-ink-300 font-mono capitalize px-2 py-0.5 bg-paper-100 rounded">
                      {agent.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
