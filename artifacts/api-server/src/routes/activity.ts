import { Router } from "express";
import { db } from "@workspace/db";
import { activityEventsTable, graphRunsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { GetActivityStreamQueryParams, GetGraphRunTimelineParams } from "@workspace/api-zod";

const router = Router();

const ORG_ID = "org_mynoted";

router.get("/activity", async (req, res) => {
  const parsed = GetActivityStreamQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
  const filter = parsed.success ? (parsed.data.filter ?? "all") : "all";

  const stageFilters: Record<string, string[]> = {
    outbound: ["drafting", "approving", "sending", "suppression_check"],
    pipeline: ["sourcing", "enriching", "scoring"],
    conversations: ["reply_analysis", "inbox"],
    all: [],
  };

  const rows = await db
    .select()
    .from(activityEventsTable)
    .where(eq(activityEventsTable.orgId, ORG_ID))
    .orderBy(desc(activityEventsTable.timestamp))
    .limit(limit);

  const filtered =
    filter === "all"
      ? rows
      : rows.filter((r) => stageFilters[filter]?.includes(r.stage));

  res.json(
    filtered.map((e) => ({
      id: e.id,
      agentName: e.agentName,
      agentType: e.agentType,
      action: e.action,
      stage: e.stage,
      timestamp: e.timestamp.toISOString(),
      artifactId: e.artifactId ?? null,
      leadId: e.leadId ?? null,
    })),
  );
});

router.get("/graph-runs/:id/timeline", async (req, res) => {
  const parsed = GetGraphRunTimelineParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [run] = await db
    .select()
    .from(graphRunsTable)
    .where(eq(graphRunsTable.id, parsed.data.id));

  if (!run) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(run.timeline ?? []);
});

export default router;
