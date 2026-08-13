import path from "node:path";
import express, {
  type Express,
  type IRouter,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { requireClerkAuth } from "./middlewares/clerk-auth";
import { UpstreamError } from "./upstream/apex-client";
import { logger } from "./lib/logger";

export interface CreateAppOptions {
  apiRouter?: IRouter;
  clerkGuard?: RequestHandler;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app: Express = express();
  const apiRouter = options.apiRouter ?? router;
  const clerkGuard = options.clerkGuard ?? requireClerkAuth();

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    // The console contains one-click approval actions and must never be
    // embedded by another origin. X-Frame-Options covers older user agents;
    // frame-ancestors is the authoritative modern control.
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Clerk auth gates every /api route except the unauthenticated health probe.
  app.use(
    "/api",
    (req, res, next) =>
      req.path === "/healthz" ? next() : clerkGuard(req, res, next),
    apiRouter,
    (_req, res) => {
      // Never let an unknown API path fall through to the production SPA and
      // masquerade as a successful HTML response to a generated client call.
      res.status(404).json({ error: "not_found" });
    },
  );

  // Production single-container mode: serve the built Vite FE + SPA fallback.
  // FE_DIST points at the FE's dist/public; unset in dev (vite serves the FE).
  const feDist = process.env["FE_DIST"];
  if (feDist) {
    app.use(express.static(feDist));
    app.use((_req, res) => {
      res.sendFile(path.join(feDist, "index.html"));
    });
  }

  // Error translator: BFF routes rethrow UpstreamError so an auth-related upstream
  // status (401/403) surfaces to the caller verbatim instead of a generic 500.
  // 4-arg signature marks this as Express error-handling middleware.
  app.use(
    (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
      if (res.headersSent) {
        next(err);
        return;
      }
      if (err instanceof UpstreamError) {
        const status =
          err.status === 401 || err.status === 403 ? err.status : 502;
        res.status(status).json({ error: "upstream", status: err.status });
        return;
      }
      logger.error({ err }, "Unhandled error");
      res.status(500).json({ error: "internal" });
    },
  );

  return app;
}

const app = createApp();

export default app;
