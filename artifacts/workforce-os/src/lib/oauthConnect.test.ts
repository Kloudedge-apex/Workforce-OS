import { describe, it, expect } from "vitest";
import { parseAuthUrlResponse, GMAIL_AUTH_URL_ENDPOINT } from "./oauthConnect";

describe("parseAuthUrlResponse", () => {
  it("extracts a well-formed { authUrl }", () => {
    expect(
      parseAuthUrlResponse({ authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=x" }),
    ).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=x");
    expect(parseAuthUrlResponse({ authUrl: "  https://a.example/p " })).toBe("https://a.example/p");
  });

  it("returns null for missing or non-http(s) payloads — never opens garbage", () => {
    expect(parseAuthUrlResponse(undefined)).toBeNull();
    expect(parseAuthUrlResponse(null)).toBeNull();
    expect(parseAuthUrlResponse({})).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "" })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: 1 })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "javascript:alert(1)" })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "accounts.google.com/no-scheme" })).toBeNull();
    expect(parseAuthUrlResponse("https://raw-string.example")).toBeNull();
  });
});

describe("GMAIL_AUTH_URL_ENDPOINT", () => {
  it("targets the BFF proxy route (org-scoped auth, same prefix as siblings)", () => {
    expect(GMAIL_AUTH_URL_ENDPOINT).toBe("/api/settings/integrations/gmail/auth-url");
  });
});
