import { describe, expect, test } from "vitest";

import {
  buildProjectInvitationEmail,
  buildProjectNotificationDigestEmail,
} from "@/lib/services/outbound-email-templates";

describe("outbound-email-templates", () => {
  test("sanitizes project invitation subject and plain text fields", () => {
    const message = buildProjectInvitationEmail({
      inviteUrl: "https://nexus-dash.app/invite/project/invite-1",
      projectName: "Roadmap\r\nBcc: attacker@example.com",
      invitedByDisplayName: "Owner\nInjected: value",
      role: "editor",
      expiresAt: new Date("2026-05-14T12:00:00.000Z"),
    });

    expect(message.subject).toBe(
      "Invitation to Roadmap Bcc: attacker@example.com on NexusDash"
    );
    expect(message.subject).not.toContain("\r");
    expect(message.subject).not.toContain("\n");
    expect(message.text).toContain(
      "Owner Injected: value invited you to collaborate on Roadmap Bcc: attacker@example.com"
    );
    expect(message.text).not.toContain("\r");
    expect(message.html).toContain("Owner Injected: value");
    expect(message.html).toContain("Roadmap Bcc: attacker@example.com");
  });

  test("builds reminder invitation copy without changing the invite link", () => {
    const message = buildProjectInvitationEmail({
      inviteUrl: "https://nexus-dash.app/invite/project/invite-1",
      projectName: "Launch",
      invitedByDisplayName: "Owner",
      role: "viewer",
      expiresAt: new Date("2026-05-14T12:00:00.000Z"),
      variant: "reminder",
    });

    expect(message.subject).toBe("Reminder: invitation to Launch on NexusDash");
    expect(message.text).toContain("Reminder: Owner invited you to view Launch");
    expect(message.text).toContain(
      "https://nexus-dash.app/invite/project/invite-1"
    );
    expect(message.html).toContain("<strong>Reminder:</strong>");
  });

  test("builds project notification digest content with collapsed counts", () => {
    const message = buildProjectNotificationDigestEmail({
      projectName: "Roadmap\nInjected: nope",
      notificationCount: 3,
      projectUrl: "https://nexus-dash.app/projects/project-1",
      notificationsUrl: "https://nexus-dash.app/account/notifications",
      items: [
        {
          label: "Agent mentioned you on API cleanup",
          count: 2,
          targetUrl: "https://nexus-dash.app/projects/project-1?taskId=task-1",
        },
      ],
      omittedCount: 1,
    });

    expect(message.subject).toBe(
      "3 updates for Roadmap Injected: nope on NexusDash"
    );
    expect(message.text).toContain(
      "You have 3 unread updates for Roadmap Injected: nope."
    );
    expect(message.text).toContain(
      "- 2x Agent mentioned you on API cleanup: https://nexus-dash.app/projects/project-1?taskId=task-1"
    );
    expect(message.text).toContain("- 1 more update in NexusDash.");
    expect(message.html).toContain("2x Agent mentioned you on API cleanup");
    expect(message.html).not.toContain("\nInjected");
  });
});
