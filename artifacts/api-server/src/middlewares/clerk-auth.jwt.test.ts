import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { verifyClerkToken } from "./clerk-auth";

const ISSUER = "https://clerk.example.test";
const AUTHORIZED_PARTY = "https://workforceos.xyz";
const KEY_ID = "clerk-key-1";

let server: Server;
let jwksUrl: string;
let privateKey: CryptoKey;

function validClaims(overrides: JWTPayload = {}): JWTPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: "user_clerk_1",
    iss: ISSUER,
    azp: AUTHORIZED_PARTY,
    iat: now - 5,
    exp: now + 300,
    ...overrides,
  };
}

async function signToken(
  payload: JWTPayload,
  header: { alg: string; kid?: string } = { alg: "RS256", kid: KEY_ID },
): Promise<string> {
  return new SignJWT(payload).setProtectedHeader(header).sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const publicJwk = {
    ...(await exportJWK(pair.publicKey)),
    use: "sig",
    alg: "RS256",
    kid: KEY_ID,
  };
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  jwksUrl = `http://127.0.0.1:${address.port}/.well-known/jwks.json`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("BFF Clerk JWT claim policy", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CLERK_JWKS_URL", jwksUrl);
    vi.stubEnv("CLERK_ISSUER", ISSUER);
    vi.stubEnv("CLERK_DOMAIN", undefined);
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", AUTHORIZED_PARTY);
    vi.stubEnv("CLERK_AUDIENCE", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a valid session token without org_id or audience", async () => {
    await expect(
      verifyClerkToken(await signToken(validClaims())),
    ).resolves.toMatchObject({
      sub: "user_clerk_1",
      iss: ISSUER,
    });
  });

  it.each(["sub", "exp", "iat"] as const)(
    "rejects a token missing %s",
    async (claim) => {
      const payload = validClaims();
      delete payload[claim];
      await expect(
        verifyClerkToken(await signToken(payload)),
      ).rejects.toThrow();
    },
  );

  it("rejects expired, future nbf, and future iat tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifyClerkToken(
        await signToken(validClaims({ iat: now - 60, exp: now - 1 })),
      ),
    ).rejects.toThrow();
    await expect(
      verifyClerkToken(await signToken(validClaims({ nbf: now + 60 }))),
    ).rejects.toThrow();
    await expect(
      verifyClerkToken(
        await signToken(validClaims({ iat: now + 60, exp: now + 360 })),
      ),
    ).rejects.toThrow("future");
  });

  it("rejects the wrong issuer and authorized party", async () => {
    await expect(
      verifyClerkToken(
        await signToken(validClaims({ iss: "https://other.example" })),
      ),
    ).rejects.toThrow();
    await expect(
      verifyClerkToken(
        await signToken(validClaims({ azp: "https://evil.example" })),
      ),
    ).rejects.toThrow("authorized party");
  });

  it("validates audience only when CLERK_AUDIENCE is configured", async () => {
    vi.stubEnv("CLERK_AUDIENCE", "workforce-api");
    await expect(
      verifyClerkToken(await signToken(validClaims({ aud: "other-api" }))),
    ).rejects.toThrow();
    await expect(
      verifyClerkToken(
        await signToken(validClaims({ aud: ["other-api", "workforce-api"] })),
      ),
    ).resolves.toMatchObject({ sub: "user_clerk_1" });
  });

  it("requires RS256 and an exact nonempty kid", async () => {
    const valid = await signToken(validClaims());
    const parts = valid.split(".");
    parts[0] = Buffer.from(
      JSON.stringify({ alg: "PS256", kid: KEY_ID }),
    ).toString("base64url");
    await expect(verifyClerkToken(parts.join("."))).rejects.toThrow("RS256");
    await expect(
      verifyClerkToken(await signToken(validClaims(), { alg: "RS256" })),
    ).rejects.toThrow("kid");
    await expect(
      verifyClerkToken(
        await signToken(validClaims(), {
          alg: "RS256",
          kid: "unknown-clerk-key",
        }),
      ),
    ).rejects.toThrow();
  });

  it("fails closed in production when authorized parties cannot be validated", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLERK_JWKS_URL", `${ISSUER}/.well-known/jwks.json`);
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", undefined);
    await expect(
      verifyClerkToken(await signToken(validClaims())),
    ).rejects.toThrow("CLERK_AUTHORIZED_PARTIES is required in production");
  });
});
