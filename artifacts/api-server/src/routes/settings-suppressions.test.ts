import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { createSuppressionSettingsRouter } from "./settings";

interface TestClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

async function request(
  client: TestClient,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const app = createApp({
    apiRouter: createSuppressionSettingsRouter(client),
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
      `http://127.0.0.1:${address.port}/api${path}`,
      init,
    );
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function client(): TestClient {
  return { get: vi.fn(), post: vi.fn() };
}

describe("settings suppression registry boundary", () => {
  it("returns an authoritative cursor page without inventing a total", async () => {
    const upstream = client();
    upstream.get.mockResolvedValue({
      rows: [
        {
          id: "sup_1",
          recipientRef: "buyer@example.com",
          reason: "USER_UNSUBSCRIBED",
          source: "list_unsubscribe",
          createdAt: "2026-08-13T12:00:00.000Z",
        },
      ],
      nextCursor: "sup_0",
    });

    const response = await request(
      upstream,
      "/settings/suppressions?limit=25&cursor=sup_2",
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ nextCursor: "sup_0" });
    expect(response.body).not.toHaveProperty("total");
    expect(upstream.get).toHaveBeenCalledWith(
      "/outreach/suppression?limit=25&cursor=sup_2",
      expect.objectContaining({
        req: expect.objectContaining({ orgId: "org_1" }),
      }),
    );
  });

  it("fails closed on an invalid query or malformed upstream page", async () => {
    const invalidQueryClient = client();
    expect(
      await request(invalidQueryClient, "/settings/suppressions?limit=0"),
    ).toMatchObject({ status: 400 });
    expect(invalidQueryClient.get).not.toHaveBeenCalled();

    const malformedClient = client();
    malformedClient.get.mockResolvedValue({ rows: [{}], nextCursor: null });
    expect(
      await request(malformedClient, "/settings/suppressions"),
    ).toMatchObject({ status: 502 });
  });

  it("records a trimmed operator-observed complaint and preserves actor derivation", async () => {
    const upstream = client();
    upstream.post.mockResolvedValue({
      created: true,
      recipientRef: "buyer@example.com",
      reason: "COMPLAINED",
    });

    const response = await request(upstream, "/settings/suppressions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipientRef: "  buyer@example.com  ",
        reason: "COMPLAINED",
      }),
    });

    expect(response.status).toBe(201);
    expect(upstream.post).toHaveBeenCalledWith(
      "/outreach/suppression",
      expect.objectContaining({
        req: expect.objectContaining({
          orgId: "org_1",
          clerkToken: "clerk-token",
        }),
      }),
      { recipientRef: "buyer@example.com", reason: "COMPLAINED" },
    );
  });

  it("defaults an omitted reason to MANUAL as declared by the contract", async () => {
    const upstream = client();
    upstream.post.mockResolvedValue({
      created: true,
      recipientRef: "buyer@example.com",
      reason: "MANUAL",
    });

    const response = await request(upstream, "/settings/suppressions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientRef: "buyer@example.com" }),
    });

    expect(response.status).toBe(201);
    expect(upstream.post).toHaveBeenCalledWith(
      "/outreach/suppression",
      expect.any(Object),
      { recipientRef: "buyer@example.com", reason: "MANUAL" },
    );
  });

  it("allows only operator-manual or operator-observed complaint reasons", async () => {
    const upstream = client();
    const response = await request(upstream, "/settings/suppressions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipientRef: "buyer@example.com",
        reason: "USER_UNSUBSCRIBED",
      }),
    });

    expect(response.status).toBe(400);
    expect(upstream.post).not.toHaveBeenCalled();
  });
});
