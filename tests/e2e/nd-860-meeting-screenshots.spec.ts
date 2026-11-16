import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);
async function pasteScreenshot(page: Page, selector: string, name: string) {
  await page.locator(selector).evaluate(
    (element, { bytes, filename }) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array(bytes)], filename, { type: "image/png" })
      );
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        })
      );
    },
    { bytes: [...png], filename: name }
  );
}

for (const width of [1440, 375]) {
  test(`ND-860 screenshot create, output, preview, recovery, and removal at ${width}px`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    const userId = await signInAsVerifiedUser(page);
    const project = await prisma.project.create({
      data: {
        name: uniqueProjectName("meeting-shots"),
        ownerId: userId,
        memberships: { create: { userId, role: "owner" } },
      },
    });
    const title = uniqueProjectName("Screenshot meeting");
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "Prepare meeting" }).click();
    await page.locator("#meeting-title").fill(title);
    await page.locator("#meeting-inputs").fill("Preparation with screenshots.");
    await page.locator("#meeting-inputs-screenshots").setInputFiles({
      name: "preparation.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(
      page.getByRole("button", { name: "Preview image preparation.png" })
    ).toBeVisible();
    await pasteScreenshot(page, "#meeting-inputs", "pasted-input.png");
    await expect(
      page.getByRole("button", { name: "Preview image pasted-input.png" })
    ).toBeVisible();
    const create = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" && r.url().endsWith("/meeting-notes")
    );
    await page.getByRole("button", { name: "Save preparation" }).click();
    const created = await create;
    expect(created.ok()).toBeTruthy();
    const { note } = await created.json();
    expect(note.screenshots).toHaveLength(2);
    expect(
      note.screenshots.every(
        (row: { section: string }) => row.section === "input"
      )
    ).toBe(true);
    const inputDownload = note.screenshots[0].downloadUrl as string;
    expect((await page.request.get(inputDownload)).ok()).toBeTruthy();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await page
      .getByRole("button", { name: "Preview image preparation.png" })
      .click();
    const preview = page.getByRole("dialog", { name: "preparation.png" });
    await expect(
      preview.getByRole("img", { name: "preparation.png" })
    ).toBeVisible();
    expect(
      await preview
        .getByRole("link", { name: "Download", exact: true })
        .getAttribute("href")
    ).toBe(inputDownload);
    await preview
      .getByRole("button", { name: "Close attachment preview" })
      .click();
    await page.locator("#meeting-outputs").fill("Outcomes with a screenshot.");
    const uploadUrl = `**/api/projects/${project.id}/meeting-notes/attachments`;
    await page.route(uploadUrl, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Upload unavailable. Please retry." }),
      })
    );
    await pasteScreenshot(page, "#meeting-outputs", "output.png");
    await expect(
      page.getByText("Upload unavailable. Please retry.")
    ).toBeVisible();
    await expect(page.locator("#meeting-outputs")).toContainText(
      "Outcomes with a screenshot."
    );
    await page.unroute(uploadUrl);
    await pasteScreenshot(page, "#meeting-outputs", "output.png");
    await expect(
      page.getByRole("button", { name: "Preview image output.png" })
    ).toBeVisible();
    // Dismiss and reopen preserve the unsaved screenshot alongside output text.
    await page
      .getByRole("button", { name: `Close ${title}`, exact: true })
      .click();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(
      page.getByRole("button", { name: "Preview image output.png" })
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(
      page.getByRole("button", { name: "Preview image output.png" })
    ).toBeVisible();
    const save = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().endsWith(`/meeting-notes/${note.id}`) &&
        r.ok() &&
        r.request().postDataJSON().outputAttachmentIds
    );
    await page.getByRole("button", { name: "Save notes", exact: true }).click();
    await save;
    await page.reload();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(
      page.getByRole("button", { name: "Preview image output.png" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preview image preparation.png" })
    ).toBeVisible();
    // Invalid upload leaves rich text intact and can be retried.
    await page.locator("#meeting-outputs-screenshots").setInputFiles({
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
    await expect(
      page.getByText("Choose an image file for the screenshot.")
    ).toBeVisible();
    await expect(page.locator("#meeting-outputs")).toContainText(
      "Outcomes with a screenshot."
    );
    await page.getByRole("button", { name: "Edit prep", exact: true }).click();
    await page
      .getByRole("button", { name: "Remove image preparation.png" })
      .click();
    const remove = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().endsWith(`/meeting-notes/${note.id}`) &&
        r.ok() &&
        r.request().postDataJSON().inputAttachmentIds
    );
    await page.getByRole("button", { name: "Save preparation" }).click();
    await remove;
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(
      page.getByRole("button", { name: "Preview image preparation.png" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Preview image pasted-input.png" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preview image output.png" })
    ).toBeVisible();
    expect((await page.request.get(inputDownload)).status()).toBe(404);
    await page.screenshot({
      path: `test-results/nd860-meeting-screenshots-${width}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
}

test("ND-860 screenshot downloads and writes enforce note visibility, module grants, and project membership", async ({
  page,
  browser,
}) => {
  const author = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({
    data: {
      name: uniqueProjectName("screenshot-access"),
      ownerId: author,
      memberships: { create: { userId: author, role: "owner" } },
    },
  });
  const base = `/api/projects/${project.id}/meeting-notes`;
  const draftResponse = await page.request.post(`${base}/attachments`, {
    multipart: {
      section: "input",
      file: { name: "private.png", mimeType: "image/png", buffer: png },
    },
  });
  expect(draftResponse.status()).toBe(201);
  const { attachment } = await draftResponse.json();
  const memberContext = await browser.newContext();
  try {
    const memberPage = await memberContext.newPage();
    const member = await signInAsVerifiedUser(memberPage);
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: member, role: "viewer" },
    });
    expect(
      (await memberPage.request.get(attachment.downloadUrl)).status()
    ).toBe(404);
    expect(
      (
        await memberPage.request.post(`${base}/attachments`, {
          multipart: {
            section: "input",
            file: { name: "no.png", mimeType: "image/png", buffer: png },
          },
        })
      ).status()
    ).toBe(403);
    const create = await page.request.post(base, {
      data: {
        title: "Private screenshots",
        inputAttachmentIds: [attachment.id],
      },
    });
    expect(create.status()).toBe(201);
    const { note } = await create.json();
    expect(
      (await memberPage.request.get(attachment.downloadUrl)).status()
    ).toBe(404);
    const team = await page.request.patch(`${base}/${note.id}`, {
      data: { visibility: "team" },
    });
    expect(team.ok()).toBeTruthy();
    const response = await memberPage.request.get(
      `${attachment.downloadUrl}?disposition=inline`
    );
    expect(response.ok()).toBeTruthy();
    expect(await response.body()).toEqual(png);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    await prisma.projectMembership.update({
      where: { projectId_userId: { projectId: project.id, userId: member } },
      data: { capabilities: [] },
    });
    expect(
      (await memberPage.request.get(attachment.downloadUrl)).status()
    ).toBe(403);
    await prisma.projectMembership.delete({
      where: { projectId_userId: { projectId: project.id, userId: member } },
    });
    expect(
      (await memberPage.request.get(attachment.downloadUrl)).status()
    ).toBe(404);
    const other = await prisma.project.create({
      data: { name: uniqueProjectName("other"), ownerId: author },
    });
    expect(
      (
        await page.request.get(
          attachment.downloadUrl.replace(project.id, other.id)
        )
      ).status()
    ).toBe(404);
    const invalid = await page.request.post(
      `/api/projects/${other.id}/meeting-notes`,
      {
        data: {
          title: "Foreign screenshot",
          inputAttachmentIds: [attachment.id],
        },
      }
    );
    expect(invalid.status()).toBe(400);
    const old = await page.request.get(`${base}/${note.id}`);
    const oldNote = (await old.json()).note;
    const removed = await page.request.patch(`${base}/${note.id}`, {
      data: { inputAttachmentIds: [] },
      headers: {
        "x-content-if-match": `"meeting-note:${note.id}:${oldNote.contentRevision}"`,
      },
    });
    expect(removed.ok()).toBeTruthy();
    expect((await page.request.get(attachment.downloadUrl)).status()).toBe(404);
    const stale = await page.request.patch(`${base}/${note.id}`, {
      data: { inputNotes: "stale" },
      headers: {
        "x-content-if-match": `"meeting-note:${note.id}:${oldNote.contentRevision}"`,
      },
    });
    expect(stale.status()).toBe(412);
  } finally {
    await memberContext.close();
  }
});
