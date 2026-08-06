import { ProjectMembershipRole } from "@prisma/client";

import { isMeetingTodoOverdueAt } from "@/lib/meeting-todo";
import type { MeetingTodoActorSummary } from "@/lib/meeting-todo-actor";
import {
  buildProjectPrincipalWhere,
  hasRequiredRole,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";
import {
  loadMeetingTodoActorRegistry,
  mapStoredMeetingTodoActor,
  meetingTodoActorCredentialSelect,
  meetingTodoActorUserSelect,
} from "@/lib/services/project-meeting-todo-actor-service";

export interface ProjectMeetingTodoSummary {
  id: string;
  content: string;
  completedAt: Date | null;
  updatedAt: Date;
  isOverdue: boolean;
  urgencyTimestamp: number;
  creator: MeetingTodoActorSummary | null;
  assignee: MeetingTodoActorSummary | null;
  completedBy: MeetingTodoActorSummary | null;
  meeting: {
    id: string;
    title: string;
    scheduledAt: Date | null;
    status: string;
  };
}

export interface ProjectMeetingTodoList {
  project: {
    id: string;
    name: string;
    role: ProjectMembershipRole;
    canEdit: boolean;
  };
  currentActorUserId: string;
  actors: MeetingTodoActorSummary[];
  open: ProjectMeetingTodoSummary[];
  completed: ProjectMeetingTodoSummary[];
}

export interface ProjectMeetingTodoNavigationSummary {
  activeCount: number;
  hasOverdue: boolean;
}

function normalizeIdentifier(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: Date | null): number {
  return value?.getTime() ?? 0;
}

export async function listProjectMeetingTodos(input: {
  actorUserId: string;
  projectId: string;
  referenceNowMs?: number;
}): Promise<ProjectMeetingTodoList | null> {
  const actorUserId = normalizeIdentifier(input.actorUserId);
  const projectId = normalizeIdentifier(input.projectId);
  if (!actorUserId || !projectId) {
    return null;
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const [project, actorRegistry] = await Promise.all([
      db.project.findFirst({
      where: {
        id: projectId,
        ...buildProjectPrincipalWhere(actorUserId),
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        memberships: {
          where: { userId: actorUserId },
          select: { role: true },
          take: 1,
        },
        meetingNotes: {
          where: {
            actions: {
              some: {},
            },
          },
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            status: true,
            createdAt: true,
            actions: {
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              select: {
                id: true,
                content: true,
                completedAt: true,
                updatedAt: true,
                creatorKind: true,
                createdByUserId: true,
                createdByCredentialId: true,
                creatorDisplayNameSnapshot: true,
                createdByUser: { select: meetingTodoActorUserSelect },
                createdByCredential: {
                  select: meetingTodoActorCredentialSelect,
                },
                assigneeKind: true,
                assigneeUserId: true,
                assigneeCredentialId: true,
                assigneeDisplayNameSnapshot: true,
                assigneeUser: { select: meetingTodoActorUserSelect },
                assigneeCredential: {
                  select: meetingTodoActorCredentialSelect,
                },
                completedByKind: true,
                completedByUserId: true,
                completedByCredentialId: true,
                completedByDisplayNameSnapshot: true,
                completedByUser: { select: meetingTodoActorUserSelect },
                completedByCredential: {
                  select: meetingTodoActorCredentialSelect,
                },
              },
            },
          },
        },
      },
      }),
      loadMeetingTodoActorRegistry({ db, projectId }),
    ]);

    if (!project) {
      return null;
    }

    const role =
      project.ownerId === actorUserId
        ? ProjectMembershipRole.owner
        : (project.memberships[0]?.role ?? ProjectMembershipRole.viewer);
    const canEdit = hasRequiredRole(role, ProjectMembershipRole.editor);
    const referenceNowMs = input.referenceNowMs ?? Date.now();
    const todos = project.meetingNotes.flatMap((meeting) =>
      meeting.actions.map((action) => ({
        id: action.id,
        content: action.content,
        completedAt: action.completedAt,
        updatedAt: action.updatedAt,
        isOverdue: isMeetingTodoOverdueAt({
          scheduledAt: meeting.scheduledAt,
          completedAt: action.completedAt,
          meetingStatus: meeting.status,
          referenceNowMs,
        }),
        urgencyTimestamp: timestamp(meeting.scheduledAt ?? meeting.createdAt),
        creator: mapStoredMeetingTodoActor({
          kind: action.creatorKind,
          id:
            action.creatorKind === "human"
              ? action.createdByUserId
              : action.createdByCredentialId,
          displayNameSnapshot: action.creatorDisplayNameSnapshot,
          user: action.createdByUser,
          credential: action.createdByCredential,
          isCurrentProjectHuman: Boolean(
            action.createdByUserId &&
              actorRegistry?.activeHumanIds.has(action.createdByUserId)
          ),
        }),
        assignee: action.assigneeKind
          ? mapStoredMeetingTodoActor({
              kind: action.assigneeKind,
              id:
                action.assigneeKind === "human"
                  ? action.assigneeUserId
                  : action.assigneeCredentialId,
              displayNameSnapshot: action.assigneeDisplayNameSnapshot,
              user: action.assigneeUser,
              credential: action.assigneeCredential,
              isCurrentProjectHuman: Boolean(
                action.assigneeUserId &&
                  actorRegistry?.activeHumanIds.has(action.assigneeUserId)
              ),
            })
          : null,
        completedBy: action.completedByKind
          ? mapStoredMeetingTodoActor({
              kind: action.completedByKind,
              id:
                action.completedByKind === "human"
                  ? action.completedByUserId
                  : action.completedByCredentialId,
              displayNameSnapshot: action.completedByDisplayNameSnapshot,
              user: action.completedByUser,
              credential: action.completedByCredential,
              isCurrentProjectHuman: Boolean(
                action.completedByUserId &&
                  actorRegistry?.activeHumanIds.has(action.completedByUserId)
              ),
            })
          : null,
        meeting: {
          id: meeting.id,
          title: meeting.title,
          scheduledAt: meeting.scheduledAt,
          status: meeting.status,
        },
      }))
    );
    const open = todos
      .filter((todo) => todo.completedAt === null)
      .sort((left, right) => {
        if (left.isOverdue !== right.isOverdue) {
          return left.isOverdue ? -1 : 1;
        }
        if (left.urgencyTimestamp !== right.urgencyTimestamp) {
          return left.urgencyTimestamp - right.urgencyTimestamp;
        }
        return left.content.localeCompare(right.content);
      });
    const completed = todos
      .filter((todo) => todo.completedAt !== null)
      .sort((left, right) => {
        const completedDifference =
          timestamp(right.completedAt) - timestamp(left.completedAt);
        return (
          completedDifference ||
          right.updatedAt.getTime() - left.updatedAt.getTime()
        );
      });

    return {
      project: {
        id: project.id,
        name: project.name,
        role,
        canEdit,
      },
      currentActorUserId: actorUserId,
      actors: actorRegistry?.assignable ?? [],
      open,
      completed,
    };
  }) as Promise<ProjectMeetingTodoList | null>;
}

export async function getProjectMeetingTodoNavigationSummary(input: {
  actorUserId: string;
  projectId: string;
  referenceNowMs?: number;
}): Promise<ProjectMeetingTodoNavigationSummary | null> {
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
      select: {
        id: true,
        meetingNotes: {
          where: {
            actions: {
              some: { completedAt: null },
            },
          },
          select: {
            scheduledAt: true,
            status: true,
            _count: {
              select: {
                actions: { where: { completedAt: null } },
              },
            },
          },
        },
      },
    });

    if (!project) {
      return null;
    }

    const referenceNowMs = input.referenceNowMs ?? Date.now();
    let activeCount = 0;
    let hasOverdue = false;

    for (const meeting of project.meetingNotes) {
      activeCount += meeting._count.actions;
      if (
        isMeetingTodoOverdueAt({
          scheduledAt: meeting.scheduledAt,
          completedAt: null,
          meetingStatus: meeting.status,
          referenceNowMs,
        })
      ) {
        hasOverdue = true;
      }
    }

    return { activeCount, hasOverdue };
  }) as Promise<ProjectMeetingTodoNavigationSummary | null>;
}
