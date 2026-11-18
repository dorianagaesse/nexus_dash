import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

async function capturePermissions(page: Page, surface: string) {
  for (const [width, height, device] of [[1440, 1000, "desktop"], [390, 844, "mobile"]] as const) {
    await page.setViewportSize({ width, height });
    for (const dark of [false, true]) {
      await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const dialog = page.getByRole("dialog").last();
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: `.tmp/nd130-${surface}-${device}-${dark ? "dark" : "light"}.png` });
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

test("agents can edit shared meetings; owner scope edits immediately restrict existing tokens", async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const ownerId = await signInAsVerifiedUser(page);
  const createdProject = await page.request.post("/api/projects", { data: { name: uniqueProjectName("agent-permissions") } });
  expect(createdProject.status()).toBe(201);
  const projectId = (await createdProject.json()).project.id;
  const base = `/api/projects/${projectId}`;
  const scopes = ["meeting:read", "meeting:write", "meeting:delete"];
  const issue = await page.request.post(`${base}/agent-access`, { data: { label: "Meeting assistant", scopes } });
  expect(issue.status()).toBe(201);
  const { credential, apiKey } = await issue.json();
  const credentialPath = `${base}/agent-access/${credential.id}`;
  const exchange = async () => {
    const response = await page.request.post("/api/auth/agent/token", { data: { apiKey } });
    expect(response.ok()).toBe(true);
    return { Authorization: `Bearer ${(await response.json()).accessToken}` };
  };
  const full = await exchange();
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  let memberId: string | undefined;
  try {
    const privateResponse = await page.request.post(`${base}/meeting-notes`, { data: { title: "Owner private note" } });
    expect(privateResponse.status()).toBe(201);
    const privateId = (await privateResponse.json()).note.id;
    for (const method of ["get", "patch", "delete"] as const) {
      const response = await page.request[method](`${base}/meeting-notes/${privateId}`, { headers: full, ...(method === "patch" ? { data: { title: "Forbidden" } } : {}) });
      expect(response.status()).toBe(404);
    }
    expect((await page.request.post(`${base}/meeting-notes`, { headers: full, data: { title: "Private agent note", visibility: "private" } })).status()).toBe(403);
    const created = await page.request.post(`${base}/meeting-notes`, { headers: full, data: { title: "Agent shared note" } });
    expect(created.status()).toBe(201);
    const note = (await created.json()).note;
    expect(note.visibility).toBe("team");
    const notePath = `${base}/meeting-notes/${note.id}`;
    expect((await page.request.get(notePath, { headers: full })).status()).toBe(200);
    expect((await page.request.patch(notePath, { headers: full, data: { outputNotes: "Shared minutes" } })).status()).toBe(200);
    expect((await page.request.patch(notePath, { headers: full, data: { visibility: "private" } })).status()).toBe(403);
    expect((await page.request.patch(credentialPath, { headers: full, data: { scopes } })).status()).toBe(401);
    for (const invalid of [[], ["meeting:unknown"], null, "meeting:read"]) {
      expect((await page.request.patch(credentialPath, { data: { scopes: invalid } })).status()).toBe(400);
    }
    memberId = await signInAsVerifiedUser(memberPage);
    await prisma.projectMembership.create({ data: { projectId, userId: memberId, role: "editor" } });
    expect((await memberPage.request.patch(credentialPath, { data: { scopes: ["meeting:read"] } })).status()).toBe(403);
    const otherProject = await memberPage.request.post("/api/projects", { data: { name: uniqueProjectName("foreign-meetings") } });
    const otherId = (await otherProject.json()).project.id;
    expect((await page.request.post(`/api/projects/${otherId}/meeting-notes`, { headers: full, data: { title: "Foreign note" } })).status()).toBe(404);
    expect((await memberPage.request.patch(`/api/projects/${otherId}/agent-access/${credential.id}`, { data: { scopes } })).status()).toBe(404);
    await memberPage.request.delete(`/api/projects/${otherId}`);

    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Share project", exact: true }).click();
    await page.getByRole("button", { name: "Agent access", exact: true }).click();
    await page.getByText("Legacy API credentials", { exact: true }).click();
    await page.getByRole("button", { name: "New credential", exact: true }).click();
    await capturePermissions(page, "create");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Manage Meeting assistant", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Meeting assistant", exact: true });
    await details.getByRole("button", { name: "Edit permissions", exact: true }).click();
    await details.getByRole("checkbox", { name: "Meeting notes edit", exact: true }).uncheck();
    await details.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(details.getByRole("checkbox", { name: "Meeting notes edit", exact: true })).toBeChecked();
    await details.getByRole("button", { name: "Edit permissions", exact: true }).click();
    await details.getByRole("checkbox", { name: "Meeting notes edit", exact: true }).uncheck();
    await details.getByRole("checkbox", { name: "Meeting notes delete", exact: true }).uncheck();
    await capturePermissions(page, "edit");
    await details.getByRole("button", { name: "Save permissions", exact: true }).click();
    await expect(details.getByRole("button", { name: "Edit permissions", exact: true })).toBeVisible();
    const saved = await prisma.apiCredential.findUniqueOrThrow({ where: { id: credential.id }, include: { scopeGrants: true } });
    expect(saved.scopeGrants.map((grant) => grant.scope)).toEqual(["meeting_read"]);
    expect(saved.lastRotatedAt).toBeNull();
    expect((await page.request.get(notePath, { headers: full })).status()).toBe(401);
    const readOnly = await exchange();
    expect((await page.request.get(notePath, { headers: readOnly })).status()).toBe(200);
    expect((await page.request.post(`${base}/meeting-notes`, { headers: readOnly, data: { title: "Denied" } })).status()).toBe(403);
    expect((await page.request.patch(notePath, { headers: readOnly, data: { title: "Denied" } })).status()).toBe(403);
    expect((await page.request.delete(notePath, { headers: readOnly })).status()).toBe(403);
    expect((await page.request.patch(credentialPath, { data: { scopes } })).status()).toBe(200);
    expect((await page.request.delete(notePath, { headers: readOnly })).status()).toBe(403);
    expect((await page.request.delete(notePath, { headers: await exchange() })).status()).toBe(200);
    const audit = await prisma.authAuditEvent.findMany({ where: { credentialId: credential.id, action: "credential_capabilities_updated" } });
    expect(audit.some((event) => JSON.stringify(event.metadata).includes("meeting:read"))).toBe(true);
  } finally {
    await page.request.delete(`/api/projects/${projectId}`);
    await memberContext.close();
    if (memberId) await prisma.user.delete({ where: { id: memberId } });
    await prisma.user.delete({ where: { id: ownerId } });
  }
});
