import { Router } from "express";
import { db } from "@workspace/db";
import { graphRunsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();
const ORG_ID = "org_mynoted";

function shapeRun(r: typeof graphRunsTable.$inferSelect) {
  return {
    id: r.id,
    status: r.status,
    agentsInvolved: (r.agentsInvolved as string[]) ?? [],
    leadsSourced: r.leadsSourced,
    artifactsGenerated: r.artifactsGenerated,
    durationMs: r.durationMs,
    costUsd: r.costUsd,
    triggeredBy: r.triggeredBy,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

router.get("/runs", async (req, res) => {
  const page = parseInt((req.query.page as string) ?? "1", 10);
  const limit = parseInt((req.query.limit as string) ?? "20", 10);
  const status = req.query.status as string | undefined;
  const offset = (page - 1) * limit;

  const conditions = [eq(graphRunsTable.orgId, ORG_ID)];
  if (status) {
    conditions.push(
      eq(
        graphRunsTable.status,
        status as "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED",
      ),
    );
  }

  const allRuns = await db
    .select()
    .from(graphRunsTable)
    .where(and(...conditions))
    .orderBy(desc(graphRunsTable.startedAt));

  const items = allRuns.slice(offset, offset + limit);

  res.json({ items: items.map(shapeRun), total: allRuns.length, page, limit });
});

router.post("/runs/trigger", async (req, res) => {
  const runId = `run_${Date.now()}`;
  const now = new Date();

  await db.insert(graphRunsTable).values({
    id: runId,
    orgId: ORG_ID,
    status: "RUNNING",
    agentsInvolved: ["SDR Agent", "Pipeline Agent"],
    leadsSourced: 0,
    artifactsGenerated: 0,
    durationMs: 0,
    costUsd: 0,
    triggeredBy: "manual",
    startedAt: now,
    timeline: [],
  });

  res.status(202).json({ runId, queued: true, message: "Pipeline run started" });
});

router.get("/runs/:id", async (req, res) => {
  const { id } = req.params;

  const [run] = await db
    .select()
    .from(graphRunsTable)
    .where(and(eq(graphRunsTable.id, id), eq(graphRunsTable.orgId, ORG_ID)));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const timeline = (run.timeline as object[]) ?? [];

  res.json({ run: shapeRun(run), timeline });
});

export default router;
