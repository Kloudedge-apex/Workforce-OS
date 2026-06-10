import path from "node:path";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { requireClerkAuth } from "./middlewares/clerk-auth";
import { UpstreamError } from "./upstream/apex-client";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk auth gates every /api route except the unauthenticated health probe.
const clerkGuard = requireClerkAuth();
app.use(
  "/api",
  (req, res, next) => (req.path === "/healthz" ? next() : clerkGuard(req, res, next)),
  router,
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
      const status = err.status === 401 || err.status === 403 ? err.status : 502;
      res.status(status).json({ error: "upstream", status: err.status });
      return;
    }
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "internal" });
  },
);

export default app;
