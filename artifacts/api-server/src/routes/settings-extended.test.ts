import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, it, expect, vi } from "vitest";
import { createApp } from "../app";
import {
  createGmailAuthorizationRouter,
  createGmailDisconnectRouter,
  createGmailFinalizeRouter,
  createGmailVerificationRouter,
  parseGmailFinalizeInput,
  shapeIcpProfile,
  toIcpCreateBody,
  shapeIntegration,
  shapeIntegrations,
  shapeAuthUrl,
  shapeGmailMailboxVerification,
  type ApexIcpProfile,
  type ApexIntegration,
  type ApexCatalogEntry,
} from "./settings-extended";

async function requestGmailAuthorization(
  get: (...args: any[]) => Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const app = createApp({
    apiRouter: createGmailAuthorizationRouter({ get }),
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
      `http://127.0.0.1:${address.port}/api/settings/integrations/gmail/auth-url`,
    );
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function requestGmailDisconnect(
  post: (...args: any[]) => Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const app = createApp({
    apiRouter: createGmailDisconnectRouter({ post }),
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
      `http://127.0.0.1:${address.port}/api/settings/integrations/gmail/disconnect`,
      { method: "POST" },
    );
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

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

async function requestGmailVerification(
  client: {
    get: (...args: any[]) => Promise<unknown>;
    post: (...args: any[]) => Promise<unknown>;
  },
): Promise<{ status: number; body: unknown }> {
  const app = createApp({
    apiRouter: createGmailVerificationRouter(client),
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
      `http://127.0.0.1:${address.port}/api/settings/integrations/gmail/verify`,
      { method: "POST" },
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
        exclusionDomains: ["competitor.com"],
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
    expect(out.exclusionDomains).toEqual(["competitor.com"]);
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
      exclusionDomains: ["competitor.com", "partner.example"],
      sizeBand: "11-50",
    });
    expect(body.name).toBe("Default ICP");
    expect(body.targetIndustries).toEqual(["SaaS"]);
    expect(body.targetTitles).toEqual(["CEO"]);
    expect(body.targetGeos).toEqual(["US"]);
    expect(body.intentKeywords).toEqual(["funding"]);
    expect(body.techStackSignals).toEqual(["HubSpot"]);
    expect(body.seedDomains).toEqual(["a.com"]);
    expect(body.exclusionDomains).toEqual([
      "competitor.com",
      "partner.example",
    ]);
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

  it("forwards explicit domain exclusions to the current-profile upsert", () => {
    expect(
      toIcpCreateBody({
        exclusionDomains: ["competitor.com", "spam.io"],
      }).exclusionDomains,
    ).toEqual(["competitor.com", "spam.io"]);
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

  it("maps ERROR to errored and PENDING/REVOKED to available", () => {
    expect(shapeIntegration({ id: "a", provider: "x", status: "ERROR", lastErrorMessage: "boom" }).status).toBe("errored");
    expect(shapeIntegration({ id: "a", provider: "x", status: "REVOKED" }).status).toBe("available");
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

describe("Gmail authorization route", () => {
  it("forwards the authenticated request and returns only the trusted URL", async () => {
    const get = vi.fn(async (..._args: any[]) => ({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
    }));

    const response = await requestGmailAuthorization(get);

    expect(response).toEqual({
      status: 200,
      body: {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
      },
    });
    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0]?.[0]).toBe("/integrations/gmail/auth-url");
    expect(get.mock.calls[0]?.[1].req).toMatchObject({
      orgId: "org_1",
      clerkToken: "clerk-token",
    });
  });

  it("fails closed when the backend returns an untrusted URL", async () => {
    const response = await requestGmailAuthorization(
      vi.fn(async () => ({ authUrl: "https://example.com/not-google" })),
    );
    expect(response).toEqual({
      status: 502,
      body: {
        error: "upstream",
        message: "The backend did not return a Gmail authorization URL.",
      },
    });
  });
});

describe("Gmail disconnect route", () => {
  it("uses the exact Gmail upstream path and returns a disconnected public row", async () => {
    const post = vi.fn(async (..._args: any[]) => ({
      id: "int_gmail",
      provider: "gmail",
      status: "REVOKED",
      createdAt: "2026-08-13T00:00:00.000Z",
    }));

    const response = await requestGmailDisconnect(post);

    expect(response).toEqual({
      status: 200,
      body: {
        id: "int_gmail",
        provider: "gmail",
        status: "available",
        accountEmail: null,
        connectedAt: null,
        errorMessage: null,
      },
    });
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[0]).toBe("/integrations/gmail/disconnect");
    expect(post.mock.calls[0]?.[1].req).toMatchObject({
      orgId: "org_1",
      clerkToken: "clerk-token",
    });
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

describe("Gmail mailbox verification", () => {
  it("accepts only an active users.watch proof and returns no history cursor", () => {
    const now = Date.UTC(2026, 7, 17);
    const expiration = String(now + 7 * 24 * 60 * 60 * 1000);
    expect(
      shapeGmailMailboxVerification(
        { ok: true, historyId: "123456", expiration },
        now,
      ),
    ).toEqual({
      verified: true,
      watchExpiresAt: new Date(Number(expiration)).toISOString(),
    });
    expect(shapeGmailMailboxVerification({ ok: true }, now)).toBeNull();
    expect(
      shapeGmailMailboxVerification(
        { ok: true, historyId: "history-1", expiration },
        now,
      ),
    ).toBeNull();
    expect(
      shapeGmailMailboxVerification(
        { ok: true, historyId: "123456", expiration: String(now) },
        now,
      ),
    ).toBeNull();
  });

  it("uses the legacy role projection before registering the watch", async () => {
    const expiration = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const get = vi.fn(async (path: string) => {
      if (path === "/orgs/me/capabilities") throw new Error("legacy route missing");
      if (path === "/auth/me") return { role: "ADMIN" };
      throw new Error(`unexpected GET ${path}`);
    });
    const post = vi.fn(async (..._args: any[]) => ({ ok: true, historyId: "123456", expiration }));

    const response = await requestGmailVerification({ get, post });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      verified: true,
      watchExpiresAt: new Date(Number(expiration)).toISOString(),
    });
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[0]).toBe("/integrations/gmail/watch");
    expect(post.mock.calls[0]?.[1].req).toMatchObject({
      orgId: "org_1",
      clerkToken: "clerk-token",
    });
  });

  it("rejects a known role denial before calling Gmail", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "/orgs/me/capabilities") throw new Error("legacy route missing");
      if (path === "/auth/me") return { role: "MEMBER" };
      throw new Error(`unexpected GET ${path}`);
    });
    const post = vi.fn(async () => ({}));

    const response = await requestGmailVerification({ get, post });

    expect(response).toEqual({
      status: 403,
      body: {
        error: "forbidden",
        message: "Gmail verification requires an administrator or manager.",
      },
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("fails closed when the backend returns only ok=true", async () => {
    const get = vi.fn(async () => ({ canManageMailbox: true }));
    const post = vi.fn(async () => ({ ok: true }));

    const response = await requestGmailVerification({ get, post });

    expect(response).toEqual({
      status: 502,
      body: {
        error: "upstream",
        message: "Google authorization exists, but the backend could not prove an active Gmail reply watch.",
      },
    });
  });
});
