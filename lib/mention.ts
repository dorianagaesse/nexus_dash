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

/**
 * Parse all @mentions from a string.
 * Returns both the extracted mentions and the plain-text version with mentions removed.
 */
export function parseMentions(input: string): MentionParseResult {
  if (typeof input !== "string" || !input) {
    return { mentions: [], plainText: "" };
  }

  const mentions: ParsedMention[] = [];
  let match: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(input)) !== null) {
    mentions.push({
      username: match[1],
      discriminator: match[2] ?? null,
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Build plain text by replacing mentions with just the username part
  const plainText = input.replace(MENTION_REGEX, (_full, username) => `@${username}`);

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
