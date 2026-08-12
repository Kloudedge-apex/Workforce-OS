import { describe, it, expect } from "vitest";
import {
  shapeArtifact,
  artifactSuppressionPath,
  shapeCitations,
  shapeEvaluatorScores,
  shapePaginatedArtifacts,
  shapeRefusal,
  type UpstreamArtifact,
} from "./artifacts";

describe("artifactSuppressionPath", () => {
  it("targets the authenticated manual-suppression endpoint and encodes the id", () => {
    expect(artifactSuppressionPath("art/one two")).toBe(
      "/outreach/suppression/artifacts/art%2Fone%20two",
    );
  });
});

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
    expect(out.channel).toBe("EMAIL");
    expect(out.subject).toBe("Quick question");
    expect(out.bodyHtml).toBe("<p>Hi Jane</p>");
    expect(out.createdAt).toBe("2026-06-01T10:00:00.000Z");
    expect(out.updatedAt).toBe("2026-06-01T10:00:00.000Z");
    expect(out.graphRunId).toBe("gr_99");
  });

  it("preserves supported channels and marks missing or novel channels unknown", () => {
    expect(shapeArtifact(makeUpstream({ channel: "HUBSPOT_NOTE" })).channel).toBe("HUBSPOT_NOTE");
    expect(shapeArtifact(makeUpstream({ channel: "LINKEDIN" })).channel).toBe("LINKEDIN");
    expect(shapeArtifact(makeUpstream({ channel: "SMS" })).channel).toBe("UNKNOWN");
    expect(shapeArtifact(makeUpstream({ channel: undefined })).channel).toBe("UNKNOWN");
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

  it("returns citations [] (not fabricated rows) when the payload has no brief_facts", () => {
    expect(shapeArtifact(makeUpstream()).citations).toEqual([]);
    expect(shapeArtifact(makeUpstream({ payload: null })).citations).toEqual([]);
  });

  it("maps payload.brief_facts to citations, marking self-check-cited facts and carrying dates", () => {
    const out = shapeArtifact(
      makeUpstream({
        payload: {
          brief_facts: [
            { id: "F1", category: "firmographic", source: "crm", text: "Acme has 120 employees" },
            { id: "S1", category: "signal", source: "press", text: "Raised Series B", date: "2026-05-12" },
          ],
          groundedness_self_check: { citedFactIds: ["S1"], unsupportedClaims: [] },
        },
      }),
    );
    expect(out.citations).toEqual([
      { factId: "F1", claim: "Acme has 120 employees", source: "crm", cited: false },
      { factId: "S1", claim: "Raised Series B", source: "press", date: "2026-05-12", cited: true },
    ]);
  });

  it("nulls evaluatorScores when not persisted — NEVER zeros", () => {
    expect(shapeArtifact(makeUpstream()).evaluatorScores).toBeNull();
  });

  it("nulls sendPolicy (no upstream source of truth) so the FE hides the badge", () => {
    expect(shapeArtifact(makeUpstream()).sendPolicy).toBeNull();
    expect(shapeArtifact(makeUpstream({ status: "SUPPRESSED" })).sendPolicy).toBeNull();
  });

  it("surfaces payload.refusal as { refused, reason } and defaults to not-refused", () => {
    expect(shapeArtifact(makeUpstream()).refusal).toEqual({ refused: false, reason: null });
    const refused = shapeArtifact(
      makeUpstream({
        payload: { refusal: { reason: "no grounded evidence", missing: ["dated trigger"] } },
      }),
    );
    expect(refused.refusal).toEqual({
      refused: true,
      reason: "no grounded evidence (missing: dated trigger)",
    });
  });

  it("maps payload.langsmith_run_id, nulling when absent", () => {
    expect(shapeArtifact(makeUpstream()).langsmithRunId).toBeNull();
    expect(
      shapeArtifact(makeUpstream({ payload: { langsmith_run_id: "ls-run-42" } })).langsmithRunId,
    ).toBe("ls-run-42");
  });

  it("preserves the approval timestamp across later status transitions", () => {
    const approved = shapeArtifact(
      makeUpstream({ status: "APPROVED", reviewedAt: "2026-06-02T09:00:00.000Z" }),
    );
    expect(approved.approvedAt).toBe("2026-06-02T09:00:00.000Z");
    const unknown = shapeArtifact(
      makeUpstream({ status: "DELIVERY_UNKNOWN", reviewedAt: "2026-06-02T09:00:00.000Z" }),
    );
    expect(unknown.approvedAt).toBe("2026-06-02T09:00:00.000Z");
  });

  it("derives rejectionReason from reviewerNote only when status is REJECTED", () => {
    const rejected = shapeArtifact(
      makeUpstream({ status: "REJECTED", reviewerNote: "off-base claim" }),
    );
    expect(rejected.rejectionReason).toBe("off-base claim");
    const pending = shapeArtifact(makeUpstream({ reviewerNote: "note" }));
    expect(pending.rejectionReason).toBeNull();
  });

  it("exposes persisted transition evidence for delivery reconciliation", () => {
    const out = shapeArtifact(
      makeUpstream({
        status: "DELIVERY_UNKNOWN",
        reviewerNote: "delivery-unknown: provider outcome was ambiguous",
        sendReceiptId: "receipt-42",
        updatedAt: "2026-06-03T11:12:13.000Z",
      }),
    );
    expect(out.statusReason).toBe("delivery-unknown: provider outcome was ambiguous");
    expect(out.sendReceiptId).toBe("receipt-42");
    expect(out.updatedAt).toBe("2026-06-03T11:12:13.000Z");
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

  it("preserves the pagination-aware backend total without slicing twice", () => {
    const out = shapePaginatedArtifacts(
      { items: rows.slice(0, 2), total: 42, page: 3, limit: 2 },
      3,
      2,
    );
    expect(out.total).toBe(42);
    expect(out.page).toBe(3);
    expect(out.limit).toBe(2);
    expect(out.items.map((item) => item.id)).toEqual(["art_0", "art_1"]);
  });

  it("returns shaped (not raw) items", () => {
    const out = shapePaginatedArtifacts([makeUpstream()], 1, 20);
    expect(out.items[0]!.evaluatorScores).toBeNull();
    expect(out.items[0]!.refusal).toEqual({ refused: false, reason: null });
    expect(out.items[0]!.recipient.name).toBe("Jane Doe");
  });

  it("yields an empty page beyond the data", () => {
    const out = shapePaginatedArtifacts(rows, 99, 5);
    expect(out.items).toEqual([]);
    expect(out.total).toBe(7);
  });
});

describe("shapeCitations", () => {
  it("accepts the snake_case cited_fact_ids wire-format key as well as camelCase", () => {
    const payload = {
      brief_facts: [{ id: "F1", source: "crm", text: "claim one" }],
      groundedness_self_check: { cited_fact_ids: ["F1"] },
    };
    expect(shapeCitations(payload)).toEqual([
      { factId: "F1", claim: "claim one", source: "crm", cited: true },
    ]);
  });

  it("marks nothing cited when the self-check is absent", () => {
    const payload = { brief_facts: [{ id: "F1", source: "crm", text: "claim one" }] };
    expect(shapeCitations(payload)[0]!.cited).toBe(false);
  });

  it("drops malformed facts instead of inventing fields", () => {
    const payload = {
      brief_facts: [
        { id: "F1", text: "good", source: "crm" },
        { id: 42, text: "bad id" },
        { id: "F3" }, // no text
        "not-an-object",
        null,
      ],
    };
    const out = shapeCitations(payload);
    expect(out).toHaveLength(1);
    expect(out[0]!.factId).toBe("F1");
  });

  it("returns [] for non-object payloads and non-array brief_facts", () => {
    expect(shapeCitations(null)).toEqual([]);
    expect(shapeCitations("oops")).toEqual([]);
    expect(shapeCitations({ brief_facts: "oops" })).toEqual([]);
  });

  it("omits the date key entirely when the fact has no date", () => {
    const out = shapeCitations({ brief_facts: [{ id: "F1", text: "t", source: "s" }] });
    expect("date" in out[0]!).toBe(false);
  });
});

describe("shapeRefusal", () => {
  it("treats a refusal without missing items as reason-only", () => {
    expect(shapeRefusal({ refusal: { reason: "icp mismatch" } })).toEqual({
      refused: true,
      reason: "icp mismatch",
    });
  });

  it("requires a string reason — malformed refusals are not refusals", () => {
    expect(shapeRefusal({ refusal: { reason: 7 } })).toEqual({ refused: false, reason: null });
    expect(shapeRefusal({ refusal: "nope" })).toEqual({ refused: false, reason: null });
    expect(shapeRefusal(null)).toEqual({ refused: false, reason: null });
  });
});

describe("shapeEvaluatorScores", () => {
  it("returns the real numbers when a payload persists all four scores", () => {
    const payload = {
      evaluator_scores: { pii: 1, hallucination: 0.95, citationCoverage: 0.8, toxicity: 0.99 },
    };
    expect(shapeEvaluatorScores(payload)).toEqual({
      pii: 1,
      hallucination: 0.95,
      citationCoverage: 0.8,
      toxicity: 0.99,
    });
  });

  it("returns null (never zero-fills) when scores are absent or partial", () => {
    expect(shapeEvaluatorScores({})).toBeNull();
    expect(shapeEvaluatorScores(null)).toBeNull();
    expect(shapeEvaluatorScores({ evaluator_scores: { pii: 1 } })).toBeNull();
    expect(
      shapeEvaluatorScores({ evaluator_scores: { pii: "1", hallucination: 1, citationCoverage: 1, toxicity: 1 } }),
    ).toBeNull();
  });
});
