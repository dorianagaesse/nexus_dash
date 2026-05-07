import { describe, expect, test } from "vitest";

import { buildProjectInvitationEmail } from "@/lib/services/outbound-email-templates";

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
});
