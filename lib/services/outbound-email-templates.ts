export type OutboundEmailTemplateKey =
  | "email_verification"
  | "password_reset"
  | "project_invitation"
  | "project_notification_digest"
  | "operational_smoke";

export interface OutboundEmailMessage {
  subject: string;
  text: string;
  html: string;
}

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;
const MAX_SUBJECT_LENGTH = 220;

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

function sanitizePlainText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function truncateSubject(value: string): string {
  return value.length > MAX_SUBJECT_LENGTH
    ? `${value.slice(0, MAX_SUBJECT_LENGTH - 3)}...`
    : value;
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
  variant?: "initial" | "reminder";
}): OutboundEmailMessage {
  const safeInviteUrl = escapeHtmlAttribute(input.inviteUrl);
  const plainProjectName = sanitizePlainText(input.projectName) || "a project";
  const plainInviterName =
    sanitizePlainText(input.invitedByDisplayName) || "Someone";
  const safeProjectName = escapeHtmlText(plainProjectName);
  const safeInviterName = escapeHtmlText(plainInviterName);
  const action = input.role === "viewer" ? "view" : "collaborate on";
  const expiresAtLabel = input.expiresAt.toUTCString();
  const isReminder = input.variant === "reminder";
  const introPrefix = isReminder ? "Reminder: " : "";

  return {
    subject: truncateSubject(
      `${isReminder ? "Reminder: invitation" : "Invitation"} to ${plainProjectName} on NexusDash`
    ),
    text:
      `${introPrefix}${plainInviterName} invited you to ${action} ${plainProjectName} on NexusDash.\n\n` +
      `This invitation expires on ${expiresAtLabel}.\n\n` +
      `${input.inviteUrl}\n\n` +
      `If you were not expecting this invitation, you can ignore this email.`,
    html:
      `<p>${isReminder ? "<strong>Reminder:</strong> " : ""}${safeInviterName} invited you to ${action} <strong>${safeProjectName}</strong> on NexusDash.</p>` +
      `<p>This invitation expires on <strong>${escapeHtmlText(expiresAtLabel)}</strong>.</p>` +
      `<p><a href="${safeInviteUrl}">Open invitation</a></p>` +
      `<p>If you were not expecting this invitation, you can ignore this email.</p>`,
  };
}

export interface ProjectNotificationDigestEmailItem {
  label: string;
  count: number;
  targetUrl: string;
}

export function buildProjectNotificationDigestEmail(input: {
  projectName: string;
  notificationCount: number;
  items: ProjectNotificationDigestEmailItem[];
  projectUrl: string;
  notificationsUrl: string;
  omittedCount?: number;
}): OutboundEmailMessage {
  const plainProjectName = sanitizePlainText(input.projectName) || "a project";
  const safeProjectName = escapeHtmlText(plainProjectName);
  const safeProjectUrl = escapeHtmlAttribute(input.projectUrl);
  const safeNotificationsUrl = escapeHtmlAttribute(input.notificationsUrl);
  const notificationLabel =
    input.notificationCount === 1 ? "update" : "updates";
  const subject = truncateSubject(
    `${input.notificationCount} ${notificationLabel} for ${plainProjectName} on NexusDash`
  );
  const digestItems = input.items.map((item) => {
    const plainLabel = sanitizePlainText(item.label) || "Project update";
    const prefix = item.count > 1 ? `${item.count}x ` : "";

    return {
      label: `${prefix}${plainLabel}`,
      targetUrl: item.targetUrl,
    };
  });
  const omittedCount = Math.max(0, input.omittedCount ?? 0);

  const textLines = [
    `You have ${input.notificationCount} unread ${notificationLabel} for ${plainProjectName}.`,
    "",
    ...digestItems.map((item) => `- ${item.label}: ${item.targetUrl}`),
    ...(omittedCount > 0
      ? [`- ${omittedCount} more ${omittedCount === 1 ? "update" : "updates"} in NexusDash.`]
      : []),
    "",
    `Open project: ${input.projectUrl}`,
    `Open notification center: ${input.notificationsUrl}`,
  ];

  const htmlItems = digestItems
    .map((item) => {
      const safeLabel = escapeHtmlText(item.label);
      const safeTargetUrl = escapeHtmlAttribute(item.targetUrl);
      return `<li><a href="${safeTargetUrl}">${safeLabel}</a></li>`;
    })
    .join("");
  const omittedHtml =
    omittedCount > 0
      ? `<li>${omittedCount} more ${omittedCount === 1 ? "update" : "updates"} in NexusDash.</li>`
      : "";

  return {
    subject,
    text: textLines.join("\n"),
    html:
      `<p>You have <strong>${input.notificationCount}</strong> unread ${notificationLabel} for <strong>${safeProjectName}</strong>.</p>` +
      `<ul>${htmlItems}${omittedHtml}</ul>` +
      `<p><a href="${safeProjectUrl}">Open project</a></p>` +
      `<p><a href="${safeNotificationsUrl}">Open notification center</a></p>`,
  };
}
