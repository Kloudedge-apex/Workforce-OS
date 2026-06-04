import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Sentiment = "positive" | "objection" | "neutral" | "negative";

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const sentimentColors = {
    positive: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
    objection: "bg-ember-400/10 text-ember-400 border-ember-400/20",
    neutral: "bg-paper-200 text-ink-700 border-paper-200",
    negative: "bg-rust-500/10 text-rust-500 border-rust-500/20",
  };

  return (
    <Badge variant="outline" className={cn("capitalize", sentimentColors[sentiment])}>
      {sentiment}
    </Badge>
  );
}
