import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("conditional authoring rejects competing writes and preserves partial aggregates", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: {
    name: uniqueProjectName("nd565-revisions"), ownerId: userId,
    memberships: { create: { userId, role: "owner" } },
  } });
  const prefix = `/api/projects/${project.id}`;
  try {
    const taskResponse = await page.request.post(`${prefix}/tasks`, { data: { title: "Revision test task" } });
    expect(taskResponse.status()).toBe(201);
    const createdTask = await taskResponse.json();
    const taskId = createdTask.task?.id ?? createdTask.taskId;
    const taskUrl = `${prefix}/tasks/${taskId}`;
    const read = await page.request.get(taskUrl);
    const initial = (await read.json()).task;
    const etag = read.headers().etag;
    expect(etag).toBe(`"task:${taskId}:${initial.contentRevision}"`);

    const saves = await Promise.all(["Writer one", "Writer two"].map((description) =>
      page.request.patch(taskUrl, { headers: { "X-Content-If-Match": etag }, data: { description } })
    ));
    expect(saves.map((response) => response.status()).sort()).toEqual([200, 412]);
    const accepted = await saves.find((response) => response.status() === 200)!.json();
    const rejected = await saves.find((response) => response.status() === 412)!.json();
    expect(saves.find((response) => response.status() === 200)!.headers().etag)
      .toBe(`"task:${taskId}:${accepted.task.contentRevision}"`);
    expect(rejected.error).toBe("edit-conflict");
    expect(rejected.current.description).toBe(accepted.task.description);
    expect(accepted.task.contentRevision).toBe(initial.contentRevision + 1);
    const activityBefore = await prisma.projectActivityEvent.count({ where: { projectId: project.id } });
    expect((await page.request.patch(taskUrl, { headers: { "X-Content-If-Match": etag }, data: { description: "Stale again" } })).status()).toBe(412);
    expect(await prisma.projectActivityEvent.count({ where: { projectId: project.id } })).toBe(activityBefore);
    expect((await page.request.patch(taskUrl, { headers: { "X-Content-If-Match": `W/${etag}` }, data: { title: "Invalid header" } })).status()).toBe(400);
    expect((await page.request.patch(taskUrl, { headers: { "If-Match": etag }, data: { title: "Unsupported transport" } })).status()).toBe(400);
    const comment = await page.request.post(`${taskUrl}/comments`, { data: { content: "Activity-only comment" } });
    expect(comment.ok()).toBeTruthy();
    expect((await (await page.request.get(taskUrl)).json()).task.contentRevision).toBe(accepted.task.contentRevision);
    expect((await page.request.patch(taskUrl, { data: { title: "Legacy client remains compatible" } })).ok()).toBeTruthy();

    const note = await prisma.projectMeetingNote.create({ data: {
      projectId: project.id, title: "Meeting revision", createdByUserId: userId, updatedByUserId: userId,
      inputNotes: "Keep preparation", outputNotes: "Old output", labelsJson: '["keep-label"]',
      participants: { create: { displayName: "External participant", position: 5 } },
      actions: { create: { content: "Keep this todo", position: 7, createdByUserId: userId, creatorDisplayNameSnapshot: "Owner", assigneeKind: "human", assigneeUserId: userId, assigneeDisplayNameSnapshot: "Owner" } },
    } });
    const noteUrl = `${prefix}/meeting-notes/${note.id}`;
    const noteRead = await page.request.get(noteUrl);
    expect(noteRead.ok()).toBeTruthy();
    const noteBody = (await noteRead.json()).note;
    const savedNote = await page.request.patch(noteUrl, { headers: { "X-Content-If-Match": noteRead.headers().etag }, data: { outputNotes: "New output" } });
    expect(savedNote.status()).toBe(200);
    const latestNote = (await savedNote.json()).note;
    expect(latestNote.inputNotes).toBe("Keep preparation");
    expect(latestNote.participants).toHaveLength(1);
    expect(latestNote.actions).toHaveLength(1);
    expect(latestNote.labels).toEqual(["keep-label"]);
    expect(latestNote.contentRevision).toBe(noteBody.contentRevision + 1);
    const storedNote = await prisma.projectMeetingNote.findUniqueOrThrow({ where: { id: note.id }, include: { participants: true, actions: true } });
    expect(storedNote.participants[0].position).toBe(5);
    expect(storedNote.actions[0].position).toBe(7);
    expect(storedNote.actions[0].assigneeUserId).toBe(userId);
    const completed = await page.request.patch(`${noteUrl}/actions/${latestNote.actions[0].id}`, { data: { completed: true } });
    expect(completed.ok()).toBeTruthy();
    expect((await page.request.patch(noteUrl, { headers: { "X-Content-If-Match": savedNote.headers().etag }, data: { outputNotes: "Stale todo snapshot" } })).status()).toBe(412);

    const card = await prisma.resource.create({ data: { projectId: project.id, type: "context-card", name: "Card revision", content: "Keep body", color: "#FDE2E4" } });
    const cardUrl = `${prefix}/context-cards/${card.id}`;
    const cardRead = await page.request.get(cardUrl);
    expect(cardRead.ok()).toBeTruthy();
    const cardBody = (await cardRead.json()).card;
    const savedCard = await page.request.patch(cardUrl, { headers: { "X-Content-If-Match": cardRead.headers().etag }, data: { title: "New card title" } });
    expect(savedCard.status()).toBe(200);
    const latestCard = (await savedCard.json()).card;
    expect(latestCard.content).toBe("Keep body");
    expect(latestCard.contentRevision).toBe(cardBody.contentRevision + 1);
    expect((await page.request.patch(cardUrl, { headers: { "X-Content-If-Match": cardRead.headers().etag }, data: { content: "Stale body" } })).status()).toBe(412);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});
