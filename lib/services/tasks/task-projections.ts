import type { Prisma } from "@prisma/client";
import { taskPersonSummarySelect } from "@/lib/task-person";

export const relatedTaskSummarySelect = {
  id: true,
  title: true,
  status: true,
  archivedAt: true,
} as const;

export const projectKanbanTaskInclude = {
  _count: {
    select: {
      comments: true,
    },
  },
  attachments: {
    where: { isCommentDraft: false },
    orderBy: [{ createdAt: "desc" }],
  },
  blockedFollowUps: {
    orderBy: [{ createdAt: "desc" }],
  },
  outgoingRelations: {
    select: {
      rightTask: {
        select: relatedTaskSummarySelect,
      },
    },
  },
  incomingRelations: {
    select: {
      leftTask: {
        select: relatedTaskSummarySelect,
      },
    },
  },
  createdByUser: {
    select: taskPersonSummarySelect,
  },
  updatedByUser: {
    select: taskPersonSummarySelect,
  },
  assigneeUser: {
    select: taskPersonSummarySelect,
  },
  assigneeAssignedByUser: {
    select: taskPersonSummarySelect,
  },
  epic: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.TaskInclude;

export type ProjectKanbanTaskRecord = Prisma.TaskGetPayload<{
  include: typeof projectKanbanTaskInclude;
}>;

// Mutations intentionally return attachment summaries; board reads keep full records.
// Keep both transport shapes stable while sharing their relation field definitions here.
export function taskMutationSelect(hasEpic = true) {
  return {
    id: true,
    contentRevision: true,
    referenceNumber: true,
    title: true,
    label: true,
    labelsJson: true,
    description: true,
    deadlineAt: true,
    _count: {
      select: {
        comments: true,
      },
    },
    blockedNote: true,
    status: true,
    position: true,
    completedAt: true,
    archivedAt: true,
    createdAt: true,
    updatedAt: true,
    attachments: {
      where: { isCommentDraft: false },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        commentId: true,
        kind: true,
        name: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
      },
    },
    epic: hasEpic ? { select: { id: true, name: true } } : false,
    createdByCredentialId: true,
    createdByCredentialLabel: true,
    updatedByCredentialId: true,
    updatedByCredentialLabel: true,
    createdByUser: {
      select: taskPersonSummarySelect,
    },
    updatedByUser: {
      select: taskPersonSummarySelect,
    },
    assigneeKind: true,
    assigneeUserId: true,
    assigneeCredentialId: true,
    assigneeDisplayNameSnapshot: true,
    assigneeAssignedByKind: true,
    assigneeAssignedByUserId: true,
    assigneeAssignedByCredentialId: true,
    assigneeAssignedByDisplayNameSnapshot: true,
    assigneeAssignedAt: true,
    assigneeUser: {
      select: taskPersonSummarySelect,
    },
    assigneeAssignedByUser: {
      select: taskPersonSummarySelect,
    },
    outgoingRelations: {
      select: {
        rightTask: {
          select: relatedTaskSummarySelect,
        },
      },
    },
    incomingRelations: {
      select: {
        leftTask: {
          select: relatedTaskSummarySelect,
        },
      },
    },
    blockedFollowUps: {
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        content: true,
        createdAt: true,
      },
    },
  } as const satisfies Prisma.TaskSelect;
}
