export interface EmojiCatalogEntry {
  emoji: string;
  hexcode: string;
  name: string;
  shortcode: string;
  hoverLabel: string;
  groupId: string;
  groupLabel: string;
  order: number;
  searchText: string;
}

export interface EmojiCatalogGroup {
  id: string;
  label: string;
  entries: EmojiCatalogEntry[];
}

export interface EmojiCatalog {
  entries: EmojiCatalogEntry[];
  groups: EmojiCatalogGroup[];
  entryByEmoji: Map<string, EmojiCatalogEntry>;
}

interface EmojibaseEntry {
  emoji?: string;
  hexcode: string;
  label: string;
  tags?: string[];
  order?: number;
  group?: number;
}

interface EmojibaseGroupMessage {
  key: string;
  message: string;
  order: number;
}

interface EmojibaseMessages {
  groups: EmojibaseGroupMessage[];
}

type EmojiShortcodeMap = Record<string, string | string[] | undefined>;

export const EMOJI_RECENTS_STORAGE_KEY = "nexusdash:emoji-recents";
export const MAX_RECENT_EMOJIS = 12;
export const MAX_SEARCH_RESULTS = 120;

const EXCLUDED_GROUP_KEYS = new Set(["component"]);

let emojiCatalogPromise: Promise<EmojiCatalog> | null = null;

function normalizeShortcodeValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^:+|:+$/g, "")
    .replace(/[^\w+-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fallbackShortcodeFromLabel(label: string) {
  return normalizeShortcodeValue(label.replace(/['"]/g, ""));
}

function normalizeShortcodes(value: string | string[] | undefined, label: string) {
  const aliases = Array.isArray(value) ? value : value ? [value] : [];
  const normalizedAliases = Array.from(
    new Set(
      aliases
        .map((alias) => normalizeShortcodeValue(alias))
        .filter((alias) => alias.length > 0)
    )
  );

  if (normalizedAliases.length > 0) {
    return normalizedAliases;
  }

  const fallbackAlias = fallbackShortcodeFromLabel(label);
  return fallbackAlias ? [fallbackAlias] : [];
}

function normalizeLabel(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildSearchText(label: string, aliases: string[], tags: string[] = []) {
  return [label, ...aliases, ...tags]
    .map((value) => value.toLowerCase())
    .join(" ");
}

export function buildEmojiCatalog(
  data: EmojibaseEntry[],
  messages: EmojibaseMessages,
  shortcodes: EmojiShortcodeMap
): EmojiCatalog {
  const groupsById = new Map<string, EmojiCatalogGroup>();
  const groupOrder = new Map<string, number>();
  const entryByEmoji = new Map<string, EmojiCatalogEntry>();

  for (const group of messages.groups) {
    if (EXCLUDED_GROUP_KEYS.has(group.key)) {
      continue;
    }

    groupsById.set(group.key, {
      id: group.key,
      label: normalizeLabel(group.message),
      entries: [],
    });
    groupOrder.set(group.key, group.order);
  }

  const entries: EmojiCatalogEntry[] = [];

  for (const entry of data) {
    if (!entry.emoji) {
      continue;
    }

    const groupMessage = typeof entry.group === "number" ? messages.groups[entry.group] : undefined;
    if (!groupMessage || EXCLUDED_GROUP_KEYS.has(groupMessage.key)) {
      continue;
    }

    const aliases = normalizeShortcodes(shortcodes[entry.hexcode], entry.label);
    const primaryShortcode = aliases[0] ?? fallbackShortcodeFromLabel(entry.label);

    const normalizedEntry: EmojiCatalogEntry = {
      emoji: entry.emoji,
      hexcode: entry.hexcode,
      name: entry.label,
      shortcode: primaryShortcode,
      hoverLabel: `:${primaryShortcode}:`,
      groupId: groupMessage.key,
      groupLabel: normalizeLabel(groupMessage.message),
      order: entry.order ?? Number.MAX_SAFE_INTEGER,
      searchText: buildSearchText(entry.label, aliases, entry.tags),
    };

    entries.push(normalizedEntry);
    entryByEmoji.set(normalizedEntry.emoji, normalizedEntry);
    groupsById.get(groupMessage.key)?.entries.push(normalizedEntry);
  }

  entries.sort((left, right) => left.order - right.order);

  const groups = Array.from(groupsById.values())
    .map((group) => ({
      ...group,
      entries: group.entries.sort((left, right) => left.order - right.order),
    }))
    .filter((group) => group.entries.length > 0)
    .sort((left, right) => (groupOrder.get(left.id) ?? 0) - (groupOrder.get(right.id) ?? 0));

  return {
    entries,
    groups,
    entryByEmoji,
  };
}

export async function loadEmojiCatalog() {
  if (!emojiCatalogPromise) {
    emojiCatalogPromise = Promise.all([
      import("emojibase-data/en/data.json"),
      import("emojibase-data/en/messages.json"),
      import("emojibase-data/en/shortcodes/github.json"),
    ]).then(([dataModule, messagesModule, shortcodesModule]) =>
      buildEmojiCatalog(
        (dataModule.default ?? dataModule) as EmojibaseEntry[],
        (messagesModule.default ?? messagesModule) as EmojibaseMessages,
        (shortcodesModule.default ?? shortcodesModule) as EmojiShortcodeMap
      )
    );
  }

  return emojiCatalogPromise;
}

export function buildNextRecentEmojis(previous: string[], nextEmoji: string): string[] {
  return [nextEmoji, ...previous.filter((emoji) => emoji !== nextEmoji)].slice(
    0,
    MAX_RECENT_EMOJIS
  );
}

export function normalizeRecentEmojis(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedRecents: string[] = [];
  const seenEmojis = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string" || seenEmojis.has(entry)) {
      continue;
    }

    seenEmojis.add(entry);
    normalizedRecents.push(entry);

    if (normalizedRecents.length >= MAX_RECENT_EMOJIS) {
      break;
    }
  }

  return normalizedRecents;
}

export function findEmojiMatches(
  entries: EmojiCatalogEntry[],
  query: string,
  limit = MAX_SEARCH_RESULTS
) {
  const normalizedQuery = query.trim().toLowerCase().replace(/^:+|:+$/g, "");
  if (!normalizedQuery) {
    return [];
  }

  return entries
    .map((entry) => {
      const shortcodeScore = entry.shortcode === normalizedQuery
        ? 0
        : entry.shortcode.startsWith(normalizedQuery)
          ? 1
          : entry.shortcode.includes(normalizedQuery)
            ? 2
            : Number.POSITIVE_INFINITY;
      const labelScore = entry.name.toLowerCase() === normalizedQuery
        ? 3
        : entry.name.toLowerCase().startsWith(normalizedQuery)
          ? 4
          : entry.name.toLowerCase().includes(normalizedQuery)
            ? 5
            : Number.POSITIVE_INFINITY;
      const searchScore = entry.searchText.includes(normalizedQuery) ? 6 : Number.POSITIVE_INFINITY;
      const score = Math.min(shortcodeScore, labelScore, searchScore);

      return {
        entry,
        score,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => left.score - right.score || left.entry.order - right.entry.order)
    .slice(0, limit)
    .map((candidate) => candidate.entry);
}

export function getRecentEmojiEntries(catalog: EmojiCatalog, recentEmojis: string[]) {
  return recentEmojis
    .map((emoji) => catalog.entryByEmoji.get(emoji))
    .filter((entry): entry is EmojiCatalogEntry => Boolean(entry));
}
