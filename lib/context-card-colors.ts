export const CONTEXT_CARD_COLORS = [
  "#FDE2E4",
  "#FDECC8",
  "#E5F4E3",
  "#DFF3F9",
  "#E8E4FB",
  "#FBE4F3",
  "#F1F3D8",
  "#E7EEF8",
] as const;

export type ContextCardColor = (typeof CONTEXT_CARD_COLORS)[number];

const CONTEXT_CARD_COLOR_SET = new Set<string>(CONTEXT_CARD_COLORS);

export function isContextCardColor(value: string): value is ContextCardColor {
  return CONTEXT_CARD_COLOR_SET.has(value);
}

export function getContextCardColorFromSeed(seed: string): ContextCardColor {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 2147483647;
  }

  return CONTEXT_CARD_COLORS[Math.abs(hash) % CONTEXT_CARD_COLORS.length];
}
