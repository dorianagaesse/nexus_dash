const RAW_URL_PATTERN = /https?:\/\/[^\s<>]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.!?;:'"\]}]+$/;
const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "com.au",
  "com.br",
  "com.mx",
  "co.jp",
  "co.nz",
]);

function humanizeHostnamePart(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function getCompactLinkTitle(href: string): string {
  try {
    const url = new URL(href);
    if (url.protocol === "mailto:") {
      return decodeURIComponent(url.pathname);
    }

    const labels = url.hostname.replace(/^www\./i, "").split(".").filter(Boolean);
    if (labels.length === 0) {
      return href;
    }

    const suffixLength = COMMON_SECOND_LEVEL_SUFFIXES.has(labels.slice(-2).join("."))
      ? 2
      : 1;
    const brandIndex = Math.max(0, labels.length - suffixLength - 1);
    const brand = humanizeHostnamePart(labels[brandIndex] ?? "");
    const subdomain = labels
      .slice(0, brandIndex)
      .filter((label) => label.toLowerCase() !== "www")
      .map(humanizeHostnamePart)
      .join(" ");

    return [brand, subdomain].filter(Boolean).join(" ") || href;
  } catch {
    return href;
  }
}

export function configureRichTextLink(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href")?.trim() ?? "";
  if (!/^(https?:|mailto:)/i.test(href)) {
    return;
  }

  const visibleText = anchor.textContent?.trim() ?? "";
  if (visibleText === href) {
    anchor.textContent = getCompactLinkTitle(href);
  }

  anchor.dataset.richLink = "true";
  if (/^https?:/i.test(href)) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
}

type LinkifyPlainTextUrlsOptions = {
  requireTrailingBoundary?: boolean;
};

export function linkifyPlainTextUrls(
  root: ParentNode,
  { requireTrailingBoundary = false }: LinkifyPlainTextUrlsOptions = {}
): boolean {
  const documentRef = root.ownerDocument ?? document;
  const walker = documentRef.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    if (
      textNode.parentElement?.closest(
        "a, pre, code, button, input, textarea, [data-rich-token-shell], [data-rich-block], [data-editor-mention]"
      )
    ) {
      continue;
    }

    RAW_URL_PATTERN.lastIndex = 0;
    if (RAW_URL_PATTERN.test(textNode.data)) {
      textNodes.push(textNode);
    }
  }

  let didChange = false;
  for (const textNode of textNodes) {
    const fragment = documentRef.createDocumentFragment();
    let lastIndex = 0;
    let didReplaceNode = false;
    RAW_URL_PATTERN.lastIndex = 0;

    for (const match of textNode.data.matchAll(RAW_URL_PATTERN)) {
      const matchIndex = match.index ?? 0;
      const matchedValue = match[0];
      const href = matchedValue.replace(TRAILING_URL_PUNCTUATION, "");
      const suffix = matchedValue.slice(href.length);
      const matchEnd = matchIndex + matchedValue.length;

      if (!href || (requireTrailingBoundary && matchEnd === textNode.data.length)) {
        continue;
      }

      fragment.append(documentRef.createTextNode(textNode.data.slice(lastIndex, matchIndex)));
      const anchor = documentRef.createElement("a");
      anchor.href = href;
      anchor.textContent = getCompactLinkTitle(href);
      configureRichTextLink(anchor);
      fragment.append(anchor);
      if (suffix) {
        fragment.append(documentRef.createTextNode(suffix));
      }
      lastIndex = matchEnd;
      didReplaceNode = true;
      didChange = true;
    }

    if (didReplaceNode) {
      fragment.append(documentRef.createTextNode(textNode.data.slice(lastIndex)));
      textNode.replaceWith(fragment);
    }
  }

  return didChange;
}
