import { Router } from "express";
import { db } from "@workspace/db";
import { orgsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const ORG_ID = "org_mynoted";

router.get("/welcome/status", async (req, res) => {
  const [org] = await db
    .select()
    .from(orgsTable)
    .where(eq(orgsTable.id, ORG_ID));

  if (!org) {
    res.status(404).json({ error: "Org not found" });
    return;
  }

  res.json({
    complete: org.welcomeComplete,
    currentStep: org.welcomeComplete ? 5 : 1,
  });
});

router.post("/welcome/complete", async (req, res) => {
  await db
    .update(orgsTable)
    .set({ welcomeComplete: true })
    .where(eq(orgsTable.id, ORG_ID));

  res.json({ complete: true, currentStep: 5 });
});

export default router;
