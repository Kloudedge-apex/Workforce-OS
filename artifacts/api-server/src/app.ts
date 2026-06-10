import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { requireClerkAuth } from "./middlewares/clerk-auth";
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

export default app;
