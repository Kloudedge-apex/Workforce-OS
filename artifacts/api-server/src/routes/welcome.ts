import { Router, type Request } from "express";
import { apex, UpstreamError } from "../upstream/apex-client";

export interface WelcomeUpstreamClient {
  get(path: string, options: { req: Request }): Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
      const status = await client.get("/orgs/onboarding/status", { req });
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
