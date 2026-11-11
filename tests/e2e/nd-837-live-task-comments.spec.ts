import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("two human sessions keep open threads current after human and agent mutations", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  const ownerId = await signInAsVerifiedUser(page);
  const memberId = await signInAsVerifiedUser(second);
  await prisma.user.update({ where: { id: ownerId }, data: { name: "Thread owner", username: null, usernameDiscriminator: null } });
  await prisma.user.update({ where: { id: memberId }, data: { name: "Thread member", username: null, usernameDiscriminator: null } });
  const project = await prisma.project.create({ data: {
    name: uniqueProjectName("nd837"), ownerId,
    memberships: { create: [{ userId: ownerId, role: "owner" }, { userId: memberId, role: "editor" }] },
  } });
  const prefix = `/api/projects/${project.id}`;
  try {
    const createdTask = await page.request.post(`${prefix}/tasks`, { data: { title: "Live thread" } });
    expect(createdTask.status()).toBe(201);
    const taskId = (await createdTask.json()).taskId;
    const commentsUrl = `${prefix}/tasks/${taskId}/comments`;
    const createdComment = await page.request.post(commentsUrl, { data: { content: "Original comment" } });
    expect(createdComment.status()).toBe(201);
    const commentId = (await createdComment.json()).comment.id;
    const reactionUrl = `${commentsUrl}/${commentId}/reactions`;
    const createdAgent = await page.request.post(`${prefix}/agent-access`, { data: { label: "Thread agent", scopes: ["task:read", "task:write"] } });
    expect(createdAgent.status()).toBe(201);
    const token = await page.request.post("/api/auth/agent/token", { data: { apiKey: (await createdAgent.json()).apiKey } });
    expect(token.ok()).toBeTruthy();
    const agentHeaders = { Authorization: `Bearer ${(await token.json()).accessToken}` };
    await Promise.all([page, second].map((session) => session.goto(`/projects/${project.id}?taskId=${taskId}#kanban`)));
    const dialogs = [page.getByRole("dialog"), second.getByRole("dialog")];
    for (const dialog of dialogs) await expect(dialog.getByText("Original comment", { exact: true })).toBeVisible();

    const composer = dialogs[0].getByRole("textbox", { name: "Task comment", exact: true });
    await composer.fill("Unsent local comment");
    await composer.focus();
    await composer.evaluate((editor) => {
      const text = editor.firstChild?.firstChild ?? editor.firstChild!;
      const range = document.createRange(); range.setStart(text, 2); range.setEnd(text, 7);
      window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    });
    const assertDraft = async () => {
      await expect(composer).toContainText("Unsent local comment");
      await expect(composer).toBeFocused();
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("sent ");
    };
    expect((await second.request.post(commentsUrl, { data: { content: "Member comment" } })).status()).toBe(201);
    for (const dialog of dialogs) await expect(dialog.getByText("Member comment", { exact: true })).toBeVisible({ timeout: 25_000 });
    expect((await page.request.post(commentsUrl, { headers: agentHeaders, data: { content: "Agent comment" } })).status()).toBe(201);
    for (const dialog of dialogs) await expect(dialog.getByText("Agent comment", { exact: true })).toBeVisible({ timeout: 25_000 });
    await assertDraft();
    expect((await page.request.patch(`${commentsUrl}/${commentId}`, { data: { content: "Edited original comment" } })).ok()).toBeTruthy();
    for (const dialog of dialogs) await expect(dialog.getByText("Edited original comment", { exact: true })).toBeVisible({ timeout: 25_000 });

    for (const [session, headers] of [[page, {}], [second, {}], [page, agentHeaders]] as const) {
      expect((await session.request.post(reactionUrl, { headers, data: { emoji: "👍" } })).ok()).toBeTruthy();
    }
    for (const dialog of dialogs) {
      const reaction = dialog.getByRole("button", { name: "👍 3", exact: true });
      await expect(reaction).toBeVisible({ timeout: 25_000 });
      await expect(reaction).toHaveAttribute("title", "Thread owner, Thread member, Thread agent (agent)");
      await expect(reaction).toHaveClass(/border-primary/);
    }
    await assertDraft();
    expect((await second.request.post(reactionUrl, { data: { emoji: "✅" } })).ok()).toBeTruthy();
    await expect(dialogs[0].getByRole("button", { name: "👍 2", exact: true })).toBeVisible({ timeout: 25_000 });
    await expect(dialogs[1].getByRole("button", { name: "👍 2", exact: true })).not.toHaveClass(/border-primary/);
    await expect(dialogs[1].getByRole("button", { name: "✅", exact: true })).toHaveClass(/border-primary/);
    expect((await second.request.post(reactionUrl, { data: { emoji: "✅" } })).ok()).toBeTruthy();
    for (const dialog of dialogs) await expect(dialog.getByRole("button", { name: "✅", exact: true })).toHaveCount(0, { timeout: 25_000 });
    const groups = (await (await page.request.get(reactionUrl, { headers: agentHeaders })).json()).reactions;
    const agentReaction = groups[0].reactions.find((r: { actor: { kind: string } }) => r.actor.kind === "agent");
    expect((await page.request.delete(`${reactionUrl}/${agentReaction.id}`, { headers: agentHeaders })).ok()).toBeTruthy();
    // Catch up through the same visibility/focus path used after reconnecting.
    await second.evaluate(() => window.dispatchEvent(new Event("focus")));
    for (const dialog of dialogs) {
      await expect(dialog.getByRole("button", { name: "👍", exact: true })).toHaveAttribute("title", "Thread owner", { timeout: 25_000 });
      await expect(dialog.getByText("Member comment", { exact: true })).toHaveCount(1);
      await expect(dialog.getByText("Agent comment", { exact: true })).toHaveCount(1);
    }
    await assertDraft();
    // The local reaction acknowledges a project version newer than this
    // remote comment, before the next activity poll has delivered it.
    expect((await second.request.post(commentsUrl, { data: { content: "Concurrent member comment" } })).status()).toBe(201);
    await dialogs[0].getByRole("button", { name: "👍", exact: true }).click();
    await expect(dialogs[0].getByText("Concurrent member comment", { exact: true })).toBeVisible({ timeout: 25_000 });
    await expect(composer).toContainText("Unsent local comment");
    await dialogs[0].getByTestId(`edit-comment-button-${commentId}`).click();
    const edit = dialogs[0].getByRole("textbox", { name: "Edit task comment", exact: true });
    await edit.fill("Unfinished comment edit");
    await edit.focus();
    expect((await second.request.post(commentsUrl, { data: { content: "Another member comment" } })).status()).toBe(201);
    await expect(dialogs[0].getByText("Another member comment", { exact: true })).toBeVisible({ timeout: 25_000 });
    await expect(edit).toHaveText("Unfinished comment edit");
    await expect(edit).toBeFocused();
  } finally {
    await secondContext.close();
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  }
});
