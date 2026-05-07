import { describe, expect, test } from "vitest";

const shouldRunSmoke = process.env.RUN_OUTBOUND_EMAIL_SMOKE === "1";
const smokeTest = shouldRunSmoke ? test : test.skip;

describe("outbound-email-service live smoke", () => {
  smokeTest("sends a real provider email when explicitly enabled", async () => {
    const recipient = process.env.OUTBOUND_EMAIL_SMOKE_TO;

    expect(recipient).toBeTruthy();
    expect(process.env.OUTBOUND_EMAIL_DELIVERY_MODE).toBe("live");
    expect(process.env.RESEND_API_KEY).toBeTruthy();
    expect(process.env.DATABASE_URL).toBeTruthy();

    const { sendOutboundEmail } = await import(
      "@/lib/services/outbound-email-service"
    );

    const result = await sendOutboundEmail({
      templateKey: "operational_smoke",
      to: recipient ?? "",
      subject: "NexusDash outbound email smoke",
      text:
        "This is a NexusDash outbound email smoke test for TASK-125.\n\n" +
        "No action is required.",
      html:
        "<p>This is a NexusDash outbound email smoke test for TASK-125.</p>" +
        "<p>No action is required.</p>",
      metadata: {
        taskId: "TASK-125",
        purpose: "live-smoke",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.delivery).toBe("sent");
    expect(result.providerMessageId).toBeTruthy();
  });
});
