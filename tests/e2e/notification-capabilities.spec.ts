import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("task notification copies and live banners follow recipient module permissions", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const ownerId = await signInAsVerifiedUser(page);
  const created = await page.request.post("/api/projects", { data: { name: uniqueProjectName("notification-access") } });
  const projectId = (await created.json()).project.id;
  const base = `/api/projects/${projectId}`;
  const context = await browser.newContext();
  const memberPage = await context.newPage();
  const memberId = await signInAsVerifiedUser(memberPage);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
  const membership = await prisma.projectMembership.create({ data: { projectId, userId: memberId, role: "editor", capabilities: [] } });
  const memberPath = `${base}/sharing/members/${membership.id}`;
  const createActivity = async (title: string) => {
    const taskResponse = await page.request.post(`${base}/tasks`, { data: { title } });
    expect(taskResponse.status()).toBe(201);
    const body = await taskResponse.json();
    const taskId = body.taskId ?? body.task.id;
    expect((await page.request.patch(`${base}/tasks/${taskId}`, { data: { assignee: { kind: "human", id: memberId } } })).status()).toBe(200);
    const comment = await page.request.post(`${base}/tasks/${taskId}/comments`, { data: { content: `Please check @${user.username}#${user.usernameDiscriminator}` } });
    expect(comment.status()).toBe(201);
  };
  try {
    for (const capabilities of [[], ["meeting:read"]]) {
      expect((await page.request.patch(memberPath, { data: { role: "editor", capabilities } })).status()).toBe(200);
      await createActivity(uniqueProjectName("hidden-title"));
      expect(await prisma.notification.count({ where: { recipientUserId: memberId, type: { in: ["task_assignment", "task_comment_mention"] } } })).toBe(0);
      expect(await prisma.projectNotificationEmail.count({ where: { recipientUserId: memberId } })).toBe(0);
    }
    expect((await page.request.patch(memberPath, { data: { role: "editor", capabilities: ["task:read"] } })).status()).toBe(200);
    const title = uniqueProjectName("revoke-this-title");
    await createActivity(title);
    expect(await prisma.notification.count({ where: { recipientUserId: memberId } })).toBe(2);
    expect(await prisma.projectNotificationEmail.count({ where: { recipientUserId: memberId, status: "pending" } })).toBeGreaterThan(0);
    await memberPage.goto("/account/notifications");
    await memberPage.bringToFront();
    await expect(memberPage.getByText(title, { exact: false }).first()).toBeVisible();
    const before = await (await memberPage.request.get("/api/account/notifications/summary")).json();
    expect(before.unreadCount).toBe(2);
    expect((await page.request.patch(memberPath, { data: { role: "editor", capabilities: [] } })).status()).toBe(200);
    const after = await (await memberPage.request.get("/api/account/notifications/summary")).json();
    expect(after.unreadCount).toBe(0);
    expect(after.latestUnreadNotification).toBeNull();
    expect(Date.parse(after.version)).toBeGreaterThan(Date.parse(before.version));
    const inbox = await (await memberPage.request.get("/api/account/notifications")).json();
    expect(JSON.stringify(inbox)).not.toContain(title);
    // Polling/Broadcast updates an already-open inbox and its awareness banner.
    await expect(memberPage.getByText(title, { exact: false })).toHaveCount(0, { timeout: 35_000 });
    expect(await prisma.notification.count({ where: { recipientUserId: memberId } })).toBe(2);
  } finally {
    await page.request.delete(base);
    await context.close();
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  }
});
