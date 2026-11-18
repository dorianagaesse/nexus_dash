import type { DbClient } from "@/lib/services/rls-context";

// Published attachment names only; matching and result limits belong to the service.
export function loadProjectTaskSearchDocuments(db: DbClient, projectId: string) {
  return db.task.findMany({
    where: { projectId },
    orderBy: [
      // Postgres ASC defaults to NULLS LAST, so archived rows would
      // precede active ones and the bounded agent slice could drop
      // active matches entirely.
      { archivedAt: { sort: "asc", nulls: "first" } },
      { status: "asc" },
      { position: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      referenceNumber: true,
      title: true,
      description: true,
      status: true,
      label: true,
      labelsJson: true,
      blockedNote: true,
      comments: { select: { content: true } },
      epic: { select: { name: true } },
      assigneeKind: true,
      assigneeCredentialId: true,
      assigneeDisplayNameSnapshot: true,
      assigneeUser: {
        select: {
          name: true,
          username: true,
          usernameDiscriminator: true,
        },
      },
      blockedFollowUps: { select: { content: true } },
      attachments: { where: { isCommentDraft: false }, select: { name: true } },
      outgoingRelations: {
        select: { rightTask: { select: { title: true } } },
      },
      incomingRelations: {
        select: { leftTask: { select: { title: true } } },
      },
    },
  });
}
