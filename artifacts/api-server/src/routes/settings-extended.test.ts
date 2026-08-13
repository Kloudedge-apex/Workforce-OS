import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, it, expect, vi } from "vitest";
import { createApp } from "../app";
import {
  createGmailFinalizeRouter,
  parseGmailFinalizeInput,
  shapeIcpProfile,
  toIcpCreateBody,
  shapeIntegration,
  shapeIntegrations,
  shapeAuthUrl,
  shapeTeamMembers,
  shapeBilling,
  type ApexIcpProfile,
  type ApexIntegration,
  type ApexCatalogEntry,
  type ApexUser,
} from "./settings-extended";

async function requestGmailFinalize(
  post: (...args: any[]) => Promise<unknown>,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const app = createApp({
    apiRouter: createGmailFinalizeRouter({ post }),
    clerkGuard: (req, _res, next) => {
      req.orgId = "org_1";
      req.clerkToken = "clerk-token";
      next();
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/settings/integrations/gmail/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("shapeIcpProfile", () => {
  it("maps the most-recent profile and renames fields", () => {
    const profiles: ApexIcpProfile[] = [
      {
        id: "icp_new",
        name: "Latest",
        targetIndustries: ["SaaS"],
        targetTitles: ["CEO", "Founder"],
        targetGeos: ["US", "India"],
        techStackSignals: ["Salesforce"],
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
    expect(out.techStackSignals).toEqual(["Salesforce"]);
    expect(out.intentSignals).toEqual(["hiring_spike"]);
    expect(out.seedDomains).toEqual(["acme.com"]);
    expect(out.sizeBand).toBe("200-2000");
    expect(out.exclusionDomains).toEqual([]); // row carries none → honest empty
  });

  it("derives sizeBand variants and defaults empty list", () => {
    expect(shapeIcpProfile([{ id: "a", minEmployees: 50 }]).sizeBand).toBe("50+");
    expect(shapeIcpProfile([{ id: "a", maxEmployees: 50 }]).sizeBand).toBe("0-50");
    expect(shapeIcpProfile([{ id: "a" }]).sizeBand).toBe("");
    const empty = shapeIcpProfile([]);
    expect(empty.industries).toEqual([]);
    expect(empty.sizeBand).toBe("");
    expect(empty.techStackSignals).toEqual([]);
    expect(empty.exclusionDomains).toEqual([]);
  });

  it("maps exclusionDomains from the row when the backend persists them", () => {
    expect(
      shapeIcpProfile([{ id: "a", exclusionDomains: ["competitor.com"] }]).exclusionDomains,
    ).toEqual(["competitor.com"]);
    // tolerate a malformed value from an older/odd backend
    expect(
      shapeIcpProfile([{ id: "a", exclusionDomains: "competitor.com" as unknown as string[] }])
        .exclusionDomains,
    ).toEqual([]);
  });
});
describe("toIcpCreateBody", () => {
  it("renames FE fields and parses sizeBand into employee bounds", () => {
    const body = toIcpCreateBody({
      industries: ["SaaS"],
      titles: ["CEO"],
      geos: ["US"],
      intentSignals: ["funding"],
      techStackSignals: ["HubSpot"],
      seedDomains: ["a.com"],
      sizeBand: "11-50",
    });
    expect(body.name).toBe("Default ICP");
    expect(body.targetIndustries).toEqual(["SaaS"]);
    expect(body.targetTitles).toEqual(["CEO"]);
    expect(body.targetGeos).toEqual(["US"]);
    expect(body.intentKeywords).toEqual(["funding"]);
    expect(body.techStackSignals).toEqual(["HubSpot"]);
    expect(body.seedDomains).toEqual(["a.com"]);
    expect(body.minEmployees).toBe(11);
    expect(body.maxEmployees).toBe(50);
  });

  it("clears employee bounds when sizeBand is absent", () => {
    const body = toIcpCreateBody({});
    expect(body.minEmployees).toBeNull();
    expect(body.maxEmployees).toBeNull();
    expect(body.targetTitles).toEqual([]);
  });

  it("rejects malformed or descending company-size bands", () => {
    expect(() => toIcpCreateBody({ sizeBand: "about fifty" })).toThrow(
      'Company size must look like "50-500" or "1000+".',
    );
    expect(() => toIcpCreateBody({ sizeBand: "500-50" })).toThrow(
      "Company size minimum must not exceed the maximum.",
    );
  });

  it("does not forward the unsupported exclusionDomains field", () => {
    expect(
      "exclusionDomains" in
        toIcpCreateBody({ exclusionDomains: ["competitor.com", "spam.io"] }),
    ).toBe(false);
  });

  it("parses an open-ended size band", () => {
    const body = toIcpCreateBody({ sizeBand: "1000+" });
    expect(body.minEmployees).toBe(1000);
    expect(body.maxEmployees).toBeNull();
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
    { provider: "apollo", name: "Apollo", category: "enrichment", authType: "api_key", status: "coming_soon" },
  ];

  it("left-joins only providers explicitly available in this release", () => {
    const rows: ApexIntegration[] = [{ id: "int_g", provider: "gmail", status: "CONNECTED" }];
    const out = shapeIntegrations(rows, catalog);
    expect(out).toHaveLength(1);
    const gmail = out.find((i) => i.provider === "gmail")!;
    expect(gmail.status).toBe("connected");
    expect(gmail.id).toBe("int_g");
    expect(out.find((i) => i.provider === "apollo")).toBeUndefined();
  });

  it("does not surface a legacy row for an unsupported provider", () => {
    const rows: ApexIntegration[] = [{ id: "int_z", provider: "zoho", status: "CONNECTED" }];
    const out = shapeIntegrations(rows, catalog);
    expect(out.find((i) => i.provider === "zoho")).toBeUndefined();
    expect(out).toHaveLength(1);
  });

  it("filters coming-soon catalog entries when there are no connected rows", () => {
    const out = shapeIntegrations([], catalog);
    expect(out).toHaveLength(1);
    expect(out[0]?.provider).toBe("gmail");
    expect(out.every((i) => i.status === "available")).toBe(true);
  });
});

describe("shapeAuthUrl", () => {
  it("extracts a well-formed { authUrl } payload", () => {
    expect(shapeAuthUrl({ authUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=1" })).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    );
    expect(shapeAuthUrl({ authUrl: "  https://accounts.google.com/o/oauth2/auth " })).toBe(
      "https://accounts.google.com/o/oauth2/auth",
    );
  });

  it("returns null for missing/garbage payloads — the route must 502, not fake a URL", () => {
    expect(shapeAuthUrl(undefined)).toBeNull();
    expect(shapeAuthUrl(null)).toBeNull();
    expect(shapeAuthUrl({})).toBeNull();
    expect(shapeAuthUrl({ authUrl: "" })).toBeNull();
    expect(shapeAuthUrl({ authUrl: 42 })).toBeNull();
    expect(shapeAuthUrl({ authUrl: "javascript:alert(1)" })).toBeNull();
    expect(shapeAuthUrl({ authUrl: "http://accounts.google.com/o/oauth2/v2/auth" })).toBeNull();
    expect(shapeAuthUrl({ authUrl: "https://a.example/path" })).toBeNull();
    expect(shapeAuthUrl({ authUrl: "https://accounts.google.com.evil.example/path" })).toBeNull();
    expect(shapeAuthUrl({ authUrl: "https://accounts.google.com:8443/path" })).toBeNull();
    expect(shapeAuthUrl({ authUrl: "not-a-url" })).toBeNull();
    expect(shapeAuthUrl("https://raw-string.example")).toBeNull();
  });
});

describe("Gmail OAuth finalization", () => {
  it("accepts only a non-empty opaque attempt ID", () => {
    expect(parseGmailFinalizeInput({ attemptId: " attempt_123 " })).toEqual({
      attemptId: "attempt_123",
    });
    expect(parseGmailFinalizeInput({})).toBeNull();
    expect(parseGmailFinalizeInput({ attemptId: " " })).toBeNull();
    expect(parseGmailFinalizeInput({ attemptId: 42 })).toBeNull();
    expect(parseGmailFinalizeInput(null)).toBeNull();
  });

  it("forwards the authenticated attempt and returns a public integration", async () => {
    const post = vi.fn(async (..._args: any[]) => ({
      id: "int_gmail",
      provider: "gmail",
      status: "CONNECTED",
      createdAt: "2026-08-13T00:00:00.000Z",
      credentialsEncrypted: "must-not-leak",
    }));
    const response = await requestGmailFinalize(post, {
      attemptId: "attempt_123",
    });

    expect(response).toEqual({
      status: 200,
      body: {
        id: "int_gmail",
        provider: "gmail",
        status: "connected",
        accountEmail: null,
        connectedAt: "2026-08-13T00:00:00.000Z",
        errorMessage: null,
      },
    });
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[0]).toBe("/integrations/gmail/finalize");
    expect(post.mock.calls[0]?.[1].req).toMatchObject({
      orgId: "org_1",
      clerkToken: "clerk-token",
    });
    expect(post.mock.calls[0]?.[2]).toEqual({ attemptId: "attempt_123" });
  });

  it("rejects a missing attempt before calling upstream", async () => {
    const post = vi.fn(async () => ({}));
    const response = await requestGmailFinalize(post, {});
    expect(response).toEqual({
      status: 400,
      body: {
        error: "validation",
        message: "A Gmail OAuth attempt ID is required.",
      },
    });
    expect(post).not.toHaveBeenCalled();
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
  it("maps the real plan and seat count without fabricating accounting data", () => {
    const out = shapeBilling({ plan: "GROWTH" }, 4);
    expect(out.plan).toBe("GROWTH");
    expect(out.seats).toBe(4);
    expect(out.creditsTotal).toBeNull();
    expect(out.creditsRemaining).toBeNull();
    expect(out.sendsLimit).toBeNull();
    expect(out.seatsLimit).toBeNull();
    expect(out.sendsThisMonth).toBeNull();
    expect(out.invoices).toBeNull();
  });

  it("preserves an upstream plan value exactly and refuses synthesized sources", () => {
    expect(shapeBilling({ plan: "MYSTERY" }, 0).plan).toBe("MYSTERY");
    expect(() => shapeBilling({} as { plan: string }, 1)).toThrow(
      "Billing plan is missing",
    );
    expect(() => shapeBilling({ plan: "GROWTH" }, -1)).toThrow("Seat count is invalid");
  });
});
