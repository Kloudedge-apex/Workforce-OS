import { Router } from "express";
import { gapResponse } from "../lib/unavailable";

const router = Router();

// GAP (2026-06-10 release audit): no welcome/onboarding controller exists and
// neither User nor Org carries an onboarding/complete/currentStep field in the
// deployed schema. There is no { complete, currentStep } read model to return and
// no backend write target for completion, so both routes degrade honestly until
// onboarding state is persisted (schema change, out of BFF scope).

router.get("/welcome/status", (_req, res) => {
  return gapResponse(res, "welcome");
});

router.post("/welcome/complete", (_req, res) => {
  return gapResponse(res, "welcome");
});

export default router;
