import { expect, test } from "@playwright/test";

import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";

test("email-bound invitations become memberships that owners can change and remove", async ({
  page,
  browser,
  baseURL,
}) => {
  const ownerId = await signInAsVerifiedUser(page);
  const recipientContext = await browser.newContext({ baseURL });
  const recipientPage = await recipientContext.newPage();

  try {
    const recipientId = await signInAsVerifiedUser(recipientPage);
    const recipient = await prisma.user.findUniqueOrThrow({
      where: { id: recipientId },
      select: { email: true },
    });
    const project = await prisma.project.create({
      data: {
        name: `ND-190 collaboration ${Date.now()}`,
        ownerId,
        memberships: { create: { userId: ownerId, role: "owner" } },
      },
      select: { id: true },
    });
    const sharingPath = `/api/projects/${project.id}/sharing`;
    const created = await page.request.post(sharingPath, {
      data: { invitedEmail: recipient.email, role: "editor" },
    });
    expect(created.status()).toBe(201);
    const { invitation } = await created.json();

    // A valid session with a different verified email cannot claim the invitation.
    const mismatch = await page.request.post(
      `/api/account/invitations/${invitation.invitationId}/respond`,
      { data: { decision: "accept" } }
    );
    expect(mismatch.status()).toBe(403);
    expect(await mismatch.json()).toEqual({ error: "invitation-email-mismatch" });

    const pending = await recipientPage.request.get("/api/account/invitations");
    expect(pending.ok()).toBeTruthy();
    expect((await pending.json()).invitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invitationId: invitation.invitationId }),
      ])
    );

    await recipientPage.goto(invitation.inviteLinkPath);
    await expect(recipientPage.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    await recipientPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(recipientPage).toHaveURL(new RegExp(`/projects/${project.id}`));

    const membership = await prisma.projectMembership.findUniqueOrThrow({
      where: { projectId_userId: { projectId: project.id, userId: recipientId } },
      select: { id: true, role: true },
    });
    expect(membership.role).toBe("editor");
    const memberPath = `${sharingPath}/members/${membership.id}`;
    const forbidden = await recipientPage.request.patch(memberPath, {
      data: { role: "viewer" },
    });
    expect(forbidden.status()).toBe(403);

    const updated = await page.request.patch(memberPath, { data: { role: "viewer" } });
    expect(updated.ok()).toBeTruthy();
    expect(await updated.json()).toEqual({ role: "viewer" });
    const summary = await page.request.get(sharingPath);
    expect((await summary.json()).members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: recipientId, role: "viewer" }),
      ])
    );

    const removed = await page.request.delete(memberPath);
    expect(removed.ok()).toBeTruthy();
    expect(await prisma.projectMembership.findUnique({ where: { id: membership.id } })).toBeNull();
    const denied = await recipientPage.request.get(`/api/projects/${project.id}`);
    expect(denied.status()).toBe(404);
  } finally {
    await recipientContext.close();
  }
});
