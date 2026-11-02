// Post-commit invitation email delivery; provider failure does not roll back the invitation.

import { sendOutboundEmail } from "@/lib/services/outbound-email-service";
import { buildProjectInvitationEmail } from "@/lib/services/outbound-email-templates";
import { logServerWarning } from "@/lib/observability/logger";
import {
  type ProjectInvitationSummary,
  type ProjectInvitationEmailDeliverySummary,
} from "./collaboration-types";
import { buildAbsoluteProjectInvitationUrl } from "./collaboration-policy";

export async function sendProjectInvitationEmail(input: {
  actorUserId: string;
  invitedByUserId: string;
  appOrigin: string | null | undefined;
  invitation: ProjectInvitationSummary;
}): Promise<ProjectInvitationEmailDeliverySummary> {
  const inviteUrl = buildAbsoluteProjectInvitationUrl(
    input.appOrigin,
    input.invitation
  );
  if (!inviteUrl) {
    logServerWarning(
      "sendProjectInvitationEmail",
      "Could not resolve an absolute project invitation URL for email delivery.",
      {
        invitationId: input.invitation.invitationId,
        projectId: input.invitation.projectId,
      }
    );

    return {
      status: "failed",
      deliveryId: null,
      provider: "resend",
      providerMessageId: null,
      providerStatus: null,
      error: "invite-url-unavailable",
    };
  }

  const message = buildProjectInvitationEmail({
    inviteUrl,
    projectName: input.invitation.projectName,
    invitedByDisplayName: input.invitation.invitedByDisplayName,
    role: input.invitation.role,
    expiresAt: new Date(input.invitation.expiresAt),
  });

  const result = await sendOutboundEmail({
    templateKey: "project_invitation",
    to: input.invitation.invitedEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
    metadata: {
      invitationId: input.invitation.invitationId,
      projectId: input.invitation.projectId,
      invitedByUserId: input.invitedByUserId,
      triggeredByUserId: input.actorUserId,
      role: input.invitation.role,
    },
  });

  if (!result.ok) {
    return {
      status: "failed",
      deliveryId: result.deliveryId,
      provider: result.provider,
      providerMessageId: null,
      providerStatus: result.providerStatus ?? null,
      error: result.error,
    };
  }

  return {
    status: result.delivery,
    deliveryId: result.deliveryId,
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    providerStatus: null,
    error: null,
  };
}
