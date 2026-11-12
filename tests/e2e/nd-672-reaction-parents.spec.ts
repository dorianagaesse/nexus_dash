import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("reaction URLs cannot address a different task or comment", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: { name: uniqueProjectName("nd672"), ownerId: userId, memberships: { create: { userId, role: "owner" } } } });
  const prefix = `/api/projects/${project.id}`;
  try {
    const threads: { taskId: string; commentId: string }[] = [];
    for (const title of ["First thread", "Second thread"]) {
      const task = await page.request.post(`${prefix}/tasks`, { data: { title } });
      expect(task.status()).toBe(201);
      const taskId = (await task.json()).taskId;
      const comment = await page.request.post(`${prefix}/tasks/${taskId}/comments`, { data: { content: title } });
      expect(comment.status()).toBe(201);
      threads.push({ taskId, commentId: (await comment.json()).comment.id });
    }
    const credential = await (await page.request.post(`${prefix}/agent-access`, { data: { label: "Parent check", scopes: ["task:read", "task:write"] } })).json();
    const token = await (await page.request.post("/api/auth/agent/token", { data: { apiKey: credential.apiKey } })).json();
    const agent = { Authorization: `Bearer ${token.accessToken}` };
    const path = (taskId: string, commentId: string) => `${prefix}/tasks/${taskId}/comments/${commentId}/reactions`;
    const valid = path(threads[0].taskId, threads[0].commentId);
    for (const headers of [{}, agent]) {
      const added = await page.request.post(valid, { headers, data: { emoji: "x" } });
      expect(added.status()).toBe(200);
      const reactionId = (await added.json()).reactions[0].reactions[0].id;
      const wrongTask = path(threads[1].taskId, threads[0].commentId);
      const wrongComment = path(threads[1].taskId, threads[1].commentId);
      for (const invalid of [wrongTask, path("missing-task", threads[0].commentId)]) {
        expect((await page.request.get(invalid, { headers })).status()).toBe(404);
        expect((await page.request.post(invalid, { headers, data: { emoji: "y" } })).status()).toBe(404);
        expect((await page.request.delete(`${invalid}/${reactionId}`, { headers })).status()).toBe(404);
      }
      expect((await page.request.delete(`${wrongComment}/${reactionId}`, { headers })).status()).toBe(404);
      expect((await page.request.delete(`${valid}/missing-reaction`, { headers })).status()).toBe(404);
      expect(await prisma.taskCommentReaction.count({ where: { commentId: threads[0].commentId } })).toBe(1);
      expect(await prisma.taskCommentReaction.count({ where: { commentId: threads[1].commentId } })).toBe(0);
      expect((await page.request.get(valid, { headers })).status()).toBe(200);
      expect((await page.request.delete(`${valid}/${reactionId}`, { headers })).status()).toBe(200);
    }
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: userId } });
  }
});
