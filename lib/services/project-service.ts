import { prisma } from "@/lib/prisma";

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

export async function getProjectDashboardById(projectId: string) {
  const archiveThreshold = new Date(Date.now() - ARCHIVE_AFTER_MS);

  await prisma.task.updateMany({
    where: {
      projectId,
      status: "Done",
      archivedAt: null,
      OR: [
        { completedAt: { lte: archiveThreshold } },
        { completedAt: null, updatedAt: { lte: archiveThreshold } },
      ],
    },
    data: {
      archivedAt: new Date(),
    },
  });

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
