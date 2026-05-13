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

export interface ProjectNotificationDigestEmailSection {
  projectName: string;
  notificationCount: number;
  items: ProjectNotificationDigestEmailItem[];
  projectUrl: string;
  omittedCount?: number;
}

type ProjectNotificationDigestEmailInput =
  | {
      sections: ProjectNotificationDigestEmailSection[];
      notificationsUrl: string;
    }
  | {
      projectName: string;
      notificationCount: number;
      items: ProjectNotificationDigestEmailItem[];
      projectUrl: string;
      notificationsUrl: string;
      omittedCount?: number;
    };

function normalizeDigestSections(
  input: ProjectNotificationDigestEmailInput
): ProjectNotificationDigestEmailSection[] {
  if ("sections" in input) {
    return input.sections;
  }

  return [
    {
      projectName: input.projectName,
      notificationCount: input.notificationCount,
      items: input.items,
      projectUrl: input.projectUrl,
      omittedCount: input.omittedCount,
    },
  ];
}

function normalizeDigestItems(items: ProjectNotificationDigestEmailItem[]) {
  return items.map((item) => {
    const plainLabel = sanitizePlainText(item.label) || "Project update";
    const prefix = item.count > 1 ? `${item.count}x ` : "";

    return {
      label: `${prefix}${plainLabel}`,
      targetUrl: item.targetUrl,
    };
  });
}

export function buildProjectNotificationDigestEmail(
  input: ProjectNotificationDigestEmailInput
): OutboundEmailMessage {
  const sections = normalizeDigestSections(input)
    .map((section) => ({
      ...section,
      projectName: sanitizePlainText(section.projectName) || "a project",
      notificationCount: Math.max(0, section.notificationCount),
      omittedCount: Math.max(0, section.omittedCount ?? 0),
    }))
    .filter((section) => section.notificationCount > 0);
  const totalNotifications = sections.reduce(
    (total, section) => total + section.notificationCount,
    0
  );
  const safeNotificationsUrl = escapeHtmlAttribute(input.notificationsUrl);
  const notificationLabel =
    totalNotifications === 1 ? "update" : "updates";
  const subject =
    sections.length === 1
      ? truncateSubject(
          `${totalNotifications} ${notificationLabel} for ${sections[0].projectName} on NexusDash`
        )
      : truncateSubject(
          `${totalNotifications} ${notificationLabel} across ${sections.length} projects on NexusDash`
        );

  const textLines = [
    sections.length === 1
      ? `You have ${totalNotifications} unread ${notificationLabel} for ${sections[0].projectName}.`
      : `You have ${totalNotifications} unread ${notificationLabel} across ${sections.length} projects.`,
    "",
    ...sections.flatMap((section) => {
      const digestItems = normalizeDigestItems(section.items);
      return [
        section.projectName,
        ...digestItems.map((item) => `- ${item.label}: ${item.targetUrl}`),
        ...(section.omittedCount > 0
          ? [
              `- ${section.omittedCount} more ${section.omittedCount === 1 ? "update" : "updates"} in NexusDash.`,
            ]
          : []),
        `Open project: ${section.projectUrl}`,
        "",
      ];
    }),
    "",
    `Open notification center: ${input.notificationsUrl}`,
  ];

  const htmlSections = sections
    .map((section) => {
      const digestItems = normalizeDigestItems(section.items);
      const htmlItems = digestItems
        .map((item) => {
          const safeLabel = escapeHtmlText(item.label);
          const safeTargetUrl = escapeHtmlAttribute(item.targetUrl);
          return `<li><a href="${safeTargetUrl}">${safeLabel}</a></li>`;
        })
        .join("");
      const omittedHtml =
        section.omittedCount > 0
          ? `<li>${section.omittedCount} more ${section.omittedCount === 1 ? "update" : "updates"} in NexusDash.</li>`
          : "";
      const safeProjectName = escapeHtmlText(section.projectName);
      const safeProjectUrl = escapeHtmlAttribute(section.projectUrl);

      return (
        `<h2>${safeProjectName}</h2>` +
        `<ul>${htmlItems}${omittedHtml}</ul>` +
        `<p><a href="${safeProjectUrl}">Open project</a></p>`
      );
    })
    .join("");

  return {
    subject,
    text: textLines.join("\n"),
    html:
      `<p>You have <strong>${totalNotifications}</strong> unread ${notificationLabel}${
        sections.length === 1
          ? ""
          : ` across <strong>${sections.length}</strong> projects`
      }.</p>` +
      htmlSections +
      `<p><a href="${safeNotificationsUrl}">Open notification center</a></p>`,
  };
}
