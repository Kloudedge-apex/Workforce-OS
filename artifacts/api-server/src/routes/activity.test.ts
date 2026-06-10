import { describe, it, expect } from "vitest";
import {
  shapeActivityEvent,
  shapeActivity,
  type ActivityEventUpstream,
  type ActivityUpstream,
} from "./activity.shape";

const draft: ActivityEventUpstream = {
  id: "artifact:art_123:created",
  kind: "draft_created",
  text: "Generated outreach draft (gmail.send)",
  at: "2026-06-09T10:00:00.000Z",
  leadId: "",
};

const runNeedsApproval: ActivityEventUpstream = {
  id: "run:run_77:needs_approval",
  kind: "run_needs_approval",
  text: "pipeline-supervisor is waiting for approval",
  at: "2026-06-09T11:00:00.000Z",
  leadId: "",
};

const meeting: ActivityEventUpstream = {
  id: "meeting:mtg_9:confirmed",
  kind: "meeting_confirmed",
  text: 'Confirmed meeting "Intro call"',
  at: "2026-06-09T12:00:00.000Z",
  leadId: "person_42",
};

describe("shapeActivityEvent", () => {
  it("maps a draft event, deriving sdr identity and extracting artifactId from the id", () => {
    expect(shapeActivityEvent(draft)).toEqual({
      id: "artifact:art_123:created",
      agentName: "SDR Agent",
      agentType: "sdr",
      action: "Generated outreach draft (gmail.send)",
      stage: "drafting",
      timestamp: "2026-06-09T10:00:00.000Z",
      artifactId: "art_123",
      leadId: null,
    });
  });

  it("maps a run event to pipeline with a null artifactId and null leadId", () => {
    const out = shapeActivityEvent(runNeedsApproval);
    expect(out.agentType).toBe("pipeline");
    expect(out.agentName).toBe("Pipeline Supervisor");
    expect(out.stage).toBe("awaiting_approval");
    expect(out.artifactId).toBeNull();
    expect(out.leadId).toBeNull();
    expect(out.timestamp).toBe("2026-06-09T11:00:00.000Z");
    expect(out.action).toBe("pipeline-supervisor is waiting for approval");
  });

  it("carries a non-empty leadId through for meeting events", () => {
    const out = shapeActivityEvent(meeting);
    expect(out.leadId).toBe("person_42");
    expect(out.artifactId).toBeNull();
    expect(out.agentType).toBe("pipeline");
  });
});

describe("shapeActivity", () => {
  const upstream: ActivityUpstream = { events: [meeting, runNeedsApproval, draft] };

  it("unwraps the envelope into a bare array preserving order", () => {
    const out = shapeActivity(upstream);
    expect(Array.isArray(out)).toBe(true);
    expect(out.map((e) => e.id)).toEqual([
      "meeting:mtg_9:confirmed",
      "run:run_77:needs_approval",
      "artifact:art_123:created",
    ]);
  });

  it("filter=outbound keeps only sdr/content (draft) events", () => {
    const out = shapeActivity(upstream, "outbound");
    expect(out.map((e) => e.agentType)).toEqual(["sdr"]);
  });

  it("filter=pipeline keeps only pipeline/ops (run + meeting) events", () => {
    const out = shapeActivity(upstream, "pipeline");
    expect(out.map((e) => e.id)).toEqual([
      "meeting:mtg_9:confirmed",
      "run:run_77:needs_approval",
    ]);
  });
});
