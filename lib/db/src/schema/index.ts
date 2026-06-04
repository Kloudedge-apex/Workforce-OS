import {
  pgTable,
  text,
  integer,
  boolean,
  real,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const artifactStatusEnum = pgEnum("artifact_status", [
  "PENDING_REVIEW",
  "APPROVED",
  "SENT",
  "REJECTED",
  "SUPPRESSED",
]);

export const agentTypeEnum = pgEnum("agent_type", [
  "sdr",
  "content",
  "ops",
  "pipeline",
  "reply",
  "reporting",
]);

export const sentimentEnum = pgEnum("sentiment", [
  "positive",
  "objection",
  "neutral",
  "negative",
]);

export const teamRoleEnum = pgEnum("team_role", ["OWNER", "ADMIN", "MEMBER"]);

export const integrationProviderEnum = pgEnum("integration_provider", [
  "gmail",
  "outlook",
  "linkedin",
  "hubspot",
  "salesforce",
  "slack",
  "clay",
  "apollo",
  "hunter",
  "fullenrich",
  "webhooks",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "available",
  "errored",
]);

export const graphRunStatusEnum = pgEnum("graph_run_status", [
  "RUNNING",
  "AWAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "approval_queue_full",
  "send_failed",
  "suppression_hit",
  "new_reply",
  "weekly_report",
]);

export const cohortEnum = pgEnum("cohort", ["A", "B"]);

export const emailStatusEnum = pgEnum("email_status", [
  "DELIVERABLE",
  "HIGH_PROBABILITY",
  "CATCH_ALL",
]);

// ─── Core tables ──────────────────────────────────────────────────────────────

export const orgsTable = pgTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().default(""),
  logoUrl: text("logo_url"),
  country: text("country").notNull().default("US"),
  timezone: text("timezone").notNull().default("UTC"),
  senderName: text("sender_name"),
  physicalAddress: text("physical_address"),
  liveSendEnabled: boolean("live_send_enabled").notNull().default(false),
  postalAddress: text("postal_address"),
  unsubscribeUrl: text("unsubscribe_url"),
  plan: text("plan").notNull().default("starter"),
  creditsRemaining: integer("credits_remaining").notNull().default(500),
  welcomeComplete: boolean("welcome_complete").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),
  role: teamRoleEnum("role").notNull().default("MEMBER"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teamMembersTable = pgTable("team_members", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  userId: text("user_id").references(() => usersTable.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: teamRoleEnum("role").notNull().default("MEMBER"),
  status: text("status").notNull().default("active"),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  joinedAt: timestamp("joined_at"),
});

export const apiKeysTable = pgTable("api_keys", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  prefix: text("prefix").notNull(),
  name: text("name").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const integrationsTable = pgTable("integrations", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  provider: integrationProviderEnum("provider").notNull(),
  status: integrationStatusEnum("status").notNull().default("available"),
  accountEmail: text("account_email"),
  connectedAt: timestamp("connected_at"),
  errorMessage: text("error_message"),
});

export const cadenceStagesTable = pgTable("cadence_stages", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  dayOffset: integer("day_offset").notNull(),
  channel: text("channel").notNull(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  position: integer("position").notNull().default(0),
});

export const styleConfigTable = pgTable("style_config", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  voice: text("voice").notNull().default("Professional"),
  toneValue: integer("tone_value").notNull().default(50),
  signatureHtml: text("signature_html").notNull().default(""),
});

export const notificationPrefsTable = pgTable("notification_prefs", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  slackEnabled: boolean("slack_enabled").notNull().default(false),
  approvalQueueFull: boolean("approval_queue_full").notNull().default(true),
  sendFailed: boolean("send_failed").notNull().default(true),
  suppressionHit: boolean("suppression_hit").notNull().default(false),
  weeklyReport: boolean("weekly_report").notNull().default(true),
  newReply: boolean("new_reply").notNull().default(true),
});

export const inAppNotificationsTable = pgTable("in_app_notifications", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  link: text("link"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const icpProfilesTable = pgTable("icp_profiles", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  industries: jsonb("industries").notNull().default([]),
  titles: jsonb("titles").notNull().default([]),
  geos: jsonb("geos").notNull().default([]),
  sizeBand: text("size_band").notNull().default("200-2000"),
  intentSignals: jsonb("intent_signals").notNull().default([]),
  seedDomains: jsonb("seed_domains").notNull().default([]),
  exclusionDomains: jsonb("exclusion_domains").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Domain tables ────────────────────────────────────────────────────────────

export const allowlistedDomainsTable = pgTable("allowlisted_domains", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  domain: text("domain").notNull(),
});

export const suppressedEmailsTable = pgTable("suppressed_emails", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  email: text("email").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leadsTable = pgTable("leads", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email").notNull(),
  company: text("company").notNull(),
  domain: text("domain"),
  companyLogoUrl: text("company_logo_url"),
  avatarUrl: text("avatar_url"),
  score: integer("score").notNull().default(0),
  stage: text("stage").notNull().default("sourced"),
  geo: text("geo"),
  country: text("country"),
  industry: text("industry"),
  headcountEstimate: text("headcount_estimate"),
  cohort: cohortEnum("cohort").notNull().default("A"),
  emailStatus: emailStatusEnum("email_status").notNull().default("DELIVERABLE"),
  targetTitles: jsonb("target_titles").notNull().default([]),
  aiSignalNotes: text("ai_signal_notes"),
  intentSignals: jsonb("intent_signals").notNull().default([]),
  lastContactedAt: timestamp("last_contacted_at"),
  researchBrief: text("research_brief"),
  scoreBreakdown: jsonb("score_breakdown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const outreachArtifactsTable = pgTable("outreach_artifacts", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  leadId: text("lead_id").references(() => leadsTable.id),
  status: artifactStatusEnum("status").notNull().default("PENDING_REVIEW"),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  recipientTitle: text("recipient_title"),
  recipientCompany: text("recipient_company").notNull(),
  recipientAvatarUrl: text("recipient_avatar_url"),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  citations: jsonb("citations").notNull().default([]),
  evaluatorScores: jsonb("evaluator_scores").notNull().default({}),
  graphRunId: text("graph_run_id"),
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activityEventsTable = pgTable("activity_events", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  agentName: text("agent_name").notNull(),
  agentType: agentTypeEnum("agent_type").notNull(),
  action: text("action").notNull(),
  stage: text("stage").notNull(),
  artifactId: text("artifact_id"),
  leadId: text("lead_id"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const graphRunsTable = pgTable("graph_runs", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  status: graphRunStatusEnum("status").notNull().default("COMPLETED"),
  artifactId: text("artifact_id"),
  langsmithRootRunId: text("langsmith_root_run_id"),
  timeline: jsonb("timeline").notNull().default([]),
  agentsInvolved: jsonb("agents_involved").notNull().default([]),
  leadsSourced: integer("leads_sourced").notNull().default(0),
  artifactsGenerated: integer("artifacts_generated").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  triggeredBy: text("triggered_by").notNull().default("auto"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversationsTable = pgTable("conversations", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => orgsTable.id),
  leadId: text("lead_id").references(() => leadsTable.id),
  leadName: text("lead_name").notNull(),
  leadCompany: text("lead_company").notNull(),
  leadAvatarUrl: text("lead_avatar_url"),
  subject: text("subject").notNull(),
  unread: boolean("unread").notNull().default(true),
  needsReply: boolean("needs_reply").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  sentiment: sentimentEnum("sentiment").notNull().default("neutral"),
  sentimentConfidence: real("sentiment_confidence").notNull().default(0.7),
  nextBestAction: text("next_best_action"),
  nextBestActionType: text("next_best_action_type"),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversationMessagesTable = pgTable("conversation_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id),
  direction: text("direction").notNull(),
  bodyHtml: text("body_html").notNull(),
  senderName: text("sender_name").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

// ─── Insert schemas ───────────────────────────────────────────────────────────

export const insertOrgSchema = createInsertSchema(orgsTable);
export const insertUserSchema = createInsertSchema(usersTable);
export const insertLeadSchema = createInsertSchema(leadsTable);
export const insertArtifactSchema = createInsertSchema(outreachArtifactsTable);
export const insertActivitySchema = createInsertSchema(activityEventsTable);
export const insertConversationSchema = createInsertSchema(conversationsTable);
export const insertMessageSchema = createInsertSchema(conversationMessagesTable);
export const insertGraphRunSchema = createInsertSchema(graphRunsTable);
export const insertApiKeySchema = createInsertSchema(apiKeysTable);
export const insertIntegrationSchema = createInsertSchema(integrationsTable);
export const insertTeamMemberSchema = createInsertSchema(teamMembersTable);
export const insertNotificationSchema = createInsertSchema(
  inAppNotificationsTable,
);
export const insertCadenceStageSchema = createInsertSchema(cadenceStagesTable);
export const insertStyleConfigSchema = createInsertSchema(styleConfigTable);
export const insertNotificationPrefsSchema =
  createInsertSchema(notificationPrefsTable);
export const insertIcpProfileSchema = createInsertSchema(icpProfilesTable);

// ─── Inferred types ───────────────────────────────────────────────────────────

export type Org = typeof orgsTable.$inferSelect;
export type User = typeof usersTable.$inferSelect;
export type TeamMember = typeof teamMembersTable.$inferSelect;
export type ApiKey = typeof apiKeysTable.$inferSelect;
export type Integration = typeof integrationsTable.$inferSelect;
export type CadenceStage = typeof cadenceStagesTable.$inferSelect;
export type StyleConfig = typeof styleConfigTable.$inferSelect;
export type NotificationPrefs = typeof notificationPrefsTable.$inferSelect;
export type InAppNotification = typeof inAppNotificationsTable.$inferSelect;
export type IcpProfile = typeof icpProfilesTable.$inferSelect;
export type Lead = typeof leadsTable.$inferSelect;
export type OutreachArtifact = typeof outreachArtifactsTable.$inferSelect;
export type ActivityEvent = typeof activityEventsTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;
export type ConversationMessage = typeof conversationMessagesTable.$inferSelect;
export type GraphRun = typeof graphRunsTable.$inferSelect;
