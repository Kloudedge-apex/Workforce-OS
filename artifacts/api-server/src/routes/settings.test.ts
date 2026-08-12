import { describe, it, expect } from "vitest";
import {
  buildOrgPatchBody,
  parseSendReadiness,
  shapeOrgSettings,
  upstreamErrorMessage,
  type ApexOrg,
} from "./settings";

describe("shapeOrgSettings", () => {
  const upstream: ApexOrg = {
    id: "org_cuid123",
    name: "Acme Corp",
    slug: "acme",
    website: "https://acme.example",
    physicalAddress: "1 Market St, SF",
    country: "US",
    senderName: "Jane Sender",
    plan: "GROWTH",
  };

  it("maps real Org columns to the OrgSettings contract", () => {
    const out = shapeOrgSettings(upstream);
    expect(out.orgId).toBe("org_cuid123");
    expect(out.orgName).toBe("Acme Corp");
    expect(out.slug).toBe("acme");
    expect(out.website).toBe("https://acme.example");
    expect(out.country).toBe("US");
    expect(out.senderName).toBe("Jane Sender");
    expect(out.postalAddress).toBe("1 Market St, SF");
    expect(out.plan).toBe("GROWTH");
  });

  it("synthesizes fields with no backing Org column", () => {
    const out = shapeOrgSettings(upstream);
    expect(out.logoUrl).toBeNull();
    expect(out.timezone).toBe("UTC");
    expect(out.unsubscribeUrl).toBeNull();
    expect(out.allowlistedDomains).toEqual([]);
    expect(out.creditsRemaining).toBe(0);
    expect(out.welcomeComplete).toBe(false);
    expect(out.suppressionCount).toBe(0);
  });

  it("uses only the caller-supplied derived onboarding verdict", () => {
    expect(shapeOrgSettings(upstream, 0, true).welcomeComplete).toBe(true);
    expect(shapeOrgSettings(upstream, 0, false).welcomeComplete).toBe(false);
  });

  it("treats a missing sendReadiness as unknown → dry-run, never live", () => {
    const out = shapeOrgSettings(upstream); // no sendReadiness on the row
    expect(out.sendReadiness).toBeNull();
    expect(out.liveSendEnabled).toBe(false);
  });

  it("forwards a well-formed sendReadiness and derives liveSendEnabled from it", () => {
    const readiness = {
      liveSendAllowed: true,
      physicalAddressSet: true,
      senderNameSet: true,
      mailboxConnected: true,
      dailyCapRemaining: 37,
    };
    const out = shapeOrgSettings({ ...upstream, sendReadiness: readiness });
    expect(out.sendReadiness).toEqual(readiness);
    expect(out.liveSendEnabled).toBe(true);

    const dry = shapeOrgSettings({
      ...upstream,
      sendReadiness: { ...readiness, liveSendAllowed: false },
    });
    expect(dry.liveSendEnabled).toBe(false);
    expect(dry.sendReadiness?.liveSendAllowed).toBe(false);

    for (const blocked of [
      { physicalAddressSet: false },
      { senderNameSet: false },
      { mailboxConnected: false },
      { dailyCapRemaining: 0 },
      { dailyCapRemaining: null },
    ]) {
      expect(
        shapeOrgSettings({
          ...upstream,
          sendReadiness: { ...readiness, ...blocked },
        }).liveSendEnabled,
      ).toBe(false);
    }
  });

  it("threads a caller-supplied suppression count through", () => {
    expect(shapeOrgSettings(upstream, 7).suppressionCount).toBe(7);
  });

  it("defaults nullable/absent columns safely", () => {
    const bare: ApexOrg = { id: "o1", name: "Bare", slug: "bare" };
    const out = shapeOrgSettings(bare);
    expect(out.country).toBe("");
    expect(out.senderName).toBeNull();
    expect(out.postalAddress).toBeNull();
    expect(out.plan).toBe("TRIAL");
  });
});

describe("parseSendReadiness", () => {
  const full = {
    liveSendAllowed: true,
    physicalAddressSet: true,
    senderNameSet: false,
    mailboxConnected: true,
    dailyCapRemaining: 12,
  };

  it("accepts the exact GL5 contract", () => {
    expect(parseSendReadiness(full)).toEqual(full);
  });

  it("accepts dailyCapRemaining: null and degrades a missing/non-finite cap to null", () => {
    expect(parseSendReadiness({ ...full, dailyCapRemaining: null })?.dailyCapRemaining).toBeNull();
    const { dailyCapRemaining: _omitted, ...withoutCap } = full;
    expect(parseSendReadiness(withoutCap)?.dailyCapRemaining).toBeNull();
    expect(parseSendReadiness({ ...full, dailyCapRemaining: Number.NaN })?.dailyCapRemaining).toBeNull();
    expect(parseSendReadiness({ ...full, dailyCapRemaining: "20" })?.dailyCapRemaining).toBeNull();
  });

  it("returns null (all-unknown) for absent or malformed envelopes — never fabricates", () => {
    expect(parseSendReadiness(undefined)).toBeNull();
    expect(parseSendReadiness(null)).toBeNull();
    expect(parseSendReadiness("live")).toBeNull();
    expect(parseSendReadiness([])).toBeNull();
    expect(parseSendReadiness({})).toBeNull();
    expect(parseSendReadiness({ ...full, liveSendAllowed: "true" })).toBeNull();
    expect(parseSendReadiness({ ...full, mailboxConnected: undefined })).toBeNull();
  });
});

describe("buildOrgPatchBody", () => {
  it("forwards name, website, senderName, country, and physicalAddress to the upstream DTO", () => {
    expect(
      buildOrgPatchBody({
        name: "Acme",
        website: "https://acme.example",
        senderName: "Jane Sender",
        country: "US",
        physicalAddress: "1 Market St, SF",
      }),
    ).toEqual({
      name: "Acme",
      website: "https://acme.example",
      senderName: "Jane Sender",
      country: "US",
      physicalAddress: "1 Market St, SF",
    });
  });

  it("maps the FE field name postalAddress to upstream physicalAddress", () => {
    expect(buildOrgPatchBody({ postalAddress: "1 Market St" })).toEqual({
      physicalAddress: "1 Market St",
    });
    // physicalAddress wins when both spellings are present
    expect(
      buildOrgPatchBody({ physicalAddress: "A", postalAddress: "B" }),
    ).toEqual({ physicalAddress: "A" });
  });

  it("omits fields the upstream DTO does not accept and non-string values", () => {
    expect(
      buildOrgPatchBody({
        slug: "acme",
        timezone: "UTC",
        logoUrl: "x",
        liveSendEnabled: true,
        name: 42,
        country: null,
      }),
    ).toEqual({});
  });

  it("forwards empty strings so a user can clear a field (upstream decides validity)", () => {
    expect(buildOrgPatchBody({ senderName: "" })).toEqual({ senderName: "" });
  });

  it("tolerates non-object bodies", () => {
    expect(buildOrgPatchBody(undefined)).toEqual({});
    expect(buildOrgPatchBody("oops")).toEqual({});
    expect(buildOrgPatchBody(null)).toEqual({});
  });
});

describe("upstreamErrorMessage", () => {
  it("extracts a NestJS string message", () => {
    expect(upstreamErrorMessage({ statusCode: 400, message: "country must be ISO-2" })).toBe(
      "country must be ISO-2",
    );
  });

  it("joins a NestJS class-validator message array", () => {
    expect(
      upstreamErrorMessage({
        statusCode: 400,
        message: ["country must be ISO-2", "senderName must be a string"],
        error: "Bad Request",
      }),
    ).toBe("country must be ISO-2; senderName must be a string");
  });

  it("falls back to the error field, then null — never a fabricated message", () => {
    expect(upstreamErrorMessage({ error: "Bad Request" })).toBe("Bad Request");
    expect(upstreamErrorMessage({})).toBeNull();
    expect(upstreamErrorMessage(null)).toBeNull();
    expect(upstreamErrorMessage("raw text body")).toBeNull();
  });
});
