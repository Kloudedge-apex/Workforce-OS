import { Router } from "express";
import { db } from "@workspace/db";
import { activityEventsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();
const ORG_ID = "org_mynoted";

const AGENT_DEFINITIONS = [
  { id: "agent_sdr", name: "SDR Agent", type: "sdr" as const },
  { id: "agent_content", name: "Content Agent", type: "content" as const },
  { id: "agent_reply", name: "Reply Agent", type: "reply" as const },
  { id: "agent_reporting", name: "Reporting Agent", type: "reporting" as const },
];

router.get("/agents", async (req, res) => {
  const recentEvents = await db
    .select()
    .from(activityEventsTable)
    .where(eq(activityEventsTable.orgId, ORG_ID))
    .orderBy(desc(activityEventsTable.timestamp))
    .limit(200);

  const agents = AGENT_DEFINITIONS.map((def) => {
    const agentEvents = recentEvents.filter(
      (e) => e.agentType === def.type,
    );
    const lastEvent = agentEvents[0];

    // Build a sparkline: count events per hour over last 24 hours (8 points)
    const now = Date.now();
    const sparklineData: number[] = Array.from({ length: 8 }, (_, idx) => {
      const windowStart = now - (8 - idx) * 3 * 60 * 60 * 1000;
      const windowEnd = now - (7 - idx) * 3 * 60 * 60 * 1000;
      return agentEvents.filter((ev) => {
        const ts = ev.timestamp.getTime();
        return ts >= windowStart && ts < windowEnd;
      }).length;
    });

    const status =
      agentEvents.length === 0
        ? "idle"
        : lastEvent &&
            Date.now() - lastEvent.timestamp.getTime() < 5 * 60 * 1000
          ? "running"
          : "idle";

    return {
      id: def.id,
      name: def.name,
      type: def.type,
      status,
      lastAction: lastEvent ? lastEvent.action : null,
      lastActionAt: lastEvent ? lastEvent.timestamp.toISOString() : null,
      recentActivityCount: agentEvents.length,
      sparklineData,
    };
  });

  res.json(agents);
});

export default router;
