import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Router } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { requireClerkAuth } from "./middlewares/clerk-auth";
import {
  createArtifactDecisionRouter,
  type ArtifactDecisionUpstreamClient,
  type UpstreamArtifact,
} from "./routes/artifacts";

describe("production API auth mount", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  it("denies an anonymous decision and forwards the verified principal/token", async () => {
    const artifact: UpstreamArtifact = {
      id: "art_1",
      purpose: "OUTBOUND",
      channel: "EMAIL",
      recipientRef: "buyer@example.com",
      subject: "Hello",
      bodyText: "Body",
      bodyHtml: null,
      payload: {
        to: "buyer@example.com",
        subject: "Hello",
        body: "Body",
        qaIssues: [],
        refusal: null,
        brief_facts: [{ id: "F1", text: "Grounded", source: "crm" }],
        groundedness_self_check: {
          citedFactIds: ["F1"],
          unsupportedClaims: [],
        },
      },
      status: "APPROVED",
      createdAt: "2026-08-13T00:00:00.000Z",
    };
    const post = vi.fn(
      async (..._args: Parameters<ArtifactDecisionUpstreamClient["post"]>) =>
        artifact,
    );
    const apiRouter = Router();
    apiRouter.use(
      createArtifactDecisionRouter({ post } as ArtifactDecisionUpstreamClient),
    );
    const clerkGuard = requireClerkAuth({
      verify: async (token) => {
        if (token !== "verified-token") throw new Error("invalid token");
        return { sub: "user_verified" };
      },
    });
    const app = createApp({ apiRouter, clerkGuard });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/api/artifacts/art_1/approve`;

    const anonymous = await fetch(url, { method: "POST" });
    expect(anonymous.status).toBe(401);
    expect(post).not.toHaveBeenCalled();

    const authenticated = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer verified-token" },
    });
    expect(authenticated.status).toBe(200);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[1].req.clerkToken).toBe("verified-token");
    expect(post.mock.calls[0]?.[2]).toEqual({ reviewedBy: "user_verified" });
  });
});
