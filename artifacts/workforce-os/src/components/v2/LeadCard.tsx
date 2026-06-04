import React from "react";
import { Lead } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PolicyBadge } from "./PolicyBadge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface LeadCardProps {
  lead: Lead;
  mode?: "compact" | "detailed";
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function LeadCard({ lead, mode = "compact", selected, onSelect }: LeadCardProps) {
  const scoreColor = 
    lead.score > 80 ? "text-signal-positive" : 
    lead.score > 60 ? "text-ember-400" : 
    "text-rust-500";

  if (mode === "compact") {
    return (
      <Card 
        className={cn("p-4 cursor-pointer hover:border-rust-500 transition-colors", selected && "border-rust-500 ring-1 ring-rust-500")}
        onClick={() => onSelect?.(lead.id)}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h4 className="font-serif text-sm font-semibold text-ink-900 truncate">{lead.name}</h4>
            <p className="text-xs text-ink-700 truncate">{lead.title ? `${lead.title} at ` : ''}{lead.company}</p>
            <div className="mt-2">
              <PolicyBadge policy={lead.sendPolicy} />
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0 ml-4">
            <span className={cn("font-tabular text-lg font-bold leading-none", scoreColor)}>
              {lead.score.toString().padStart(2, '0')}
            </span>
            <span className="text-[10px] text-ink-400 mt-1 uppercase tracking-wider">SCORE</span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <Avatar className="h-12 w-12 border border-paper-200">
          <AvatarImage src={lead.avatarUrl || undefined} />
          <AvatarFallback className="bg-paper-200 text-ink-700 font-serif">
            {lead.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-serif text-lg font-semibold text-ink-900">{lead.name}</h3>
              <p className="text-sm text-ink-700">{lead.title} • {lead.company}</p>
            </div>
            <div className="flex flex-col items-end">
              <span className={cn("font-tabular text-2xl font-bold leading-none", scoreColor)}>
                {lead.score.toString().padStart(2, '0')}
              </span>
              <span className="text-[10px] text-ink-400 mt-1 uppercase tracking-wider">FIT SCORE</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {lead.intentSignals.slice(0, 3).map((signal, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-paper-200 text-ink-900">
                <span className="h-1.5 w-1.5 rounded-full bg-signal-info opacity-70" />
                {signal.label}
              </span>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PolicyBadge policy={lead.sendPolicy} />
              {lead.lastContactedAt && (
                <span className="text-xs text-ink-400">
                  Last contact: {formatDistanceToNow(new Date(lead.lastContactedAt), { addSuffix: true })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8">View Full Profile</Button>
              <Button size="sm" className="h-8">Approve Outbound</Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
