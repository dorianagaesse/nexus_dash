import { PanelsTopLeft } from "lucide-react";

import { ProjectContextPanel } from "@/components/project-context-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContextCardColorFromSeed } from "@/lib/context-card-colors";
import { listProjectContextResources } from "@/lib/services/project-service";
import { ATTACHMENT_KIND_FILE } from "@/lib/task-attachment";

interface ProjectContextPanelSectionProps {
  projectId: string;
  storageProvider: "local" | "r2";
}

export async function ProjectContextPanelSection({
  projectId,
  storageProvider,
}: ProjectContextPanelSectionProps) {
  const resources = await listProjectContextResources(projectId);

  const cards = resources.map((resource) => ({
    id: resource.id,
    title: resource.name,
    content: resource.content,
    color: resource.color ?? getContextCardColorFromSeed(resource.id),
    attachments: resource.attachments.map((attachment) => ({
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
    })),
  }));

  return (
    <ProjectContextPanel
      projectId={projectId}
      storageProvider={storageProvider}
      cards={cards}
    />
  );
}

export function ProjectContextPanelSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PanelsTopLeft className="h-4 w-4" />
          Project context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-20 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-20 w-full animate-pulse rounded-md bg-muted" />
      </CardContent>
    </Card>
  );
}
