import { Prisma } from "@prisma/client";

import { requireProjectRole } from "@/lib/services/project-access-service";
import { withActorRlsContext, type DbClient } from "@/lib/services/rls-context";

export type OffboardingActorKind = "human" | "agent";
export type ResponsibilityResolutionMode = "reassign" | "unassign";

export interface ProjectResponsibilityInventory {
  taskAssignments: number;
  contextCardStewardships: number;
  meetingNoteStewardships: number;
  meetingTodoAssignments: number;
  total: number;
}

export interface ResponsibilityResolution {
  mode: ResponsibilityResolutionMode;
  replacementUserId?: string | null;
}

interface ServiceError {
  ok: false;
  status: number;
  error: string;
  inventory?: ProjectResponsibilityInventory;
}

interface ServiceSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

interface ResponsibilityActor {
  kind: OffboardingActorKind;
  id: string;
}

const EMPTY_INVENTORY: ProjectResponsibilityInventory = {
  taskAssignments: 0,
  contextCardStewardships: 0,
  meetingNoteStewardships: 0,
  meetingTodoAssignments: 0,
  total: 0,
};

function createError(
  status: number,
  error: string,
  inventory?: ProjectResponsibilityInventory
): ServiceError {
  return { ok: false, status, error, ...(inventory ? { inventory } : {}) };
}

function createSuccess<T>(status: number, data: T): ServiceSuccess<T> {
  return { ok: true, status, data };
}

function normalizeId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildDisplayName(user: {
  name: string | null;
  username: string | null;
  usernameDiscriminator: string | null;
  email: string | null;
}): string {
  const name = user.name?.trim();
  if (name) {
    return name.slice(0, 80);
  }

  const username = user.username?.trim();
  const discriminator = user.usernameDiscriminator?.trim();
  if (username && discriminator) {
    return `${username}#${discriminator}`.slice(0, 80);
  }

  return (user.email?.trim() || username || "Project collaborator").slice(
    0,
    80
  );
}

export function isOffboardingActorKind(
  value: unknown
): value is OffboardingActorKind {
  return value === "human" || value === "agent";
}

export function parseResponsibilityResolution(
  value: unknown
): ResponsibilityResolution | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    mode?: unknown;
    replacementUserId?: unknown;
  };
  if (candidate.mode !== "reassign" && candidate.mode !== "unassign") {
    return null;
  }

  if (candidate.mode === "unassign") {
    return { mode: "unassign" };
  }

  if (typeof candidate.replacementUserId !== "string") {
    return null;
  }

  const replacementUserId = normalizeId(candidate.replacementUserId);
  return replacementUserId ? { mode: "reassign", replacementUserId } : null;
}

export async function countActiveProjectResponsibilities(
  db: DbClient,
  projectId: string,
  actor: ResponsibilityActor
): Promise<ProjectResponsibilityInventory> {
  const humanId = actor.kind === "human" ? actor.id : undefined;
  const credentialId = actor.kind === "agent" ? actor.id : undefined;

  const [
    taskAssignments,
    contextCardStewardships,
    meetingNoteStewardships,
    meetingTodoAssignments,
  ] = await Promise.all([
    humanId
      ? db.task.count({
          where: {
            projectId,
            assigneeUserId: humanId,
            archivedAt: null,
            NOT: { status: "Done" },
          },
        })
      : Promise.resolve(0),
    db.resource.count({
      where: {
        projectId,
        stewardKind: actor.kind,
        ...(humanId
          ? { stewardUserId: humanId }
          : { stewardCredentialId: credentialId }),
      },
    }),
    db.projectMeetingNote.count({
      where: {
        projectId,
        stewardKind: actor.kind,
        NOT: { status: "done" },
        ...(humanId
          ? { stewardUserId: humanId }
          : { stewardCredentialId: credentialId }),
      },
    }),
    db.projectMeetingNoteAction.count({
      where: {
        meetingNote: { projectId },
        completedAt: null,
        assigneeKind: actor.kind,
        ...(humanId
          ? { assigneeUserId: humanId }
          : { assigneeCredentialId: credentialId }),
      },
    }),
  ]);

  return {
    taskAssignments,
    contextCardStewardships,
    meetingNoteStewardships,
    meetingTodoAssignments,
    total:
      taskAssignments +
      contextCardStewardships +
      meetingNoteStewardships +
      meetingTodoAssignments,
  };
}

async function resolveReplacementUser(
  db: DbClient,
  projectId: string,
  departingActor: ResponsibilityActor,
  replacementUserId: string
) {
  if (
    departingActor.kind === "human" &&
    departingActor.id === replacementUserId
  ) {
    return null;
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          usernameDiscriminator: true,
          email: true,
        },
      },
      memberships: {
        where: { userId: replacementUserId },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              usernameDiscriminator: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  const user =
    project.ownerId === replacementUserId
      ? project.owner
      : (project.memberships[0]?.user ?? null);
  return user ? { id: user.id, displayName: buildDisplayName(user) } : null;
}

export async function resolveActiveProjectResponsibilities(input: {
  db: DbClient;
  projectId: string;
  actor: ResponsibilityActor;
  resolution: ResponsibilityResolution | null;
}): Promise<ServiceResult<{ inventory: ProjectResponsibilityInventory }>> {
  const inventory = await countActiveProjectResponsibilities(
    input.db,
    input.projectId,
    input.actor
  );
  if (inventory.total === 0) {
    return createSuccess(200, { inventory });
  }

  if (!input.resolution) {
    return createError(409, "responsibility-resolution-required", inventory);
  }

  const replacement =
    input.resolution.mode === "reassign"
      ? await resolveReplacementUser(
          input.db,
          input.projectId,
          input.actor,
          normalizeId(input.resolution.replacementUserId)
        )
      : null;
  if (input.resolution.mode === "reassign" && !replacement) {
    return createError(400, "invalid-responsibility-replacement", inventory);
  }

  const rows = await input.db.$queryRaw<Array<{ result: string }>>(Prisma.sql`
    SELECT app.resolve_project_actor_responsibilities(
      ${input.projectId}::text,
      ${input.actor.kind}::text,
      ${input.actor.id}::text,
      ${input.resolution.mode}::text,
      ${replacement?.id ?? null}::text
    ) AS result
  `);
  const result = rows[0]?.result;
  if (result !== "ok") {
    const status =
      result === "forbidden"
        ? 403
        : result === "actor-not-found"
          ? 404
          : 400;
    return createError(
      status,
      result || "responsibility-resolution-failed",
      inventory
    );
  }

  return createSuccess(200, { inventory });
}

export async function getProjectResponsibilityInventory(input: {
  actorUserId: string;
  projectId: string;
  actorKind: OffboardingActorKind;
  actorId: string;
}): Promise<ServiceResult<{ inventory: ProjectResponsibilityInventory }>> {
  const actorUserId = normalizeId(input.actorUserId);
  const actorId = normalizeId(input.actorId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!actorId) {
    return createError(400, "actor-required");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const actorExists =
      input.actorKind === "human"
        ? await db.projectMembership.findFirst({
            where: { projectId: input.projectId, userId: actorId },
            select: { id: true },
          })
        : await db.apiCredential.findFirst({
            where: { projectId: input.projectId, id: actorId },
            select: { id: true },
          });
    if (!actorExists) {
      return createError(404, "actor-not-found");
    }

    const inventory = await countActiveProjectResponsibilities(
      db,
      input.projectId,
      {
        kind: input.actorKind,
        id: actorId,
      }
    );
    return createSuccess(200, { inventory });
  });
}

export async function transferProjectOwnership(input: {
  actorUserId: string;
  projectId: string;
  newOwnerMembershipId: string;
  previousOwnerLeaves: boolean;
  responsibilityResolution: ResponsibilityResolution | null;
}): Promise<
  ServiceResult<{
    projectId: string;
    newOwnerUserId: string;
    previousOwnerLeft: boolean;
    resolvedInventory: ProjectResponsibilityInventory;
  }>
> {
  const actorUserId = normalizeId(input.actorUserId);
  const membershipId = normalizeId(input.newOwnerMembershipId);
  if (!actorUserId) {
    return createError(401, "unauthorized");
  }
  if (!membershipId) {
    return createError(400, "membership-required");
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const access = await requireProjectRole({
      actorUserId,
      projectId: input.projectId,
      minimumRole: "owner",
      db,
    });
    if (!access.ok) {
      return createError(access.status, access.error);
    }

    const target = await db.projectMembership.findUnique({
      where: { id: membershipId },
      select: { projectId: true, userId: true },
    });
    if (!target || target.projectId !== input.projectId) {
      return createError(404, "new-owner-not-member");
    }
    if (target.userId === actorUserId) {
      return createError(400, "same-owner");
    }

    let resolvedInventory = EMPTY_INVENTORY;
    if (input.previousOwnerLeaves) {
      const resolutionResult = await resolveActiveProjectResponsibilities({
        db,
        projectId: input.projectId,
        actor: { kind: "human", id: actorUserId },
        resolution: input.responsibilityResolution,
      });
      if (!resolutionResult.ok) {
        return resolutionResult;
      }
      resolvedInventory = resolutionResult.data.inventory;
    }

    const rows = await db.$queryRaw<Array<{ result: string }>>(Prisma.sql`
      SELECT app.transfer_project_ownership(
        ${actorUserId},
        ${input.projectId},
        ${target.userId},
        ${input.previousOwnerLeaves}
      ) AS result
    `);
    const result = rows[0]?.result;
    if (result !== "ok") {
      const status =
        result === "forbidden"
          ? 403
          : result === "project-not-found"
            ? 404
            : 409;
      return createError(status, result || "ownership-transfer-failed");
    }

    return createSuccess(200, {
      projectId: input.projectId,
      newOwnerUserId: target.userId,
      previousOwnerLeft: input.previousOwnerLeaves,
      resolvedInventory,
    });
  });
}
