import { describe, it, expect } from "vitest";
import { shapeAgents, type UpstreamAgent } from "./agents";

// Sample upstream rows shaped exactly like apex-gtm-api GET /api/agents
// (AgentsService.findAll → Agent[] with template + _count.runs).
const upstream: UpstreamAgent[] = [
  {
    id: "agent_1",
    name: "Outbound SDR",
    domain: "SALES",
    status: "ACTIVE",
    template: { name: "SDR Outreach" },
    _count: { runs: 7 },
  },
  {
    id: "agent_2",
    name: "Blog Writer",
    domain: "MARKETING",
    status: "ERROR",
    template: { name: "Content Writer" },
    _count: { runs: 0 },
  },
  {
    id: "agent_3",
    name: "Ops Bot",
    domain: "OPS",
    status: "DEPLOYING",
    template: null,
    _count: null,
  },
];

describe("shapeAgents", () => {
  it("maps the upstream Agent[] to the openapi Agent[] shape", () => {
    expect(shapeAgents(upstream)).toEqual([
      {
        id: "agent_1",
        name: "Outbound SDR",
        type: "sdr",
        status: "idle",
        lastAction: null,
        lastActionAt: null,
        recentActivityCount: 7,
        sparklineData: [],
      },
      {
        id: "agent_2",
        name: "Blog Writer",
        type: "content",
        status: "error",
        lastAction: null,
        lastActionAt: null,
        recentActivityCount: 0,
        sparklineData: [],
      },
      {
        id: "agent_3",
        name: "Ops Bot",
        type: "ops",
        status: "running",
        lastAction: null,
        lastActionAt: null,
        recentActivityCount: 0,
        sparklineData: [],
      },
    ]);
  });

  it("maps AgentStatus → {idle,running,error}", () => {
    const rows: UpstreamAgent[] = [
      { id: "a", name: "a", domain: "SALES", status: "ACTIVE" },
      { id: "b", name: "b", domain: "SALES", status: "PAUSED" },
      { id: "c", name: "c", domain: "SALES", status: "ERROR" },
      { id: "d", name: "d", domain: "SALES", status: "DEPLOYING" },
    ];
    expect(shapeAgents(rows).map((r) => r.status)).toEqual([
      "idle",
      "idle",
      "error",
      "running",
    ]);
  });

  it("refines type from template name when present, else falls back to domain", () => {
    const rows: UpstreamAgent[] = [
      { id: "1", name: "x", domain: "OPS", status: "ACTIVE", template: { name: "Reply Manager" } },
      { id: "2", name: "x", domain: "SALES", status: "ACTIVE", template: { name: "Weekly Reporting" } },
      { id: "3", name: "x", domain: "OPS", status: "ACTIVE", template: { name: "Pipeline Runner" } },
      { id: "4", name: "x", domain: "MARKETING", status: "ACTIVE" },
    ];
    expect(shapeAgents(rows).map((r) => r.type)).toEqual([
      "reply",
      "reporting",
      "pipeline",
      "content",
    ]);
  });
});
