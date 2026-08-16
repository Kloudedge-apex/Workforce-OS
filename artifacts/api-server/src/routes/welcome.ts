import { Router, type Request } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";

export interface WelcomeUpstreamClient {
  get(path: string, options: { req: Request }): Promise<unknown>;
}

interface LegacyOrgRead {
  name: string;
  website: string | null;
  senderName: string | null;
  country: string | null;
  physicalAddress: string | null;
  sendReadiness: {
    liveSendAllowed: boolean;
    physicalAddressSet: boolean;
    senderNameSet: boolean;
    mailboxConnected: boolean;
    dailyCapRemaining: number | null;
  };
}

interface LegacyIcpRead {
  name: string;
  targetTitles: string[];
  targetIndustries: string[];
  targetGeos: string[];
  techStackSignals: string[];
  intentKeywords: string[];
  seedDomains: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function parseLegacyOrg(value: unknown): LegacyOrgRead | null {
  const root = asRecord(value);
  const readiness = asRecord(root?.["sendReadiness"]);
  const dailyCapRemaining = readiness?.["dailyCapRemaining"];
  if (
    !root ||
    !readiness ||
    typeof root["name"] !== "string" ||
    (root["website"] !== null && typeof root["website"] !== "string") ||
    (root["senderName"] !== null && typeof root["senderName"] !== "string") ||
    (root["country"] !== null && typeof root["country"] !== "string") ||
    (root["physicalAddress"] !== null && typeof root["physicalAddress"] !== "string") ||
    typeof readiness["liveSendAllowed"] !== "boolean" ||
    typeof readiness["physicalAddressSet"] !== "boolean" ||
    typeof readiness["senderNameSet"] !== "boolean" ||
    typeof readiness["mailboxConnected"] !== "boolean" ||
    (dailyCapRemaining !== null &&
      (typeof dailyCapRemaining !== "number" || !Number.isFinite(dailyCapRemaining)))
  ) return null;
  return root as unknown as LegacyOrgRead;
}

function parseLegacyIcp(value: unknown): LegacyIcpRead[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: LegacyIcpRead[] = [];
  for (const item of value) {
    const root = asRecord(item);
    const targetTitles = stringArray(root?.["targetTitles"]);
    const targetIndustries = stringArray(root?.["targetIndustries"]);
    const targetGeos = stringArray(root?.["targetGeos"]);
    const techStackSignals = stringArray(root?.["techStackSignals"]);
    const intentKeywords = stringArray(root?.["intentKeywords"]);
    const seedDomains = stringArray(root?.["seedDomains"]);
    if (
      !root ||
      typeof root["name"] !== "string" ||
      !targetTitles ||
      !targetIndustries ||
      !targetGeos ||
      !techStackSignals ||
      !intentKeywords ||
      !seedDomains
    ) return null;
    parsed.push({
      name: root["name"],
      targetTitles,
      targetIndustries,
      targetGeos,
      techStackSignals,
      intentKeywords,
      seedDomains,
    });
  }
  return parsed;
}

export function deriveLegacyWelcomeStatus(orgValue: unknown, icpValue: unknown): unknown {
  const org = parseLegacyOrg(orgValue);
  const profiles = parseLegacyIcp(icpValue);
  if (!org || !profiles) return null;

  const profile = profiles[0];
  const nameSet = hasText(org.name);
  const websiteSet = hasText(org.website);
  const senderNameSet = hasText(org.senderName) && org.sendReadiness.senderNameSet;
  const physicalAddressSet = hasText(org.physicalAddress) &&
    org.sendReadiness.physicalAddressSet;
  const countrySet = typeof org.country === "string" && /^[A-Z]{2}$/u.test(org.country);
  const usableIcp = Boolean(
    profile &&
      hasText(profile.name) &&
      [
        profile.targetTitles,
        profile.targetIndustries,
        profile.targetGeos,
        profile.techStackSignals,
        profile.intentKeywords,
        profile.seedDomains,
      ].some((values) => values.some(hasText)),
  );
  const mailboxConnected = org.sendReadiness.mailboxConnected;
  const organizationComplete = nameSet && websiteSet;
  const senderIdentityComplete = senderNameSet && physicalAddressSet && countrySet;
  const complete = organizationComplete && senderIdentityComplete && usableIcp && mailboxConnected;
  const currentStep = !organizationComplete
    ? "organization"
    : !senderIdentityComplete
      ? "sender_identity"
      : !usableIcp
        ? "icp"
        : !mailboxConnected
          ? "mailbox"
          : "complete";
  const sendReadiness = {
    ...org.sendReadiness,
    countrySet,
  };
  return {
    organization: { nameSet, websiteSet, complete: organizationComplete },
    senderIdentity: {
      senderNameSet,
      countrySet,
      physicalAddressSet,
      complete: senderIdentityComplete,
    },
    icp: { usable: usableIcp, complete: usableIcp },
    mailbox: { connected: mailboxConnected, complete: mailboxConnected },
    sendReadiness,
    currentStep,
    complete,
    readyForLiveSend: complete &&
      sendReadiness.liveSendAllowed &&
      sendReadiness.dailyCapRemaining !== null &&
      sendReadiness.dailyCapRemaining > 0,
  };
}

/**
 * Compatibility read for the June production backend. Only a missing new
 * endpoint activates it; authentication and authorization failures remain
 * fail-closed. Both fallback inputs are authenticated, persisted backend
 * reads, so the client still cannot set completion itself.
 */
export async function fetchWelcomeStatus(
  req: Request,
  client: WelcomeUpstreamClient = apex,
): Promise<unknown> {
  try {
    return await client.get("/orgs/onboarding/status", { req });
  } catch (error) {
    if (!(error instanceof UpstreamError) || error.status !== 404) throw error;
  }
  const [org, icp] = await Promise.all([
    client.get("/orgs/me", { req }),
    client.get("/leads/icp", { req }),
  ]);
  return deriveLegacyWelcomeStatus(org, icp);
}

export function isWelcomeStatusPayload(value: unknown): boolean {
  const root = asRecord(value);
  const organization = asRecord(root?.["organization"]);
  const sender = asRecord(root?.["senderIdentity"]);
  const icp = asRecord(root?.["icp"]);
  const mailbox = asRecord(root?.["mailbox"]);
  const readiness = asRecord(root?.["sendReadiness"]);
  const cap = readiness?.["dailyCapRemaining"];
  const steps = new Set(["organization", "sender_identity", "icp", "mailbox", "complete"]);
  return Boolean(
    root &&
      organization &&
      sender &&
      icp &&
      mailbox &&
      readiness &&
      typeof organization["nameSet"] === "boolean" &&
      typeof organization["websiteSet"] === "boolean" &&
      typeof organization["complete"] === "boolean" &&
      typeof sender["senderNameSet"] === "boolean" &&
      typeof sender["countrySet"] === "boolean" &&
      typeof sender["physicalAddressSet"] === "boolean" &&
      typeof sender["complete"] === "boolean" &&
      typeof icp["usable"] === "boolean" &&
      typeof icp["complete"] === "boolean" &&
      typeof mailbox["connected"] === "boolean" &&
      typeof mailbox["complete"] === "boolean" &&
      typeof readiness["liveSendAllowed"] === "boolean" &&
      typeof readiness["physicalAddressSet"] === "boolean" &&
      typeof readiness["senderNameSet"] === "boolean" &&
      typeof readiness["countrySet"] === "boolean" &&
      typeof readiness["mailboxConnected"] === "boolean" &&
      (cap === null || (typeof cap === "number" && Number.isFinite(cap))) &&
      typeof root["complete"] === "boolean" &&
      typeof root["readyForLiveSend"] === "boolean" &&
      typeof root["currentStep"] === "string" &&
      steps.has(root["currentStep"]),
  );
}

export function createWelcomeRouter(client: WelcomeUpstreamClient = apex): Router {
  const router = Router();

  // Completion is a derived backend read model. There is deliberately no
  // "mark complete" mutation: every step must remain backed by persisted org,
  // ICP, and mailbox state.
  router.get("/welcome/status", async (req, res, next) => {
    try {
      const status = await fetchWelcomeStatus(req, client);
      if (!isWelcomeStatusPayload(status)) {
        res.status(502).json({
          error: "upstream",
          message: "The backend returned an invalid onboarding status",
        });
        return;
      }
      res.json(status);
    } catch (err) {
      if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) throw err;
      next(err);
    }
  });

  return router;
}

export default createWelcomeRouter();
