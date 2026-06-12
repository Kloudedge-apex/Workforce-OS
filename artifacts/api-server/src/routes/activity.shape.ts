/**
 * Pure (db-free) mappers for GET /activity. Kept in its own module so the unit
 * tests can import the shaping logic without pulling in the Drizzle `@workspace/db`
 * client (still used by the co-located /graph-runs/:id/timeline route, which throws
 * at import time when DATABASE_URL is unset).
 */

/** A single event as emitted by DashboardService.activity (apex-gtm-api). */
export interface ActivityEventUpstream {
  id: string;
  kind:
    | "run_started"
    | "run_needs_approval"
    | "run_completed"
    | "run_failed"
    | "draft_created"
    | "draft_approved"
    | "draft_rejected"
    | "meeting_proposed"
    | "meeting_confirmed";
  text: string;
  at: string;
  leadId: string;
}

/** GET /api/activity envelope. */
export interface ActivityUpstream {
  events: ActivityEventUpstream[];
}

export type AgentType = "sdr" | "content" | "ops" | "pipeline" | "reply" | "reporting";

/** FE ActivityEvent contract (openapi.yaml #/components/schemas/ActivityEvent). */
export interface ActivityEvent {
  id: string;
  agentName: string;
  agentType: AgentType;
  action: string;
  stage: string;
  timestamp: string;
  artifactId: string | null;
  leadId: string | null;
}

export type ActivityFilter = "all" | "outbound" | "pipeline" | "conversations";

/**
 * Derive an agent identity + pipeline stage from the upstream `kind`.
 *
 * SYNTHETIC (see 2026-06-10 release audit, dashboard domain): the backend
 * ActivityEvent has NO per-event agent attribution, so agentType/agentName/stage
 * are best-effort labels derived from `kind`, not ground truth.
 */
function deriveAgent(kind: ActivityEventUpstream["kind"]): {
  agentType: AgentType;
  agentName: string;
  stage: string;
} {
  switch (kind) {
    case "run_started":
      return { agentType: "pipeline", agentName: "Pipeline Supervisor", stage: "running" };
    case "run_needs_approval":
      return { agentType: "pipeline", agentName: "Pipeline Supervisor", stage: "awaiting_approval" };
    case "run_completed":
      return { agentType: "pipeline", agentName: "Pipeline Supervisor", stage: "completed" };
    case "run_failed":
      return { agentType: "pipeline", agentName: "Pipeline Supervisor", stage: "failed" };
    case "draft_created":
      return { agentType: "sdr", agentName: "SDR Agent", stage: "drafting" };
    case "draft_approved":
      return { agentType: "sdr", agentName: "SDR Agent", stage: "approved" };
    case "draft_rejected":
      return { agentType: "sdr", agentName: "SDR Agent", stage: "rejected" };
    case "meeting_proposed":
      return { agentType: "pipeline", agentName: "Pipeline Supervisor", stage: "meeting" };
    case "meeting_confirmed":
      return { agentType: "pipeline", agentName: "Pipeline Supervisor", stage: "meeting" };
  }
}

/** Extract the artifact id from a synthetic event id of form `artifact:<id>:<verb>`. */
function artifactIdFrom(id: string): string | null {
  const parts = id.split(":");
  return parts[0] === "artifact" && parts[1] ? parts[1] : null;
}

/** Pure mapper: a single upstream event → the FE ActivityEvent shape. */
export function shapeActivityEvent(ev: ActivityEventUpstream): ActivityEvent {
  const { agentType, agentName, stage } = deriveAgent(ev.kind);
  return {
    id: ev.id,
    agentName,
    agentType,
    action: ev.text,
    stage,
    timestamp: ev.at,
    artifactId: artifactIdFrom(ev.id),
    leadId: ev.leadId || null,
  };
}

/**
 * Pure mapper: the upstream `{ events }` envelope → the FE's bare ActivityEvent[].
 * `filter` (all|outbound|pipeline|conversations) has no backend equivalent, so it
 * is applied here over the derived agentType (audit: BFF-side filtering only).
 */
export function shapeActivity(
  upstream: ActivityUpstream,
  filter: ActivityFilter = "all",
): ActivityEvent[] {
  const mapped = upstream.events.map(shapeActivityEvent);
  if (filter === "all") return mapped;
  const allowedTypes: Record<Exclude<ActivityFilter, "all">, AgentType[]> = {
    outbound: ["sdr", "content"],
    pipeline: ["pipeline", "ops"],
    conversations: ["reply"],
  };
  const allow = allowedTypes[filter];
  return mapped.filter((e) => allow.includes(e.agentType));
}
