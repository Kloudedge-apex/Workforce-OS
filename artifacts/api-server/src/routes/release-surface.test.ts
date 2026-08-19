import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";

const unsupportedRoutes = [
  ["GET", "/settings/cadence"],
  ["PUT", "/settings/cadence"],
  ["GET", "/settings/style"],
  ["PUT", "/settings/style"],
  ["GET", "/settings/team"],
  ["POST", "/settings/team/invite"],
  ["DELETE", "/settings/team/user_1"],
  ["GET", "/settings/billing"],
  ["GET", "/settings/api-keys"],
  ["POST", "/settings/api-keys"],
  ["DELETE", "/settings/api-keys/key_1"],
  ["GET", "/settings/notifications"],
  ["PUT", "/settings/notifications"],
  ["GET", "/notifications"],
  ["POST", "/notifications/mark-read"],
  ["GET", "/graph-runs/run_1/timeline"],
  ["POST", "/leads/person_1/trigger-outbound"],
  ["POST", "/artifacts/bulk-approve"],
  ["GET", "/agents"],
] as const;

describe("sellable release surface", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const app = createApp({
      clerkGuard: (req, _res, next) => {
        req.orgId = "org_release_surface";
        req.clerkUserId = "user_release_surface";
        req.clerkToken = "test-token";
        next();
      },
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it.each(unsupportedRoutes)(
    "does not publish the unsupported %s %s operation",
    async (method, route) => {
      const response = await fetch(`${origin}/api${route}`, { method });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    },
  );

  it("does not advertise unsupported operations in the generated-client source contract", () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");
    const openapi = readFileSync(
      path.join(repositoryRoot, "lib/api-spec/openapi.yaml"),
      "utf8",
    );
    for (const [, route] of unsupportedRoutes) {
      const templated = route
        .replace("/user_1", "/{userId}")
        .replace("/key_1", "/{id}")
        .replace("/run_1", "/{id}")
        .replace("/person_1", "/{id}");
      expect(openapi).not.toContain(`  ${templated}:`);
    }
  });
});
