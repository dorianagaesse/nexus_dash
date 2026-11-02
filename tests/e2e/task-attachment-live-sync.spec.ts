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
    await page.bringToFront();
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
    const draftUpload = await sessionB.request.post(attachmentsUrl, {
      multipart: {
        kind: "file", isCommentDraft: "true", name: "Unpublished comment file",
        file: { name: "comment-draft.txt", mimeType: "text/plain", buffer: Buffer.from("comment draft") },
      },
    });
    expect(draftUpload.ok()).toBeTruthy();
    const { attachment: commentDraft } = await draftUpload.json();
    const readTask = async () => (await (await page.request.get(`/api/projects/${projectId}/tasks/${task.id}`)).json()).task;
    expect((await readTask()).attachments).not.toContainEqual(expect.objectContaining({ id: commentDraft.id }));
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
      // The unrelated change triggers polling reconciliation too: an unposted
      // comment upload must stay absent from the task-level attachment panel.
      await expect(page.getByText("Unpublished comment file", { exact: true })).toHaveCount(0);
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
    const published = await sessionB.request.post(`/api/projects/${projectId}/tasks/${task.id}/comments`, {
      data: { content: "Published comment with a file", attachmentIds: [commentDraft.id] },
    });
    expect(published.ok()).toBeTruthy();
    const { comment } = await published.json();
    expect(comment.attachments).toContainEqual(expect.objectContaining({ id: commentDraft.id, commentId: comment.id }));
    expect((await readTask()).attachments).toContainEqual(expect.objectContaining({ id: commentDraft.id, commentId: comment.id }));
    await expect(page.getByText("Unpublished comment file", { exact: true })).toHaveCount(0);
  } finally {
    await remote.close();
    await page.request.delete(`/api/projects/${projectId}`);
  }
});
