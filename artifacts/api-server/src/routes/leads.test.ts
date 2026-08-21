import { describe, it, expect } from "vitest";
import {
  verifiedEmailStatus,
  shapeLead,
  shapeLeadsList,
  shapePersonAsLead,
  shapePersonScoreBreakdown,
  shapeLeadDetail,
  BULK_PERSON_SUPPRESSION_PATH,
  parseBulkPersonSuppressionBody,
  type UpstreamUiLead,
  type UpstreamPersonDetail,
} from "./leads";

describe("manual suppression route contract", () => {
  it("targets the server-side Person-id bulk suppression endpoint", () => {
    expect(BULK_PERSON_SUPPRESSION_PATH).toBe(
      "/outreach/suppression/people/bulk",
    );
  });

  it("accepts only bounded Person ids and rejects the legacy ids/email shape", () => {
    expect(
      parseBulkPersonSuppressionBody({ personIds: [" person_1 "] }),
    ).toEqual({
      personIds: ["person_1"],
    });
    expect(parseBulkPersonSuppressionBody({ personIds: [] })).toBeNull();
    expect(parseBulkPersonSuppressionBody({ ids: ["person_1"] })).toBeNull();
    expect(
      parseBulkPersonSuppressionBody({
        personIds: ["person_1"],
        email: "victim@example.com",
      }),
    ).toBeNull();
    expect(parseBulkPersonSuppressionBody({ personIds: ["   "] })).toBeNull();
    expect(
      parseBulkPersonSuppressionBody({ personIds: ["x".repeat(257)] }),
    ).toBeNull();
    expect(
      parseBulkPersonSuppressionBody({
        personIds: Array(201).fill("person_1"),
      }),
    ).toBeNull();
  });
});

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
  lastContactedAt: "2026-06-03T10:30:00.000Z",
  createdAt: "2026-06-01T12:00:00.000Z",
};

describe("verifiedEmailStatus", () => {
  it("maps only explicit verification evidence", () => {
    expect(verifiedEmailStatus(samplePerson.emails[0])).toBe("DELIVERABLE");
    expect(
      verifiedEmailStatus({
        ...samplePerson.emails[0]!,
        verified: false,
        verificationResult: "catch_all",
      }),
    ).toBe("CATCH_ALL");
    expect(
      verifiedEmailStatus({
        ...samplePerson.emails[0]!,
        verified: null,
        verificationResult: null,
      }),
    ).toBeNull();
    expect(verifiedEmailStatus(undefined)).toBeNull();
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
      geo: null,
      country: null,
      industry: "Software",
      headcountEstimate: "51-200",
      cohort: null,
      emailStatus: null,
      intentSignals: null,
      lastContactedAt: "2026-06-03T10:30:00.000Z",
      sendPolicy: null,
      createdAt: "2026-06-01T12:00:00.000Z",
    });
  });

  it("never fabricates a send policy — null when no upstream source exists", () => {
    // HONESTY contract (same as artifacts.ts): an all-false SendPolicy is a
    // claim ("no postal address", "no unsubscribe"), not a gap. The FE shows
    // its neutral badge for null instead of fake red compliance badges.
    expect(shapeLead(sampleUiLead).sendPolicy).toBeNull();
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

  it("preserves an unscored lead as unknown instead of inventing zero", () => {
    expect(shapeLead({ ...sampleUiLead, score: null }).score).toBeNull();
  });

  it("preserves missing contact history as unknown", () => {
    expect(
      shapeLead({ ...sampleUiLead, lastContactedAt: "  " }).lastContactedAt,
    ).toBeNull();
  });
});

describe("shapeLeadsList", () => {
  it("renames {leads,total} to {items,total,page,limit}", () => {
    const out = shapeLeadsList({ leads: [sampleUiLead], total: 1 }, 2, 25);
    expect(out.total).toBe(1);
    expect(out.page).toBe(2);
    expect(out.limit).toBe(25);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.id).toBe("person_1");
  });

  it("handles an empty list defensively", () => {
    expect(shapeLeadsList({ leads: [], total: 0 }, 1, 25)).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
    });
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
  location: "Austin, TX",
  bio: null,
  industry: "Software",
  employeeRange: "51-200",
  country: "US",
  city: "Austin",
  createdAt: "2026-06-01T12:00:00.000Z",
  bestEmail: "sam@globex.io",
  score: 91,
  qualifiedAt: "2026-06-02T09:00:00.000Z",
  stage: "replied",
  lastContactedAt: "2026-06-03T10:30:00.000Z",
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
  researchBrief: "Sam Rivera leads revenue operations at Globex.",
  scoreBreakdown: { fit: 96, intent: 84, engagement: 90, timing: 78 },
  recentEvidenceEvents: [
    {
      id: "evidence_1",
      eventType: "Recent Hire",
      description:
        "Hiring for an account executive. Source: https://jobs.globex.io/ae",
      timestamp: "2026-06-01T00:00:00.000Z",
      sourceUrl: "https://jobs.globex.io/ae",
    },
  ],
  intentSignals: [
    { label: "Hiring for an account executive", confidence: 0.92 },
  ],
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
    expect(lead.stage).toBe("replied");
    expect(lead.cohort).toBeNull();
    expect(lead.emailStatus).toBe("DELIVERABLE");
    expect(lead.geo).toBe("Austin, TX");
    expect(lead.industry).toBe("Software");
    expect(lead.headcountEstimate).toBe("51-200");
    expect(lead.intentSignals).toEqual(samplePerson.intentSignals);
    expect(lead.lastContactedAt).toBe("2026-06-03T10:30:00.000Z");
    expect(lead.createdAt).toBe("2026-06-01T12:00:00.000Z");
    expect(lead.sendPolicy).toBeNull(); // no policy source — never fabricated
  });

  it("derives stage 'enriched' when not qualified", () => {
    expect(
      shapePersonAsLead({ ...samplePerson, stage: null, qualifiedAt: null })
        .stage,
    ).toBe("enriched");
  });

  it("keeps a person without qualification or email at sourced", () => {
    expect(
      shapePersonAsLead({
        ...samplePerson,
        stage: null,
        qualifiedAt: null,
        bestEmail: null,
        emails: [],
      }).stage,
    ).toBe("sourced");
  });

  it("preserves a missing person score as unknown", () => {
    expect(
      shapePersonAsLead({ ...samplePerson, score: null }).score,
    ).toBeNull();
  });

  it("preserves missing person contact history as unknown", () => {
    expect(
      shapePersonAsLead({ ...samplePerson, lastContactedAt: null })
        .lastContactedAt,
    ).toBeNull();
  });
});

describe("shapePersonScoreBreakdown", () => {
  it("passes through persisted category percentages", () => {
    expect(shapePersonScoreBreakdown(samplePerson)).toEqual({
      fit: 96,
      intent: 84,
      engagement: 90,
      timing: 78,
    });
  });

  it("clamps malformed upstream percentages", () => {
    expect(
      shapePersonScoreBreakdown({
        ...samplePerson,
        scoreBreakdown: {
          fit: 140,
          intent: -5,
          engagement: 67.8,
          timing: Number.NaN,
        },
      }),
    ).toEqual({ fit: 100, intent: 0, engagement: 68, timing: 0 });
  });
});

describe("shapeLeadDetail", () => {
  it("composes LeadDetail from persisted intelligence", () => {
    const detail = shapeLeadDetail(samplePerson);
    expect(detail.lead.id).toBe("person_42");
    expect(detail.researchBrief).toBe(
      "Sam Rivera leads revenue operations at Globex.",
    );
    expect(detail.recentEvidenceEvents).toHaveLength(1);
    // sendPolicy has no upstream source on the detail path either — null,
    // never the old fabricated all-false policy.
    expect(detail.lead.sendPolicy).toBeNull();
    expect(detail.scoreBreakdown).toEqual(samplePerson.scoreBreakdown);
  });

  it("returns a structured safe citation and removes its duplicate text suffix", () => {
    const detail = shapeLeadDetail(samplePerson);
    expect(detail.recentEvidenceEvents).toEqual([
      {
        id: "evidence_1",
        eventType: "Recent Hire",
        description: "Hiring for an account executive.",
        timestamp: "2026-06-01T00:00:00.000Z",
        sourceUrl: "https://jobs.globex.io/ae",
      },
    ]);
  });

  it.each([
    "javascript:alert(1)",
    "https://user:secret@jobs.globex.io/ae",
    "jobs.globex.io/ae",
  ])("drops unsafe evidence source %s", (sourceUrl) => {
    const detail = shapeLeadDetail({
      ...samplePerson,
      recentEvidenceEvents: [
        { ...samplePerson.recentEvidenceEvents[0]!, sourceUrl },
      ],
    });
    expect(detail.recentEvidenceEvents[0]?.sourceUrl).toBeNull();
  });
});
