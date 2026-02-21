import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import { resolveActorUserId } from "@/lib/services/actor-service";
import {
  buildProjectAccessWhere,
  ensureProjectOwnerMembership,
  hasProjectAccess,
} from "@/lib/services/project-authorization-service";

const ARCHIVE_AFTER_DAYS = 7;
const ARCHIVE_AFTER_MS = ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

interface ProjectUpsertInput {
  name: string;
  description: string | null;
  actorUserId?: string | null;
}

interface ProjectUpdateInput extends ProjectUpsertInput {
  projectId: string;
}

export async function listProjectsWithCounts(input?: {
  actorUserId?: string | null;
}) {
  const actorUserId = await resolveActorUserId({
    preferredUserId: input?.actorUserId ?? null,
  });

  return prisma.project.findMany({
    where: buildProjectAccessWhere({
      actorUserId,
      minimumRole: "viewer",
    }),
    orderBy: [{ updatedAt: "desc" }],
    include: {
      _count: {
        select: {
          tasks: true,
          resources: true,
        },
      },
    },
  });
}

export type ProjectWithCounts = Awaited<
  ReturnType<typeof listProjectsWithCounts>
>[number];

export async function createProject(input: ProjectUpsertInput) {
  const actorUserId = await resolveActorUserId({
    preferredUserId: input.actorUserId ?? null,
  });

  return prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      ownerId: actorUserId,
      memberships: {
        create: {
          userId: actorUserId,
          role: "owner",
        },
      },
    },
  });
}

export async function updateProject(input: ProjectUpdateInput) {
  const actorUserId = await resolveActorUserId({
    preferredUserId: input.actorUserId ?? null,
  });
  const hasAccess = await hasProjectAccess({
    projectId: input.projectId,
    actorUserId,
    minimumRole: "owner",
  });

  if (!hasAccess) {
    throw new Error("project-not-found");
  }

  return prisma.project.update({
    where: { id: input.projectId },
    data: {
      name: input.name,
      description: input.description,
    },
  });
}

export async function deleteProject(projectId: string) {
  const actorUserId = await resolveActorUserId();
  const hasAccess = await hasProjectAccess({
    projectId,
    actorUserId,
    minimumRole: "owner",
  });

  if (!hasAccess) {
    throw new Error("project-not-found");
  }

  return prisma.project.delete({
    where: { id: projectId },
  });
}

function buildStaleDoneTaskFilter(projectId: string) {
  const archiveThreshold = new Date(Date.now() - ARCHIVE_AFTER_MS);

  return {
    projectId,
    status: "Done" as const,
    archivedAt: null,
    OR: [
      { completedAt: { lte: archiveThreshold } },
      { completedAt: null, updatedAt: { lte: archiveThreshold } },
    ],
  };
}

async function archiveStaleDoneTasks(projectId: string) {
  const staleDoneTaskFilter = buildStaleDoneTaskFilter(projectId);

  const staleDoneTask = await prisma.task.findFirst({
    where: staleDoneTaskFilter,
    select: { id: true },
  });

  if (staleDoneTask) {
    await prisma.task.updateMany({
      where: staleDoneTaskFilter,
      data: {
        archivedAt: new Date(),
      },
    });
  }
}

export async function getProjectSummaryById(
  projectId: string,
  input?: { actorUserId?: string | null }
) {
  const actorUserId = await resolveActorUserId({
    preferredUserId: input?.actorUserId ?? null,
  });

  return prisma.project.findFirst({
    where: {
      id: projectId,
      ...buildProjectAccessWhere({
        actorUserId,
        minimumRole: "viewer",
      }),
    },
    select: {
      id: true,
      name: true,
      description: true,
      _count: {
        select: {
          tasks: true,
        },
      },
    },
  });
}

export async function listProjectKanbanTasks(
  projectId: string,
  input?: { actorUserId?: string | null }
) {
  const actorUserId = await resolveActorUserId({
    preferredUserId: input?.actorUserId ?? null,
  });
  const hasAccess = await hasProjectAccess({
    projectId,
    actorUserId,
    minimumRole: "viewer",
  });

  if (!hasAccess) {
    return [];
  }

  await archiveStaleDoneTasks(projectId);

  return prisma.task.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    include: {
      attachments: {
        orderBy: [{ createdAt: "desc" }],
      },
      blockedFollowUps: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });
}

export async function listProjectContextResources(
  projectId: string,
  input?: { actorUserId?: string | null }
) {
  const actorUserId = await resolveActorUserId({
    preferredUserId: input?.actorUserId ?? null,
  });
  const hasAccess = await hasProjectAccess({
    projectId,
    actorUserId,
    minimumRole: "viewer",
  });

  if (!hasAccess) {
    return [];
  }

  return prisma.resource.findMany({
    where: {
      projectId,
      type: RESOURCE_TYPE_CONTEXT_CARD,
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      attachments: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });
}

export async function getProjectDashboardById(projectId: string) {
  const actorUserId = await resolveActorUserId();
  const hasAccess = await hasProjectAccess({
    projectId,
    actorUserId,
    minimumRole: "viewer",
  });

  if (!hasAccess) {
    return null;
  }

  await archiveStaleDoneTasks(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
        include: {
          attachments: {
            orderBy: [{ createdAt: "desc" }],
          },
          blockedFollowUps: {
            orderBy: [{ createdAt: "desc" }],
          },
        },
      },
      resources: {
        orderBy: [{ createdAt: "desc" }],
        include: {
          attachments: {
            orderBy: [{ createdAt: "desc" }],
          },
        },
      },
    },
  });

  if (project) {
    await ensureProjectOwnerMembership({
      projectId: project.id,
      ownerId: project.ownerId,
    });
  }

  return project;
}
