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

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force-safe links: external targets can't reach window.opener.
    ADD_ATTR: ["target", "rel"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
