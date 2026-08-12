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
    | "draft_sent"
    | "delivery_unknown"
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

/** FE ActivityEvent contract (openapi.yaml #/components/schemas/ActivityEvent). */
export interface ActivityEvent {
  id: string;
  kind: ActivityEventUpstream["kind"];
  action: string;
  timestamp: string;
  artifactId: string | null;
  leadId: string | null;
}

export type ActivityFilter = "all" | "outbound" | "pipeline";

/** Extract the artifact id from a synthetic event id of form `artifact:<id>:<verb>`. */
function artifactIdFrom(id: string): string | null {
  const parts = id.split(":");
  return parts[0] === "artifact" && parts[1] ? parts[1] : null;
}

/** Pure mapper: a single upstream event → the FE ActivityEvent shape. */
export function shapeActivityEvent(ev: ActivityEventUpstream): ActivityEvent {
  return {
    id: ev.id,
    kind: ev.kind,
    action: ev.text,
    timestamp: ev.at,
    artifactId: artifactIdFrom(ev.id),
    leadId: ev.leadId || null,
  };
}

/**
 * Pure mapper: the upstream `{ events }` envelope → the FE's bare ActivityEvent[].
 * `filter` has no backend equivalent, so it is applied here over the real,
 * persisted event kind. No agent identity or stage is inferred.
 */
export function shapeActivity(
  upstream: ActivityUpstream,
  filter: ActivityFilter = "all",
): ActivityEvent[] {
  const mapped = upstream.events.map(shapeActivityEvent);
  if (filter === "all") return mapped;
  const allowedKinds: Record<
    Exclude<ActivityFilter, "all">,
    ActivityEventUpstream["kind"][]
  > = {
    outbound: ["draft_created", "draft_approved", "draft_rejected", "draft_sent", "delivery_unknown"],
    pipeline: ["run_started", "run_needs_approval", "run_completed", "run_failed", "meeting_proposed", "meeting_confirmed"],
  };
  const allow = allowedKinds[filter];
  return mapped.filter((e) => allow.includes(e.kind));
}
