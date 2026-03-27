import sanitizeHtml from "sanitize-html";

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "h1",
    "h2",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  enforceHtmlBoundary: true,
};

const SUPPORTED_HTML_TAG_PATTERN =
  /<\/?(p|h1|h2|br|strong|b|em|i|u|s|ul|ol|li|blockquote|a)(\s[^>]*)?>/i;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextToRichText(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.split("\n").map(escapeHtml).join("<br />")}</p>`);

  if (paragraphs.length === 0) {
    return null;
  }

  return paragraphs.join("");
}

export function sanitizeRichText(input: string): string | null {
  const sanitized = sanitizeHtml(input, RICH_TEXT_OPTIONS).trim();

  if (!sanitized) {
    return null;
  }

  const plainText = sanitizeHtml(sanitized, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\u00a0/g, " ")
    .trim();

  if (!plainText) {
    return null;
  }

  return sanitized;
}

export function coerceRichTextHtml(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  if (!SUPPORTED_HTML_TAG_PATTERN.test(trimmed)) {
    return plainTextToRichText(trimmed);
  }

  return sanitizeRichText(trimmed) ?? plainTextToRichText(trimmed);
}

export function richTextToPlainText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
