import { expect, test } from "@playwright/test";
import { prisma } from "../../lib/prisma";
import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

test("credential management tolerates permission scopes added by a newer deployment", async ({ page }) => {
  const userId = await signInAsVerifiedUser(page);
  const project = await prisma.project.create({ data: {
    name: uniqueProjectName("credential-scope-compatibility"), ownerId: userId,
    memberships: { create: { userId, role: "owner" } },
  } });
  const prefix = `/api/projects/${project.id}/agent-access`;
  try {
    const created = await page.request.post(prefix, { data: {
      label: "Future-compatible agent", scopes: ["task:read", "task:write"],
    } });
    expect(created.status()).toBe(201);
    const credential = (await created.json()).credential;

    // Use synthetic future values absent from this build, including after ND-130.
    // Do not regenerate Prisma: the runtime must ignore and preserve unknown grants.
    await prisma.$executeRaw`ALTER TYPE "ApiCredentialScope" ADD VALUE IF NOT EXISTS 'e2e_future_read'`;
    await prisma.$executeRaw`ALTER TYPE "ApiCredentialScope" ADD VALUE IF NOT EXISTS 'e2e_future_write'`;
    await prisma.$executeRaw`
      INSERT INTO "ApiCredentialScopeGrant" ("credentialId", "scope")
      VALUES (${credential.id}, 'e2e_future_read'::"ApiCredentialScope"),
             (${credential.id}, 'e2e_future_write'::"ApiCredentialScope")
      ON CONFLICT DO NOTHING
    `;

    const summary = await page.request.get(prefix);
    expect(summary.status()).toBe(200);
    const saved = (await summary.json()).credentials.find((entry: { id: string }) => entry.id === credential.id);
    expect(saved.scopes).toEqual(["task:read", "task:write"]);

    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "Share project", exact: true }).click();
    await page.getByRole("button", { name: "Agent access", exact: true }).click();
    await expect(page.getByRole("listitem", { name: credential.label, exact: true })).toBeVisible();
    await expect(page.getByRole("alert", { name: "Credential loading error", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New credential", exact: true })).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath("credentials-with-newer-scopes.png"), animations: "disabled" });

    const labels = await page.request.patch(`${prefix}/${credential.id}/labels`, {
      data: { descriptiveLabels: ["Codex"] },
    });
    expect(labels.status()).toBe(200);
    expect((await page.request.post(`${prefix}/${credential.id}/rotate`)).status()).toBe(200);
    expect((await page.request.delete(`${prefix}/${credential.id}`)).status()).toBe(200);
    expect((await page.request.get(prefix)).status()).toBe(200);

    const remainingGrants = await prisma.$queryRaw<Array<{ scope: string }>>`
      SELECT scope::text AS scope FROM "ApiCredentialScopeGrant" WHERE "credentialId" = ${credential.id}
    `;
    expect(remainingGrants.map((entry) => entry.scope)).toEqual(expect.arrayContaining(["e2e_future_read", "e2e_future_write"]));
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: userId } });
  }
});
