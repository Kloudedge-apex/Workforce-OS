import type { Request, Response, NextFunction } from "express";
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from "jose";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      orgId?: string;
      clerkUserId?: string;
      /** Verified Clerk organization role, used only as a privilege veto. */
      clerkOrgRole?: string;
      /** Raw bearer token, forwarded upstream to apex-gtm-api. */
      clerkToken?: string;
    }
  }
}

interface ClerkVerificationConfig {
  jwksUrl: string;
  issuer: string;
  audiences: string[];
  authorizedParties: string[];
}

let jwksCache: {
  url: string;
  resolver: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function assertSafeProtocol(url: URL, label: string): void {
  if (url.protocol === "https:") return;
  if (
    process.env["NODE_ENV"] !== "production" &&
    url.protocol === "http:" &&
    isLoopbackHostname(url.hostname)
  ) {
    return;
  }
  throw new Error(
    `${label} must use https (http is allowed only for loopback in non-production)`,
  );
}

function parseOrigin(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new Error(`${label} must be a valid origin`);
  }
  assertSafeProtocol(url, label);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== "/")
  ) {
    throw new Error(
      `${label} must be an origin without credentials, path, query, or fragment`,
    );
  }
  return url.origin;
}

function parseUrl(raw: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  assertSafeProtocol(url, label);
  if (url.username || url.password || url.hash) {
    throw new Error(`${label} must not contain credentials or a fragment`);
  }
  return url;
}

function parseCommaSeparated(raw: string | undefined, label: string): string[] {
  if (raw === undefined || raw.trim().length === 0) return [];
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) throw new Error(`${label} is configured but empty`);
  return values;
}

function resolveClerkVerificationConfig(): ClerkVerificationConfig {
  const explicitJwksUrl = process.env["CLERK_JWKS_URL"]?.trim();
  if (!explicitJwksUrl) throw new Error("CLERK_JWKS_URL is not set");
  const jwksUrl = parseUrl(explicitJwksUrl, "CLERK_JWKS_URL");

  const issuer = process.env["CLERK_ISSUER"]?.trim()
    ? parseOrigin(process.env["CLERK_ISSUER"]!, "CLERK_ISSUER")
    : process.env["CLERK_DOMAIN"]?.trim()
      ? parseOrigin(process.env["CLERK_DOMAIN"]!, "CLERK_DOMAIN")
      : jwksUrl.origin;

  const authorizedPartyValues = parseCommaSeparated(
    process.env["CLERK_AUTHORIZED_PARTIES"],
    "CLERK_AUTHORIZED_PARTIES",
  );
  if (
    process.env["NODE_ENV"] === "production" &&
    authorizedPartyValues.length === 0
  ) {
    throw new Error(
      "CLERK_AUTHORIZED_PARTIES is required in production so the JWT azp claim can be validated",
    );
  }

  return {
    jwksUrl: jwksUrl.toString(),
    issuer,
    audiences: parseCommaSeparated(
      process.env["CLERK_AUDIENCE"],
      "CLERK_AUDIENCE",
    ),
    authorizedParties: authorizedPartyValues.map((value, index) =>
      parseOrigin(value, `CLERK_AUTHORIZED_PARTIES[${index}]`),
    ),
  };
}

function getJwks(url: string) {
  if (!jwksCache || jwksCache.url !== url) {
    jwksCache = {
      url,
      resolver: createRemoteJWKSet(new URL(url)),
    };
  }
  return jwksCache.resolver;
}

function validateAuthorizedParty(
  payload: JWTPayload,
  expected: string[],
): void {
  if (expected.length === 0) return;
  const azp = payload["azp"];
  if (typeof azp !== "string" || azp.length === 0) {
    throw new Error("JWT azp claim is required");
  }
  let tokenParty: string;
  try {
    tokenParty = parseOrigin(azp, "JWT azp claim");
  } catch {
    throw new Error("JWT azp claim is not a valid authorized-party origin");
  }
  if (!expected.includes(tokenParty))
    throw new Error("JWT authorized party is not allowed");
}

/** Verify a Clerk RS256 session JWT against the configured instance and claim policy. */
export async function verifyClerkToken(token: string): Promise<JWTPayload> {
  const config = resolveClerkVerificationConfig();
  const unverifiedHeader = decodeProtectedHeader(token);
  if (unverifiedHeader.alg !== "RS256")
    throw new Error("JWT alg must be RS256");
  if (
    typeof unverifiedHeader.kid !== "string" ||
    unverifiedHeader.kid.trim().length === 0
  ) {
    throw new Error("JWT kid header is required");
  }

  const { payload, protectedHeader } = await jwtVerify(
    token,
    getJwks(config.jwksUrl),
    {
      algorithms: ["RS256"],
      issuer: config.issuer,
      ...(config.audiences.length > 0 ? { audience: config.audiences } : {}),
      requiredClaims: ["sub", "exp", "iat"],
    },
  );
  if (
    protectedHeader.alg !== "RS256" ||
    protectedHeader.kid !== unverifiedHeader.kid
  ) {
    throw new Error("JWT protected header is invalid");
  }
  if (typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
    throw new Error("JWT sub claim must be a nonempty string");
  }
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    throw new Error("JWT exp claim must be a finite NumericDate");
  }
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
    throw new Error("JWT iat claim must be a finite NumericDate");
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.iat > now) throw new Error("JWT iat claim is in the future");
  if (payload.exp <= payload.iat)
    throw new Error("JWT exp claim must be later than iat");
  validateAuthorizedParty(payload, config.authorizedParties);

  const orgId = payload["org_id"];
  if (
    orgId !== undefined &&
    (typeof orgId !== "string" || orgId.trim().length === 0)
  ) {
    throw new Error("JWT org_id claim must be a nonempty string when present");
  }
  return payload;
}

interface RequireClerkAuthDeps {
  /** Injectable verifier (tests). Defaults to JWKS verification. */
  verify?: (token: string) => Promise<JWTPayload>;
}

/**
 * Express middleware: deny-by-default Clerk auth. Verifies the Clerk user JWT and
 * sets `req.clerkUserId` (from `sub`) + `req.clerkToken` (forwarded upstream).
 *
 * Clerk Organizations is currently disabled on this instance, so `org_id` is
 * optional. apex-gtm-api resolves the tenant server-side through
 * `User.clerkId == sub -> User.orgId` when the claim is absent.
 *
 * `DEV_TRUST_X_ORG_ID=true` is a local-only escape hatch. Production ignores
 * it unconditionally and still requires a verified bearer token.
 */
export function requireClerkAuth(deps: RequireClerkAuthDeps = {}) {
  const verify = deps.verify ?? verifyClerkToken;

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (
      process.env["NODE_ENV"] !== "production" &&
      process.env["DEV_TRUST_X_ORG_ID"] === "true"
    ) {
      req.clerkUserId = req.header("x-clerk-user-id") ?? "dev-user";
      req.orgId = req.header("x-org-id") ?? undefined;
      next();
      return;
    }

    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) {
      res.status(401).json({ error: "missing bearer token" });
      return;
    }

    try {
      const payload = await verify(token);
      if (typeof payload.sub !== "string" || !payload.sub) {
        res.status(401).json({ error: "invalid token (no subject)" });
        return;
      }
      req.clerkUserId = payload.sub;
      req.clerkToken = token;
      req.orgId =
        typeof payload["org_id"] === "string"
          ? (payload["org_id"] as string)
          : undefined;
      req.clerkOrgRole =
        typeof payload["org_role"] === "string"
          ? (payload["org_role"] as string)
          : undefined;
      next();
    } catch {
      res.status(401).json({ error: "invalid token" });
    }
  };
}
