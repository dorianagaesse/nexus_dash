import sanitizeHtml from "sanitize-html";

export const RICH_TEXT_CODE_BLOCK = "code";
export const RICH_TEXT_TOKEN_BLOCK = "token";

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

export function formatCompactRichTextTokenValue(value: string): string {
  const normalizedValue = normalizeInlineText(value);

  if (normalizedValue.length <= 28) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 16)}...${normalizedValue.slice(-10)}`;
}

export function createRichTextCodeBlock(value: string): string | null {
  const normalizedValue = value.replace(/\r\n/g, "\n").trim();

  if (!normalizedValue) {
    return null;
  }

  return `<pre data-rich-block="${RICH_TEXT_CODE_BLOCK}"><code>${escapeHtml(normalizedValue)}</code></pre>`;
}

export function createRichTextTokenBlock(label: string, value: string): string | null {
  const normalizedLabel = label.trim();
  const normalizedValue = value.replace(/\r\n/g, "\n").trim();

  if (!normalizedLabel || !normalizedValue) {
    return null;
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

  return convertRichTextHtmlToText(normalizedHtml, {
    code: (value) => `Code: ${value}`,
    token: ({ label, value }) =>
      value ? `${label}: ${formatCompactRichTextTokenValue(value)}` : label,
  })
    .split(/\n+/)
    .map((segment) => normalizeInlineText(segment))
    .filter(Boolean)
    .join(" • ");
}
