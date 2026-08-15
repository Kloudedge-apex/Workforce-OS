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
    emailsSent: 120,
    replyRate: null,
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
      artifactsPending: 9,
      artifactsSentToday: 13,
      replyRate7d: null,
      qualifiedMeetingsBooked: 6,
      leadsSourcedToday: null,
      leadsScored: 42,
    });
  });

  it("does not present an ungrounded upstream reply rate as measured telemetry", () => {
    expect(shapeTodayKpis({ ...stats, replyRate: 0 }, quality).replyRate7d).toBeNull();
    expect(shapeTodayKpis({ ...stats, replyRate: 0.73 }, quality).replyRate7d).toBeNull();
  });

  it("returns only the six contract keys (no extra upstream leakage)", () => {
    const out = shapeTodayKpis(stats, quality);
    expect(Object.keys(out).sort()).toEqual(
      [
        "artifactsPending",
        "artifactsSentToday",
        "leadsScored",
        "leadsSourcedToday",
        "qualifiedMeetingsBooked",
        "replyRate7d",
      ].sort(),
    );
  });
});
