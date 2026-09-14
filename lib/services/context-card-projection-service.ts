import { Prisma } from "@prisma/client";

import { type ContextCardActorSummary } from "@/lib/context-card-actor";
import { buildProjectPrincipalWhere } from "@/lib/services/project-access-service";
import {
  loadContextCardActorRegistry,
  mapStoredContextCardActor,
  contextCardActorCredentialSelect,
  contextCardActorUserSelect,
  type ContextCardActorRegistry,
} from "@/lib/services/context-card-actor-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

export interface ContextCardProjection {
  id: string;
  creator: ContextCardActorSummary | null;
  lastEditor: ContextCardActorSummary | null;
  attachments: ContextCardAttachmentProjection[];
}

export interface ContextCardAttachmentProjection {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: ContextCardActorSummary | null;
  uploadedByDisplayNameSnapshot: string;
  uploadedAt: Date;
}

export interface ContextCardCardRecord {
  id: string;
  projectId: string;
  updatedAt: Date;
  createdByUserId: string | null;
  createdByCredentialId: string | null;
  creatorKind: "human" | "agent";
  creatorDisplayNameSnapshot: string;
  lastEditedByUserId: string | null;
  lastEditedByCredentialId: string | null;
  lastEditorKind: "human" | "agent" | null;
  lastEditorDisplayNameSnapshot: string | null;
  createdByUser?: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  } | null;
  createdByCredential?: {
    id: string;
    label: string;
    projectId: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  lastEditedByUser?: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  } | null;
  lastEditedByCredential?: {
    id: string;
    label: string;
    projectId: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  attachments?: ContextCardAttachmentRecord[];
}

export interface ContextCardAttachmentRecord {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByUserId: string;
  uploadedByKind: "human" | "agent";
  uploadedByDisplayNameSnapshot: string;
  createdAt: Date;
  uploadedBy?: {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null;
    usernameDiscriminator: string | null;
    avatarSeed: string | null;
  } | null;
}

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapAttachmentProjection(
  attachment: ContextCardAttachmentRecord,
  registry: ContextCardActorRegistry | null
): ContextCardAttachmentProjection {
  const uploader =
    attachment.uploadedByKind === "human"
      ? mapStoredContextCardActor({
          kind: "human",
          id: attachment.uploadedByUserId,
          displayNameSnapshot: attachment.uploadedByDisplayNameSnapshot,
          user: attachment.uploadedBy,
          isCurrentProjectHuman: Boolean(
            attachment.uploadedByUserId &&
              registry?.activeHumanIds.has(attachment.uploadedByUserId)
          ),
        })
      : mapStoredContextCardActor({
          kind: "agent",
          id: attachment.uploadedByUserId,
          displayNameSnapshot: attachment.uploadedByDisplayNameSnapshot,
        });
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    url: attachment.url,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedBy: uploader,
    uploadedByDisplayNameSnapshot: attachment.uploadedByDisplayNameSnapshot,
    uploadedAt: attachment.createdAt,
  };
}

export function projectContextCard(input: {
  card: ContextCardCardRecord;
  registry?: ContextCardActorRegistry | null;
}): ContextCardProjection {
  const registry = input.registry ?? null;

  function isCurrentHuman(userId: string | null): boolean | undefined {
    if (!userId || !registry) {
      return undefined;
    }
    return registry.activeHumanIds.has(userId);
  }

  return {
    id: input.card.id,
    creator: mapStoredContextCardActor({
      kind: input.card.creatorKind,
      id:
        input.card.creatorKind === "human"
          ? input.card.createdByUserId
          : input.card.createdByCredentialId,
      displayNameSnapshot: input.card.creatorDisplayNameSnapshot,
      user: input.card.createdByUser,
      credential: input.card.createdByCredential,
      isCurrentProjectHuman: isCurrentHuman(input.card.createdByUserId),
    }),
    lastEditor:
      input.card.lastEditorKind && input.card.lastEditorDisplayNameSnapshot
        ? mapStoredContextCardActor({
            kind: input.card.lastEditorKind,
            id:
              input.card.lastEditorKind === "human"
                ? input.card.lastEditedByUserId
                : input.card.lastEditedByCredentialId,
            displayNameSnapshot: input.card.lastEditorDisplayNameSnapshot,
            user: input.card.lastEditedByUser,
            credential: input.card.lastEditedByCredential,
            isCurrentProjectHuman: isCurrentHuman(input.card.lastEditedByUserId),
          })
        : null,
    attachments: (input.card.attachments ?? []).map((attachment) =>
      mapAttachmentProjection(attachment, registry)
    ),
  };
}

export const contextCardCardSelect = {
  id: true,
  projectId: true,
  updatedAt: true,
  createdByUserId: true,
  createdByCredentialId: true,
  creatorKind: true,
  creatorDisplayNameSnapshot: true,
  lastEditedByUserId: true,
  lastEditedByCredentialId: true,
  lastEditorKind: true,
  lastEditorDisplayNameSnapshot: true,
  createdByUser: { select: contextCardActorUserSelect },
  createdByCredential: { select: contextCardActorCredentialSelect },
  lastEditedByUser: { select: contextCardActorUserSelect },
  lastEditedByCredential: { select: contextCardActorCredentialSelect },
} satisfies Prisma.ResourceSelect;

export const contextCardAttachmentSelect = {
  id: true,
  kind: true,
  name: true,
  url: true,
  mimeType: true,
  sizeBytes: true,
  uploadedByUserId: true,
  uploadedByKind: true,
  uploadedByDisplayNameSnapshot: true,
  createdAt: true,
  uploadedBy: { select: contextCardActorUserSelect },
} satisfies Prisma.ResourceAttachmentSelect;

export async function recordContextCardEditor(input: {
  db: Prisma.TransactionClient;
  cardId: string;
  editor: { userId: string | null; credentialId: string | null; displayNameSnapshot: string; kind: "human" | "agent" };
}): Promise<void> {
  await input.db.resource.update({
    where: { id: input.cardId },
    data: {
      lastEditedByUserId: input.editor.userId,
      lastEditedByCredentialId: input.editor.credentialId,
      lastEditorKind: input.editor.kind,
      lastEditorDisplayNameSnapshot: input.editor.displayNameSnapshot,
    },
  });
}

export async function recordContextCardCreator(input: {
  db: Prisma.TransactionClient;
  cardId: string;
  creator: { userId: string | null; credentialId: string | null; displayNameSnapshot: string; kind: "human" | "agent" };
}): Promise<void> {
  await input.db.resource.update({
    where: { id: input.cardId },
    data: {
      createdByUserId: input.creator.userId,
      createdByCredentialId: input.creator.credentialId,
      creatorKind: input.creator.kind,
      creatorDisplayNameSnapshot: input.creator.displayNameSnapshot,
      lastEditedByUserId: input.creator.userId,
      lastEditedByCredentialId: input.creator.credentialId,
      lastEditorKind: input.creator.kind,
      lastEditorDisplayNameSnapshot: input.creator.displayNameSnapshot,
    },
  });
}

// Used by the dashboard loader to hydrate creator/editor actors without going
// through the service boundary.
export async function loadContextCardActorRegistryForProject(input: {
  actorUserId: string;
  projectId: string;
}): Promise<ContextCardActorRegistry | null> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  const projectId = normalizeIdentifier(input.projectId);
  if (!actorUserId || !projectId) {
    return null;
  }
  return withActorRlsContext(actorUserId, async (db) => {
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        ...buildProjectPrincipalWhere(actorUserId),
      },
      select: { id: true },
    });
    if (!project) {
      return null;
    }
    return loadContextCardActorRegistry({ db, projectId });
  }) as Promise<ContextCardActorRegistry | null>;
}
