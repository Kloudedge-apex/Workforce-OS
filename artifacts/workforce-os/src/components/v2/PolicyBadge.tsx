import React from "react";
import { SendPolicy } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, ShieldAlert, Navigation } from "lucide-react";

interface PolicyBadgeProps {
  policy?: SendPolicy | null;
  /**
   * Workspace-level live flag derived from OrgSettings.sendReadiness (GL5,
   * see lib/sendReadiness.ts): true/false when the backend reported it, null
   * when unknown. Used ONLY when per-item `policy` data is missing — a live
   * workspace must not be painted "Dry Run" just because the per-item policy
   * wasn't populated. false/null keep the fail-closed Dry Run rendering.
   */
  workspaceLive?: boolean | null;
}

const LIVE_SEND_BADGE = (
  <Badge variant="outline" className="border-signal-positive text-signal-positive bg-signal-positive/10">
    <CheckCircle2 className="mr-1 h-3 w-3" />
    Live Send
  </Badge>
);

const DRY_RUN_BADGE = (
  <Badge variant="outline" className="border-ember-400 text-ember-400 bg-rust-100/50">
    <Navigation className="mr-1 h-3 w-3" />
    Dry Run
  </Badge>
);

export function PolicyBadge({ policy, workspaceLive = null }: PolicyBadgeProps) {
  if (!policy) {
    // No per-item policy data. The workspace readiness is the only honest
    // signal left: live → Live Send; dry-run or unknown → Dry Run (fail-closed,
    // matching the backend's dry-run-by-default behavior).
    return workspaceLive === true ? LIVE_SEND_BADGE : DRY_RUN_BADGE;
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
    return LIVE_SEND_BADGE;
  }

  return DRY_RUN_BADGE;
}
