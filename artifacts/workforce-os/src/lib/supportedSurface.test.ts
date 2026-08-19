import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const supportedSources = [
  "pages/RunDetail.tsx",
  "pages/Conversations.tsx",
  "pages/ConversationThread.tsx",
  "pages/Settings.tsx",
  "components/v2/ConversationThread.tsx",
  "components/v2/ConversationActions.tsx",
  "components/v2/ApprovalCard.tsx",
] as const;

describe("supported release surface", () => {
  const sourceRoot = path.resolve(import.meta.dirname, "..");

  it.each(supportedSources)(
    "%s uses real success or error states, not a retired availability sentinel",
    (relativePath) => {
      const source = readFileSync(path.join(sourceRoot, relativePath), "utf8");
      expect(source).not.toContain("@/lib/unavailable");
      expect(source).not.toContain("isUnavailable(");
      expect(source).not.toMatch(/coming soon/i);
    },
  );

  it("does not ship the retired unavailable-sentinel helper", () => {
    expect(existsSync(path.join(import.meta.dirname, "unavailable.tsx"))).toBe(
      false,
    );
  });

  it("advertises run detail as a persisted timeline, not optional availability", () => {
    const openapi = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../lib/api-spec/openapi.yaml",
      ),
      "utf8",
    );
    expect(openapi).toContain(
      "summary: Get one run and its persisted timeline",
    );
    expect(openapi).not.toMatch(/unavailable sentinel/i);
    expect(openapi).not.toMatch(/timeline availability/i);
  });
});
