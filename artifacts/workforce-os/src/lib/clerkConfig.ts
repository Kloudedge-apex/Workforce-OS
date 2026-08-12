const CLERK_PUBLISHABLE_KEY_PATTERN = /^pk_(?:test|live)_[A-Za-z0-9_-]+$/;
const PLACEHOLDER_PATTERN = /(?:replace|your[_-]?clerk|placeholder)/i;

export function requireClerkPublishableKey(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required");
  }

  const key = value.trim();
  if (
    !CLERK_PUBLISHABLE_KEY_PATTERN.test(key) ||
    PLACEHOLDER_PATTERN.test(key)
  ) {
    throw new Error(
      "VITE_CLERK_PUBLISHABLE_KEY must be a non-placeholder Clerk publishable key",
    );
  }

  return key;
}
