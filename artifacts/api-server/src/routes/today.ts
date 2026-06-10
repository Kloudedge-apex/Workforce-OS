import { Router } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";

const router = Router();

/** Shape of GET /api/dashboard/stats (DashboardService.stats). */
export interface DashboardStatsUpstream {
  leadsSourced: number;
  leadsQualified: number;
  emailsSent: number;
  replyRate: number;
  meetingsBooked: number;
}

/** Shape of GET /api/kpis/quality (KpiCalculatorService.quality). */
export interface QualityKpiUpstream {
  windowDays: number;
  outreach_artifacts: {
    pending_review: number;
    approved: number;
    rejected: number;
    sent: number;
  };
  lead_score_distribution: { A: number; B: number; C: number };
}

/** FE TodayKpis contract (openapi.yaml #/components/schemas/TodayKpis). */
export interface TodayKpis {
  artifactsPending: number;
  artifactsSentToday: number;
  replyRate7d: number;
  qualifiedMeetingsBooked: number;
  leadsSourcedToday: number;
  leadsScored: number;
}

/**
 * Pure mapper: compose the FE TodayKpis tile from the two upstream calls.
 *
 * Grounding notes (see 2026-06-10 release audit, dashboard domain):
 * - artifactsPending  <- kpis.quality.outreach_artifacts.pending_review
 * - artifactsSentToday <- kpis.quality.outreach_artifacts.sent (windowDays=1 ~= "today")
 * - qualifiedMeetingsBooked <- dashboard.stats.meetingsBooked
 * - leadsScored <- dashboard.stats.leadsSourced (every LeadScore row is a scored lead)
 * - replyRate7d <- dashboard.stats.replyRate (backend HARDCODES 0; no real 7d reply
 *   telemetry surfaced — passed through honestly)
 * - leadsSourcedToday <- dashboard.stats.leadsSourced (no calendar-today endpoint exists;
 *   all-time count is the closest available signal — see audit "true gaps within this tile")
 */
export function shapeTodayKpis(
  stats: DashboardStatsUpstream,
  quality: QualityKpiUpstream,
): TodayKpis {
  return {
    artifactsPending: quality.outreach_artifacts.pending_review,
    artifactsSentToday: quality.outreach_artifacts.sent,
    replyRate7d: stats.replyRate,
    qualifiedMeetingsBooked: stats.meetingsBooked,
    leadsSourcedToday: stats.leadsSourced,
    leadsScored: stats.leadsSourced,
  };
}

router.get("/today/kpis", async (req, res, next) => {
  try {
    const [stats, quality] = await Promise.all([
      apex.get("/dashboard/stats", { req }) as Promise<DashboardStatsUpstream>,
      // windowDays=1 approximates calendar "today" for the sent/pending split.
      apex.get("/kpis/quality?windowDays=1", { req }) as Promise<QualityKpiUpstream>,
    ]);
    res.json(shapeTodayKpis(stats, quality));
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
      res.status(err.status).json(err.body);
      return;
    }
    next(err);
  }
});

export default router;
