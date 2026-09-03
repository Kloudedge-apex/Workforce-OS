import { describe, it, expect } from "vitest";
import {
  shapeTodayKpis,
  type DashboardStatsUpstream,
  type QualityKpiUpstream,
} from "./today";

describe("shapeTodayKpis", () => {
  const stats: DashboardStatsUpstream = {
    leadsSourced: 42,
    leadsQualified: 17,
    verifiedEmails: 18,
    emailsSent: 120,
    meetingsBooked: 6,
  };
  const quality: QualityKpiUpstream = {
    windowDays: 1,
    outreach_artifacts: {
      pending_review: 9,
      approved: 4,
      rejected: 1,
      sent: 13,
    },
    lead_score_distribution: { A: 10, B: 20, C: 12 },
  };

  it("maps the two upstream payloads onto the exact TodayKpis fields", () => {
    expect(shapeTodayKpis(stats, quality)).toEqual({
      leadsSourced: 42,
      leadsQualified: 17,
      verifiedEmails: 18,
      artifactsPending: 9,
      artifactsSentToday: 13,
      qualifiedMeetingsBooked: 6,
      leadsScored: 42,
    });
  });

  it("does not publish unmeasured reply-rate or calendar-day lead placeholders", () => {
    const out = shapeTodayKpis(stats, quality);
    expect(out).not.toHaveProperty("replyRate7d");
    expect(out).not.toHaveProperty("leadsSourcedToday");
  });

  it("returns only measured contract keys (no extra upstream leakage)", () => {
    const out = shapeTodayKpis(stats, quality);
    expect(Object.keys(out).sort()).toEqual(
      [
        "leadsSourced",
        "leadsQualified",
        "verifiedEmails",
        "artifactsPending",
        "artifactsSentToday",
        "leadsScored",
        "qualifiedMeetingsBooked",
      ].sort(),
    );
  });
});
