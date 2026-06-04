import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CohortBadge({ cohort }: { cohort: string }) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-mono", 
        cohort === "A" ? "border-rust-500 text-rust-500" : "border-ink-900 text-ink-900"
      )}
    >
      Cohort {cohort}
    </Badge>
  );
}
