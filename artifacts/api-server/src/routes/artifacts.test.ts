import { describe, it, expect } from "vitest";
import {
  shapeArtifact,
  shapePaginatedArtifacts,
  type UpstreamArtifact,
} from "./artifacts";

// A raw OutreachArtifact row as apex-gtm-api serializes it (response_shape from
// the Phase-2 release audit): bare prisma fields, dates as ISO strings.
function makeUpstream(over: Partial<UpstreamArtifact> = {}): UpstreamArtifact {
  return {
    id: "art_1",
    orgId: "org_x",
    graphRunId: "gr_99",
    toolName: "send_email",
    channel: "EMAIL",
    recipientRef: "jane@acme.com",
    subject: "Quick question",
    bodyText: "Hi Jane,\nplain text",
    bodyHtml: "<p>Hi Jane</p>",
    payload: { name: "Jane Doe", company: "Acme Inc", title: "VP Sales", cohort: "wave-1" },
    status: "PENDING_REVIEW",
    reviewerNote: null,
    reviewedBy: null,
    reviewedAt: null,
    sentAt: null,
    sendReceiptId: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...over,
  };
}

describe("shapeArtifact", () => {
  it("maps scalars 1:1 to the FE OutreachArtifact shape", () => {
    const out = shapeArtifact(makeUpstream());
    expect(out.id).toBe("art_1");
    expect(out.status).toBe("PENDING_REVIEW");
    expect(out.subject).toBe("Quick question");
    expect(out.bodyHtml).toBe("<p>Hi Jane</p>");
    expect(out.createdAt).toBe("2026-06-01T10:00:00.000Z");
    expect(out.graphRunId).toBe("gr_99");
  });

  it("synthesizes recipient from recipientRef + payload Json", () => {
    const out = shapeArtifact(makeUpstream());
    expect(out.recipient).toEqual({
      id: "jane@acme.com",
      name: "Jane Doe",
      email: "jane@acme.com",
      title: "VP Sales",
      company: "Acme Inc",
      avatarUrl: null,
    });
  });

  it("falls back recipient.name to recipientRef and empties title/company when payload lacks them", () => {
    const out = shapeArtifact(makeUpstream({ payload: {}, recipientRef: "bob@x.io" }));
    expect(out.recipient.name).toBe("bob@x.io");
    expect(out.recipient.title).toBe("");
    expect(out.recipient.company).toBe("");
    expect(out.recipient.email).toBe("bob@x.io");
    expect(out.recipient.id).toBe("bob@x.io");
  });

  it("uses bodyText when bodyHtml is null, and '' when both are null", () => {
    expect(shapeArtifact(makeUpstream({ bodyHtml: null })).bodyHtml).toBe("Hi Jane,\nplain text");
    expect(shapeArtifact(makeUpstream({ bodyHtml: null, bodyText: null })).bodyHtml).toBe("");
  });

  it("coalesces null subject to empty string", () => {
    expect(shapeArtifact(makeUpstream({ subject: null })).subject).toBe("");
  });

  it("stubs citations as [] and evaluatorScores as zeros (no DB backing store)", () => {
    const out = shapeArtifact(makeUpstream());
    expect(out.citations).toEqual([]);
    expect(out.evaluatorScores).toEqual({
      pii: 0,
      hallucination: 0,
      citationCoverage: 0,
      toxicity: 0,
    });
  });

  it("stubs sendPolicy with conservative defaults; recipientSuppressed mirrors SUPPRESSED status", () => {
    expect(shapeArtifact(makeUpstream()).sendPolicy).toEqual({
      liveSendEnabled: false,
      postalAddressSet: false,
      unsubscribeConfigured: false,
      recipientSuppressed: false,
    });
    expect(shapeArtifact(makeUpstream({ status: "SUPPRESSED" })).sendPolicy.recipientSuppressed).toBe(true);
  });

  it("derives approvedAt from reviewedAt only when status is APPROVED", () => {
    const approved = shapeArtifact(
      makeUpstream({ status: "APPROVED", reviewedAt: "2026-06-02T09:00:00.000Z" }),
    );
    expect(approved.approvedAt).toBe("2026-06-02T09:00:00.000Z");
    // reviewedAt present but not APPROVED → approvedAt null
    const pending = shapeArtifact(makeUpstream({ reviewedAt: "2026-06-02T09:00:00.000Z" }));
    expect(pending.approvedAt).toBeNull();
  });

  it("derives rejectionReason from reviewerNote only when status is REJECTED", () => {
    const rejected = shapeArtifact(
      makeUpstream({ status: "REJECTED", reviewerNote: "off-base claim" }),
    );
    expect(rejected.rejectionReason).toBe("off-base claim");
    const pending = shapeArtifact(makeUpstream({ reviewerNote: "note" }));
    expect(pending.rejectionReason).toBeNull();
  });

  it("maps sentAt and cohort (from payload), nulling when absent", () => {
    expect(shapeArtifact(makeUpstream({ sentAt: "2026-06-03T00:00:00.000Z" })).sentAt).toBe(
      "2026-06-03T00:00:00.000Z",
    );
    expect(shapeArtifact(makeUpstream()).cohort).toBe("wave-1");
    expect(shapeArtifact(makeUpstream({ payload: {} })).cohort).toBeNull();
    expect(shapeArtifact(makeUpstream({ sentAt: null })).sentAt).toBeNull();
  });

  it("nulls graphRunId when absent", () => {
    expect(shapeArtifact(makeUpstream({ graphRunId: null })).graphRunId).toBeNull();
  });
});

describe("shapePaginatedArtifacts", () => {
  const rows = Array.from({ length: 7 }, (_, i) =>
    makeUpstream({ id: `art_${i}`, recipientRef: `u${i}@x.io` }),
  );

  it("wraps the bare upstream array into the FE envelope and reports total=array length", () => {
    const out = shapePaginatedArtifacts(rows, 1, 5);
    expect(out.total).toBe(7);
    expect(out.page).toBe(1);
    expect(out.limit).toBe(5);
    expect(out.items).toHaveLength(5);
    expect(out.items[0]!.id).toBe("art_0");
    expect(out.items[4]!.id).toBe("art_4");
  });

  it("paginates BFF-side by (page, limit) slicing", () => {
    const page2 = shapePaginatedArtifacts(rows, 2, 5);
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0]!.id).toBe("art_5");
    expect(page2.items[1]!.id).toBe("art_6");
  });

  it("returns shaped (not raw) items", () => {
    const out = shapePaginatedArtifacts([makeUpstream()], 1, 20);
    expect(out.items[0]!.evaluatorScores).toEqual({
      pii: 0,
      hallucination: 0,
      citationCoverage: 0,
      toxicity: 0,
    });
    expect(out.items[0]!.recipient.name).toBe("Jane Doe");
  });

  it("yields an empty page beyond the data", () => {
    const out = shapePaginatedArtifacts(rows, 99, 5);
    expect(out.items).toEqual([]);
    expect(out.total).toBe(7);
  });
});
