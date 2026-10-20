import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";
import { buildCanonicalTaskRelation } from "../../lib/task-related";
import { lockContentRevision } from "../../lib/services/content-revision-service";
import { retryTransaction } from "../../lib/services/transaction-retry";

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

test("relation snapshots are no-ops and reciprocal guarded edits recover from deadlocks", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: {
    name: uniqueProjectName("nd565-relations"), ownerId: userId,
    memberships: { create: { userId, role: "owner" } },
    tasks: { create: ["Snapshot A", "Snapshot B", "Concurrent A", "Concurrent B", "Locked A", "Locked B"].map((title, position) => ({
      title, position, createdByUserId: userId, updatedByUserId: userId,
    })) },
  }, include: { tasks: { orderBy: { position: "asc" } } } });
  const [a, b, c, d, e, f] = project.tasks;
  const url = (id: string) => `/api/projects/${project.id}/tasks/${id}`;
  const read = async (id: string) => {
    const response = await page.request.get(url(id));
    expect(response.status()).toBe(200);
    return { etag: response.headers().etag, task: (await response.json()).task };
  };
  const patch = (id: string, peer: string, etag: string, additive = false) =>
    page.request.patch(url(id), { headers: { "X-Content-If-Match": etag },
      data: additive ? { addRelatedTaskIds: [peer] } : { relatedTaskIds: [peer] } });
  try {
    const initial = await read(a.id);
    expect((await patch(a.id, b.id, initial.etag)).status()).toBe(200);
    const beforeA = await read(a.id);
    const beforeB = await read(b.id);
    // Full legacy snapshots and conditional snapshots must retain both ETags.
    expect((await page.request.patch(url(a.id), { data: { title: a.title, relatedTaskIds: [b.id] } })).status()).toBe(200);
    expect((await patch(a.id, b.id, beforeA.etag)).status()).toBe(200);
    expect((await patch(b.id, a.id, beforeB.etag)).status()).toBe(200);
    expect((await read(a.id)).etag).toBe(beforeA.etag);
    expect((await read(b.id)).etag).toBe(beforeB.etag);

    const beforeC = await read(c.id);
    const beforeD = await read(d.id);
    const activityBefore = await prisma.projectActivityEvent.count({ where: { projectId: project.id } });
    const reciprocal = await Promise.all([
      patch(c.id, d.id, beforeC.etag, true), patch(d.id, c.id, beforeD.etag, true),
    ]);
    expect(reciprocal.map((response) => response.status()).sort()).toEqual([200, 412]);
    expect(await prisma.projectActivityEvent.count({ where: { projectId: project.id } })).toBe(activityBefore + 1);
    expect((await read(c.id)).task.contentRevision).toBe(beforeC.task.contentRevision + 1);
    expect((await read(d.id)).task.contentRevision).toBe(beforeD.task.contentRevision + 1);

    // Force the reciprocal lock schedule so this regression cannot pass merely
    // because one HTTP request happened to finish before the other began.
    let waiting = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const attempts = [0, 0];
    const write = (id: string, peer: string, index: number) => retryTransaction(
      () => prisma.$transaction(async (db) => {
        attempts[index] += 1;
        const state = await lockContentRevision({ db, domain: "task", projectId: project.id, id, expectedRevision: 0 });
        if (state !== "matched") return state;
        if (attempts[index] === 1) {
          waiting += 1;
          if (waiting === 2) release();
          await barrier;
        }
        await db.taskRelation.createMany({ data: [{ projectId: project.id, ...buildCanonicalTaskRelation(id, peer) }], skipDuplicates: true });
        return "accepted";
      }, { timeout: 15_000 }), true
    );
    expect((await Promise.all([write(e.id, f.id, 0), write(f.id, e.id, 1)])).sort()).toEqual(["accepted", "conflict"]);
    expect(attempts[0] + attempts[1]).toBe(3);
    expect(await prisma.taskRelation.count({ where: { projectId: project.id, ...buildCanonicalTaskRelation(e.id, f.id) } })).toBe(1);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
  }
});
