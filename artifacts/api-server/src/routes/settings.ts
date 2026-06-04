import { Router } from "express";
import { db } from "@workspace/db";
import {
  orgsTable,
  allowlistedDomainsTable,
  suppressedEmailsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const ORG_ID = "org_demo";

router.get("/settings/org", async (req, res) => {
  const [org] = await db
    .select()
    .from(orgsTable)
    .where(eq(orgsTable.id, ORG_ID));

  if (!org) {
    res.status(404).json({ error: "Org not found" });
    return;
  }

  const [domains, suppressionCountResult] = await Promise.all([
    db
      .select()
      .from(allowlistedDomainsTable)
      .where(eq(allowlistedDomainsTable.orgId, ORG_ID)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(suppressedEmailsTable)
      .where(eq(suppressedEmailsTable.orgId, ORG_ID)),
  ]);

  res.json({
    orgId: org.id,
    orgName: org.name,
    liveSendEnabled: org.liveSendEnabled,
    postalAddress: org.postalAddress ?? null,
    unsubscribeUrl: org.unsubscribeUrl ?? null,
    suppressionCount: Number(suppressionCountResult[0]?.count ?? 0),
    allowlistedDomains: domains.map((d) => d.domain),
    plan: org.plan,
    creditsRemaining: org.creditsRemaining,
  });
});

router.get("/settings/org/health", async (req, res) => {
  const [org] = await db
    .select()
    .from(orgsTable)
    .where(eq(orgsTable.id, ORG_ID));

  if (!org) {
    res.status(404).json({ error: "Org not found" });
    return;
  }

  const suppressionCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suppressedEmailsTable)
    .where(eq(suppressedEmailsTable.orgId, ORG_ID));

  const postalAddressConfigured = !!org.postalAddress;
  const unsubscribeConfigured = !!org.unsubscribeUrl;

  const blockers: string[] = [];
  if (!org.liveSendEnabled) blockers.push("Live send not enabled for this org");
  if (!postalAddressConfigured) blockers.push("Physical postal address not configured");
  if (!unsubscribeConfigured) blockers.push("Unsubscribe URL not configured");

  res.json({
    liveSendEnabled: org.liveSendEnabled,
    postalAddressConfigured,
    unsubscribeConfigured,
    suppressionCount: Number(suppressionCountResult[0]?.count ?? 0),
    blockers,
  });
});

export default router;
