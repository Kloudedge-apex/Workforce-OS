import { Router } from "express";
import { db } from "@workspace/db";
import { outreachArtifactsTable, suppressedEmailsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListPendingArtifactsQueryParams,
  ListArtifactsQueryParams,
  GetArtifactParams,
  ApproveArtifactParams,
  RejectArtifactParams,
  RejectArtifactBody,
  SuppressArtifactParams,
} from "@workspace/api-zod";

const router = Router();

const ORG_ID = "org_mynoted";

function shapeArtifact(a: typeof outreachArtifactsTable.$inferSelect) {
  const scores = (a.evaluatorScores ?? {}) as Record<string, number>;
  const citations = (a.citations ?? []) as Array<{ factId: string; claim: string; source: string }>;
  return {
    id: a.id,
    status: a.status,
    recipient: {
      id: a.leadId ?? a.id,
      name: a.recipientName,
      email: a.recipientEmail,
      title: a.recipientTitle ?? "",
      company: a.recipientCompany,
      avatarUrl: a.recipientAvatarUrl ?? null,
    },
    subject: a.subject,
    bodyHtml: a.bodyHtml,
    citations,
    evaluatorScores: {
      pii: scores["pii"] ?? 0.95,
      hallucination: scores["hallucination"] ?? 0.92,
      citationCoverage: scores["citationCoverage"] ?? 0.88,
    },
    sendPolicy: {
      liveSendEnabled: false,
      postalAddressSet: false,
      unsubscribeConfigured: false,
      recipientSuppressed: a.status === "SUPPRESSED",
    },
    createdAt: a.createdAt.toISOString(),
    approvedAt: a.approvedAt?.toISOString() ?? null,
    sentAt: a.sentAt?.toISOString() ?? null,
    rejectionReason: a.rejectionReason ?? null,
    graphRunId: a.graphRunId ?? null,
  };
}

router.get("/artifacts/pending", async (req, res) => {
  const parsed = ListPendingArtifactsQueryParams.safeParse(req.query);
  const page = parsed.success ? (parsed.data.page ?? 1) : 1;
  const limit = parsed.success ? (parsed.data.limit ?? 5) : 5;
  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(outreachArtifactsTable)
      .where(and(eq(outreachArtifactsTable.orgId, ORG_ID), eq(outreachArtifactsTable.status, "PENDING_REVIEW")))
      .orderBy(desc(outreachArtifactsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ id: outreachArtifactsTable.id })
      .from(outreachArtifactsTable)
      .where(and(eq(outreachArtifactsTable.orgId, ORG_ID), eq(outreachArtifactsTable.status, "PENDING_REVIEW"))),
  ]);

  res.json({ items: items.map(shapeArtifact), total: countResult.length, page, limit });
});

router.get("/artifacts", async (req, res) => {
  const parsed = ListArtifactsQueryParams.safeParse(req.query);
  const status = parsed.success ? parsed.data.status : undefined;
  const page = parsed.success ? (parsed.data.page ?? 1) : 1;
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  const offset = (page - 1) * limit;

  const conditions = status
    ? and(eq(outreachArtifactsTable.orgId, ORG_ID), eq(outreachArtifactsTable.status, status as "PENDING_REVIEW" | "APPROVED" | "SENT" | "REJECTED" | "SUPPRESSED"))
    : eq(outreachArtifactsTable.orgId, ORG_ID);

  const [items, allItems] = await Promise.all([
    db
      .select()
      .from(outreachArtifactsTable)
      .where(conditions)
      .orderBy(desc(outreachArtifactsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ id: outreachArtifactsTable.id })
      .from(outreachArtifactsTable)
      .where(conditions),
  ]);

  res.json({ items: items.map(shapeArtifact), total: allItems.length, page, limit });
});

router.get("/artifacts/:id", async (req, res) => {
  const parsed = GetArtifactParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [artifact] = await db
    .select()
    .from(outreachArtifactsTable)
    .where(and(eq(outreachArtifactsTable.id, parsed.data.id), eq(outreachArtifactsTable.orgId, ORG_ID)));

  if (!artifact) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(shapeArtifact(artifact));
});

router.post("/artifacts/:id/approve", async (req, res) => {
  const parsed = ApproveArtifactParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [updated] = await db
    .update(outreachArtifactsTable)
    .set({ status: "APPROVED", approvedAt: new Date() })
    .where(and(eq(outreachArtifactsTable.id, parsed.data.id), eq(outreachArtifactsTable.orgId, ORG_ID)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(shapeArtifact(updated));
});

router.post("/artifacts/:id/reject", async (req, res) => {
  const paramParsed = RejectArtifactParams.safeParse(req.params);
  const bodyParsed = RejectArtifactBody.safeParse(req.body);

  if (!paramParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [updated] = await db
    .update(outreachArtifactsTable)
    .set({ status: "REJECTED", rejectionReason: bodyParsed.data.reason })
    .where(and(eq(outreachArtifactsTable.id, paramParsed.data.id), eq(outreachArtifactsTable.orgId, ORG_ID)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(shapeArtifact(updated));
});

router.post("/artifacts/:id/suppress", async (req, res) => {
  const parsed = SuppressArtifactParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [artifact] = await db
    .select()
    .from(outreachArtifactsTable)
    .where(and(eq(outreachArtifactsTable.id, parsed.data.id), eq(outreachArtifactsTable.orgId, ORG_ID)));

  if (!artifact) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.insert(suppressedEmailsTable).values({
    id: `sup_${Date.now()}`,
    orgId: ORG_ID,
    email: artifact.recipientEmail,
    reason: "manually suppressed",
  }).onConflictDoNothing();

  const [updated] = await db
    .update(outreachArtifactsTable)
    .set({ status: "SUPPRESSED" })
    .where(eq(outreachArtifactsTable.id, parsed.data.id))
    .returning();

  res.json(shapeArtifact(updated!));
});

router.post("/artifacts/bulk-approve", async (req, res) => {
  const pending = await db
    .select()
    .from(outreachArtifactsTable)
    .where(and(eq(outreachArtifactsTable.orgId, ORG_ID), eq(outreachArtifactsTable.status, "PENDING_REVIEW")));

  let approved = 0;
  let skipped = 0;
  const reasons: string[] = [];

  for (const artifact of pending) {
    const scores = (artifact.evaluatorScores ?? {}) as Record<string, number>;
    const pii = scores["pii"] ?? 0;
    const hallucination = scores["hallucination"] ?? 0;
    const citation = scores["citationCoverage"] ?? 0;

    if (pii >= 0.9 && hallucination >= 0.9 && citation >= 0.8) {
      await db
        .update(outreachArtifactsTable)
        .set({ status: "APPROVED", approvedAt: new Date() })
        .where(eq(outreachArtifactsTable.id, artifact.id));
      approved++;
    } else {
      skipped++;
      reasons.push(`${artifact.recipientName}: scores below threshold`);
    }
  }

  res.json({ approved, skipped, reasons });
});

export default router;
