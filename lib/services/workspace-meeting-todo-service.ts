import { ProjectMembershipRole } from "@prisma/client";

import { isMeetingTodoOverdueAt } from "@/lib/meeting-todo";
import {
  buildProjectPrincipalWhere,
  hasRequiredRole,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

export interface WorkspaceMeetingTodoSummary {
  id: string;
  content: string;
  completedAt: Date | null;
  updatedAt: Date;
  isOverdue: boolean;
  urgencyTimestamp: number;
  meeting: {
    id: string;
    title: string;
    scheduledAt: Date | null;
    status: string;
  };
  project: {
    id: string;
    name: string;
    role: ProjectMembershipRole;
    canEdit: boolean;
  };
}

export interface WorkspaceMeetingTodoNavigationSummary {
  openCount: number;
  overdueCount: number;
}

function normalizeActorUserId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: Date | null): number {
  return value?.getTime() ?? 0;
}

async function loadWorkspaceMeetingTodos(input: {
  actorUserId: string;
  openOnly: boolean;
  referenceNowMs: number;
}): Promise<WorkspaceMeetingTodoSummary[]> {
  return withActorRlsContext(input.actorUserId, async (db) => {
    const projects = await db.project.findMany({
      where: buildProjectPrincipalWhere(input.actorUserId),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        ownerId: true,
        memberships: {
          where: { userId: input.actorUserId },
          select: { role: true },
          take: 1,
        },
        meetingNotes: {
          where: {
            actions: {
              some: input.openOnly ? { completedAt: null } : {},
            },
          },
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            status: true,
            createdAt: true,
            actions: {
              ...(input.openOnly ? { where: { completedAt: null } } : {}),
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              select: {
                id: true,
                content: true,
                completedAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    return projects.flatMap((project) => {
      const role =
        project.ownerId === input.actorUserId
          ? ProjectMembershipRole.owner
          : (project.memberships[0]?.role ?? ProjectMembershipRole.viewer);
      const canEdit = hasRequiredRole(role, ProjectMembershipRole.editor);

      return project.meetingNotes.flatMap((meeting) =>
        meeting.actions.map((action) => {
          const urgencyTimestamp = timestamp(
            meeting.scheduledAt ?? meeting.createdAt
          );

          return {
            id: action.id,
            content: action.content,
            completedAt: action.completedAt,
            updatedAt: action.updatedAt,
            isOverdue: isMeetingTodoOverdueAt({
              scheduledAt: meeting.scheduledAt,
              completedAt: action.completedAt,
              meetingStatus: meeting.status,
              referenceNowMs: input.referenceNowMs,
            }),
            urgencyTimestamp,
            meeting: {
              id: meeting.id,
              title: meeting.title,
              scheduledAt: meeting.scheduledAt,
              status: meeting.status,
            },
            project: {
              id: project.id,
              name: project.name,
              role,
              canEdit,
            },
          };
        })
      );
    });
  }) as Promise<WorkspaceMeetingTodoSummary[]>;
}

export async function listWorkspaceMeetingTodos(input: {
  actorUserId: string;
  referenceNowMs?: number;
}): Promise<{
  open: WorkspaceMeetingTodoSummary[];
  completed: WorkspaceMeetingTodoSummary[];
}> {
  const actorUserId = normalizeActorUserId(input.actorUserId);
  if (!actorUserId) {
    return { open: [], completed: [] };
  }

  const todos = await loadWorkspaceMeetingTodos({
    actorUserId,
    openOnly: false,
    referenceNowMs: input.referenceNowMs ?? Date.now(),
  });

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
      return completedDifference || right.updatedAt.getTime() - left.updatedAt.getTime();
    });

  return { open, completed };
}

export async function getWorkspaceMeetingTodoNavigationSummary(
  actorUserIdInput: string
): Promise<WorkspaceMeetingTodoNavigationSummary> {
  const actorUserId = normalizeActorUserId(actorUserIdInput);
  if (!actorUserId) {
    return { openCount: 0, overdueCount: 0 };
  }

  return withActorRlsContext(actorUserId, async (db) => {
    const projects = await db.project.findMany({
      where: buildProjectPrincipalWhere(actorUserId),
      select: {
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
                actions: {
                  where: { completedAt: null },
                },
              },
            },
          },
        },
      },
    });
    const referenceNowMs = Date.now();

    return projects.reduce<WorkspaceMeetingTodoNavigationSummary>(
      (summary, project) => {
        for (const meeting of project.meetingNotes) {
          const openInMeeting = meeting._count.actions;
          summary.openCount += openInMeeting;
          if (
            isMeetingTodoOverdueAt({
              scheduledAt: meeting.scheduledAt,
              completedAt: null,
              meetingStatus: meeting.status,
              referenceNowMs,
            })
          ) {
            summary.overdueCount += openInMeeting;
          }
        }

        return summary;
      },
      { openCount: 0, overdueCount: 0 }
    );
  });
}
