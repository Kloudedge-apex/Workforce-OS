import { describe, expect, it } from "vitest";
import {
  canManageWorkflow,
  workflowAuthorityMessage,
} from "./workflowAuthority";

describe("workflow authority", () => {
  it("allows only an explicit server authorization", () => {
    expect(canManageWorkflow(true)).toBe(true);
    expect(canManageWorkflow(false)).toBe(false);
    expect(canManageWorkflow(null)).toBe(false);
    expect(canManageWorkflow(undefined)).toBe(false);
  });

  it("distinguishes a known role denial from unavailable authority", () => {
    expect(workflowAuthorityMessage(false)).toContain("owner, administrator, or manager");
    expect(workflowAuthorityMessage(null)).toContain("could not be verified");
  });
});
