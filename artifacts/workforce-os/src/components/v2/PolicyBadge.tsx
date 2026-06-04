import React from "react";
import { SendPolicy } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, ShieldAlert, Navigation } from "lucide-react";

interface PolicyBadgeProps {
  policy?: SendPolicy;
}

export function PolicyBadge({ policy }: PolicyBadgeProps) {
  if (!policy) {
    return (
      <Badge variant="outline" className="border-ember-400 text-ember-400 bg-rust-100/50">
        <Navigation className="mr-1 h-3 w-3" />
        Dry Run
      </Badge>
    );
  }

  if (policy.recipientSuppressed) {
    return (
      <Badge variant="default" className="bg-ink-900 text-paper-50 hover:bg-ink-900">
        <ShieldAlert className="mr-1 h-3 w-3" />
        Suppressed
      </Badge>
    );
  }

  if (!policy.postalAddressSet) {
    return (
      <Badge variant="destructive" className="bg-rust-500 text-white hover:bg-rust-500">
        <AlertTriangle className="mr-1 h-3 w-3" />
        No Postal Address
      </Badge>
    );
  }

  if (policy.liveSendEnabled) {
    return (
      <Badge variant="outline" className="border-signal-positive text-signal-positive bg-signal-positive/10">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Live Send
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-ember-400 text-ember-400 bg-rust-100/50">
      <Navigation className="mr-1 h-3 w-3" />
      Dry Run
    </Badge>
  );
}
