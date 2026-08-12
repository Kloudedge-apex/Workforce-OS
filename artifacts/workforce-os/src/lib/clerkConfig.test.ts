import { describe, expect, it } from "vitest";
import { requireClerkPublishableKey } from "./clerkConfig";

describe("requireClerkPublishableKey", () => {
  it.each([undefined, null, "", "   "])(
    "rejects missing values (%s)",
    (value) => {
      expect(() => requireClerkPublishableKey(value)).toThrow(
        "VITE_CLERK_PUBLISHABLE_KEY is required",
      );
    },
  );

  it.each([
    "not-a-clerk-key",
    "sk_test_server_secret",
    "pk_test_REPLACE_WITH_YOUR_CLERK_PUBLISHABLE_KEY",
  ])("rejects malformed or placeholder values (%s)", (value) => {
    expect(() => requireClerkPublishableKey(value)).toThrow(
      "must be a non-placeholder Clerk publishable key",
    );
  });

  it.each(["pk_test_c2FmZS10ZXN0LW9ubHkk"])(
    "accepts a configured publishable key (%s)",
    (value) => {
      expect(requireClerkPublishableKey(`  ${value}  `)).toBe(value);
    },
  );
});
