import { describe, it, expect } from "vitest";
import { parseAuthUrlResponse } from "./oauthConnect";

describe("parseAuthUrlResponse", () => {
  it("extracts a well-formed { authUrl }", () => {
    expect(
      parseAuthUrlResponse({ authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=x" }),
    ).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=x");
    expect(
      parseAuthUrlResponse({ authUrl: "  https://accounts.google.com/o/oauth2/auth " }),
    ).toBe("https://accounts.google.com/o/oauth2/auth");
  });

  it("returns null for untrusted or malformed payloads — never opens garbage", () => {
    expect(parseAuthUrlResponse(undefined)).toBeNull();
    expect(parseAuthUrlResponse(null)).toBeNull();
    expect(parseAuthUrlResponse({})).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "" })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: 1 })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "javascript:alert(1)" })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "http://accounts.google.com/o/oauth2/v2/auth" })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "https://a.example/p" })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "https://accounts.google.com.evil.example/p" })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "https://accounts.google.com:8443/p" })).toBeNull();
    expect(parseAuthUrlResponse({ authUrl: "accounts.google.com/no-scheme" })).toBeNull();
    expect(parseAuthUrlResponse("https://raw-string.example")).toBeNull();
  });
});
