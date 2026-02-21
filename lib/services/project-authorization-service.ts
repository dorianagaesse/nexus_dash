import type { Prisma, ProjectMembershipRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ProjectAccessRole = "viewer" | "editor" | "owner";

const ROLE_ORDER: Record<ProjectAccessRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

const ALL_PROJECT_ROLES: ProjectAccessRole[] = ["viewer", "editor", "owner"];

function allowedRolesForMinimum(
  minimumRole: ProjectAccessRole
): ProjectMembershipRole[] {
  const requiredOrder = ROLE_ORDER[minimumRole];
  return ALL_PROJECT_ROLES.filter(
    (role) => ROLE_ORDER[role] >= requiredOrder
  ) as ProjectMembershipRole[];
}

export function buildProjectAccessWhere(input: {
  actorUserId: string;
  minimumRole: ProjectAccessRole;
}): Prisma.ProjectWhereInput {
  const allowedMembershipRoles = allowedRolesForMinimum(input.minimumRole);

  return {
    OR: [
      { ownerId: input.actorUserId },
      {
        memberships: {
          some: {
            userId: input.actorUserId,
            role: { in: allowedMembershipRoles },
          },
        },
      },
    ],
  };
}

export async function hasProjectAccess(input: {
  projectId: string;
  actorUserId: string;
  minimumRole: ProjectAccessRole;
}): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      ...buildProjectAccessWhere({
        actorUserId: input.actorUserId,
        minimumRole: input.minimumRole,
      }),
    },
    select: { id: true },
  });

  return Boolean(project);
}

export async function ensureProjectOwnerMembership(input: {
  projectId: string;
  ownerId: string;
}): Promise<void> {
  await prisma.projectMembership.upsert({
    where: {
      projectId_userId: {
        projectId: input.projectId,
        userId: input.ownerId,
      },
    },
    update: {
      role: "owner",
    },
    create: {
      projectId: input.projectId,
      userId: input.ownerId,
      role: "owner",
    },
  });
}

