/**
 * Choose the signed-in landing route from the derived backend verdict.
 * Missing, malformed, or incomplete state always fails closed into setup.
 */
export function homePathForWelcome(status: unknown): "/today" | "/settings/setup" {
  return isCompleteWelcomeStatus(status) ? "/today" : "/settings/setup";
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
