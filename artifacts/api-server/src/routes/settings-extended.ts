import { Router } from "express";
import { db } from "@workspace/db";
import {
  orgsTable,
  integrationsTable,
  cadenceStagesTable,
  styleConfigTable,
  teamMembersTable,
  apiKeysTable,
  notificationPrefsTable,
  icpProfilesTable,
  suppressedEmailsTable,
  outreachArtifactsTable,
  inAppNotificationsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();
const ORG_ID = "org_mynoted";

// ─── ICP ────────────────────────────────────────────────────────────────────

router.get("/settings/icp", async (req, res) => {
  const [profile] = await db
    .select()
    .from(icpProfilesTable)
    .where(eq(icpProfilesTable.orgId, ORG_ID));

  if (!profile) {
    res.json({
      industries: ["Tech/SaaS", "Manufacturing"],
      titles: ["CEO", "Founder", "Head of Growth", "RevOps Lead"],
      geos: ["India", "US"],
      sizeBand: "200-2000",
      intentSignals: ["hiring_spike", "series_b_funding"],
      seedDomains: [],
      exclusionDomains: [],
    });
    return;
  }

  res.json({
    industries: (profile.industries as string[]) ?? [],
    titles: (profile.titles as string[]) ?? [],
    geos: (profile.geos as string[]) ?? [],
    sizeBand: profile.sizeBand,
    intentSignals: (profile.intentSignals as string[]) ?? [],
    seedDomains: (profile.seedDomains as string[]) ?? [],
    exclusionDomains: (profile.exclusionDomains as string[]) ?? [],
  });
});

router.put("/settings/icp", async (req, res) => {
  const body = req.body as {
    industries?: string[];
    titles?: string[];
    geos?: string[];
    sizeBand?: string;
    intentSignals?: string[];
    seedDomains?: string[];
    exclusionDomains?: string[];
  };

  const [existing] = await db
    .select()
    .from(icpProfilesTable)
    .where(eq(icpProfilesTable.orgId, ORG_ID));

  if (existing) {
    await db
      .update(icpProfilesTable)
      .set({
        industries: body.industries ?? existing.industries,
        titles: body.titles ?? existing.titles,
        geos: body.geos ?? existing.geos,
        sizeBand: body.sizeBand ?? existing.sizeBand,
        intentSignals: body.intentSignals ?? existing.intentSignals,
        seedDomains: body.seedDomains ?? existing.seedDomains,
        exclusionDomains: body.exclusionDomains ?? existing.exclusionDomains,
        updatedAt: new Date(),
      })
      .where(eq(icpProfilesTable.id, existing.id));
  } else {
    await db.insert(icpProfilesTable).values({
      id: `icp_${Date.now()}`,
      orgId: ORG_ID,
      industries: body.industries ?? [],
      titles: body.titles ?? [],
      geos: body.geos ?? [],
      sizeBand: body.sizeBand ?? "200-2000",
      intentSignals: body.intentSignals ?? [],
      seedDomains: body.seedDomains ?? [],
      exclusionDomains: body.exclusionDomains ?? [],
    });
  }

  res.json(body);
});

// ─── Integrations ────────────────────────────────────────────────────────────

router.get("/settings/integrations", async (req, res) => {
  const integrations = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.orgId, ORG_ID));

  res.json(
    integrations.map((i) => ({
      id: i.id,
      provider: i.provider,
      status: i.status,
      accountEmail: i.accountEmail ?? null,
      connectedAt: i.connectedAt ? i.connectedAt.toISOString() : null,
      errorMessage: i.errorMessage ?? null,
    })),
  );
});

router.post("/settings/integrations/:provider/connect", async (req, res) => {
  const { provider } = req.params;

  const [existing] = await db
    .select()
    .from(integrationsTable)
    .where(
      and(
        eq(integrationsTable.orgId, ORG_ID),
        eq(
          integrationsTable.provider,
          provider as typeof integrationsTable.$inferSelect.provider,
        ),
      ),
    );

  const now = new Date();

  if (existing) {
    await db
      .update(integrationsTable)
      .set({ status: "connected", connectedAt: now, errorMessage: null })
      .where(eq(integrationsTable.id, existing.id));
    res.json({
      id: existing.id,
      provider,
      status: "connected",
      accountEmail: existing.accountEmail ?? null,
      connectedAt: now.toISOString(),
      errorMessage: null,
    });
  } else {
    const id = `int_${provider}_${Date.now()}`;
    await db.insert(integrationsTable).values({
      id,
      orgId: ORG_ID,
      provider: provider as typeof integrationsTable.$inferInsert.provider,
      status: "connected",
      connectedAt: now,
    });
    res.json({ id, provider, status: "connected", accountEmail: null, connectedAt: now.toISOString(), errorMessage: null });
  }
});

router.post("/settings/integrations/:provider/disconnect", async (req, res) => {
  const { provider } = req.params;

  await db
    .update(integrationsTable)
    .set({ status: "available", connectedAt: null, accountEmail: null })
    .where(
      and(
        eq(integrationsTable.orgId, ORG_ID),
        eq(
          integrationsTable.provider,
          provider as typeof integrationsTable.$inferSelect.provider,
        ),
      ),
    );

  res.json({ id: `int_${provider}`, provider, status: "available", accountEmail: null, connectedAt: null, errorMessage: null });
});

// ─── Cadence ─────────────────────────────────────────────────────────────────

router.get("/settings/cadence", async (req, res) => {
  const stages = await db
    .select()
    .from(cadenceStagesTable)
    .where(eq(cadenceStagesTable.orgId, ORG_ID))
    .orderBy(cadenceStagesTable.position);

  if (stages.length === 0) {
    res.json([
      { id: "cad_1", dayOffset: 0, channel: "email", label: "Initial email", enabled: true, position: 0 },
      { id: "cad_2", dayOffset: 1, channel: "linkedin", label: "LinkedIn connect", enabled: true, position: 1 },
      { id: "cad_3", dayOffset: 3, channel: "email", label: "Follow-up email", enabled: true, position: 2 },
      { id: "cad_4", dayOffset: 5, channel: "linkedin", label: "LinkedIn message", enabled: true, position: 3 },
      { id: "cad_5", dayOffset: 7, channel: "email", label: "Breakup email", enabled: true, position: 4 },
    ]);
    return;
  }

  res.json(
    stages.map((s) => ({
      id: s.id,
      dayOffset: s.dayOffset,
      channel: s.channel,
      label: s.label,
      enabled: s.enabled,
      position: s.position,
    })),
  );
});

router.put("/settings/cadence", async (req, res) => {
  const { stages } = req.body as {
    stages: Array<{
      id: string;
      dayOffset: number;
      channel: string;
      label: string;
      enabled: boolean;
      position: number;
    }>;
  };

  await db.delete(cadenceStagesTable).where(eq(cadenceStagesTable.orgId, ORG_ID));

  for (const stage of stages) {
    await db.insert(cadenceStagesTable).values({
      id: stage.id,
      orgId: ORG_ID,
      dayOffset: stage.dayOffset,
      channel: stage.channel,
      label: stage.label,
      enabled: stage.enabled,
      position: stage.position,
    });
  }

  res.json(stages);
});

// ─── Style ───────────────────────────────────────────────────────────────────

router.get("/settings/style", async (req, res) => {
  const [config] = await db
    .select()
    .from(styleConfigTable)
    .where(eq(styleConfigTable.orgId, ORG_ID));

  if (!config) {
    res.json({ voice: "Professional", toneValue: 50, signatureHtml: "" });
    return;
  }

  res.json({
    voice: config.voice,
    toneValue: config.toneValue,
    signatureHtml: config.signatureHtml,
  });
});

router.put("/settings/style", async (req, res) => {
  const body = req.body as {
    voice?: string;
    toneValue?: number;
    signatureHtml?: string;
  };

  const [existing] = await db
    .select()
    .from(styleConfigTable)
    .where(eq(styleConfigTable.orgId, ORG_ID));

  if (existing) {
    await db
      .update(styleConfigTable)
      .set({
        voice: body.voice ?? existing.voice,
        toneValue: body.toneValue ?? existing.toneValue,
        signatureHtml: body.signatureHtml ?? existing.signatureHtml,
      })
      .where(eq(styleConfigTable.id, existing.id));
  } else {
    await db.insert(styleConfigTable).values({
      id: `style_${Date.now()}`,
      orgId: ORG_ID,
      voice: body.voice ?? "Professional",
      toneValue: body.toneValue ?? 50,
      signatureHtml: body.signatureHtml ?? "",
    });
  }

  res.json({
    voice: body.voice ?? "Professional",
    toneValue: body.toneValue ?? 50,
    signatureHtml: body.signatureHtml ?? "",
  });
});

// ─── Team ────────────────────────────────────────────────────────────────────

router.get("/settings/team", async (req, res) => {
  const members = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.orgId, ORG_ID));

  res.json(
    members.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status,
      invitedAt: m.invitedAt.toISOString(),
      joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
    })),
  );
});

router.post("/settings/team/invite", async (req, res) => {
  const { email, name, role } = req.body as { email: string; name: string; role: string };
  const id = `member_${Date.now()}`;

  await db.insert(teamMembersTable).values({
    id,
    orgId: ORG_ID,
    email,
    name,
    role: role as "OWNER" | "ADMIN" | "MEMBER",
    status: "invited",
  });

  res.json({
    id,
    email,
    name,
    role,
    status: "invited",
    invitedAt: new Date().toISOString(),
    joinedAt: null,
  });
});

router.delete("/settings/team/:userId", async (req, res) => {
  const { userId } = req.params;
  await db.delete(teamMembersTable).where(eq(teamMembersTable.id, userId));
  res.json({ affected: 1 });
});

// ─── Billing ─────────────────────────────────────────────────────────────────

router.get("/settings/billing", async (req, res) => {
  const [org] = await db.select().from(orgsTable).where(eq(orgsTable.id, ORG_ID));

  const members = await db.select().from(teamMembersTable).where(eq(teamMembersTable.orgId, ORG_ID));
  const sent = await db.select().from(outreachArtifactsTable).where(
    and(eq(outreachArtifactsTable.orgId, ORG_ID), eq(outreachArtifactsTable.status, "SENT")),
  );

  res.json({
    plan: org?.plan ?? "starter",
    creditsRemaining: org?.creditsRemaining ?? 500,
    creditsTotal: 1000,
    sendsThisMonth: sent.length,
    sendsLimit: 500,
    seats: members.length,
    seatsLimit: 10,
    invoices: [
      { id: "inv_001", date: "2026-06-01", amount: 149, status: "paid", downloadUrl: "#" },
      { id: "inv_002", date: "2026-05-01", amount: 149, status: "paid", downloadUrl: "#" },
      { id: "inv_003", date: "2026-04-01", amount: 149, status: "paid", downloadUrl: "#" },
    ],
  });
});

// ─── API Keys ─────────────────────────────────────────────────────────────────

router.get("/settings/api-keys", async (req, res) => {
  const keys = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.orgId, ORG_ID))
    .orderBy(desc(apiKeysTable.createdAt));

  res.json(
    keys.map((k) => ({
      id: k.id,
      prefix: k.prefix,
      name: k.name,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      createdAt: k.createdAt.toISOString(),
    })),
  );
});

router.post("/settings/api-keys", async (req, res) => {
  const { name } = req.body as { name: string };
  const id = `key_${Date.now()}`;
  const randomSuffix = Math.random().toString(36).substring(2, 18);
  const fullKey = `wos_live_${randomSuffix}`;
  const prefix = `wos_live_${randomSuffix.substring(0, 6)}`;

  await db.insert(apiKeysTable).values({
    id,
    orgId: ORG_ID,
    prefix,
    name,
  });

  res.status(201).json({
    id,
    prefix,
    name,
    fullKey,
    createdAt: new Date().toISOString(),
  });
});

router.delete("/settings/api-keys/:id", async (req, res) => {
  const { id } = req.params;
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id));
  res.json({ affected: 1 });
});

// ─── Notification Prefs ───────────────────────────────────────────────────────

router.get("/settings/notifications", async (req, res) => {
  const [prefs] = await db
    .select()
    .from(notificationPrefsTable)
    .where(eq(notificationPrefsTable.orgId, ORG_ID));

  if (!prefs) {
    res.json({
      emailEnabled: true,
      slackEnabled: false,
      approvalQueueFull: true,
      sendFailed: true,
      suppressionHit: false,
      weeklyReport: true,
      newReply: true,
    });
    return;
  }

  res.json({
    emailEnabled: prefs.emailEnabled,
    slackEnabled: prefs.slackEnabled,
    approvalQueueFull: prefs.approvalQueueFull,
    sendFailed: prefs.sendFailed,
    suppressionHit: prefs.suppressionHit,
    weeklyReport: prefs.weeklyReport,
    newReply: prefs.newReply,
  });
});

router.put("/settings/notifications", async (req, res) => {
  const body = req.body as {
    emailEnabled?: boolean;
    slackEnabled?: boolean;
    approvalQueueFull?: boolean;
    sendFailed?: boolean;
    suppressionHit?: boolean;
    weeklyReport?: boolean;
    newReply?: boolean;
  };

  const [existing] = await db
    .select()
    .from(notificationPrefsTable)
    .where(eq(notificationPrefsTable.orgId, ORG_ID));

  if (existing) {
    await db
      .update(notificationPrefsTable)
      .set(body)
      .where(eq(notificationPrefsTable.id, existing.id));
  } else {
    await db.insert(notificationPrefsTable).values({
      id: `notifpref_${Date.now()}`,
      orgId: ORG_ID,
      emailEnabled: body.emailEnabled ?? true,
      slackEnabled: body.slackEnabled ?? false,
      approvalQueueFull: body.approvalQueueFull ?? true,
      sendFailed: body.sendFailed ?? true,
      suppressionHit: body.suppressionHit ?? false,
      weeklyReport: body.weeklyReport ?? true,
      newReply: body.newReply ?? true,
    });
  }

  res.json(body);
});

// ─── Update Org Settings ──────────────────────────────────────────────────────

router.put("/settings/org", async (req, res) => {
  const body = req.body as {
    name?: string;
    slug?: string;
    logoUrl?: string;
    country?: string;
    timezone?: string;
    senderName?: string;
    postalAddress?: string;
    liveSendEnabled?: boolean;
  };

  await db.update(orgsTable).set(body).where(eq(orgsTable.id, ORG_ID));

  const [org] = await db.select().from(orgsTable).where(eq(orgsTable.id, ORG_ID));
  const domains = [] as string[];
  const suppCount = await db.select().from(suppressedEmailsTable).where(eq(suppressedEmailsTable.orgId, ORG_ID));

  res.json({
    orgId: org.id,
    orgName: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl ?? null,
    country: org.country,
    timezone: org.timezone,
    senderName: org.senderName ?? null,
    liveSendEnabled: org.liveSendEnabled,
    postalAddress: org.postalAddress ?? null,
    unsubscribeUrl: org.unsubscribeUrl ?? null,
    suppressionCount: suppCount.length,
    allowlistedDomains: domains,
    plan: org.plan,
    creditsRemaining: org.creditsRemaining,
    welcomeComplete: org.welcomeComplete,
  });
});

export default router;
