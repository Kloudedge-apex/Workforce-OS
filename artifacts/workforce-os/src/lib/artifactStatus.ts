import type { OutreachArtifactStatus } from "@workspace/api-client-react";

/**
 * Single source of truth for outreach-artifact status presentation.
 *
 * HONESTY CONTRACT — these labels must never overstate what happened:
 *  - APPROVED  → the draft is queued; nothing has been delivered.
 *  - SENDING   → the send worker has claimed it; delivery is in flight.
 *  - SENT      → an email actually left for a real recipient. Nothing else
 *                may render as "Sent".
 *  - SIMULATED → the backend force-mocked the send (dry-run). Distinct amber
 *                badge so pilots can't mistake it for a real delivery.
 *  - DELIVERY_UNKNOWN → provider acceptance could not be reconciled. It is
 *                terminal and must never be presented as retryable or sent.
 *  - FAILED → provider acceptance did not occur and automatic retries are
 *                exhausted. It is distinct from human REJECTED.
 *  - RECONCILIATION_REQUIRED → historical system metadata is insufficient to
 *                classify the row as either a human rejection or send failure.
 *
 * The generated client is the source of the complete server enum.
 */
export type ArtifactUiStatus = OutreachArtifactStatus;

export interface ArtifactStatusBadge {
  label: string;
  /** Tailwind classes following the paper/ink/rust/ember/signal palette. */
  className: string;
}

export const ARTIFACT_STATUS_BADGES: Record<
  ArtifactUiStatus,
  ArtifactStatusBadge
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-paper-100 text-ink-600 border-paper-200",
  },
  PENDING_REVIEW: {
    label: "Pending review",
    className: "bg-rust-100 text-rust-800 border-rust-200",
  },
  APPROVED: {
    label: "Approved — queued to send",
    className: "bg-signal-info/10 text-signal-info border-signal-info/20",
  },
  SENDING: {
    label: "Sending…",
    className: "bg-signal-info/10 text-signal-info border-signal-info/20",
  },
  SENT: {
    label: "Sent",
    className:
      "bg-signal-positive/10 text-signal-positive border-signal-positive/20",
  },
  SIMULATED: {
    label: "Simulated (dry-run)",
    className: "bg-ember-400/15 text-ember-500 border-ember-400/40",
  },
  DELIVERY_UNKNOWN: {
    label: "Delivery unknown — reconcile before resend",
    className: "bg-ember-400/15 text-ember-600 border-ember-400/40",
  },
  FAILED: {
    label: "Failed — no delivery",
    className: "bg-rust-500/10 text-rust-600 border-rust-500/30",
  },
  RECONCILIATION_REQUIRED: {
    label: "Unclassified — reconcile history",
    className: "bg-ember-400/15 text-ember-600 border-ember-400/40",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-paper-200 text-ink-700 border-paper-200",
  },
  SUPPRESSED: {
    label: "Suppressed",
    className: "bg-rust-500/10 text-rust-500 border-rust-500/20",
  },
};

const TERMINAL_ARTIFACT_STATUSES: ReadonlySet<ArtifactUiStatus> = new Set([
  "REJECTED",
  "SENT",
  "SUPPRESSED",
  "SIMULATED",
  "DELIVERY_UNKNOWN",
  "FAILED",
  "RECONCILIATION_REQUIRED",
]);

export function isTerminalArtifactStatus(status: string): boolean {
  return TERMINAL_ARTIFACT_STATUSES.has(status as ArtifactUiStatus);
}

const FALLBACK_BADGE: ArtifactStatusBadge = {
  label: "",
  className: "bg-paper-100 text-ink-600 border-paper-200",
};

/**
 * Resolve any server-sent status string to a badge. Unknown statuses get a
 * humanized neutral badge rather than crashing or masquerading as a known one.
 */
export function artifactStatusBadge(status: string): ArtifactStatusBadge {
  const known = (ARTIFACT_STATUS_BADGES as Record<string, ArtifactStatusBadge>)[
    status
  ];
  if (known) return known;
  return { ...FALLBACK_BADGE, label: status.replace(/_/g, " ") };
}
