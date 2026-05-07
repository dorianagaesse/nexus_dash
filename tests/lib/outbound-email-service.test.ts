import { beforeEach, describe, expect, test, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  outboundEmailDelivery: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const envMock = vi.hoisted(() => ({
  getOutboundEmailRuntimeConfig: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logServerError: vi.fn(),
  logServerInfo: vi.fn(),
  logServerWarning: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/env.server", () => ({
  getOutboundEmailRuntimeConfig: envMock.getOutboundEmailRuntimeConfig,
}));

vi.mock("@/lib/observability/logger", () => ({
  logServerError: loggerMock.logServerError,
  logServerInfo: loggerMock.logServerInfo,
  logServerWarning: loggerMock.logServerWarning,
}));

import { sendOutboundEmail } from "@/lib/services/outbound-email-service";

const baseMessage = {
  templateKey: "email_verification" as const,
  to: "USER@example.com",
  subject: "Verify your NexusDash email",
  text: "Verify your NexusDash email",
  html: "<p>Verify your NexusDash email</p>",
};

describe("outbound-email-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn());
    envMock.getOutboundEmailRuntimeConfig.mockReturnValue({
      provider: "resend",
      deliveryMode: "auto",
      apiKey: "re_test_key",
      fromEmail: "NexusDash <noreply@nexus-dash.app>",
      shouldDeliver: true,
    });
    prismaMock.outboundEmailDelivery.create.mockResolvedValue({
      id: "email-1",
    });
    prismaMock.outboundEmailDelivery.update.mockResolvedValue({
      id: "email-1",
    });
  });

  test("rejects invalid recipients before creating a delivery record", async () => {
    const result = await sendOutboundEmail({
      ...baseMessage,
      to: "not-an-email",
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid-recipient",
      deliveryId: null,
      provider: "resend",
    });
    expect(prismaMock.outboundEmailDelivery.create).not.toHaveBeenCalled();
  });

  test("records skipped delivery when outbound delivery is disabled", async () => {
    envMock.getOutboundEmailRuntimeConfig.mockReturnValueOnce({
      provider: "resend",
      deliveryMode: "disabled",
      apiKey: null,
      fromEmail: "NexusDash <noreply@nexus-dash.app>",
      shouldDeliver: false,
    });

    const result = await sendOutboundEmail(baseMessage);

    expect(result).toEqual({
      ok: true,
      delivery: "skipped",
      deliveryId: "email-1",
      provider: "resend",
      providerMessageId: null,
    });
    expect(prismaMock.outboundEmailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: Prisma.DbNull,
        recipientEmail: "user@example.com",
        status: "pending",
        templateKey: "email_verification",
      }),
      select: { id: true },
    });
    expect(prismaMock.outboundEmailDelivery.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: expect.objectContaining({
        status: "skipped",
        completedAt: expect.any(Date),
      }),
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("sends through Resend and records provider id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-message-1" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendOutboundEmail({
      ...baseMessage,
      metadata: {
        userId: "user-1",
      },
    });

    expect(result).toEqual({
      ok: true,
      delivery: "sent",
      deliveryId: "email-1",
      provider: "resend",
      providerMessageId: "resend-message-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
        }),
        body: expect.stringContaining('"to":["user@example.com"]'),
      })
    );
    expect(prismaMock.outboundEmailDelivery.update).toHaveBeenLastCalledWith({
      where: { id: "email-1" },
      data: expect.objectContaining({
        status: "sent",
        providerMessageId: "resend-message-1",
        providerStatus: 200,
        completedAt: expect.any(Date),
      }),
    });
  });

  test("records provider rejection without logging secrets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "domain not verified" }), {
          status: 403,
        })
      )
    );

    const result = await sendOutboundEmail(baseMessage);

    expect(result).toEqual({
      ok: false,
      error: "provider-rejected",
      deliveryId: "email-1",
      provider: "resend",
      providerStatus: 403,
    });
    expect(prismaMock.outboundEmailDelivery.update).toHaveBeenLastCalledWith({
      where: { id: "email-1" },
      data: expect.objectContaining({
        status: "failed",
        errorCode: "provider-rejected",
        providerStatus: 403,
      }),
    });
    expect(loggerMock.logServerWarning).toHaveBeenCalledWith(
      "sendOutboundEmail",
      "Outbound email provider rejected send.",
      expect.not.objectContaining({
        apiKey: expect.any(String),
      })
    );
  });

  test("records provider-unavailable when live delivery has no key", async () => {
    envMock.getOutboundEmailRuntimeConfig.mockReturnValueOnce({
      provider: "resend",
      deliveryMode: "live",
      apiKey: null,
      fromEmail: "NexusDash <noreply@nexus-dash.app>",
      shouldDeliver: true,
    });

    const result = await sendOutboundEmail(baseMessage);

    expect(result).toEqual({
      ok: false,
      error: "provider-unavailable",
      deliveryId: "email-1",
      provider: "resend",
    });
    expect(prismaMock.outboundEmailDelivery.update).toHaveBeenCalledWith({
      where: { id: "email-1" },
      data: expect.objectContaining({
        status: "failed",
        errorCode: "provider-unavailable",
      }),
    });
  });

  test("returns typed provider failure when failed-status update also fails", async () => {
    envMock.getOutboundEmailRuntimeConfig.mockReturnValueOnce({
      provider: "resend",
      deliveryMode: "live",
      apiKey: null,
      fromEmail: "NexusDash <noreply@nexus-dash.app>",
      shouldDeliver: true,
    });
    prismaMock.outboundEmailDelivery.update.mockRejectedValueOnce(
      new Error("status update failed")
    );

    const result = await sendOutboundEmail(baseMessage);

    expect(result).toEqual({
      ok: false,
      error: "provider-unavailable",
      deliveryId: "email-1",
      provider: "resend",
    });
    expect(loggerMock.logServerError).toHaveBeenCalledWith(
      "sendOutboundEmail.markFailed",
      expect.any(Error),
      expect.objectContaining({
        deliveryId: "email-1",
        errorCode: "provider-unavailable",
      })
    );
  });

  test("fails closed when the initial delivery record cannot be created", async () => {
    prismaMock.outboundEmailDelivery.create.mockRejectedValueOnce(
      new Error("db unavailable")
    );

    const result = await sendOutboundEmail(baseMessage);

    expect(result).toEqual({
      ok: false,
      error: "delivery-record-failed",
      deliveryId: null,
      provider: "resend",
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(loggerMock.logServerError).toHaveBeenCalled();
  });
});
