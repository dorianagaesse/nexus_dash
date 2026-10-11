import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("agent pair edits preserve other edges and read back from both endpoints", async ({ page }) => {
  await signInAsVerifiedUser(page);
  const createdProject = await page.request.post("/api/projects", {
    data: { name: uniqueProjectName("nd451-relations") },
  });
  expect(createdProject.status()).toBe(201);
  const { project } = await createdProject.json();
  const projectPath = `/api/projects/${project.id}`;

  try {
    const credential = await page.request.post(`${projectPath}/agent-access`, {
      data: { label: "Relation test agent", scopes: ["task:read", "task:write"] },
    });
    expect(credential.status()).toBe(201);
    const { apiKey } = await credential.json();
    const exchange = await page.request.post("/api/auth/agent/token", {
      headers: { Authorization: `ApiKey ${apiKey}` },
    });
    expect(exchange.status()).toBe(200);
    const { accessToken } = await exchange.json();
    const headers = { Authorization: `Bearer ${accessToken}` };

    const taskIds: string[] = [];
    for (const title of ["Task A", "Task B", "Task C", "Task D"]) {
      const response = await page.request.post(`${projectPath}/tasks`, {
        headers, data: { title, labels: ["feature"], description: "<p>Keep this body</p>" },
      });
      expect(response.status()).toBe(201);
      taskIds.push((await response.json()).taskId);
    }
    const [a, b, c, d] = taskIds;
    const taskPath = (id: string) => `${projectPath}/tasks/${id}`;
    const patch = async (id: string, data: unknown) => {
      const response = await page.request.patch(taskPath(id), { headers, data });
      expect(response.status()).toBe(200);
      return (await response.json()).task;
    };
    const expectEdges = async (id: string, expectedIds: string[]) => {
      const response = await page.request.get(taskPath(id), { headers });
      expect(response.status()).toBe(200);
      const { task } = await response.json();
      expect(task.relatedTasks.map((entry: { id: string }) => entry.id).sort()).toEqual([...expectedIds].sort());
      return task;
    };

    // Concurrent edits to different pairs must not overwrite one another.
    await Promise.all([
      patch(a, { addRelatedTaskIds: [b] }),
      patch(a, { addRelatedTaskIds: [d] }),
    ]);
    await expectEdges(a, [b, d]);

    // The existing replace contract still establishes a complete neighborhood.
    await patch(a, { relatedTaskIds: [b, d] });
    await patch(b, { relatedTaskIds: [a, c] });
    const doneResponse = await page.request.post(`${taskPath(d)}/status`, {
      headers, data: { status: "Done" },
    });
    expect(doneResponse.status()).toBe(200);
    expect((await page.request.post(`${taskPath(d)}/archive`, { headers })).status()).toBe(200);

    const updated = await patch(a, { addRelatedTaskIds: [c, c] });
    expect(updated.relatedTasks.map((entry: { id: string }) => entry.id).sort()).toEqual([b, c, d].sort());
    expect(updated.title).toBe("Task A");
    expect(updated.description).toBe("<p>Keep this body</p>");
    expect(updated.labels).toEqual(["feature"]);
    await expectEdges(a, [b, c, d]);
    await expectEdges(b, [a, c]);
    await expectEdges(c, [a, b]);
    await expectEdges(d, [a]);

    // Retry from the other endpoint: there must still be one undirected edge.
    await patch(c, { addRelatedTaskIds: [a] });
    await patch(a, { addRelatedTaskIds: [d] });
    await expectEdges(a, [b, c, d]);
    await expectEdges(c, [a, b]);

    // A failed addition must not apply its accompanying removal.
    const invalid = await page.request.patch(taskPath(c), {
      headers, data: { addRelatedTaskIds: [d], removeRelatedTaskIds: [b] },
    });
    expect(invalid.status()).toBe(400);
    await expectEdges(c, [a, b]);
    await expectEdges(b, [a, c]);

    await patch(a, { removeRelatedTaskIds: [b, d] });
    await patch(b, { removeRelatedTaskIds: [a, "missing-task"] });
    await expectEdges(a, [c]);
    await expectEdges(b, [c]);
    await expectEdges(c, [a, b]);
    await expectEdges(d, []);

    await patch(a, { addRelatedTaskIds: [b], removeRelatedTaskIds: [c] });
    await expectEdges(a, [b]);
    await expectEdges(b, [a, c]);
    await expectEdges(c, [b]);

    await patch(a, { relatedTaskIds: [] });
    await expectEdges(a, []);
    await expectEdges(b, [c]);
    await expectEdges(c, [b]);
  } finally {
    const deleted = await page.request.delete(projectPath);
    expect(deleted.status()).toBe(200);
  }
});
