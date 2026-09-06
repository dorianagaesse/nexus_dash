export const COMMENT_BODY_COLLAPSED_MAX_HEIGHT_REM = 7.5;

/**
 * True when `element` would clip under the collapsed comment cap. The cap is
 * expressed in rem so it stays in sync with the inline `max-height` the
 * collapsed comment body renders with, whatever the root font size.
 */
export function measureCommentBodyOverflow(element: HTMLElement): boolean {
  const rootStyle = window.getComputedStyle(document.documentElement);
  const rootFontSizePx = Number.parseFloat(rootStyle.fontSize);
  const baseFontSizePx =
    Number.isFinite(rootFontSizePx) && rootFontSizePx > 0 ? rootFontSizePx : 16;
  const collapsedCapPx = baseFontSizePx * COMMENT_BODY_COLLAPSED_MAX_HEIGHT_REM;

  return element.scrollHeight > collapsedCapPx + 0.5;
}
