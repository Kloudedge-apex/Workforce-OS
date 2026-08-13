import type { Server } from "node:http";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "./graceful-shutdown";

function testContext() {
  const close = vi.fn();
  const closeAllConnections = vi.fn();
  const server = { close, closeAllConnections } as unknown as Server;
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
  const exit = vi.fn();
  const timer = { unref: vi.fn() } as unknown as ReturnType<typeof setTimeout>;
  const setTimer = vi.fn(() => timer) as unknown as typeof setTimeout;
  const clearTimer = vi.fn() as unknown as typeof clearTimeout;

  return {
    close,
    closeAllConnections,
    server,
    logger,
    exit,
    timer,
    setTimer,
    clearTimer,
  };
}

describe("createGracefulShutdown", () => {
  it("closes the HTTP server once and exits cleanly", () => {
    const ctx = testContext();
    ctx.close.mockImplementation((callback?: (error?: Error) => void) => {
      callback?.();
      return ctx.server;
    });
    const shutdown = createGracefulShutdown(ctx.server, ctx.logger, {
      exit: ctx.exit,
      setTimer: ctx.setTimer,
      clearTimer: ctx.clearTimer,
    });

    shutdown("SIGTERM");
    shutdown("SIGINT");

    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(ctx.clearTimer).toHaveBeenCalledWith(ctx.timer);
    expect(ctx.closeAllConnections).not.toHaveBeenCalled();
    expect(ctx.exit).toHaveBeenCalledWith(0);
  });

  it("forces active connections closed after the bounded timeout", () => {
    const ctx = testContext();
    ctx.close.mockReturnValue(ctx.server);
    let timeoutHandler: (() => void) | undefined;
    ctx.setTimer = vi.fn((handler: () => void) => {
      timeoutHandler = handler;
      return ctx.timer;
    }) as unknown as typeof setTimeout;
    const shutdown = createGracefulShutdown(ctx.server, ctx.logger, {
      exit: ctx.exit,
      setTimer: ctx.setTimer,
      clearTimer: ctx.clearTimer,
      timeoutMs: 25,
    });

    shutdown("SIGTERM");
    timeoutHandler?.();

    expect(ctx.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(ctx.exit).toHaveBeenCalledWith(1);
  });
});
