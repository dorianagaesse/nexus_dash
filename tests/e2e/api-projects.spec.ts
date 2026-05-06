import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test.describe("project API parity", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsVerifiedUser(page);
  });

  test("creates and lists a project through the session API", async ({ page }) => {
    const projectName = uniqueProjectName("api-project");

    const createResponse = await page.request.post("/api/projects", {
      data: {
        name: projectName,
        description: "Created through the project collection API.",
      },
    });
    expect(createResponse.status()).toBe(201);
    const createdBody = (await createResponse.json()) as {
      project: {
        id: string;
        name: string;
        description: string | null;
      };
    };
    expect(createdBody.project.name).toBe(projectName);
    expect(createdBody.project.description).toBe(
      "Created through the project collection API."
    );

    const listResponse = await page.request.get("/api/projects");
    expect(listResponse.ok()).toBeTruthy();
    const listBody = (await listResponse.json()) as {
      projects: Array<{
        id: string;
        name: string;
        role: string;
        counts: {
          tasks: number;
          contextCards: number;
        };
      }>;
    };
    expect(listBody.projects).toContainEqual(
      expect.objectContaining({
        id: createdBody.project.id,
        name: projectName,
        role: "owner",
        counts: {
          tasks: 0,
          contextCards: 0,
        },
      })
    );

    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  });
});
