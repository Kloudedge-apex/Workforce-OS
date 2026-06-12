import { describe, it, expect } from "vitest";
import { decisionErrorMessage } from "./RunDetail";

// Matches the shape customFetch throws: an ApiError carrying the parsed BFF
// body in `.data` plus the HTTP `.status`.
function apiError(status: number, data: unknown): unknown {
  const err = new Error(`HTTP ${status}`);
  return Object.assign(err, { status, data });
}

describe("decisionErrorMessage", () => {
  it("surfaces the BFF/upstream `message` verbatim (409 resume conflict)", () => {
    expect(
      decisionErrorMessage(
        apiError(409, { message: "Graph run is COMPLETED, not AWAITING_APPROVAL" }),
      ),
    ).toBe("Graph run is COMPLETED, not AWAITING_APPROVAL");
  });

  it("falls back to the BFF `error` marker with the HTTP status", () => {
    expect(decisionErrorMessage(apiError(404, { error: "Not found" }))).toBe(
      "Not found (HTTP 404)",
    );
    expect(decisionErrorMessage(apiError(502, { error: "upstream", status: 500 }))).toBe(
      "upstream (HTTP 502)",
    );
  });

  it("ignores blank/non-string body fields and uses the error's own message", () => {
    expect(decisionErrorMessage(apiError(500, { message: "   " }))).toBe("HTTP 500");
    expect(decisionErrorMessage(apiError(500, { unrelated: true }))).toBe("HTTP 500");
    expect(decisionErrorMessage(apiError(500, null))).toBe("HTTP 500");
  });

  it("uses a plain Error's message (network failure, no response body)", () => {
    expect(decisionErrorMessage(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  it("falls back to a generic line for unknown shapes", () => {
    expect(decisionErrorMessage(undefined)).toBe("Request failed — please try again.");
    expect(decisionErrorMessage({})).toBe("Request failed — please try again.");
  });
});
