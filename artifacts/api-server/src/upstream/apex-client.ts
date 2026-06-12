import type { Request } from "express";

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
  req: Pick<Request, "orgId" | "clerkToken">;
}

function baseUrl(): string {
  const url = process.env["API_UPSTREAM_URL"];
  if (!url) throw new Error("API_UPSTREAM_URL is not set");
  return url.replace(/\/+$/, "");
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
