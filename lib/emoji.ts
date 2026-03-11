export interface EmojiOption {
  emoji: string;
  name: string;
}

export interface EmojiGroup {
  id: string;
  label: string;
  emojis: EmojiOption[];
}

export const EMOJI_RECENTS_STORAGE_KEY = "nexusdash:emoji-recents";
export const MAX_RECENT_EMOJIS = 12;

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: "faces",
    label: "Faces",
    emojis: [
      { emoji: "😀", name: "Grinning face" },
      { emoji: "🙂", name: "Slightly smiling face" },
      { emoji: "😊", name: "Smiling face" },
      { emoji: "😂", name: "Face with tears of joy" },
      { emoji: "🥲", name: "Smiling through tears" },
      { emoji: "😉", name: "Winking face" },
      { emoji: "🤔", name: "Thinking face" },
      { emoji: "🫡", name: "Saluting face" },
      { emoji: "😎", name: "Smiling face with sunglasses" },
      { emoji: "🥳", name: "Partying face" },
      { emoji: "🚀", name: "Rocket" },
      { emoji: "✨", name: "Sparkles" },
    ],
  },
  {
    id: "signals",
    label: "Signals",
    emojis: [
      { emoji: "👍", name: "Thumbs up" },
      { emoji: "👀", name: "Eyes" },
      { emoji: "👏", name: "Clapping hands" },
      { emoji: "🙌", name: "Raising hands" },
      { emoji: "✅", name: "Check mark" },
      { emoji: "❗", name: "Exclamation mark" },
      { emoji: "⚠️", name: "Warning" },
      { emoji: "🧠", name: "Brain" },
      { emoji: "💡", name: "Light bulb" },
      { emoji: "🔥", name: "Fire" },
      { emoji: "📌", name: "Pushpin" },
      { emoji: "🛠️", name: "Hammer and wrench" },
    ],
  },
  {
    id: "work",
    label: "Work",
    emojis: [
      { emoji: "📅", name: "Calendar" },
      { emoji: "📝", name: "Memo" },
      { emoji: "📎", name: "Paperclip" },
      { emoji: "📣", name: "Megaphone" },
      { emoji: "📦", name: "Package" },
      { emoji: "📈", name: "Chart increasing" },
      { emoji: "🎯", name: "Direct hit" },
      { emoji: "🧪", name: "Test tube" },
      { emoji: "🔍", name: "Magnifying glass" },
      { emoji: "🔒", name: "Lock" },
      { emoji: "🌱", name: "Seedling" },
      { emoji: "🤝", name: "Handshake" },
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      { emoji: "🌿", name: "Herb" },
      { emoji: "🍀", name: "Four leaf clover" },
      { emoji: "🌊", name: "Water wave" },
      { emoji: "☀️", name: "Sun" },
      { emoji: "🌙", name: "Moon" },
      { emoji: "⭐", name: "Star" },
      { emoji: "🌈", name: "Rainbow" },
      { emoji: "🪴", name: "Potted plant" },
      { emoji: "🍵", name: "Teacup" },
      { emoji: "☕", name: "Coffee" },
      { emoji: "🍕", name: "Pizza" },
      { emoji: "🎉", name: "Party popper" },
    ],
  },
];

export function buildNextRecentEmojis(previous: string[], nextEmoji: string): string[] {
  return [nextEmoji, ...previous.filter((emoji) => emoji !== nextEmoji)].slice(
    0,
    MAX_RECENT_EMOJIS
  );
}

export function getEmojiGroupById(groupId: string): EmojiGroup | undefined {
  return EMOJI_GROUPS.find((group) => group.id === groupId);
}
