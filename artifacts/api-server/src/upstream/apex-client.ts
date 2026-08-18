import { createHash } from "node:crypto";
import type { Request } from "express";

declare const __REVIEWED_API_UPSTREAM_SHA256__: string | undefined;

/** Thrown on a non-2xx response from apex-gtm-api. */
export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`apex-gtm-api responded ${status}`);
    this.name = "UpstreamError";
  }
}

/** The request fields the client needs to forward the caller's identity. */
export interface UpstreamCtx {
  req: Pick<Request, "orgId" | "clerkToken" | "clerkUserId">;
}

function reviewedUpstreamSha256(): string | null {
  const buildPin =
    typeof __REVIEWED_API_UPSTREAM_SHA256__ === "string"
      ? __REVIEWED_API_UPSTREAM_SHA256__
      : undefined;
  // The environment fallback exists for source-level tests and local builds.
  // A production bundle always carries the source-controlled buildPin, so a
  // runtime configuration writer cannot replace the reviewed destination.
  const candidate = buildPin ?? process.env["API_UPSTREAM_URL_SHA256"];
  if (!candidate || candidate === "UNCONFIGURED") return null;
  if (!/^[0-9a-f]{64}$/u.test(candidate)) {
    throw new Error(
      "The reviewed API_UPSTREAM_URL SHA-256 must be 64 lowercase hex characters",
    );
  }
  return candidate;
}

/**
 * Fail before forwarding identity when the upstream is not one HTTPS origin or
 * differs from the source-reviewed production destination.
 */
export function validateApexUpstreamConfig(
  raw = process.env["API_UPSTREAM_URL"],
): string {
  if (!raw) throw new Error("API_UPSTREAM_URL is not set");
  if (raw !== raw.trim()) {
    throw new Error("API_UPSTREAM_URL must not contain surrounding whitespace");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("API_UPSTREAM_URL must be a valid HTTPS origin");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      "API_UPSTREAM_URL must be an HTTPS origin without credentials, path, query, or fragment",
    );
  }

  const reviewedSha256 = reviewedUpstreamSha256();
  if (reviewedSha256) {
    const actualSha256 = createHash("sha256").update(raw).digest("hex");
    if (actualSha256 !== reviewedSha256) {
      throw new Error(
        "API_UPSTREAM_URL does not match the source-reviewed production origin",
      );
    }
  }

  return parsed.origin;
}

function baseUrl(): string {
  return validateApexUpstreamConfig();
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function call(
  method: string,
  path: string,
  { req }: UpstreamCtx,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (req.clerkToken) headers["authorization"] = `Bearer ${req.clerkToken}`;
  if (req.orgId) headers["x-org-id"] = req.orgId;
  if (req.clerkUserId) headers["x-clerk-user-id"] = req.clerkUserId;
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${baseUrl()}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const parsed = text ? safeJson(text) : undefined;
  if (!res.ok) throw new UpstreamError(res.status, parsed);
  return parsed;
}

/**
 * Server-side client for apex-gtm-api. Every call forwards the caller's Clerk
 * Bearer token + `x-org-id` (so apex-gtm-api's OrgScopeGuard authorizes it) and
 * prefixes the upstream global `/api` path.
 */
export const apex = {
  get: (path: string, ctx: UpstreamCtx) => call("GET", path, ctx),
  post: (path: string, ctx: UpstreamCtx, body?: unknown) => call("POST", path, ctx, body),
  patch: (path: string, ctx: UpstreamCtx, body?: unknown) => call("PATCH", path, ctx, body),
  delete: (path: string, ctx: UpstreamCtx) => call("DELETE", path, ctx),
};
