import { customFetch } from "@workspace/api-client-react";

/**
 * GL3 Gmail OAuth connect. OAuth providers cannot use the synchronous
 * POST /connect endpoint (that is the api-key path — it always fails for
 * gmail). Instead the BFF proxies the upstream auth-url route; the FE opens
 * the returned Google consent URL in a new tab (the OAuth callback lands on
 * the backend, not on this SPA) and then polls integration status to reflect
 * CONNECTED honestly.
 */

export const GMAIL_AUTH_URL_ENDPOINT = "/api/settings/integrations/gmail/auth-url";

/**
 * PURE: extract the authorization URL from the BFF `{ authUrl }` response.
 * Returns null unless the payload carries a non-empty http(s) URL — callers
 * must surface an honest error rather than open garbage.
 */
export function parseAuthUrlResponse(data: unknown): string | null {
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const authUrl = rec?.["authUrl"];
  if (typeof authUrl !== "string") return null;
  const trimmed = authUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Fetch the Gmail authorization URL through the shared client (same base URL
 * + Clerk bearer as every generated call). Throws on transport/HTTP errors
 * (ApiError carries the BFF's verbatim message) and on a malformed payload.
 */
export async function fetchGmailAuthUrl(): Promise<string> {
  const data = await customFetch<unknown>(GMAIL_AUTH_URL_ENDPOINT, {
    method: "GET",
    responseType: "json",
  });
  const url = parseAuthUrlResponse(data);
  if (!url) {
    throw new Error("The server did not return a Gmail authorization URL.");
  }
  return url;
}
