import { describe, it, expect } from "vitest";
import {
  shapeIcpProfile,
  toIcpCreateBody,
  shapeIntegration,
  shapeIntegrations,
  shapeTeamMembers,
  shapeBilling,
  type ApexIcpProfile,
  type ApexIntegration,
  type ApexCatalogEntry,
  type ApexUser,
} from "./settings-extended";

describe("shapeIcpProfile", () => {
  it("maps the most-recent profile and renames fields", () => {
    const profiles: ApexIcpProfile[] = [
      {
        id: "icp_new",
        name: "Latest",
        targetIndustries: ["SaaS"],
        targetTitles: ["CEO", "Founder"],
        targetGeos: ["US", "India"],
        intentKeywords: ["hiring_spike"],
        seedDomains: ["acme.com"],
        minEmployees: 200,
        maxEmployees: 2000,
      },
      { id: "icp_old", name: "Older" },
    ];
    const out = shapeIcpProfile(profiles);
    expect(out.industries).toEqual(["SaaS"]);
    expect(out.titles).toEqual(["CEO", "Founder"]);
    expect(out.geos).toEqual(["US", "India"]);
    expect(out.intentSignals).toEqual(["hiring_spike"]);
    expect(out.seedDomains).toEqual(["acme.com"]);
    expect(out.sizeBand).toBe("200-2000");
    expect(out.exclusionDomains).toEqual([]); // synthesized
  });

  it("derives sizeBand variants and defaults empty list", () => {
    expect(shapeIcpProfile([{ id: "a", minEmployees: 50 }]).sizeBand).toBe("50+");
    expect(shapeIcpProfile([{ id: "a", maxEmployees: 50 }]).sizeBand).toBe("0-50");
    expect(shapeIcpProfile([{ id: "a" }]).sizeBand).toBe("");
    const empty = shapeIcpProfile([]);
    expect(empty.industries).toEqual([]);
    expect(empty.sizeBand).toBe("");
    expect(empty.exclusionDomains).toEqual([]);
  });
});

describe("toIcpCreateBody", () => {
  it("renames FE fields and parses sizeBand into employee bounds", () => {
    const body = toIcpCreateBody({
      industries: ["SaaS"],
      titles: ["CEO"],
      geos: ["US"],
      intentSignals: ["funding"],
      seedDomains: ["a.com"],
      sizeBand: "11-50",
    });
    expect(body.name).toBe("Default ICP");
    expect(body.targetIndustries).toEqual(["SaaS"]);
    expect(body.targetTitles).toEqual(["CEO"]);
    expect(body.targetGeos).toEqual(["US"]);
    expect(body.intentKeywords).toEqual(["funding"]);
    expect(body.seedDomains).toEqual(["a.com"]);
    expect(body.minEmployees).toBe(11);
    expect(body.maxEmployees).toBe(50);
  });

  it("omits employee bounds when sizeBand is unparseable/absent", () => {
    const body = toIcpCreateBody({});
    expect(body.minEmployees).toBeUndefined();
    expect(body.maxEmployees).toBeUndefined();
    expect(body.targetTitles).toEqual([]);
  });

  it("parses an open-ended size band", () => {
    const body = toIcpCreateBody({ sizeBand: "1000+" });
    expect(body.minEmployees).toBe(1000);
    expect(body.maxEmployees).toBeUndefined();
  });
});

describe("shapeIntegration", () => {
  it("maps enum status and never exposes credentials", () => {
    const row: ApexIntegration = {
      id: "int_1",
      provider: "gmail",
      status: "CONNECTED",
      lastSyncAt: "2026-06-01T00:00:00.000Z",
      lastErrorMessage: null,
      createdAt: "2026-05-01T00:00:00.000Z",
    };
    const out = shapeIntegration(row);
    expect(out).toEqual({
      id: "int_1",
      provider: "gmail",
      status: "connected",
      accountEmail: null,
      connectedAt: "2026-06-01T00:00:00.000Z",
      errorMessage: null,
    });
  });

  it("maps ERROR/REVOKED to errored and PENDING to available", () => {
    expect(shapeIntegration({ id: "a", provider: "x", status: "ERROR", lastErrorMessage: "boom" }).status).toBe("errored");
    expect(shapeIntegration({ id: "a", provider: "x", status: "REVOKED" }).status).toBe("errored");
    expect(shapeIntegration({ id: "a", provider: "x", status: "PENDING" }).status).toBe("available");
    expect(shapeIntegration({ id: "a", provider: "x", status: "ERROR", lastErrorMessage: "boom" }).errorMessage).toBe("boom");
  });

  it("falls back to createdAt when lastSyncAt is missing", () => {
    expect(
      shapeIntegration({ id: "a", provider: "x", status: "CONNECTED", createdAt: "2026-01-01T00:00:00.000Z" }).connectedAt,
    ).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("shapeIntegrations", () => {
  const catalog: ApexCatalogEntry[] = [
    { provider: "gmail", name: "Gmail", category: "email", authType: "oauth", status: "available" },
    { provider: "apollo", name: "Apollo", category: "enrichment", authType: "api_key", status: "available" },
  ];

  it("left-joins catalog so unconnected providers appear as available", () => {
    const rows: ApexIntegration[] = [{ id: "int_g", provider: "gmail", status: "CONNECTED" }];
    const out = shapeIntegrations(rows, catalog);
    expect(out).toHaveLength(2);
    const gmail = out.find((i) => i.provider === "gmail")!;
    const apollo = out.find((i) => i.provider === "apollo")!;
    expect(gmail.status).toBe("connected");
    expect(gmail.id).toBe("int_g");
    expect(apollo.status).toBe("available");
    expect(apollo.id).toBe("cat_apollo");
  });

  it("surfaces connected rows whose provider is not in the catalog", () => {
    const rows: ApexIntegration[] = [{ id: "int_z", provider: "zoho", status: "CONNECTED" }];
    const out = shapeIntegrations(rows, catalog);
    expect(out.find((i) => i.provider === "zoho")?.id).toBe("int_z");
    expect(out).toHaveLength(3);
  });

  it("returns only catalog entries when there are no connected rows", () => {
    const out = shapeIntegrations([], catalog);
    expect(out.every((i) => i.status === "available")).toBe(true);
  });
});

describe("shapeTeamMembers", () => {
  it("maps User rows and synthesizes status/timestamps", () => {
    const users: ApexUser[] = [
      { id: "u1", email: "owner@acme.com", name: "Owner", role: "OWNER", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "u2", email: "m@acme.com", name: null, role: "MEMBER", createdAt: "2026-02-01T00:00:00.000Z" },
    ];
    const out = shapeTeamMembers(users);
    expect(out[0]).toEqual({
      id: "u1",
      email: "owner@acme.com",
      name: "Owner",
      role: "OWNER",
      status: "active",
      invitedAt: "2026-01-01T00:00:00.000Z",
      joinedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(out[1]?.name).toBe("");
    expect(out[1]?.role).toBe("MEMBER");
  });

  it("coerces an unknown role to MEMBER", () => {
    expect(shapeTeamMembers([{ id: "u", email: "e", role: "SUPERADMIN" }])[0]?.role).toBe("MEMBER");
  });
});

describe("shapeBilling", () => {
  it("maps real plan and synthesizes limits from the plan table", () => {
    const out = shapeBilling({ plan: "GROWTH" }, 4);
    expect(out.plan).toBe("GROWTH");
    expect(out.creditsTotal).toBe(5000);
    expect(out.creditsRemaining).toBe(5000);
    expect(out.sendsLimit).toBe(5000);
    expect(out.seatsLimit).toBe(20);
    expect(out.seats).toBe(4);
    expect(out.sendsThisMonth).toBe(0);
    expect(out.invoices).toEqual([]);
  });

  it("defaults unknown/absent plan to TRIAL limits", () => {
    const out = shapeBilling({}, 1);
    expect(out.plan).toBe("TRIAL");
    expect(out.seatsLimit).toBe(3);
    expect(shapeBilling({ plan: "MYSTERY" }, 0).seatsLimit).toBe(3);
  });
});
