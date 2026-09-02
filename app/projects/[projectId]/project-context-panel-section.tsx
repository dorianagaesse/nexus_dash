import { PanelsTopLeft } from "lucide-react";

import {
  PROJECT_SECTION_CARD_CLASS,
  PROJECT_SECTION_CONTENT_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "@/components/project-dashboard/project-section-chrome";
import { ProjectContextPanel } from "@/components/project-context-panel";
import {
  type ProjectContextActorSummary,
  type ProjectContextAttachmentProjection,
} from "@/components/project-context-panel-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContextCardColorFromSeed } from "@/lib/context-card-colors";

import {
  projectContextCard,
  loadContextCardActorRegistryForProject,
  type ContextCardCardRecord,
} from "@/lib/services/context-card-stewardship-service";
import { listProjectContextResources } from "@/lib/services/project-service";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";

type ContextCardAttachment =
  Awaited<ReturnType<typeof listProjectContextResources>>[number]["attachments"][number];

interface ProjectContextPanelSectionProps {
  projectId: string;
  actorUserId: string;
  canEdit: boolean;
  storageProvider: "local" | "r2";
}

export async function ProjectContextPanelSection({
  projectId,
  actorUserId,
  canEdit,
  storageProvider,
}: ProjectContextPanelSectionProps) {
  const resources = await listProjectContextResources(projectId, actorUserId);
  const registry = await loadContextCardActorRegistryForProject({
    actorUserId,
    projectId,
  });
  const now = new Date();

  const cards = resources.map((resource) => {
    const cardRecord = resource as unknown as ContextCardCardRecord;
    const projection = projectContextCard({
      card: cardRecord,
      now,
      registry,
    });

    const attachments = resource.attachments.map(
      (attachment: ContextCardAttachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        url: attachment.url,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        downloadUrl:
          attachment.kind === ATTACHMENT_KIND_FILE
            ? `/api/projects/${projectId}/context-cards/${resource.id}/attachments/${attachment.id}/download`
            : null,
      })
    );

    const attachmentProjections: ProjectContextAttachmentProjection[] =
      projection.attachments.map((attachmentProjection) => ({
        id: attachmentProjection.id,
        kind: attachmentProjection.kind,
        name: attachmentProjection.name,
        url: attachmentProjection.url,
        mimeType: attachmentProjection.mimeType,
        sizeBytes: attachmentProjection.sizeBytes,
        uploadedBy:
          (attachmentProjection.uploadedBy as ProjectContextActorSummary | null) ??
          null,
        uploadedByDisplayNameSnapshot:
          attachmentProjection.uploadedByDisplayNameSnapshot,
        uploadedAt:
          attachmentProjection.uploadedAt instanceof Date
            ? attachmentProjection.uploadedAt.toISOString()
            : (attachmentProjection.uploadedAt as unknown as string),
      }));

    return {
      id: resource.id,
      title: resource.name,
      content: resource.content,
      color: resource.color ?? getContextCardColorFromSeed(resource.id),
      createdAt: resource.createdAt.toISOString(),
      updatedAt: cardRecord.updatedAt.toISOString(),
      attachments,
      projection: {
        id: projection.id,
        creator: projection.creator as ProjectContextActorSummary | null,
        lastEditor: projection.lastEditor as ProjectContextActorSummary | null,
        attachments: attachmentProjections,
      },
    };
  });

  return (
    <ProjectContextPanel
      canEdit={canEdit}
      projectId={projectId}
      storageProvider={storageProvider}
      cards={cards}
    />
  );
}

export function ProjectContextPanelSkeleton() {
  return (
    <Card className={PROJECT_SECTION_CARD_CLASS}>
      <CardHeader className={PROJECT_SECTION_HEADER_CLASS}>
        <CardTitle className="flex items-center gap-2 text-base">
          <PanelsTopLeft className="h-4 w-4" />
          Project context
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-3 ${PROJECT_SECTION_CONTENT_CLASS}`}>
        <div className="h-20 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-20 w-full animate-pulse rounded-xl bg-muted" />
      </CardContent>
    </Card>
  );
}
