import { Router } from "express";
import { GetActivityStreamQueryParams } from "@workspace/api-zod";
import { apex, UpstreamError } from "../upstream/apex-client";
import { shapeActivity, type ActivityUpstream } from "./activity.shape";
import { gapResponse } from "../lib/unavailable";

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

// Run-detail timeline has no clean shape on the deployed backend (run detail is a
// Phase-2b gap). Return the gap marker so the FE renders an EmptyState. This also
// keeps the BFF DB-free — it must NOT import @workspace/db (which throws without
// DATABASE_URL) since the BFF proxies apex-gtm-api, not the mock DB.
router.get("/graph-runs/:id/timeline", (_req, res) => {
  gapResponse(res, "run-timeline");
});

export default router;
