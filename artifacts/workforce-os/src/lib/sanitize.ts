import DOMPurify from "dompurify";

/**
 * Sanitize untrusted HTML before it reaches `dangerouslySetInnerHTML`.
 *
 * Allows the small editorial set we actually render in artifacts, approval
 * cards, and conversation threads (paragraphs, line breaks, basic inline
 * marks, links, lists). Strips <script>, event handlers, <iframe>, and any
 * other vector. Links are forced to open safely.
 *
 * Use at EVERY `dangerouslySetInnerHTML` call site.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
];

const ALLOWED_ATTR = ["href", "title", "target", "rel"];

let safeLinkHookInstalled = false;

function ensureSafeLinkHook(): void {
  // DOMPurify's Node/SSR factory does not expose hooks until it has a Window.
  // The conversation body is browser-rendered, so install lazily on first use.
  if (safeLinkHookInstalled || typeof DOMPurify.addHook !== "function") return;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName !== "A") return;

    const target = node.getAttribute("target");
    if (target?.toLowerCase() === "_blank") {
      // Override attacker-provided `rel=opener`; modern implicit noopener can
      // be explicitly disabled by that value.
      node.setAttribute("rel", "noopener noreferrer");
      return;
    }

    // Named/top-level targets are not needed by the conversation renderer and
    // create avoidable navigation behavior from untrusted inbound email HTML.
    node.removeAttribute("target");
    node.removeAttribute("rel");
  });
  safeLinkHookInstalled = true;
}

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  ensureSafeLinkHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Preserve link attributes for the hook above to normalize safely.
    ADD_ATTR: ["target", "rel"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
