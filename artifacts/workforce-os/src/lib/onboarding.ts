/**
 * Choose the signed-in landing route from the derived backend verdict.
 * Missing, malformed, or incomplete state lands in setup, but it does not
 * turn setup into a global navigation guard. Individual write and live-send
 * actions remain protected by their server-authoritative capability gates.
 */
export function homePathForWelcome(status: unknown): "/today" | "/settings/setup" {
  return isCompleteWelcomeStatus(status) ? "/today" : "/settings/setup";
}

/**
 * Guided setup owns only the signed-in root landing decision. A customer may
 * inspect and configure the rest of the product while setup is incomplete;
 * server-side authorization and readiness checks continue to guard writes and
 * delivery. This prevents every menu click from bouncing back into setup.
 */
export function welcomeRedirectForLocation(
  location: string,
  status: unknown,
): "/today" | "/settings/setup" | null {
  return location === "/" ? homePathForWelcome(status) : null;
}

/**
 * Setup owns its loading and failure UI. Holding a setup route behind the same
 * welcome-status query would unmount that UI while it refetches; a failed
 * request could then remount it and start the cycle again. All other private
 * routes remain fail-closed until the initial status check settles.
 */
export function isSetupRoute(location: string): boolean {
  return /^\/settings(?:\/(?:setup|org|icp|integrations))?\/?$/.test(location);
}

export function shouldHoldForWelcomeStatus(
  location: string,
  isLoading: boolean,
): boolean {
  return isLoading && !isSetupRoute(location);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isCompleteWelcomeStatus(status: unknown): boolean {
  const root = record(status);
  const organization = record(root?.["organization"]);
  const sender = record(root?.["senderIdentity"]);
  const icp = record(root?.["icp"]);
  const mailbox = record(root?.["mailbox"]);
  const readiness = record(root?.["sendReadiness"]);
  if (!root || !organization || !sender || !icp || !mailbox || !readiness) return false;

  const cap = readiness["dailyCapRemaining"];
  const readinessValid =
    typeof readiness["liveSendAllowed"] === "boolean" &&
    typeof readiness["physicalAddressSet"] === "boolean" &&
    typeof readiness["senderNameSet"] === "boolean" &&
    typeof readiness["countrySet"] === "boolean" &&
    typeof readiness["mailboxConnected"] === "boolean" &&
    (cap === null || (typeof cap === "number" && Number.isFinite(cap)));

  return (
    readinessValid &&
    root["complete"] === true &&
    root["currentStep"] === "complete" &&
    typeof root["readyForLiveSend"] === "boolean" &&
    organization["nameSet"] === true &&
    organization["websiteSet"] === true &&
    organization["complete"] === true &&
    sender["senderNameSet"] === true &&
    sender["countrySet"] === true &&
    sender["physicalAddressSet"] === true &&
    sender["complete"] === true &&
    icp["usable"] === true &&
    icp["complete"] === true &&
    mailbox["connected"] === true &&
    mailbox["complete"] === true
  );
}
