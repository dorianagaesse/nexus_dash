import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("reaction toggles and deletion belong to each human or credential actor", async ({
  page,
}) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("nd671"),
      ownerId: userId,
      memberships: { create: { userId, role: "owner" } },
    },
  });
  const prefix = `/api/projects/${project.id}`;
  const actors: { id?: string; headers: Record<string, string> }[] = [
    { headers: {} },
  ];
  try {
    const taskResponse = await page.request.post(`${prefix}/tasks`, {
      data: { title: "Reaction actors" },
    });
    expect(taskResponse.status()).toBe(201);
    const taskId = (await taskResponse.json()).taskId;
    const commentResponse = await page.request.post(
      `${prefix}/tasks/${taskId}/comments`,
      { data: { content: "Actor reactions" } }
    );
    expect(commentResponse.status()).toBe(201);
    const commentId = (await commentResponse.json()).comment.id;
    const url = `${prefix}/tasks/${taskId}/comments/${commentId}/reactions`;
    for (const label of ["Reaction A", "Reaction B"]) {
      const created = await page.request.post(`${prefix}/agent-access`, {
        data: { label, scopes: ["task:read", "task:write"] },
      });
      expect(created.status()).toBe(201);
      const credential = await created.json();
      const token = await page.request.post("/api/auth/agent/token", {
        data: { apiKey: credential.apiKey },
      });
      expect(token.ok()).toBeTruthy();
      actors.push({
        id: credential.credential.id,
        headers: {
          Authorization: `Bearer ${(await token.json()).accessToken}`,
        },
      });
    }
    const emoji = "\u{1f44d}";
    for (const actor of actors)
      expect(
        (
          await page.request.post(url, {
            headers: actor.headers,
            data: { emoji },
          })
        ).status()
      ).toBe(200);
    let groups = (await (await page.request.get(url)).json()).reactions;
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].reacted).toBe(true);
    expect(
      groups[0].reactions.map((r: { actor: { kind: string } }) => r.actor.kind)
    ).toEqual(["human", "agent", "agent"]);
    const aId = groups[0].reactions.find(
      (r: { actor: { id: string } }) => r.actor.id === actors[1].id
    ).id;
    for (const actor of [actors[0], actors[2]])
      expect(
        (
          await page.request.delete(`${url}/${aId}`, { headers: actor.headers })
        ).status()
      ).toBe(403);
    expect(
      (await page.request.post(url, { data: { emoji } })).ok()
    ).toBeTruthy();
    groups = (await (await page.request.get(url)).json()).reactions;
    expect(groups[0].count).toBe(2);
    expect(groups[0].reacted).toBe(false);
    expect(
      (
        await page.request.post(url, {
          headers: actors[1].headers,
          data: { emoji: "\u{2705}" },
        })
      ).ok()
    ).toBeTruthy();
    groups = (
      await (await page.request.get(url, { headers: actors[2].headers })).json()
    ).reactions;
    expect(
      groups.find((g: { emoji: string }) => g.emoji === emoji).reacted
    ).toBe(true);
    expect(
      groups.find((g: { emoji: string }) => g.emoji !== emoji).reacted
    ).toBe(false);
    const newAId = groups.find((g: { emoji: string }) => g.emoji !== emoji)
      .reactions[0].id;
    expect(
      (
        await page.request.delete(`${url}/${newAId}`, {
          headers: actors[1].headers,
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await page.request.post(url, {
          headers: actors[1].headers,
          data: { emoji },
        })
      ).ok()
    ).toBeTruthy();
    await prisma.apiCredential.update({
      where: { id: actors[1].id! },
      data: { revokedAt: new Date() },
    });
    expect(
      (await page.request.get(url, { headers: actors[1].headers })).status()
    ).toBe(401);
    await prisma.apiCredential.delete({ where: { id: actors[1].id! } });
    groups = (await (await page.request.get(url)).json()).reactions;
    const historical = groups[0].reactions.find(
      (r: { actor: { displayName: string } }) =>
        r.actor.displayName === "Reaction A"
    );
    expect(historical.actor).toEqual({
      kind: "agent",
      id: null,
      displayName: "Reaction A",
    });
    expect(historical.user).toBeNull();
    expect(groups[0].reacted).toBe(false);
    await page.goto(`/projects/${project.id}?taskId=${taskId}#kanban`);
    await expect(page.getByTitle(/Reaction A \(agent\)/)).toBeVisible();
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: userId } });
  }
});
