import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingUsageSummary } from "./BillingUsageSummary";

describe("BillingUsageSummary", () => {
  it("shows unknown accounting as not recorded without fake bars or limits", () => {
    const html = renderToStaticMarkup(
      <BillingUsageSummary
        billing={{
          creditsRemaining: null,
          creditsTotal: null,
          sendsThisMonth: null,
          sendsLimit: null,
          seats: 4,
          seatsLimit: null,
        }}
      />,
    );

    expect(html).toContain("Not recorded");
    expect(html).toContain("Limit: Not recorded");
    expect(html).toContain(">4 used");
    expect(html).not.toContain('role="progressbar"');
  });

  it("renders usage bars only when both sides of a recorded range exist", () => {
    const html = renderToStaticMarkup(
      <BillingUsageSummary
        billing={{
          creditsRemaining: 60,
          creditsTotal: 100,
          sendsThisMonth: 25,
          sendsLimit: 50,
          seats: 2,
          seatsLimit: 5,
        }}
      />,
    );

    expect(html.match(/role="progressbar"/g)).toHaveLength(2);
    expect(html).not.toContain("Not recorded");
  });
});
