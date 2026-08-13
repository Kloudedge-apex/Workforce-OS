import app from "./app";
import { createGracefulShutdown } from "./graceful-shutdown";
import { logger } from "./lib/logger";
import { validateApexUpstreamConfig } from "./upstream/apex-client";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Validate the bearer-token forwarding destination before accepting traffic.
validateApexUpstreamConfig();

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const shutdown = createGracefulShutdown(server, logger);
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
