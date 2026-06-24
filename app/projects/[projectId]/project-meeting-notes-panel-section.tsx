import { ClipboardList } from "lucide-react";

import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import {
  ProjectMeetingNotesPanel,
} from "@/components/project-meeting-notes-panel";
import type { ProjectMeetingNotePanelNote } from "@/components/meeting-todos/meeting-note-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjectMeetingNotes } from "@/lib/services/project-meeting-note-service";

interface ProjectMeetingNotesPanelSectionProps {
  projectId: string;
  actorUserId: string;
  canEdit: boolean;
}

function serializeMeetingNote(
  note: Awaited<ReturnType<typeof listProjectMeetingNotes>>[number]
): ProjectMeetingNotePanelNote {
  return {
    ...note,
    scheduledAt: note.scheduledAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    actions: note.actions.map((action) => ({
      ...action,
      completedAt: action.completedAt?.toISOString() ?? null,
    })),
  };
}

export async function ProjectMeetingNotesPanelSection({
  projectId,
  actorUserId,
  canEdit,
}: ProjectMeetingNotesPanelSectionProps) {
  const notes = await listProjectMeetingNotes({
    projectId,
    actorUserId,
  });

  return (
    <ProjectMeetingNotesPanel
      projectId={projectId}
      canEdit={canEdit}
      notes={notes.map((note) => serializeMeetingNote(note))}
    />
  );
}

export function ProjectMeetingNotesPanelSkeleton() {
  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" />
          Meeting notes
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-3 ${PROJECT_SECTION_CONTENT_CLASS}`}>
        <div className="h-11 w-full animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.85fr),minmax(0,1.65fr)]">
          <div className="space-y-2">
            <div className="h-20 w-full animate-pulse rounded-xl bg-muted" />
            <div className="h-20 w-full animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="h-56 w-full animate-pulse rounded-xl bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}
