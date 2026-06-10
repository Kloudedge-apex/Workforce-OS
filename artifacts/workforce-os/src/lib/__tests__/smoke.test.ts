import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("vitest smoke", () => {
  it("runs and resolves the @ alias", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
