import { describe, it, expect, vi } from "vitest";
import {
  buildOrgPatchBody,
  fetchOrgCapabilities,
  fetchReviewCapability,
  legacyOrgCapabilities,
  parseOrgCapabilities,
  parseSendReadiness,
  shapeOrgSettings,
  upstreamErrorMessage,
  type ApexOrg,
} from "./settings";
import { UpstreamError } from "../upstream/apex-client";

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

  it("defaults fields with no backing Org column without inventing values", () => {
    const out = shapeOrgSettings(upstream);
    expect(out.logoUrl).toBeNull();
    expect(out.timezone).toBe("UTC");
    expect(out.unsubscribeUrl).toBeNull();
    expect(out.allowlistedDomains).toEqual([]);
    expect(out.creditsRemaining).toBeNull();
    expect(out.welcomeComplete).toBe(false);
    expect(out.canReviewArtifacts).toBeNull();
    expect(out.canManageMailbox).toBeNull();
    expect(out.canManageOrg).toBeNull();
    expect(out.canManageSuppressions).toBeNull();
    expect(out.suppressionCount).toBeNull();
  });

  it("uses only the caller-supplied derived onboarding verdict", () => {
    expect(shapeOrgSettings(upstream, null, true).welcomeComplete).toBe(true);
    expect(shapeOrgSettings(upstream, null, false).welcomeComplete).toBe(false);
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
      countrySet: true,
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
      { countrySet: false },
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

  it("accepts the exact legacy readiness omission using the persisted country", () => {
    const legacyReadiness = {
      liveSendAllowed: true,
      physicalAddressSet: true,
      senderNameSet: true,
      mailboxConnected: true,
      dailyCapRemaining: 37,
    };
    const out = shapeOrgSettings({
      ...upstream,
      sendReadiness: legacyReadiness,
    });
    expect(out.sendReadiness).toEqual({
      ...legacyReadiness,
      countrySet: true,
    });
    expect(out.liveSendEnabled).toBe(true);

    const withoutCountry = shapeOrgSettings({
      ...upstream,
      country: null,
      sendReadiness: legacyReadiness,
    });
    expect(withoutCountry.sendReadiness?.countrySet).toBe(false);
    expect(withoutCountry.sendReadiness?.mailboxConnected).toBe(true);
    expect(withoutCountry.liveSendEnabled).toBe(false);
  });

  it("threads a caller-supplied suppression count through", () => {
    expect(shapeOrgSettings(upstream, 7).suppressionCount).toBe(7);
  });

  it("threads the caller-supplied granular capabilities through", () => {
    const capabilities = {
      canReviewArtifacts: true,
      canManageMailbox: false,
      canManageOrg: true,
      canManageSuppressions: false,
    };
    expect(shapeOrgSettings(upstream, null, false, capabilities)).toMatchObject(
      capabilities,
    );
  });

  it("defaults nullable/absent columns safely", () => {
    const bare: ApexOrg = { id: "o1", name: "Bare", slug: "bare" };
    const out = shapeOrgSettings(bare);
    expect(out.country).toBe("");
    expect(out.senderName).toBeNull();
    expect(out.postalAddress).toBeNull();
    expect(out.plan).toBeNull();
  });
});

describe("parseOrgCapabilities", () => {
  it("preserves every explicit allow and denial in the capability matrix", () => {
    expect(
      parseOrgCapabilities({
        canReviewArtifacts: true,
        canManageMailbox: false,
        canManageOrg: false,
        canManageSuppressions: true,
      }),
    ).toEqual({
      canReviewArtifacts: true,
      canManageMailbox: false,
      canManageOrg: false,
      canManageSuppressions: true,
    });
  });

  it("fails malformed fields closed without discarding valid siblings", () => {
    expect(
      parseOrgCapabilities({
        canReviewArtifacts: "true",
        canManageMailbox: true,
        canManageOrg: undefined,
        canManageSuppressions: 1,
      }),
    ).toEqual({
      canReviewArtifacts: null,
      canManageMailbox: true,
      canManageOrg: null,
      canManageSuppressions: null,
    });
    expect(parseOrgCapabilities(null)).toEqual({
      canReviewArtifacts: null,
      canManageMailbox: null,
      canManageOrg: null,
      canManageSuppressions: null,
    });
  });
});

describe("legacyOrgCapabilities", () => {
  it("mirrors the legacy write guards for personal-session roles", () => {
    expect(legacyOrgCapabilities({ role: "OWNER" }, undefined)).toEqual({
      canReviewArtifacts: true,
      canManageMailbox: true,
      canManageOrg: true,
      canManageSuppressions: true,
    });
    expect(legacyOrgCapabilities({ role: "MANAGER" }, undefined)).toEqual({
      canReviewArtifacts: true,
      canManageMailbox: true,
      canManageOrg: false,
      canManageSuppressions: false,
    });
    expect(legacyOrgCapabilities({ role: "MEMBER" }, undefined)).toEqual({
      canReviewArtifacts: false,
      canManageMailbox: false,
      canManageOrg: false,
      canManageSuppressions: false,
    });
  });

  it("uses the signed Clerk role only as a privilege veto", () => {
    expect(legacyOrgCapabilities({ role: "OWNER" }, "org:manager")).toEqual({
      canReviewArtifacts: true,
      canManageMailbox: true,
      canManageOrg: false,
      canManageSuppressions: false,
    });
    expect(legacyOrgCapabilities({ role: "MEMBER" }, "org:admin")).toEqual({
      canReviewArtifacts: false,
      canManageMailbox: false,
      canManageOrg: false,
      canManageSuppressions: false,
    });
    expect(legacyOrgCapabilities({ role: "OWNER" }, "org:member")).toEqual({
      canReviewArtifacts: false,
      canManageMailbox: false,
      canManageOrg: false,
      canManageSuppressions: false,
    });
  });

  it("keeps malformed legacy role projections unknown", () => {
    expect(legacyOrgCapabilities({ role: "SUPERUSER" }, undefined)).toEqual({
      canReviewArtifacts: null,
      canManageMailbox: null,
      canManageOrg: null,
      canManageSuppressions: null,
    });
  });
});

describe("parseSendReadiness", () => {
  const full = {
    liveSendAllowed: true,
    physicalAddressSet: true,
    senderNameSet: false,
    countrySet: true,
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
    const { countrySet: _countryOmitted, ...withoutCountry } = full;
    expect(parseSendReadiness(withoutCountry)).toBeNull();
    expect(parseSendReadiness({ ...full, liveSendAllowed: "true" })).toBeNull();
    expect(parseSendReadiness({ ...full, mailboxConnected: undefined })).toBeNull();
  });

  it("accepts only the exact legacy countrySet omission when a persisted country is supplied", () => {
    const { countrySet: _countryOmitted, ...legacy } = full;
    expect(parseSendReadiness(legacy, "US")).toEqual(full);
    expect(parseSendReadiness(legacy, null)).toEqual({
      ...full,
      countrySet: false,
    });
    expect(parseSendReadiness({ ...legacy, countrySet: "true" }, "US")).toBeNull();
  });
});

describe("fetchReviewCapability", () => {
  const req = {} as Parameters<typeof fetchReviewCapability>[0];

  it("returns true only for the exact successful capability response", async () => {
    const get = vi.fn(async () => ({ canReviewArtifacts: true }));
    await expect(
      fetchReviewCapability(req, { get }),
    ).resolves.toBe(true);
    expect(get).toHaveBeenCalledWith(
      "/outreach-artifacts/review-capability",
      { req },
    );

    for (const malformed of [
      { canReviewArtifacts: false },
      { canReviewArtifacts: "true" },
      {},
      null,
    ]) {
      await expect(
        fetchReviewCapability(req, { get: async () => malformed }),
      ).resolves.toBeNull();
    }
  });

  it("maps a backend guard denial to a known read-only capability", async () => {
    await expect(
      fetchReviewCapability(req, {
        get: async () => {
          throw new UpstreamError(403, { message: "Forbidden" });
        },
      }),
    ).resolves.toBe(false);
  });

  it("propagates 401 but degrades 404, other statuses, and transport errors to unknown", async () => {
    const unauthorized = new UpstreamError(401, { message: "Unauthorized" });
    await expect(
      fetchReviewCapability(req, { get: async () => Promise.reject(unauthorized) }),
    ).rejects.toBe(unauthorized);

    for (const err of [new UpstreamError(404, {}), new UpstreamError(503, {}), new Error("down")]) {
      await expect(
        fetchReviewCapability(req, { get: async () => Promise.reject(err) }),
      ).resolves.toBeNull();
    }
  });
});

describe("fetchOrgCapabilities", () => {
  const req = {} as Parameters<typeof fetchOrgCapabilities>[0];

  it("uses the granular endpoint and does not probe the legacy route when review is explicit", async () => {
    const response = {
      canReviewArtifacts: false,
      canManageMailbox: true,
      canManageOrg: false,
      canManageSuppressions: true,
    };
    const get = vi.fn(async () => response);
    await expect(fetchOrgCapabilities(req, { get })).resolves.toEqual(response);
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith("/orgs/me/capabilities", { req });
  });

  it("derives legacy management capabilities from the authenticated user role", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "/orgs/me/capabilities") {
        throw new UpstreamError(404, { message: "Not found" });
      }
      if (path === "/auth/me") return { role: "OWNER" };
      throw new Error(`unexpected path ${path}`);
    });
    await expect(fetchOrgCapabilities(req, { get })).resolves.toEqual({
      canReviewArtifacts: true,
      canManageMailbox: true,
      canManageOrg: true,
      canManageSuppressions: true,
    });
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/orgs/me/capabilities",
      "/auth/me",
    ]);
  });

  it("applies a signed role veto to the legacy authenticated user role", async () => {
    const signedReq = { clerkOrgRole: "org:manager" } as Parameters<
      typeof fetchOrgCapabilities
    >[0];
    const get = vi.fn(async (path: string) => {
      if (path === "/orgs/me/capabilities") {
        throw new UpstreamError(404, { message: "Not found" });
      }
      if (path === "/auth/me") return { role: "OWNER" };
      throw new Error(`unexpected path ${path}`);
    });
    await expect(fetchOrgCapabilities(signedReq, { get })).resolves.toEqual({
      canReviewArtifacts: true,
      canManageMailbox: true,
      canManageOrg: false,
      canManageSuppressions: false,
    });
  });

  it("uses the legacy review probe only when both capability projections are unavailable", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "/orgs/me/capabilities" || path === "/auth/me") {
        throw new UpstreamError(404, { message: "Not found" });
      }
      return { canReviewArtifacts: true };
    });
    await expect(fetchOrgCapabilities(req, { get })).resolves.toEqual({
      canReviewArtifacts: true,
      canManageMailbox: null,
      canManageOrg: null,
      canManageSuppressions: null,
    });
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/orgs/me/capabilities",
      "/auth/me",
      "/outreach-artifacts/review-capability",
    ]);
  });

  it("keeps management unknown and preserves a legacy role denial", async () => {
    const get = vi.fn(async (path: string) => {
      if (path === "/orgs/me/capabilities") return { canManageOrg: true };
      throw new UpstreamError(403, { message: "Forbidden" });
    });
    await expect(fetchOrgCapabilities(req, { get })).resolves.toEqual({
      canReviewArtifacts: false,
      canManageMailbox: null,
      canManageOrg: true,
      canManageSuppressions: null,
    });
  });

  it("propagates authentication failure from the granular endpoint", async () => {
    const unauthorized = new UpstreamError(401, { message: "Unauthorized" });
    await expect(
      fetchOrgCapabilities(req, {
        get: async () => Promise.reject(unauthorized),
      }),
    ).rejects.toBe(unauthorized);
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
