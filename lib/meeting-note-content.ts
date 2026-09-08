import { richTextToPlainText, richTextToPreviewText } from "@/lib/rich-text";

// Sections store canonical rich-text HTML, but legacy rows still hold plain
// text; both forms must read identically in search and previews.
export function meetingNoteSectionsSearchText(
  inputNotes: string,
  outputNotes: string
): string {
  return `${richTextToPlainText(inputNotes)} ${richTextToPlainText(
    outputNotes
  )}`.trim();
}

export function meetingNoteInputPreviewText(inputNotes: string): string {
  return richTextToPreviewText(inputNotes)
    .replace(/\s*•\s*/g, " • ")
    .replace(/(?: • )+/g, " • ")
    .trim();
}
