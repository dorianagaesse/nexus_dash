export type OutboundEmailTemplateKey =
  | "email_verification"
  | "password_reset"
  | "project_invitation"
  | "operational_smoke";

export interface OutboundEmailMessage {
  subject: string;
  text: string;
  html: string;
}

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatExpiryLabel(tokenTtlSeconds: number): string {
  const ttlMinutes = Math.floor(tokenTtlSeconds / 60);
  if (ttlMinutes < 60) {
    return `${ttlMinutes} minute${ttlMinutes === 1 ? "" : "s"}`;
  }

  const ttlHours = Math.floor(ttlMinutes / 60);
  return `${ttlHours} hour${ttlHours === 1 ? "" : "s"}`;
}

export function buildEmailVerificationEmail(input: {
  verificationUrl: string;
  tokenTtlSeconds?: number;
}): OutboundEmailMessage {
  const expiryLabel = formatExpiryLabel(
    input.tokenTtlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
  );
  const safeVerificationUrl = escapeHtmlAttribute(input.verificationUrl);

  return {
    subject: "Verify your NexusDash email",
    text:
      `Verify your email to unlock your NexusDash workspace.\n\n` +
      `This link expires in ${expiryLabel}.\n\n` +
      `${input.verificationUrl}\n\n` +
      `If you did not request this, you can ignore this email.`,
    html:
      `<p>Verify your email to unlock your NexusDash workspace.</p>` +
      `<p>This link expires in <strong>${expiryLabel}</strong>.</p>` +
      `<p><a href="${safeVerificationUrl}">Verify email</a></p>` +
      `<p>If you did not request this, you can ignore this email.</p>`,
  };
}

export function buildPasswordResetEmail(input: {
  resetUrl: string;
  tokenTtlSeconds?: number;
}): OutboundEmailMessage {
  const expiryLabel = formatExpiryLabel(
    input.tokenTtlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS
  );
  const safeResetUrl = escapeHtmlAttribute(input.resetUrl);

  return {
    subject: "Reset your NexusDash password",
    text:
      `A password reset was requested for your NexusDash account.\n\n` +
      `This link expires in ${expiryLabel}.\n\n` +
      `${input.resetUrl}\n\n` +
      `If you did not request this, you can ignore this email.`,
    html:
      `<p>A password reset was requested for your NexusDash account.</p>` +
      `<p>This link expires in <strong>${expiryLabel}</strong>.</p>` +
      `<p><a href="${safeResetUrl}">Reset password</a></p>` +
      `<p>If you did not request this, you can ignore this email.</p>`,
  };
}

export function buildProjectInvitationEmail(input: {
  inviteUrl: string;
  projectName: string;
  invitedByDisplayName: string;
  role: "editor" | "viewer";
  expiresAt: Date;
}): OutboundEmailMessage {
  const safeInviteUrl = escapeHtmlAttribute(input.inviteUrl);
  const safeProjectName = escapeHtmlText(input.projectName);
  const safeInviterName = escapeHtmlText(input.invitedByDisplayName);
  const action = input.role === "viewer" ? "view" : "collaborate on";
  const expiresAtLabel = input.expiresAt.toUTCString();

  return {
    subject: `Invitation to ${input.projectName} on NexusDash`,
    text:
      `${input.invitedByDisplayName} invited you to ${action} ${input.projectName} on NexusDash.\n\n` +
      `This invitation expires on ${expiresAtLabel}.\n\n` +
      `${input.inviteUrl}\n\n` +
      `If you were not expecting this invitation, you can ignore this email.`,
    html:
      `<p>${safeInviterName} invited you to ${action} <strong>${safeProjectName}</strong> on NexusDash.</p>` +
      `<p>This invitation expires on <strong>${escapeHtmlText(expiresAtLabel)}</strong>.</p>` +
      `<p><a href="${safeInviteUrl}">Open invitation</a></p>` +
      `<p>If you were not expecting this invitation, you can ignore this email.</p>`,
  };
}
