import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceSourceLink, evidenceSourceHref } from "./LeadDetail";

describe("lead evidence source links", () => {
  it("renders a safe reviewer link in a separate browsing context", () => {
    const html = renderToStaticMarkup(
      <EvidenceSourceLink sourceUrl="https://news.example.com/evidence" />,
    );

    expect(html).toContain('href="https://news.example.com/evidence"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("View source");
  });

  it.each([
    "javascript:alert(1)",
    "https://user:secret@news.example.com/evidence",
    "news.example.com/evidence",
  ])("refuses unsafe source %s", (sourceUrl) => {
    expect(evidenceSourceHref(sourceUrl)).toBeNull();
    expect(
      renderToStaticMarkup(<EvidenceSourceLink sourceUrl={sourceUrl} />),
    ).toBe("");
  });
});
