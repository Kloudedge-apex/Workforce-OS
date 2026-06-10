import { describe, it, expect } from "vitest";
import {
  cohortFromScore,
  emailStatusForLead,
  defaultSendPolicy,
  shapeLead,
  shapeLeadsList,
  shapePersonAsLead,
  shapePersonScoreBreakdown,
  shapeLeadDetail,
  type UpstreamUiLead,
  type UpstreamPersonDetail,
} from "./leads";

// Sample upstream lead matching LeadsService.listLeadsForUi (release audit).
const sampleUiLead: UpstreamUiLead = {
  id: "person_1",
  name: "Jane Doe",
  title: "VP Engineering",
  company: "Acme Inc",
  domain: "acme.com",
  email: "jane@acme.com",
  industry: "Software",
  companySize: "51-200",
  techStack: ["aws", "react"],
  score: 82,
  scoreBreakdown: [{ label: "Total", value: 82 }],
  stage: "qualified",
  source: "discovery",
  emailStatus: "not_sent",
  timeline: [],
  createdAt: "2026-06-01T12:00:00.000Z",
};

describe("cohortFromScore", () => {
  it("maps score >= 70 to cohort A", () => {
    expect(cohortFromScore(70)).toBe("A");
    expect(cohortFromScore(99)).toBe("A");
  });
  it("maps score < 70 to cohort B", () => {
    expect(cohortFromScore(69)).toBe("B");
    expect(cohortFromScore(0)).toBe("B");
  });
});

describe("emailStatusForLead", () => {
  it("always returns the honest HIGH_PROBABILITY default (no verification source)", () => {
    expect(emailStatusForLead("not_sent")).toBe("HIGH_PROBABILITY");
    expect(emailStatusForLead("sent")).toBe("HIGH_PROBABILITY");
    expect(emailStatusForLead("bounced")).toBe("HIGH_PROBABILITY");
  });
});

describe("defaultSendPolicy", () => {
  it("fails closed — nothing enabled", () => {
    expect(defaultSendPolicy()).toEqual({
      liveSendEnabled: false,
      postalAddressSet: false,
      unsubscribeConfigured: false,
      recipientSuppressed: false,
    });
  });
});

describe("shapeLead", () => {
  it("maps an upstream UI lead to the exact openapi Lead fields", () => {
    expect(shapeLead(sampleUiLead)).toEqual({
      id: "person_1",
      name: "Jane Doe",
      title: "VP Engineering",
      email: "jane@acme.com",
      company: "Acme Inc",
      domain: "acme.com",
      companyLogoUrl: null,
      avatarUrl: null,
      score: 82,
      stage: "qualified",
      geo: "",
      country: null,
      industry: "Software",
      headcountEstimate: "51-200",
      cohort: "A",
      emailStatus: "HIGH_PROBABILITY",
      intentSignals: [],
      lastContactedAt: null,
      sendPolicy: {
        liveSendEnabled: false,
        postalAddressSet: false,
        unsubscribeConfigured: false,
        recipientSuppressed: false,
      },
      createdAt: "2026-06-01T12:00:00.000Z",
    });
  });

  it("nulls empty company domain / industry / size", () => {
    const shaped = shapeLead({
      ...sampleUiLead,
      domain: "",
      industry: "  ",
      companySize: "",
    });
    expect(shaped.domain).toBeNull();
    expect(shaped.industry).toBeNull();
    expect(shaped.headcountEstimate).toBeNull();
  });

  it("truncates a fractional score to an integer", () => {
    expect(shapeLead({ ...sampleUiLead, score: 47.9 }).score).toBe(47);
  });
});

describe("shapeLeadsList", () => {
  it("renames {leads,total} to {items,total,page,limit}", () => {
    const out = shapeLeadsList(
      { leads: [sampleUiLead], total: 1 },
      2,
      25,
    );
    expect(out.total).toBe(1);
    expect(out.page).toBe(2);
    expect(out.limit).toBe(25);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.id).toBe("person_1");
  });

  it("handles an empty list defensively", () => {
    expect(
      shapeLeadsList({ leads: [], total: 0 }, 1, 25),
    ).toEqual({ items: [], total: 0, page: 1, limit: 25 });
  });
});

// Sample upstream person matching LeadsService.getPersonDetail (release audit).
const samplePerson: UpstreamPersonDetail = {
  id: "person_42",
  firstName: "Sam",
  lastName: "Rivera",
  title: "Head of RevOps",
  company: "Globex",
  companyDomain: "globex.io",
  seniority: "DIRECTOR",
  department: "OPERATIONS",
  linkedinUrl: "https://linkedin.com/in/samrivera",
  location: null,
  bio: null,
  bestEmail: "sam@globex.io",
  score: 91,
  qualifiedAt: "2026-06-02T09:00:00.000Z",
  emails: [
    {
      email: "sam@globex.io",
      pattern: "first",
      source: "enrich",
      confidence: 0.9,
      verified: true,
      verificationResult: "valid",
    },
  ],
  scoreBreakdown: [{ category: "Total", points: 91 }],
};

describe("shapePersonAsLead", () => {
  it("maps person detail into the embedded openapi Lead shape", () => {
    const lead = shapePersonAsLead(samplePerson);
    expect(lead.id).toBe("person_42");
    expect(lead.name).toBe("Sam Rivera");
    expect(lead.title).toBe("Head of RevOps");
    expect(lead.email).toBe("sam@globex.io");
    expect(lead.company).toBe("Globex");
    expect(lead.domain).toBe("globex.io");
    expect(lead.score).toBe(91);
    expect(lead.stage).toBe("qualified"); // qualifiedAt set
    expect(lead.cohort).toBe("A");
    expect(lead.emailStatus).toBe("HIGH_PROBABILITY");
    expect(lead.industry).toBeNull(); // not returned by getPersonDetail
    expect(lead.createdAt).toBe(""); // not returned by getPersonDetail
  });

  it("derives stage 'enriched' when not qualified", () => {
    expect(
      shapePersonAsLead({ ...samplePerson, qualifiedAt: null }).stage,
    ).toBe("enriched");
  });
});

describe("shapePersonScoreBreakdown", () => {
  it("maps the single 'Total' row into fit and zeros the rest (lossy)", () => {
    expect(shapePersonScoreBreakdown(samplePerson)).toEqual({
      fit: 91,
      intent: 0,
      engagement: 0,
      timing: 0,
    });
  });

  it("falls back to score when no breakdown rows exist", () => {
    expect(
      shapePersonScoreBreakdown({ ...samplePerson, scoreBreakdown: [] }),
    ).toEqual({ fit: 91, intent: 0, engagement: 0, timing: 0 });
  });

  it("defaults to 0 when neither breakdown nor score exist", () => {
    expect(
      shapePersonScoreBreakdown({
        ...samplePerson,
        scoreBreakdown: [],
        score: null,
      }),
    ).toEqual({ fit: 0, intent: 0, engagement: 0, timing: 0 });
  });
});

describe("shapeLeadDetail", () => {
  it("composes LeadDetail with honest defaults for ungrounded fields", () => {
    const detail = shapeLeadDetail(samplePerson);
    expect(detail.lead.id).toBe("person_42");
    // researchBrief + recentEvidenceEvents have no source on release.
    expect(detail.researchBrief).toBe("");
    expect(detail.recentEvidenceEvents).toEqual([]);
    expect(detail.scoreBreakdown).toEqual({
      fit: 91,
      intent: 0,
      engagement: 0,
      timing: 0,
    });
  });
});
