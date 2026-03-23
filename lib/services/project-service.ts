import { Prisma, ProjectMembershipRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";
import {
  buildProjectPrincipalWhere,
  requireProjectRole,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import type { DbClient } from "@/lib/services/rls-context";

const ARCHIVE_AFTER_DAYS = 7;
const ARCHIVE_AFTER_MS = ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

type ProjectKanbanTaskRecord = Prisma.TaskGetPayload<{
  include: {
    attachments: true;
    blockedFollowUps: true;
    outgoingRelations: {
      select: {
        rightTask: {
          select: {
            id: true;
            title: true;
            status: true;
            archivedAt: true;
          };
        };
      };
    };
    incomingRelations: {
      select: {
        leftTask: {
          select: {
            id: true;
            title: true;
            status: true;
            archivedAt: true;
          };
        };
      };
    };
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
    ownerId: true;
    memberships: {
      select: {
        role: true;
      };
    };
  };
}>;

interface ProjectSummaryStats {
  trackedTasks: number;
  openTasks: number;
  completedTasks: number;
  contextCards: number;
  attachmentCount: number;
  isCalendarConnected: boolean;
}

type ProjectSummaryWithStatsRecord = ProjectSummaryRecord & {
  stats: ProjectSummaryStats;
};

interface ProjectWithCountsRecord {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  updatedAt: Date;
  memberships: Array<{
    role: ProjectMembershipRole;
  }>;
  _count: {
    tasks: number;
    resources: number;
  };
}

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

function normalizeProjectName(name: string | null | undefined): string {
  if (typeof name !== "string") {
    return "";
  }

  return name.trim();
}

function normalizeProjectDescription(
  description: string | null | undefined
): string | null {
  if (typeof description !== "string") {
    return null;
  }

  const normalizedDescription = description.trim();
  return normalizedDescription.length > 0 ? normalizedDescription : null;
}

async function ensureSyntheticTestUserExists(actorUserId: string, db: DbClient = prisma) {
  const allowSyntheticUser =
    process.env.NODE_ENV === "test" || process.env.CI === "true";
  if (!allowSyntheticUser || actorUserId !== "test-user") {
    return;
  }

  await db.user.upsert({
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

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const projects = await db.project.findMany({
      where: buildProjectPrincipalWhere(normalizedActorUserId),
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        updatedAt: true,
        _count: {
          select: {
            tasks: true,
            resources: true,
          },
        },
      },
    });

    const collaboratorProjectIds = projects
      .filter((project) => project.ownerId !== normalizedActorUserId)
      .map((project) => project.id);

    const memberships =
      collaboratorProjectIds.length > 0
        ? await db.projectMembership.findMany({
            where: {
              userId: normalizedActorUserId,
              projectId: {
                in: collaboratorProjectIds,
              },
            },
            select: {
              projectId: true,
              role: true,
            },
          })
        : [];

    const roleByProjectId = new Map(
      memberships.map((membership) => [membership.projectId, membership.role])
    );

    return projects.map((project) => {
      if (project.ownerId === normalizedActorUserId) {
        return {
          ...project,
          memberships: [],
        };
      }

      const collaboratorRole = roleByProjectId.get(project.id);
      return {
        ...project,
        memberships: collaboratorRole ? [{ role: collaboratorRole }] : [],
      };
    });
  }) as Promise<ProjectWithCountsRecord[]>;
}

export type ProjectWithCounts = Awaited<
  ReturnType<typeof listProjectsWithCounts>
>[number];

export async function createProject(input: ProjectUpsertInput) {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const name = normalizeProjectName(input.name);
  const description = normalizeProjectDescription(input.description);
  if (!actorUserId) {
    throw new Error("unauthorized");
  }
  if (!name) {
    throw new Error("project-name-required");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    await ensureSyntheticTestUserExists(actorUserId, db);

    return db.project.create({
      data: {
        ownerId: actorUserId,
        name,
        description,
        memberships: {
          create: {
            userId: actorUserId,
            role: "owner",
          },
        },
      },
    });
  });
}

export async function updateProject(input: ProjectUpdateInput) {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  const name = normalizeProjectName(input.name);
  const description = normalizeProjectDescription(input.description);
  if (!actorUserId) {
    throw new Error("unauthorized");
  }
  if (!name) {
    throw new Error("project-name-required");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      throw new Error(access.error);
    }

    return db.project.update({
      where: { id: input.projectId },
      data: {
        name,
        description,
      },
    });
  });
}

export async function deleteProject(input: {
  actorUserId: string;
  projectId: string;
}) {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    throw new Error("unauthorized");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      throw new Error(access.error);
    }

    return db.project.delete({
      where: { id: input.projectId },
    });
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

async function archiveStaleDoneTasks(
  projectId: string,
  actorUserId: string,
  db: DbClient
) {
  const staleDoneTaskFilter = buildStaleDoneTaskFilter(projectId, actorUserId);

  const staleDoneTask = await db.task.findFirst({
    where: staleDoneTaskFilter,
    select: { id: true },
  });

  if (staleDoneTask) {
    await db.task.updateMany({
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
): Promise<ProjectSummaryWithStatsRecord | null> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return null;
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    const principalWhere = buildProjectPrincipalWhere(normalizedActorUserId);

    const [
      project,
      trackedTasks,
      openTasks,
      completedTasks,
      contextCards,
      taskAttachmentCount,
      contextAttachmentCount,
      calendarCredential,
    ] = await Promise.all([
      db.project.findFirst({
        where: {
          id: projectId,
          ...principalWhere,
        },
        select: {
          id: true,
          name: true,
          description: true,
          ownerId: true,
          memberships: {
            where: { userId: normalizedActorUserId },
            select: {
              role: true,
            },
            take: 1,
          },
        },
      }),
      db.task.count({
        where: {
          projectId,
          project: principalWhere,
        },
      }),
      db.task.count({
        where: {
          projectId,
          project: principalWhere,
          archivedAt: null,
          status: {
            in: ["In Progress", "Blocked"],
          },
        },
      }),
      db.task.count({
        where: {
          projectId,
          project: principalWhere,
          OR: [{ status: "Done" }, { archivedAt: { not: null } }],
        },
      }),
      db.resource.count({
        where: {
          projectId,
          project: principalWhere,
          type: RESOURCE_TYPE_CONTEXT_CARD,
        },
      }),
      db.taskAttachment.count({
        where: {
          task: {
            projectId,
            project: principalWhere,
          },
        },
      }),
      db.resourceAttachment.count({
        where: {
          resource: {
            projectId,
            project: principalWhere,
            type: RESOURCE_TYPE_CONTEXT_CARD,
          },
        },
      }),
      db.googleCalendarCredential.findUnique({
        where: { userId: normalizedActorUserId },
        select: {
          revokedAt: true,
        },
      }),
    ]);

    if (!project) {
      return null;
    }

    return {
      ...project,
      stats: {
        trackedTasks,
        openTasks,
        completedTasks,
        contextCards,
        attachmentCount: taskAttachmentCount + contextAttachmentCount,
        isCalendarConnected: calendarCredential?.revokedAt == null && Boolean(calendarCredential),
      },
    };
  }) as Promise<ProjectSummaryWithStatsRecord | null>;
}

export async function listProjectKanbanTasks(
  projectId: string,
  actorUserId: string
): Promise<ProjectKanbanTaskRecord[]> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return [];
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    await archiveStaleDoneTasks(projectId, normalizedActorUserId, db);

    return db.task.findMany({
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
        outgoingRelations: {
          select: {
            rightTask: {
              select: {
                id: true,
                title: true,
                status: true,
                archivedAt: true,
              },
            },
          },
        },
        incomingRelations: {
          select: {
            leftTask: {
              select: {
                id: true,
                title: true,
                status: true,
                archivedAt: true,
              },
            },
          },
        },
      },
    });
  });
}

export async function listProjectContextResources(
  projectId: string,
  actorUserId: string
): Promise<ProjectContextResourceRecord[]> {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return [];
  }

  return withActorRlsContext(normalizedActorUserId, (db) =>
    db.resource.findMany({
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
    })
  );
}

export async function getProjectDashboardById(projectId: string, actorUserId: string) {
  const normalizedActorUserId = normalizeActorUserId(actorUserId);
  if (!normalizedActorUserId) {
    return null;
  }

  return withActorRlsContext(normalizedActorUserId, async (db) => {
    await archiveStaleDoneTasks(projectId, normalizedActorUserId, db);

    return db.project.findFirst({
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
            outgoingRelations: {
              select: {
                rightTask: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    archivedAt: true,
                  },
                },
              },
            },
            incomingRelations: {
              select: {
                leftTask: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    archivedAt: true,
                  },
                },
              },
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
  });
}
