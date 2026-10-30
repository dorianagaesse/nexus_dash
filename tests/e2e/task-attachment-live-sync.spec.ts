import { expect, test } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import {
  createProjectFromProjectsPage,
  openNewestProjectDashboard,
  uniqueProjectName,
} from "./helpers/project-helpers";

test("another browser session adds and removes attachments while a task draft stays focused", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  await signInAsVerifiedUser(page);
  const projectName = uniqueProjectName("attachment-sync");
  await createProjectFromProjectsPage(page, projectName);
  await openNewestProjectDashboard(page, projectName);
  const projectId = page.url().match(/\/projects\/([^/?#]+)/)![1];
  const created = await page.request.post(`/api/projects/${projectId}/tasks`, {
    data: { title: "Live attachment task" },
  });
  expect(created.ok()).toBeTruthy();
  const { task } = await created.json();
  const remote = await browser.newContext({
    storageState: await page.context().storageState(),
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
  });
  // A separate browser context has its own live subscription and local UI state.
  const sessionB = await remote.newPage();
  try {
    await page.goto(`/projects/${projectId}?taskId=${task.id}`);
    await sessionB.goto(`/projects/${projectId}`);
    await expect(
      page.getByRole("button", { name: "Task options" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Task options" }).click();
    await page.getByRole("button", { name: /^Edit$/ }).click();
    const title = page.getByLabel("Task title");
    await title.fill("Unfinished local title");
    await page
      .getByRole("button", { name: "Open attachment link input" })
      .click();
    const draft = page.getByPlaceholder("https://...");
    await draft.fill("https://unfinished.example/draft");
    await expect(draft).toBeFocused();
    const attachmentsUrl = `/api/projects/${projectId}/tasks/${task.id}/attachments`;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=",
      "base64"
    );
    for (const kind of ["link", "file", "image"] as const) {
      const name = `Remote ${kind}`;
      const response = await sessionB.request.post(attachmentsUrl, {
        multipart:
          kind === "link"
            ? { kind: "link", name, url: "https://example.com/remote" }
            : {
                kind: "file",
                name,
                file: {
                  name: kind === "image" ? "pixel.png" : "note.txt",
                  mimeType: kind === "image" ? "image/png" : "text/plain",
                  buffer: kind === "image" ? png : Buffer.from("remote file"),
                },
              },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const { attachment } = await response.json();
      const rendered =
        kind === "image"
          ? page.getByRole("button", { name: `Preview image ${name}` })
          : page.getByRole("link", { name, exact: true });
      await expect(rendered).toBeVisible({ timeout: 30_000 });
      await expect(title).toHaveValue("Unfinished local title");
      await expect(draft).toHaveValue("https://unfinished.example/draft");
      await expect(draft).toBeFocused();
      const deleted = await sessionB.request.delete(
        `${attachmentsUrl}/${attachment.id}`
      );
      expect(deleted.ok()).toBeTruthy();
      await expect(rendered).toHaveCount(0, { timeout: 30_000 });
      await expect(title).toHaveValue("Unfinished local title");
      await expect(draft).toHaveValue("https://unfinished.example/draft");
      await expect(draft).toBeFocused();
    }
  } finally {
    await remote.close();
    await page.request.delete(`/api/projects/${projectId}`);
  }
});
