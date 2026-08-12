import React from "react";
import { ReplyIntelligenceSentiment } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VisibleSentiment = NonNullable<ReplyIntelligenceSentiment>;

const sentimentColors: Record<VisibleSentiment, string> = {
  positive: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
  objection: "bg-ember-400/10 text-ember-400 border-ember-400/20",
  neutral: "bg-paper-200 text-ink-700 border-paper-200",
  negative: "bg-rust-500/10 text-rust-500 border-rust-500/20",
};

interface SentimentBadgeProps {
  sentiment: VisibleSentiment;
  /** Compact preview variant used in the conversation list row. */
  dense?: boolean;
  className?: string;
}

export function SentimentBadge({ sentiment, dense, className }: SentimentBadgeProps) {
  const colors = sentimentColors[sentiment] ?? sentimentColors.neutral;
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize font-medium",
        dense && "text-[10px] px-1.5 py-0 h-4",
        colors,
        className,
      )}
    >
      {sentiment}
    </Badge>
  );
}
