import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request } from "express";
import { apex, UpstreamError, type UpstreamCtx } from "./apex-client";

const ctx: UpstreamCtx = {
  req: { orgId: "org_x", clerkToken: "tok_abc" } as Pick<Request, "orgId" | "clerkToken">,
};

describe("apex upstream client", () => {
  beforeEach(() => {
    process.env["API_UPSTREAM_URL"] = "https://up.example.com";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET forwards Bearer + x-org-id to {base}/api{path} and parses JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await apex.get("/leads/people", ctx);
    expect(out).toEqual([{ id: 1 }]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://up.example.com/api/leads/people");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok_abc");
    expect(headers["x-org-id"]).toBe("org_x");
  });

  it("POST serializes the body and sets content-type", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apex.post("/graph-runs", ctx, { icpProfileIds: ["a"] });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ icpProfileIds: ["a"] }));
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("throws UpstreamError carrying status + body on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 404 })));
    await expect(apex.get("/leads/people", ctx)).rejects.toBeInstanceOf(UpstreamError);
  });

  it("throws if API_UPSTREAM_URL is unset", async () => {
    delete process.env["API_UPSTREAM_URL"];
    vi.stubGlobal("fetch", vi.fn());
    await expect(apex.get("/x", ctx)).rejects.toThrow("API_UPSTREAM_URL");
  });
});
