// Invitation projections. Scoped callers pass their existing RLS client; landing reads retain the restricted SQL projection.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateEmail } from "@/lib/services/account-security-policy";
import { type DbClient } from "@/lib/services/rls-context";
import {
  type PendingInvitationMetadataRow,
  type InvitationMatchedUser,
  type InvitationRecipientLookupRow,
  type ProjectInvitationRecord,
} from "./collaboration-types";
import { normalizeInvitationEmail } from "./collaboration-policy";

export async function listPendingInvitationMetadataRows(
  db: DbClient
): Promise<PendingInvitationMetadataRow[]> {
  return db.$queryRaw<PendingInvitationMetadataRow[]>(Prisma.sql`
    SELECT
      invitation_id AS "invitationId",
      app.get_project_invitation_capabilities(invitation_id) AS "capabilities",
      project_id AS "projectId",
      project_name AS "projectName",
      invited_email AS "invitedEmail",
      invited_by_user_id AS "invitedByUserId",
      invited_by_email AS "invitedByEmail",
      invited_by_name AS "invitedByName",
      invited_by_username AS "invitedByUsername",
      invited_by_username_discriminator AS "invitedByUsernameDiscriminator",
      invitation_role AS "invitationRole",
      created_at AS "createdAt",
      expires_at AS "expiresAt"
    FROM app.list_pending_project_invitations_for_current_user()
  `);
}

export async function revokeExpiredInvitationsForEmail(input: {
  db: DbClient;
  projectId: string;
  invitedEmail: string;
  now: Date;
}) {
  await input.db.projectInvitation.updateMany({
    where: {
      projectId: input.projectId,
      invitedEmail: input.invitedEmail,
      acceptedAt: null,
      revokedAt: null,
      replacedAt: null,
      expiresAt: {
        lte: input.now,
      },
    },
    data: {
      revokedAt: input.now,
    },
  });
}

export async function getVerifiedUsersByEmail(
  db: DbClient,
  emails: string[]
): Promise<Map<string, InvitationMatchedUser>> {
  const normalizedEmails = Array.from(
    new Set(
      emails
        .map((email) => normalizeInvitationEmail(email))
        .filter((email) => validateEmail(email))
    )
  );

  if (normalizedEmails.length === 0) {
    return new Map<string, InvitationMatchedUser>();
  }

  const users = await db.user.findMany({
    where: {
      emailVerified: {
        not: null,
      },
      email: {
        in: normalizedEmails,
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      usernameDiscriminator: true,
      avatarSeed: true,
    },
  });

  return new Map(
    users
      .filter((user) => user.email)
      .map((user) => [normalizeInvitationEmail(user.email), user])
  );
}

export async function findInvitationById(
  invitationId: string
): Promise<ProjectInvitationRecord | null> {
  const rows = await prisma.$queryRaw<
    InvitationRecipientLookupRow[]
  >(Prisma.sql`
    SELECT
      invitation_id AS "invitationId",
      app.get_project_invitation_capabilities(invitation_id) AS "capabilities",
      project_id AS "projectId",
      project_name AS "projectName",
      invited_email AS "invitedEmail",
      invitation_role AS "invitationRole",
      created_at AS "createdAt",
      expires_at AS "expiresAt",
      accepted_at AS "acceptedAt",
      revoked_at AS "revokedAt",
      replaced_at AS "replacedAt",
      invited_by_user_id AS "invitedByUserId",
      invited_by_email AS "invitedByEmail",
      invited_by_name AS "invitedByName",
      invited_by_username AS "invitedByUsername",
      invited_by_username_discriminator AS "invitedByUsernameDiscriminator"
    FROM app.get_project_invitation_for_landing(${invitationId})
  `);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.invitationId,
    projectId: row.projectId,
    invitedEmail: row.invitedEmail,
    role: row.invitationRole,
    capabilities: row.capabilities,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
    replacedAt: row.replacedAt,
    project: {
      id: row.projectId,
      name: row.projectName,
    },
    invitedByUser: {
      id: row.invitedByUserId,
      email: row.invitedByEmail,
      name: row.invitedByName,
      username: row.invitedByUsername,
      usernameDiscriminator: row.invitedByUsernameDiscriminator,
    },
  };
}
