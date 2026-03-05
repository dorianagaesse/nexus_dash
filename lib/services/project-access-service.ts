import { ProjectMembershipRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { DbClient } from "@/lib/services/rls-context";

type ProjectRoleRequirement = ProjectMembershipRole;

interface ProjectAccessError {
  ok: false;
  status: number;
  error: string;
}

interface ProjectAccessSuccess {
  ok: true;
  role: ProjectMembershipRole;
}

type ProjectAccessResult = ProjectAccessError | ProjectAccessSuccess;

const PROJECT_ROLE_PRIORITY: Record<ProjectMembershipRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

function normalizeActorUserId(actorUserId: string | null | undefined): string {
  if (typeof actorUserId !== "string") {
    return "";
  }

  return actorUserId.trim();
}

function hasRequiredRole(
  actualRole: ProjectMembershipRole,
  requiredRole: ProjectRoleRequirement
): boolean {
  return PROJECT_ROLE_PRIORITY[actualRole] >= PROJECT_ROLE_PRIORITY[requiredRole];
}

export function buildProjectPrincipalWhere(actorUserId: string) {
  return {
    OR: [
      { ownerId: actorUserId },
      {
        memberships: {
          some: {
            userId: actorUserId,
          },
        },
      },
    ],
  };
}

export async function requireProjectRole(input: {
  actorUserId: string;
  projectId: string;
  minimumRole: ProjectRoleRequirement;
  db?: DbClient;
}): Promise<ProjectAccessResult> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const db = input.db ?? prisma;

  const project = await db.project.findFirst({
    where: {
      id: input.projectId,
      ...buildProjectPrincipalWhere(actorUserId),
    },
    select: {
      ownerId: true,
      memberships: {
        where: { userId: actorUserId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!project) {
    return { ok: false, status: 404, error: "project-not-found" };
  }

  const actorRole: ProjectMembershipRole =
    project.ownerId === actorUserId
      ? "owner"
      : (project.memberships[0]?.role ?? "viewer");

  if (!hasRequiredRole(actorRole, input.minimumRole)) {
    return { ok: false, status: 403, error: "forbidden" };
  }

  return { ok: true, role: actorRole };
}
