import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/brand/Logo", () => ({
  Logo: () => null,
}));

import {
  PrivacyPolicy,
  PublicHome,
  TermsOfService,
  publicSurfaceForLocation,
} from "./Public";

describe("public Workforce OS surfaces", () => {
  it("routes only the exact public locations outside authenticated app navigation", () => {
    expect(publicSurfaceForLocation("/")).toBe("home");
    expect(publicSurfaceForLocation("/privacy/")).toBe("privacy");
    expect(publicSurfaceForLocation("/terms?source=footer")).toBe("terms");
    expect(publicSurfaceForLocation("/sign-in#login")).toBe("sign-in");
    expect(publicSurfaceForLocation("/today")).toBeNull();
    expect(publicSurfaceForLocation("/privacy/export")).toBeNull();
  });

  it("publishes an honest product homepage with approval and policy links", () => {
    const html = renderToStaticMarkup(<PublicHome />);

    expect(html).toContain(
      "No message is sent until an authorized person approves it",
    );
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/sign-in"');
  });

  it("publishes the Google Limited Use and Gmail deletion disclosures", () => {
    const html = renderToStaticMarkup(<PrivacyPolicy />);

    expect(html).toContain("Google API Services User Data Policy");
    expect(html).toContain("Limited Use");
    expect(html).toContain(
      "Disconnecting Gmail deletes the stored integration record",
    );
    expect(html).toContain(
      "do not sell personal information or Google user data",
    );
  });

  it("makes human approval and lawful outbound responsibility explicit", () => {
    const html = renderToStaticMarkup(<TermsOfService />);

    expect(html).toContain(
      "must review and approve an outbound message before it can be sent",
    );
    expect(html).toContain("suppression, unsubscribe, consent");
    expect(html).toContain(
      "Generated research and drafts can be incomplete or wrong",
    );
  });
});
