import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { requireClerkAuth } from "./clerk-auth";

function mockReq(headers: Record<string, string>): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function mockRes() {
  const res = { statusCode: 200, body: undefined as unknown } as Response & { body: unknown };
  res.status = vi.fn().mockImplementation((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn().mockImplementation((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

describe("requireClerkAuth", () => {
  beforeEach(() => {
    delete process.env["DEV_TRUST_X_ORG_ID"];
  });

  it("401s (deny-by-default) when there is no Authorization header", async () => {
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();
    await requireClerkAuth()(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("sets orgId/clerkUserId/clerkToken and calls next for a valid token with org_id", async () => {
    const req = mockReq({ authorization: "Bearer abc.def.ghi" });
    const res = mockRes();
    const next = vi.fn();
    await requireClerkAuth({ verify: async () => ({ org_id: "org_x", sub: "user_1" }) })(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.orgId).toBe("org_x");
    expect(req.clerkUserId).toBe("user_1");
    expect(req.clerkToken).toBe("abc.def.ghi");
  });

  it("403s when the token has no org_id claim", async () => {
    const req = mockReq({ authorization: "Bearer abc" });
    const res = mockRes();
    const next = vi.fn();
    await requireClerkAuth({ verify: async () => ({ sub: "user_1" }) })(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("401s when verification throws", async () => {
    const req = mockReq({ authorization: "Bearer bad" });
    const res = mockRes();
    const next = vi.fn();
    await requireClerkAuth({
      verify: async () => {
        throw new Error("bad sig");
      },
    })(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("dev fallback trusts x-org-id when DEV_TRUST_X_ORG_ID=true", async () => {
    process.env["DEV_TRUST_X_ORG_ID"] = "true";
    const req = mockReq({ "x-org-id": "org_dev" });
    const res = mockRes();
    const next = vi.fn();
    await requireClerkAuth()(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.orgId).toBe("org_dev");
  });
});
