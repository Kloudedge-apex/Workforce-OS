import { Router } from "express";
import { apex } from "../upstream/apex-client";
import { UpstreamError } from "../upstream/apex-client";

const router = Router();

/** The openapi `Agent` shape this BFF returns to the premium FE. */
export interface AgentShape {
  id: string;
  name: string;
  type: "sdr" | "content" | "ops" | "pipeline" | "reply" | "reporting";
  status: "idle" | "running" | "error";
  lastAction: string | null;
  lastActionAt: string | null;
  recentActivityCount: number;
  sparklineData: number[];
}

/**
 * A single row from apex-gtm-api `GET /api/agents` (AgentsService.findAll).
 * Only the fields the BFF maps from are typed; the upstream row carries more.
 */
export interface UpstreamAgent {
  id: string;
  name: string;
  domain: "SALES" | "MARKETING" | "OPS";
  status: "ACTIVE" | "PAUSED" | "ERROR" | "DEPLOYING";
  template?: { name?: string | null } | null;
  _count?: { runs?: number } | null;
}

/** Map an apex AgentStatus → the openapi {idle,running,error} status. */
function mapStatus(status: UpstreamAgent["status"]): AgentShape["status"] {
  switch (status) {
    case "ERROR":
      return "error";
    case "DEPLOYING":
      return "running";
    // ACTIVE + PAUSED both render as idle (no in-flight run in findAll payload).
    default:
      return "idle";
  }
}

/**
 * Map an apex Domain (+ template name when present) → the openapi agent `type`
 * enum. SALES→sdr, MARKETING→content, OPS→ops are the baseline; a recognizable
 * template name refines to the more specific enum member.
 */
function mapType(agent: UpstreamAgent): AgentShape["type"] {
  const t = (agent.template?.name ?? "").toLowerCase();
  if (t.includes("reply")) return "reply";
  if (t.includes("report")) return "reporting";
  if (t.includes("pipeline")) return "pipeline";
  if (t.includes("content") || t.includes("writer")) return "content";
  if (t.includes("sdr")) return "sdr";
  switch (agent.domain) {
    case "SALES":
      return "sdr";
    case "MARKETING":
      return "content";
    case "OPS":
      return "ops";
    default:
      return "sdr";
  }
}

/**
 * PURE: map the bare `UpstreamAgent[]` from apex-gtm-api into the openapi
 * `Agent[]` the FE expects. `lastAction`/`lastActionAt` and a real sparkline
 * are NOT in the findAll payload (would need a per-agent N+1 to /agents/:id/
 * analytics), so they are honestly null / empty here.
 */
export function shapeAgents(upstream: UpstreamAgent[]): AgentShape[] {
  return upstream.map((a) => ({
    id: a.id,
    name: a.name,
    type: mapType(a),
    status: mapStatus(a.status),
    lastAction: null,
    lastActionAt: null,
    recentActivityCount: a._count?.runs ?? 0,
    sparklineData: [],
  }));
}

router.get("/agents", async (req, res, next) => {
  try {
    const upstream = (await apex.get("/agents", { req })) as UpstreamAgent[];
    res.json(shapeAgents(upstream));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
      throw err;
    }
    next(err);
  }
});

export default router;
