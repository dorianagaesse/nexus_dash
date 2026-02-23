import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import {
  buildProjectPrincipalWhere,
  requireProjectRole,
} from "@/lib/services/project-access-service";

const ARCHIVE_AFTER_DAYS = 7;
const ARCHIVE_AFTER_MS = ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

type ProjectKanbanTaskRecord = Prisma.TaskGetPayload<{
  include: {
    attachments: true;
    blockedFollowUps: true;
  };
}>;

type ProjectContextResourceRecord = Prisma.ResourceGetPayload<{
  include: {
    attachments: true;
  };
}>;

type ProjectSummaryRecord = Prisma.ProjectGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    _count: {
      select: {
        tasks: true;
      };
    };
  };
}>;

type ProjectWithCountsRecord = Prisma.ProjectGetPayload<{
  include: {
    _count: {
      select: {
        tasks: true;
        resources: true;
      };
    };
  };
}>;

interface ProjectUpsertInput {
  actorUserId: string;
  name: string;
  description: string | null;
}

interface ProjectUpdateInput extends ProjectUpsertInput {
  projectId: string;
}

function normalizeActorUserId(actorUserId: string | null | undefined): string {
  if (typeof actorUserId !== "string") {
    return "";
  }

  return actorUserId.trim();
}

async function ensureSyntheticTestUserExists(actorUserId: string) {
  const allowSyntheticUser =
    process.env.NODE_ENV === "test" || process.env.CI === "true";
  if (!allowSyntheticUser || actorUserId !== "test-user") {
    return;
  }

  await prisma.user.upsert({
    where: { id: actorUserId },
    update: {},
    create: { id: actorUserId },
  });
}

export async function listProjectsWithCounts(
  actorUserId: string
): Promise<ProjectWithCountsRecord[]> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return [];
  }

  return prisma.project.findMany({
    where: buildProjectPrincipalWhere(normalizedActorUserId),
    orderBy: [{ updatedAt: "desc" }],
    include: {
      _count: {
        select: {
          tasks: true,
          resources: true,
        },
      },
    },
  }) as Promise<ProjectWithCountsRecord[]>;
}

export type ProjectWithCounts = Awaited<
  ReturnType<typeof listProjectsWithCounts>
>[number];

export async function createProject(input: ProjectUpsertInput) {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    throw new Error("unauthorized");
  }

  await ensureSyntheticTestUserExists(actorUserId);

  return prisma.project.create({
    data: {
      ownerId: actorUserId,
      name: input.name,
      description: input.description,
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
  const access = await requireProjectRole({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    minimumRole: "owner",
  });
  if (!access.ok) {
    throw new Error(access.error);
  }

  return prisma.project.update({
    where: { id: input.projectId },
    data: {
      name: input.name,
      description: input.description,
    },
  });
}

export async function deleteProject(input: {
  actorUserId: string;
  projectId: string;
}) {
  const access = await requireProjectRole({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    minimumRole: "owner",
  });
  if (!access.ok) {
    throw new Error(access.error);
  }

  return prisma.project.delete({
    where: { id: input.projectId },
  });
}

function buildStaleDoneTaskFilter(projectId: string, actorUserId: string) {
  const archiveThreshold = new Date(Date.now() - ARCHIVE_AFTER_MS);

  return {
    projectId,
    project: buildProjectPrincipalWhere(actorUserId),
    status: "Done" as const,
    archivedAt: null,
    OR: [
      { completedAt: { lte: archiveThreshold } },
      { completedAt: null, updatedAt: { lte: archiveThreshold } },
    ],
  };
}

async function archiveStaleDoneTasks(projectId: string, actorUserId: string) {
  const staleDoneTaskFilter = buildStaleDoneTaskFilter(projectId, actorUserId);

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
  actorUserId: string
): Promise<ProjectSummaryRecord | null> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return null;
  }

  return prisma.project.findFirst({
    where: {
      id: projectId,
      ...buildProjectPrincipalWhere(normalizedActorUserId),
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
  }) as Promise<ProjectSummaryRecord | null>;
}

export async function listProjectKanbanTasks(
  projectId: string,
  actorUserId: string
): Promise<ProjectKanbanTaskRecord[]> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return prisma.task.findMany({
      where: { id: { in: [] } },
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

  await archiveStaleDoneTasks(projectId, normalizedActorUserId);

  return prisma.task.findMany({
    where: {
      projectId,
      project: buildProjectPrincipalWhere(normalizedActorUserId),
    },
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
  actorUserId: string
): Promise<ProjectContextResourceRecord[]> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return prisma.resource.findMany({
      where: { id: { in: [] } },
      orderBy: [{ createdAt: "desc" }],
      include: {
        attachments: {
          orderBy: [{ createdAt: "desc" }],
        },
      },
    });
  }

  return prisma.resource.findMany({
    where: {
      projectId,
      project: buildProjectPrincipalWhere(normalizedActorUserId),
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

export async function getProjectDashboardById(projectId: string, actorUserId: string) {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return null;
  }

  await archiveStaleDoneTasks(projectId, normalizedActorUserId);

  return prisma.project.findFirst({
    where: {
      id: projectId,
      ...buildProjectPrincipalWhere(normalizedActorUserId),
    },
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
}
