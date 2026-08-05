import { ProjectMembershipRole } from "@prisma/client";

import { isMeetingTodoOverdueAt } from "@/lib/meeting-todo";
import {
  buildProjectPrincipalWhere,
  hasRequiredRole,
} from "@/lib/services/project-access-service";
import { withActorRlsContext } from "@/lib/services/rls-context";

export interface ProjectMeetingTodoSummary {
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
}

export interface ProjectMeetingTodoList {
  project: {
    id: string;
    name: string;
    role: ProjectMembershipRole;
    canEdit: boolean;
  };
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
    const project = await db.project.findFirst({
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
              },
            },
          },
        },
      },
    });

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
