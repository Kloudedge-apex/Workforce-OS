export interface CapabilityAccess {
  allowed: boolean;
  reason: string;
}

/** Missing or malformed capability data always stays read-only. */
export function suppressionAccess(
  capability: boolean | null | undefined,
): CapabilityAccess {
  if (capability === true) return { allowed: true, reason: "" };
  if (capability === false) {
    return {
      allowed: false,
      reason:
        "Suppression controls are read-only. Managing suppressions requires an owner or administrator.",
    };
  }
  return {
    allowed: false,
    reason:
      "Suppression permissions could not be verified. Suppression controls are disabled.",
  };
}
