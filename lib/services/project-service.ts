import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPE_CONTEXT_CARD } from "@/lib/resource-type";

const ARCHIVE_AFTER_DAYS = 7;
const ARCHIVE_AFTER_MS = ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

interface ProjectUpsertInput {
  name: string;
  description: string | null;
}

interface ProjectUpdateInput extends ProjectUpsertInput {
  projectId: string;
}

export async function listProjectsWithCounts() {
  return prisma.project.findMany({
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
  return prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
    },
  });
}

export async function updateProject(input: ProjectUpdateInput) {
  return prisma.project.update({
    where: { id: input.projectId },
    data: {
      name: input.name,
      description: input.description,
    },
  });
}

export async function deleteProject(projectId: string) {
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

export async function getProjectSummaryById(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
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

export async function listProjectKanbanTasks(projectId: string) {
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

export async function listProjectContextResources(projectId: string) {
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
  await archiveStaleDoneTasks(projectId);

  return prisma.project.findUnique({
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
}
