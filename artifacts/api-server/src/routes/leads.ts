import { Router } from "express";
import { db } from "@workspace/db";
import {
  leadsTable,
  activityEventsTable,
  suppressedEmailsTable,
} from "@workspace/db";
import { eq, and, gte, desc, sql, ilike } from "drizzle-orm";
import {
  ListLeadsQueryParams,
  GetLeadParams,
  TriggerOutboundParams,
  BulkSuppressLeadsBody,
} from "@workspace/api-zod";

const router = Router();

const ORG_ID = "org_demo";

function shapeLead(l: typeof leadsTable.$inferSelect) {
  const signals = (l.intentSignals ?? []) as Array<{ label: string; confidence: number }>;
  return {
    id: l.id,
    name: l.name,
    title: l.title ?? "",
    email: l.email,
    company: l.company,
    companyLogoUrl: l.companyLogoUrl ?? null,
    avatarUrl: l.avatarUrl ?? null,
    score: l.score,
    stage: l.stage,
    geo: l.geo ?? "",
    intentSignals: signals,
    lastContactedAt: l.lastContactedAt?.toISOString() ?? null,
    sendPolicy: {
      liveSendEnabled: false,
      postalAddressSet: false,
      unsubscribeConfigured: false,
      recipientSuppressed: false,
    },
    createdAt: l.createdAt.toISOString(),
  };
}

router.get("/leads", async (req, res) => {
  const parsed = ListLeadsQueryParams.safeParse(req.query);
  const page = parsed.success ? (parsed.data.page ?? 1) : 1;
  const limit = parsed.success ? (parsed.data.limit ?? 25) : 25;
  const q = parsed.success ? parsed.data.q : undefined;
  const offset = (page - 1) * limit;

  const query = db
    .select()
    .from(leadsTable)
    .where(
      q
        ? and(eq(leadsTable.orgId, ORG_ID), ilike(leadsTable.name, `%${q}%`))
        : eq(leadsTable.orgId, ORG_ID),
    )
    .orderBy(desc(leadsTable.score))
    .limit(limit)
    .offset(offset);

  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(
      q
        ? and(eq(leadsTable.orgId, ORG_ID), ilike(leadsTable.name, `%${q}%`))
        : eq(leadsTable.orgId, ORG_ID),
    );

  const [items, countResult] = await Promise.all([query, countQuery]);

  res.json({
    items: items.map(shapeLead),
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
  });
});

router.get("/leads/:id", async (req, res) => {
  const parsed = GetLeadParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, parsed.data.id), eq(leadsTable.orgId, ORG_ID)));

  if (!lead) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const recentEvents = await db
    .select()
    .from(activityEventsTable)
    .where(
      and(
        eq(activityEventsTable.orgId, ORG_ID),
        eq(activityEventsTable.leadId, lead.id),
      ),
    )
    .orderBy(desc(activityEventsTable.timestamp))
    .limit(5);

  const scoreBreakdown = (lead.scoreBreakdown ?? { fit: 70, intent: 80, engagement: 65, timing: 75 }) as Record<string, number>;

  res.json({
    lead: shapeLead(lead),
    researchBrief: lead.researchBrief ?? "No research brief available for this lead yet.",
    scoreBreakdown: {
      fit: scoreBreakdown["fit"] ?? 70,
      intent: scoreBreakdown["intent"] ?? 80,
      engagement: scoreBreakdown["engagement"] ?? 65,
      timing: scoreBreakdown["timing"] ?? 75,
    },
    recentEvidenceEvents: recentEvents.map((e) => ({
      id: e.id,
      eventType: e.agentType,
      description: e.action,
      timestamp: e.timestamp.toISOString(),
    })),
  });
});

router.post("/leads/:id/trigger-outbound", async (req, res) => {
  const parsed = TriggerOutboundParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const runId = `run_${Date.now()}`;
  res.status(202).json({
    runId,
    queued: true,
    message: "Outbound pipeline run queued",
  });
});

router.post("/leads/bulk-suppress", async (req, res) => {
  const parsed = BulkSuppressLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const leads = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.orgId, ORG_ID));

  const toSuppress = leads.filter((l) => parsed.data.ids.includes(l.id));

  let affected = 0;
  for (const lead of toSuppress) {
    await db
      .insert(suppressedEmailsTable)
      .values({
        id: `sup_${Date.now()}_${lead.id}`,
        orgId: ORG_ID,
        email: lead.email,
        reason: "bulk suppressed",
      })
      .onConflictDoNothing();
    affected++;
  }

  res.json({ affected });
});

export default router;
