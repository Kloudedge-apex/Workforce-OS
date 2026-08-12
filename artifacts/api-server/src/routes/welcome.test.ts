import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { describe, expect, it, vi } from "vitest";
import {
  createWelcomeRouter,
  isWelcomeStatusPayload,
  type WelcomeUpstreamClient,
} from "./welcome";

const status = {
  organization: { nameSet: true, websiteSet: true, complete: true },
  senderIdentity: {
    senderNameSet: true,
    countrySet: true,
    physicalAddressSet: true,
    complete: true,
  },
  icp: { usable: true, complete: true },
  mailbox: { connected: true, complete: true },
  sendReadiness: {
    liveSendAllowed: false,
    physicalAddressSet: true,
    senderNameSet: true,
    mailboxConnected: true,
    dailyCapRemaining: 20,
  },
  currentStep: "complete",
  complete: true,
  readyForLiveSend: false,
};

async function request(
  client: WelcomeUpstreamClient,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const app = express();
  app.use(express.json());
  app.use(createWelcomeRouter(client));
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(500).json({ error: "test-unhandled" }),
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    const text = await response.text();
    let body: unknown = text;
    if (response.headers.get("content-type")?.includes("application/json")) {
      body = JSON.parse(text);
    }
    return { status: response.status, body };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("welcome router", () => {
  it("proxies the authenticated derived onboarding status without rewriting it", async () => {
    const get = vi.fn(async (_path: string) => status);
    const response = await request({ get }, "/welcome/status");

    expect(response).toEqual({ status: 200, body: status });
    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0]?.[0]).toBe("/orgs/onboarding/status");
  });

  it("does not expose a manual mark-complete mutation", async () => {
    const get = vi.fn(async (_path: string) => status);
    const response = await request(
      { get },
      "/welcome/complete",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );

    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects a malformed upstream status instead of acknowledging completion", async () => {
    const get = vi.fn(async (_path: string) => ({ complete: true }));
    const response = await request({ get }, "/welcome/status");

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: "upstream" });
    expect(isWelcomeStatusPayload({ complete: true })).toBe(false);
  });
});
