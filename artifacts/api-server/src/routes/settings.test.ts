import { describe, it, expect } from "vitest";
import { shapeOrgSettings, type ApexOrg } from "./settings";

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
    expect(out.country).toBe("US");
    expect(out.senderName).toBe("Jane Sender");
    expect(out.postalAddress).toBe("1 Market St, SF");
    expect(out.plan).toBe("GROWTH");
  });

  it("synthesizes fields with no backing Org column", () => {
    const out = shapeOrgSettings(upstream);
    expect(out.logoUrl).toBeNull();
    expect(out.timezone).toBe("UTC");
    expect(out.liveSendEnabled).toBe(false);
    expect(out.unsubscribeUrl).toBeNull();
    expect(out.allowlistedDomains).toEqual([]);
    expect(out.creditsRemaining).toBe(0);
    expect(out.welcomeComplete).toBe(true);
    expect(out.suppressionCount).toBe(0);
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
