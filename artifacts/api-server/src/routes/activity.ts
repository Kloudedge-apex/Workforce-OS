import { Router } from "express";
import { db } from "@workspace/db";
import { graphRunsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetActivityStreamQueryParams, GetGraphRunTimelineParams } from "@workspace/api-zod";
import { apex, UpstreamError } from "../upstream/apex-client";
import { shapeActivity, type ActivityUpstream } from "./activity.shape";

const router = Router();

router.get("/activity", async (req, res, next) => {
  const parsed = GetActivityStreamQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;
  const filter = parsed.success ? (parsed.data.filter ?? "all") : "all";

  try {
    const upstream = (await apex.get(`/activity?limit=${limit}`, { req })) as ActivityUpstream;
    res.json(shapeActivity(upstream, filter));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
      res.status(err.status).json(err.body);
      return;
    }
    next(err);
  }
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
