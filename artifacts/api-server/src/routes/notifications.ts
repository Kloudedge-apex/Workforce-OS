import { Router } from "express";
import { gapResponse } from "../lib/unavailable";

const router = Router();

// GAP (2026-06-10 release audit): no Notification model, no notifications
// controller, and no per-user read-state storage exist in the deployed backend.
// Both routes degrade honestly until a real Notification model + read tracking
// ship (out of BFF scope).

router.get("/notifications", (_req, res) => {
  return gapResponse(res, "notifications");
});

router.post("/notifications/mark-read", (_req, res) => {
  return gapResponse(res, "notifications");
});

export default router;
