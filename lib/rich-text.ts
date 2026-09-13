import sanitizeHtml from "sanitize-html";

export const RICH_TEXT_CODE_BLOCK = "code";
export const RICH_TEXT_TOKEN_BLOCK = "token";
export const DEFAULT_RICH_TEXT_TOKEN_LABEL = "Token";

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
    "pre",
    "code",
    "div",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    div: ["data-rich-block"],
    pre: ["data-rich-block"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  enforceHtmlBoundary: true,
};

const SUPPORTED_HTML_TAG_PATTERN =
  /<\/?(p|h1|h2|br|strong|b|em|i|u|s|ul|ol|li|blockquote|a|pre|code|div)(\s[^>]*)?>/i;
const TOKEN_BLOCK_PATTERN =
  /<div[^>]*data-rich-block=["']token["'][^>]*>([\s\S]*?)<\/div>/gi;
const CODE_BLOCK_PATTERN = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeInlineText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function htmlFragmentToText(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  }).replace(/\u00a0/g, " ");
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

function getNormalizedRichTextHtml(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  return sanitizeRichText(trimmed) ?? coerceRichTextHtml(trimmed) ?? "";
}

function extractTokenBlockParts(innerHtml: string): { label: string; value: string } {
  const labelMatch = innerHtml.match(/<(p|h1|h2)[^>]*>([\s\S]*?)<\/\1>/i);
  const codeMatch = innerHtml.match(/<code[^>]*>([\s\S]*?)<\/code>/i);

  const label = normalizeInlineText(
    htmlFragmentToText(labelMatch ? labelMatch[2] : "Token")
  );
  const fallbackValueHtml = labelMatch
    ? innerHtml.replace(labelMatch[0], "")
    : innerHtml;
  const value = normalizeInlineText(
    htmlFragmentToText(codeMatch ? codeMatch[1] : fallbackValueHtml)
  );

  return {
    label: label || "Token",
    value,
  };
}

function convertRichTextHtmlToText(
  html: string,
  formatter: {
    code: (value: string) => string;
    token: (parts: { label: string; value: string }) => string;
  }
): string {
  if (!html) {
    return "";
  }

  const withTokenBlocks = html.replace(TOKEN_BLOCK_PATTERN, (_match, innerHtml: string) => {
    const tokenParts = extractTokenBlockParts(innerHtml);
    return tokenParts.value ? `${formatter.token(tokenParts)}\n` : `${tokenParts.label}\n`;
  });

  const withStructuredBlocks = withTokenBlocks.replace(
    CODE_BLOCK_PATTERN,
    (_match, attributes: string, innerHtml: string) => {
      if (/data-rich-block=["']token["']/i.test(attributes)) {
        const tokenParts = extractTokenBlockParts(innerHtml);
        return tokenParts.value ? `${formatter.token(tokenParts)}\n` : `${tokenParts.label}\n`;
      }

      const codeValue = normalizeInlineText(htmlFragmentToText(innerHtml));
      return codeValue ? `${formatter.code(codeValue)}\n` : "";
    }
  );

  return htmlFragmentToText(
    withStructuredBlocks
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|h1|h2|blockquote|li|ul|ol|div)>/gi, "\n")
  );
}

export function createRichTextCodeBlock(value: string): string | null {
  const normalizedValue = value.replace(/\r\n/g, "\n").trim();

  if (!normalizedValue) {
    return null;
  }

  return `<pre data-rich-block="${RICH_TEXT_CODE_BLOCK}"><code>${escapeHtml(normalizedValue)}</code></pre>`;
}

export function createRichTextTokenBlock(
  value: string,
  label?: string
): string | null {
  const normalizedLabel = label?.trim() ?? "";
  const normalizedValue = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!normalizedValue) {
    return null;
  }

  if (!normalizedLabel) {
    return `<div data-rich-block="${RICH_TEXT_TOKEN_BLOCK}"><code>${escapeHtml(normalizedValue)}</code></div>`;
  }

  return `<div data-rich-block="${RICH_TEXT_TOKEN_BLOCK}"><p>${escapeHtml(normalizedLabel)}</p><code>${escapeHtml(normalizedValue)}</code></div>`;
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

// Browsers keep text typed before the first Enter as a bare root text node;
// wrap such stray text runs in paragraphs so stored sections stay canonical.
// String scanning rather than DOM APIs: services run this on the Node server,
// where no document exists. Input is sanitize-html output, so it is
// well-formed markup with only the supported tags and XHTML-style voids.
function wrapRootLevelTextNodes(html: string): string {
  if (!html) {
    return html;
  }

  const tokens = html.match(/<[^>]*>|[^<]+/g) ?? [];
  const output: string[] = [];
  let depth = 0;
  let pendingText = "";

  const flushPendingText = () => {
    if (!pendingText) {
      return;
    }
    const trimmed = pendingText.trim();
    output.push(trimmed ? `<p>${trimmed}</p>` : pendingText);
    pendingText = "";
  };

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      if (depth === 0) {
        pendingText += token;
      } else {
        output.push(token);
      }
      continue;
    }

    const isClosingTag = token.startsWith("</");
    const isSelfClosing = /\/>$/.test(token);

    if (depth === 0 && !isClosingTag) {
      flushPendingText();
    }
    output.push(token);

    if (isSelfClosing) {
      continue;
    }

    depth = isClosingTag ? Math.max(0, depth - 1) : depth + 1;
  }

  flushPendingText();
  return output.join("");
}

export function coerceRichTextHtml(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  if (!SUPPORTED_HTML_TAG_PATTERN.test(trimmed)) {
    return plainTextToRichText(trimmed);
  }

  const sanitized = sanitizeRichText(trimmed);
  if (sanitized) {
    return wrapRootLevelTextNodes(sanitized);
  }

  // Supported markup whose sanitized text is empty (cleared composers emit
  // leftovers like `<p><br /></p>`) is empty content, not literal text.
  return null;
}

const HTML_ENTITY_DECODE_PATTERN = /&(amp|lt|gt|quot|#39);/g;
const HTML_ENTITY_DECODE_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
};

/**
 * Decode the entities sanitize-html emits, so text projected out of rich
 * content can be compared against raw strings (agent mention tokens keep
 * labels that contain `&` and friends).
 */
export function decodeRichTextEntities(value: string): string {
  return value.replace(
    HTML_ENTITY_DECODE_PATTERN,
    (entity: string, name: string) => HTML_ENTITY_DECODE_MAP[name] ?? entity
  );
}

export function richTextToPlainText(input: string): string {
  const normalizedHtml = getNormalizedRichTextHtml(input);

  return convertRichTextHtmlToText(normalizedHtml, {
    code: (value) => value,
    token: ({ label, value }) => (value ? `${label}: ${value}` : label),
  })
    .replace(/\s+/g, " ")
    .trim();
}

export function richTextToPreviewText(input: string): string {
  const normalizedHtml = getNormalizedRichTextHtml(input);

  const segments = convertRichTextHtmlToText(normalizedHtml, {
    code: (value) => `Code: ${value}`,
    token: ({ label, value }) => (value ? `${label}: hidden value` : label),
  })
    .split(/\n+/)
    .map((segment) => normalizeInlineText(segment))
    .filter(Boolean);

  return segments.reduce((text, segment, index) => {
    if (index === 0) {
      return segment;
    }
    // List segments already carry their own leading bullet; a plain space
    // avoids doubling the " • " separator into "• •".
    return segment.startsWith("• ")
      ? `${text} ${segment}`
      : `${text} • ${segment}`;
  }, "");
}
