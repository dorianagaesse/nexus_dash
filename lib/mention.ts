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

export interface MentionTriggerReplacement {
  value: string;
  cursorPosition: number;
}

const ACTIVE_MENTION_QUERY_REGEX = /^[a-zA-Z0-9_#]*$/;
const MENTION_BOUNDARY_REGEX = /[\s([{]/;
const MENTION_LEFT_BOUNDARY_REGEX = /[a-zA-Z0-9_]/;

function hasMentionLeftBoundary(input: string, startIndex: number): boolean {
  if (startIndex <= 0) {
    return true;
  }

  return !MENTION_LEFT_BOUNDARY_REGEX.test(input[startIndex - 1] ?? "");
}

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
  while ((match = MENTION_REGEX.exec(input)) !== null) {
    const startIndex = match.index;
    if (!hasMentionLeftBoundary(input, startIndex)) {
      continue;
    }

    mentions.push({
      username: match[1],
      discriminator: match[2] ?? null,
      fullMatch: match[0],
      startIndex,
      endIndex: startIndex + match[0].length,
    });
  }

  // Build plain text by replacing mentions with just the username part.
  const plainTextParts: string[] = [];
  let lastEnd = 0;
  for (const mention of mentions) {
    plainTextParts.push(input.slice(lastEnd, mention.startIndex));
    plainTextParts.push(`@${mention.username}`);
    lastEnd = mention.endIndex;
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

  return parseMentions(input).mentions.length > 0;
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
 * Replace an active mention query with the selected mention text.
 */
export function replaceMentionTrigger(input: {
  text: string;
  startIndex: number;
  endIndex: number;
  replacement: string;
}): MentionTriggerReplacement {
  const text = typeof input.text === "string" ? input.text : "";
  const startIndex = Math.max(0, Math.min(input.startIndex, text.length));
  const endIndex = Math.max(startIndex, Math.min(input.endIndex, text.length));
  const shouldConsumeFollowingWhitespace =
    input.replacement.endsWith(" ") && /\s/.test(text[endIndex] ?? "");
  const suffixStartIndex = shouldConsumeFollowingWhitespace ? endIndex + 1 : endIndex;
  const nextValue = `${text.slice(0, startIndex)}${input.replacement}${text.slice(
    suffixStartIndex
  )}`;

  return {
    value: nextValue,
    cursorPosition: startIndex + input.replacement.length,
  };
}

/**
 * Remove the complete mention immediately before the cursor.
 *
 * This is used by plain textarea composers to match rich editor mention-chip
 * deletion: pressing Backspace after `@alice ` removes the whole mention plus
 * the separator, not just one character.
 */
export function removeMentionBeforeCursor(input: {
  text: string;
  cursorPosition: number;
}): MentionTriggerReplacement | null {
  const text = typeof input.text === "string" ? input.text : "";
  const cursorPosition = Math.max(0, Math.min(input.cursorPosition, text.length));
  const { mentions } = parseMentions(text);

  let targetMention: ParsedMention | null = null;

  for (const mention of mentions) {
    if (mention.endIndex > cursorPosition) {
      continue;
    }

    const textBetweenMentionAndCursor = text.slice(mention.endIndex, cursorPosition);
    if (/^\s*$/.test(textBetweenMentionAndCursor)) {
      targetMention = mention;
    }
  }

  if (!targetMention) {
    return null;
  }

  return {
    value: `${text.slice(0, targetMention.startIndex)}${text.slice(cursorPosition)}`,
    cursorPosition: targetMention.startIndex,
  };
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
