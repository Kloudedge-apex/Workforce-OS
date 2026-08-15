import type { Server } from "node:http";
import type { Logger } from "pino";

export const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 8_000;

interface GracefulShutdownOptions {
  timeoutMs?: number;
  exit?: (code: number) => void;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

/**
 * Build the signal handler separately so shutdown behavior can be verified
 * without sending a real signal to the test runner.
 */
export function createGracefulShutdown(
  server: Server,
  logger: Logger,
  options: GracefulShutdownOptions = {},
): (signal: NodeJS.Signals) => void {
  const timeoutMs = options.timeoutMs ?? GRACEFUL_SHUTDOWN_TIMEOUT_MS;
  const exit = options.exit ?? ((code) => process.exit(code));
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let shuttingDown = false;

  return (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");

    const forceExitTimer = setTimer(() => {
      logger.error(
        { signal, timeoutMs },
        "Graceful shutdown timed out; closing active connections",
      );
      server.closeAllConnections();
      exit(1);
    }, timeoutMs);
    forceExitTimer.unref();

    server.close((error) => {
      clearTimer(forceExitTimer);
      if (error) {
        logger.error({ err: error, signal }, "Graceful shutdown failed");
        exit(1);
        return;
      }
      logger.info({ signal }, "Graceful shutdown complete");
      exit(0);
    });
  };
}
