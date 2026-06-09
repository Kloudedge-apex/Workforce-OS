// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("strips <script> tags", () => {
    const out = sanitizeHtml('<p>Hi</p><script>alert("x")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("keeps <p> content", () => {
    const out = sanitizeHtml("<p>Hello world</p>");
    expect(out).toContain("<p>Hello world</p>");
  });

  it("keeps <a href> links", () => {
    const out = sanitizeHtml('<a href="https://nikxius.com">Nikxius</a>');
    expect(out).toContain('href="https://nikxius.com"');
    expect(out).toContain("Nikxius");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeHtml('<a href="#" onclick="steal()">x</a>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("steal");
  });

  it("drops disallowed tags but keeps their text", () => {
    const out = sanitizeHtml("<iframe>nope</iframe><p>keep</p>");
    expect(out).not.toContain("<iframe");
    expect(out).toContain("<p>keep</p>");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});
