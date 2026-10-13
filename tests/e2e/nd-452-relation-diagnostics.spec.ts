import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("relation errors identify bad ids without leaking a foreign project to an agent", async ({ page }) => {
  await signInAsVerifiedUser(page);
  const projects: string[] = [];
  const createProject = async (label: string) => {
    const response = await page.request.post("/api/projects", {
      data: { name: uniqueProjectName(label) },
    });
    expect(response.status()).toBe(201);
    const { project } = await response.json();
    projects.push(project.id);
    return project.id as string;
  };

  try {
    const projectId = await createProject("nd452-relations");
    const otherProjectId = await createProject("nd452-foreign");
    const createTask = async (id: string, title: string) => {
      const response = await page.request.post(`/api/projects/${id}/tasks`, {
        data: { title, labels: ["feature"] },
      });
      expect(response.status()).toBe(201);
      const body = await response.json();
      return body.taskId as string;
    };
    const sourceId = await createTask(projectId, "Source task");
    const archivedId = await createTask(projectId, "Archived target");
    const foreignId = await createTask(otherProjectId, "Foreign target");
    const sourcePath = `/api/projects/${projectId}/tasks/${sourceId}`;

    const done = await page.request.post(`/api/projects/${projectId}/tasks/${archivedId}/status`, {
      data: { status: "Done" },
    });
    expect(done.status()).toBe(200);
    const archived = await page.request.post(`/api/projects/${projectId}/tasks/${archivedId}/archive`);
    expect(archived.status()).toBe(200);

    const credential = await page.request.post(`/api/projects/${projectId}/agent-access`, {
      data: { label: "Relation diagnostics agent", scopes: ["task:read", "task:write"] },
    });
    expect(credential.status()).toBe(201);
    const { apiKey } = await credential.json();
    const exchange = await page.request.post("/api/auth/agent/token", {
      headers: { Authorization: `ApiKey ${apiKey}` },
    });
    expect(exchange.status()).toBe(200);
    const { accessToken } = await exchange.json();
    const headers = { Authorization: `Bearer ${accessToken}` };

    const rejectedCreate = await page.request.post(`/api/projects/${projectId}/tasks`, {
      headers,
      data: { title: "Rejected task", relatedTaskIds: [archivedId] },
    });
    expect(rejectedCreate.status()).toBe(400);
    expect(await rejectedCreate.json()).toEqual({
      error: "related-tasks-invalid",
      invalidRelatedTask: { id: archivedId, reason: "archived" },
    });

    const agentFailures: Array<[string, "archived" | "missing"]> = [
      [archivedId, "archived"],
      [foreignId, "missing"],
      ["nd452-nonexistent", "missing"],
    ];
    for (const [id, reason] of agentFailures) {
      const response = await page.request.patch(sourcePath, {
        headers,
        data: { addRelatedTaskIds: [id] },
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({
        error: "related-tasks-invalid",
        invalidRelatedTask: { id, reason },
      });
    }

    const humanResponse = await page.request.patch(sourcePath, {
      data: { relatedTaskIds: [foreignId] },
    });
    expect(humanResponse.status()).toBe(400);
    expect(await humanResponse.json()).toEqual({
      error: "related-tasks-invalid",
      invalidRelatedTask: { id: foreignId, reason: "cross-project" },
    });

    const readBack = await page.request.get(sourcePath, { headers });
    expect(readBack.status()).toBe(200);
    const { task } = await readBack.json();
    expect(task.relatedTasks).toEqual([]);
  } finally {
    for (const id of projects.reverse()) {
      const response = await page.request.delete(`/api/projects/${id}`);
      expect(response.status()).toBe(200);
    }
  }
});
