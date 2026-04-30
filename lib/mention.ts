/**
 * Mention parsing utilities for @username#discriminator tagging.
 *
 * Matches patterns like @alice or @alice#1234 where username is 1-20 chars
 * and discriminator is 1-4 chars.
 */

const MENTION_REGEX = /@([a-zA-Z0-9_]{1,20})(?:#([a-zA-Z0-9]{1,4}))?(?![a-zA-Z0-9_])/g;

export interface ParsedMention {
  username: string;
  discriminator: string | null;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
}

export interface MentionParseResult {
  mentions: ParsedMention[];
  plainText: string;
}

export interface ActiveMentionTrigger {
  startIndex: number;
  query: string;
}

const ACTIVE_MENTION_QUERY_REGEX = /^[a-zA-Z0-9_#]*$/;
const MENTION_BOUNDARY_REGEX = /[\s([{]/;

/**
 * Parse all @mentions from a string.
 * Returns both the extracted mentions and the plain-text version with
 * discriminator suffix stripped (e.g. "@alice#1234" -> "@alice").
 *
 * Note: left boundary check is applied (mention must be at string start or
 * preceded by whitespace or a punctuation char) to avoid matching @ inside
 * email addresses. This is conservative — some valid patterns at other
 * boundaries (e.g. `@alice.`, `@alice!`) are not captured.
 */
export function parseMentions(input: string): MentionParseResult {
  if (typeof input !== "string" || !input) {
    return { mentions: [], plainText: "" };
  }

  const mentions: ParsedMention[] = [];
  let match: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  let searchFrom = 0;
  while ((match = MENTION_REGEX.exec(input)) !== null) {
    const startIndex = match.index;
    // Skip matches before our current scan position (avoids stale matches after reset)
    if (startIndex < searchFrom) {
      continue;
    }
    const charBefore = startIndex > 0 ? input[startIndex - 1] : " ";
    // Skip @ preceded by an alphanumeric char (email addresses, etc.)
    if (/[a-zA-Z0-9]/.test(charBefore)) {
      searchFrom = startIndex + match[0].length;
      continue;
    }
    mentions.push({
      username: match[1],
      discriminator: match[2] ?? null,
      fullMatch: match[0],
      startIndex,
      endIndex: startIndex + match[0].length,
    });
    searchFrom = startIndex + match[0].length;
  }

  // Build plain text by replacing mentions with just the username part.
  // Apply same skip logic as above for consistency (skip email-like @).
  const plainTextParts: string[] = [];
  let lastEnd = 0;
  for (const match of input.matchAll(new RegExp(MENTION_REGEX.source, "g"))) {
    const startIdx = match.index!;
    const charBefore = startIdx > 0 ? input[startIdx - 1] : " ";
    if (/[a-zA-Z0-9]/.test(charBefore)) {
      lastEnd = startIdx + match[0].length;
      continue;
    }
    plainTextParts.push(input.slice(lastEnd, startIdx));
    plainTextParts.push(`@${match[1]}`); // strip discriminator in plain text
    lastEnd = startIdx + match[0].length;
  }
  plainTextParts.push(input.slice(lastEnd));
  const plainText = plainTextParts.join("");

  return { mentions, plainText };
}

/**
 * Check if a string contains any @mentions.
 */
export function containsMentions(input: string): boolean {
  if (typeof input !== "string" || !input) {
    return false;
  }

  MENTION_REGEX.lastIndex = 0;
  return MENTION_REGEX.test(input);
}

/**
 * Extract unique usernames from a string's mentions.
 * Returns a set of normalized usernames (lowercase).
 */
export function extractMentionedUsernames(input: string): Set<string> {
  const { mentions } = parseMentions(input);
  const usernames = new Set<string>();

  for (const mention of mentions) {
    usernames.add(mention.username.toLowerCase());
  }

  return usernames;
}

/**
 * Build a mention string from username and optional discriminator.
 */
export function buildMentionString(username: string, discriminator: string | null): string {
  if (discriminator) {
    return `@${username}#${discriminator}`;
  }

  return `@${username}`;
}

/**
 * Check if a username matches a mention pattern.
 */
export function isValidMentionUsername(username: string): boolean {
  if (typeof username !== "string") {
    return false;
  }

  return /^[a-zA-Z0-9_]{1,20}$/.test(username);
}

/**
 * Locate the currently edited @mention immediately before a text cursor.
 */
export function getActiveMentionTrigger(
  input: string,
  cursorPosition: number
): ActiveMentionTrigger | null {
  if (typeof input !== "string" || cursorPosition < 0) {
    return null;
  }

  const clampedCursorPosition = Math.min(cursorPosition, input.length);
  const textBeforeCursor = input.slice(0, clampedCursorPosition);
  const lastAtIndex = textBeforeCursor.lastIndexOf("@");
  if (lastAtIndex === -1) {
    return null;
  }

  const boundaryCharacter = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : "";
  if (lastAtIndex > 0 && !MENTION_BOUNDARY_REGEX.test(boundaryCharacter)) {
    return null;
  }

  const query = textBeforeCursor.slice(lastAtIndex + 1);
  if (!ACTIVE_MENTION_QUERY_REGEX.test(query)) {
    return null;
  }

  return {
    startIndex: lastAtIndex,
    query,
  };
}
