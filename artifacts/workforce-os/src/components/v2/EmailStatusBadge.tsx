import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type EmailStatus = "DELIVERABLE" | "HIGH_PROBABILITY" | "CATCH_ALL";

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const colors = {
    DELIVERABLE: "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
    HIGH_PROBABILITY: "bg-ember-400/10 text-ember-400 border-ember-400/20",
    CATCH_ALL: "bg-paper-200 text-ink-700 border-paper-200",
  };

  return (
    <Badge variant="outline" className={cn("text-[10px] tracking-tight", colors[status])}>
      {status.replace("_", " ")}
    </Badge>
  );
}
