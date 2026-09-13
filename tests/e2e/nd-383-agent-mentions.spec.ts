import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test.describe("ND-383 agent mentions in task comments", () => {
  test("records a tagged-agent event and keeps the mention after revocation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const ownerId = await signInAsVerifiedUser(page);
    const suffix = Date.now().toString(36);
    const projectName = uniqueProjectName("nd383-agent-mentions");
    const label = `Release bot ${suffix}`;

    const project = await prisma.project.create({
      data: {
        name: projectName,
        description: "Agent mention fixture.",
        ownerId,
        memberships: { create: { userId: ownerId, role: "owner" } },
      },
      select: { id: true },
    });
    const task = await prisma.task.create({
      data: {
        title: "Tag the release agent",
        description: null,
        status: "Backlog",
        position: 0,
        projectId: project.id,
        createdByUserId: ownerId,
        updatedByUserId: ownerId,
      },
      select: { id: true, title: true },
    });
    const credential = await prisma.apiCredential.create({
      data: {
        projectId: project.id,
        createdByUserId: ownerId,
        label,
        publicId: `nd383-agent-${suffix}`,
        secretHash: "not-a-real-secret-hash",
      },
      select: { id: true },
    });

    await page.goto(`/projects/${project.id}#kanban`);
    await expect(page.getByRole("heading", { name: "Kanban board" })).toBeVisible();

    const taskCard = page
      .getByRole("button", { name: new RegExp(task.title) })
      .first();
    await expect(taskCard).toBeVisible();
    await taskCard.click();
    await expect(page.getByRole("button", { name: "Task options" })).toBeVisible();

    const commentInput = page.locator("#task-comment-input");
    await commentInput.click();
    await page.keyboard.type(`@${label.slice(0, 7)}`);
    const agentMention = page
      .getByRole("option", { name: new RegExp(label) })
      .first();
    await expect(agentMention).toBeVisible();
    await expect(agentMention).toHaveAttribute("aria-disabled", "false");
    await agentMention.click();

    const token = `@{${label}}`;
    const composerChip = commentInput.locator("[data-editor-mention='true']");
    await expect(composerChip).toHaveText(`@${label}`);
    await expect(composerChip).toHaveAttribute("data-mention-raw", token);

    const commentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/comments") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Add comment" }).click();
    const commentResponse = await commentResponsePromise;
    expect(commentResponse.status()).toBe(201);

    const comment = await prisma.taskComment.findFirst({
      where: { taskId: task.id, content: { contains: token } },
      select: { id: true, content: true },
    });
    expect(comment).not.toBeNull();

    const commentBody = page.locator(`#task-comment-body-${comment?.id}`);
    await expect(commentBody).toBeVisible();
    await expect(commentBody).toContainText(`@${label}`);

    // Agent chips expose the same hover card as human mentions.
    const agentChip = commentBody.locator(
      `[data-rich-mention='true'][data-agent-mention-label="${label}"]`
    );
    await expect(agentChip).toBeVisible();
    await agentChip.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toContainText(label);
    await expect(tooltip).toContainText("Agent");
    await expect(tooltip.locator("[data-agent-avatar='true']")).toBeVisible();

    const mentions = await prisma.taskCommentAgentMention.findMany({
      where: { commentId: comment?.id },
    });
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({
      taskId: task.id,
      agentCredentialId: credential.id,
      agentLabel: label,
      createdByUserId: ownerId,
      createdByCredentialId: null,
      createdByCredentialLabel: null,
    });

    await prisma.apiCredential.update({
      where: { id: credential.id },
      data: { revokedAt: new Date(), revokedByUserId: ownerId },
    });

    await page.reload();
    const reloadedCard = page
      .getByRole("button", { name: new RegExp(task.title) })
      .first();
    await expect(reloadedCard).toBeVisible();
    await reloadedCard.click();
    await expect(page.locator(`#task-comment-body-${comment?.id}`)).toContainText(
      `@${label}`
    );
    await expect(
      prisma.taskCommentAgentMention.count({
        where: { commentId: comment?.id },
      })
    ).resolves.toBe(1);
  });
});
