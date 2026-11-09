import { describe, expect, test, vi } from "vitest";
import { canReceiveProjectNotification, notificationAccessWhere } from "@/lib/services/notification-access";

describe("notification recipient module access", () => {
  test.each([
    [null, true], [[], false], [["meeting:read"], false], [["task:read"], true],
  ])("task copies follow current grants %j", async (capabilities, expected) => {
    const db = { project: { findFirst: vi.fn().mockResolvedValue({ ownerId: "owner", memberships: [{ role: "viewer", capabilities }] }) } };
    for (const type of ["task_assignment", "task_comment_mention", "task_due_date_reminder"]) {
      expect(await canReceiveProjectNotification({ db: db as never, recipientUserId: "member", projectId: "project", type })).toBe(expected);
    }
  });
  test("owner identity retains access, missing membership denies it, invitations remain independent", async () => {
    const findFirst = vi.fn().mockResolvedValue({ ownerId: "owner", memberships: [] });
    const db = { project: { findFirst } } as never;
    expect(await canReceiveProjectNotification({ db, recipientUserId: "owner", projectId: "project", type: "task_assignment" })).toBe(true);
    findFirst.mockResolvedValue(null);
    expect(await canReceiveProjectNotification({ db, recipientUserId: "former-member", projectId: "project", type: "task_assignment" })).toBe(false);
    expect(await canReceiveProjectNotification({ db, recipientUserId: "invitee", projectId: "project", type: "project_invitation" })).toBe(true);
  });
  test("read predicates include only currently permitted module/project pairs", async () => {
    const db = { project: { findMany: vi.fn().mockResolvedValue([
      { id: "denied", ownerId: "other", memberships: [{ role: "editor", capabilities: [] }] },
      { id: "meeting", ownerId: "other", memberships: [{ role: "viewer", capabilities: ["meeting:read"] }] },
      { id: "own", ownerId: "member", memberships: [] },
    ]) } };
    const filter = await notificationAccessWhere(db as never, "member");
    expect(JSON.stringify(filter)).not.toContain('"equals":"denied"');
    const allowed = filter.OR!.slice(1);
    expect(allowed.filter((entry) => JSON.stringify(entry).includes('"equals":"meeting"'))).toEqual([
      { type: { in: ["meeting_todo_overdue_reminder"] }, metadata: { path: ["projectId"], equals: "meeting" } },
    ]);
    expect(allowed.filter((entry) => JSON.stringify(entry).includes('"equals":"own"'))).toHaveLength(2);
  });
});
