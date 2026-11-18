import type { Prisma } from "@prisma/client";
import { effectiveProjectCapabilities, type ProjectCapability } from "@/lib/project-capabilities";
import { getProjectAccess } from "@/lib/services/project-access-service";
import type { DbClient } from "@/lib/services/rls-context";

// Notifications are readable copies of module data, not independent grants.
const MODULE_NOTIFICATION_TYPES = {
  "task:read": ["task_comment_mention", "task_assignment", "task_due_date_reminder"],
  "meeting:read": ["meeting_todo_overdue_reminder"],
} as const;

export function notificationReadCapability(type: string): ProjectCapability | null {
  for (const [capability, types] of Object.entries(MODULE_NOTIFICATION_TYPES)) {
    if ((types as readonly string[]).includes(type)) return capability as ProjectCapability;
  }
  return null;
}

export async function canReceiveProjectNotification(input: {
  db: DbClient; recipientUserId: string; projectId: string; type: string;
}): Promise<boolean> {
  const capability = notificationReadCapability(input.type);
  if (!capability) return true; // Invitations do not require an existing membership.
  const access = await getProjectAccess({ db: input.db, actorUserId: input.recipientUserId, projectId: input.projectId });
  return access.ok && access.capabilities.includes(capability);
}

/** Apply before SELECT/count/update, including when the runtime role bypasses RLS. */
export async function notificationAccessWhere(db: DbClient, recipientUserId: string): Promise<Prisma.NotificationWhereInput> {
  const projects = await db.project.findMany({
    where: { OR: [{ ownerId: recipientUserId }, { memberships: { some: { userId: recipientUserId } } }] },
    select: { id: true, ownerId: true, memberships: { where: { userId: recipientUserId }, take: 1, select: { role: true, capabilities: true } } },
  });
  const alternatives: Prisma.NotificationWhereInput[] = [
    { type: { notIn: Object.values(MODULE_NOTIFICATION_TYPES).flat() } },
  ];
  for (const project of projects) {
    const member = project.memberships[0];
    const role = project.ownerId === recipientUserId ? "owner" : member?.role === "owner" ? "editor" : member?.role;
    if (!role) continue;
    const capabilities = effectiveProjectCapabilities(role, member?.capabilities);
    for (const [capability, types] of Object.entries(MODULE_NOTIFICATION_TYPES)) {
      if (capabilities.includes(capability as ProjectCapability)) alternatives.push({
        type: { in: [...types] }, metadata: { path: ["projectId"], equals: project.id },
      });
    }
  }
  return { OR: alternatives };
}
