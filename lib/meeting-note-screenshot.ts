export type MeetingScreenshotSection = "input" | "output";

export interface MeetingNoteScreenshot {
  isDraft?: boolean;
  id: string;
  section: MeetingScreenshotSection;
  kind: "file";
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: null;
  downloadUrl: string;
}

export const MAX_MEETING_SCREENSHOTS = 10;

export function meetingScreenshotIds(
  screenshots: MeetingNoteScreenshot[] | undefined
): string[] {
  return (screenshots ?? []).map(({ id }) => id).sort();
}
