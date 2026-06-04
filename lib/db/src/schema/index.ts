import { pgTable, text, integer, boolean, real, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
]);

export const sentimentEnum = pgEnum("sentiment", [
  "positive",
  "objection",
  "neutral",
  "negative",
]);

export const orgsTable = pgTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  liveSendEnabled: boolean("live_send_enabled").notNull().default(false),
  postalAddress: text("postal_address"),
  unsubscribeUrl: text("unsubscribe_url"),
  plan: text("plan").notNull().default("starter"),
  creditsRemaining: integer("credits_remaining").notNull().default(500),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const allowlistedDomainsTable = pgTable("allowlisted_domains", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgsTable.id),
  domain: text("domain").notNull(),
});

export const suppressedEmailsTable = pgTable("suppressed_emails", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgsTable.id),
  email: text("email").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leadsTable = pgTable("leads", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgsTable.id),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email").notNull(),
  company: text("company").notNull(),
  companyLogoUrl: text("company_logo_url"),
  avatarUrl: text("avatar_url"),
  score: integer("score").notNull().default(0),
  stage: text("stage").notNull().default("sourced"),
  geo: text("geo"),
  intentSignals: jsonb("intent_signals").notNull().default([]),
  lastContactedAt: timestamp("last_contacted_at"),
  researchBrief: text("research_brief"),
  scoreBreakdown: jsonb("score_breakdown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const outreachArtifactsTable = pgTable("outreach_artifacts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgsTable.id),
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
  orgId: text("org_id").notNull().references(() => orgsTable.id),
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
  orgId: text("org_id").notNull().references(() => orgsTable.id),
  artifactId: text("artifact_id"),
  langsmithRootRunId: text("langsmith_root_run_id"),
  timeline: jsonb("timeline").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const conversationsTable = pgTable("conversations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgsTable.id),
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
  conversationId: text("conversation_id").notNull().references(() => conversationsTable.id),
  direction: text("direction").notNull(),
  bodyHtml: text("body_html").notNull(),
  senderName: text("sender_name").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const insertOrgSchema = createInsertSchema(orgsTable);
export const insertLeadSchema = createInsertSchema(leadsTable);
export const insertArtifactSchema = createInsertSchema(outreachArtifactsTable);
export const insertActivitySchema = createInsertSchema(activityEventsTable);
export const insertConversationSchema = createInsertSchema(conversationsTable);
export const insertMessageSchema = createInsertSchema(conversationMessagesTable);

export type Org = typeof orgsTable.$inferSelect;
export type Lead = typeof leadsTable.$inferSelect;
export type OutreachArtifact = typeof outreachArtifactsTable.$inferSelect;
export type ActivityEvent = typeof activityEventsTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;
export type ConversationMessage = typeof conversationMessagesTable.$inferSelect;
export type GraphRun = typeof graphRunsTable.$inferSelect;
