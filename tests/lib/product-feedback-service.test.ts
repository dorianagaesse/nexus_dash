import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  outboundEmailDelivery: {
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

const outboundEmailMock = vi.hoisted(() => ({
  sendOutboundEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/app-metadata", () => ({
  getAppMetadataSummary: () => ({
    versionLabel: "v0.29.0",
  }),
}));

vi.mock("@/lib/services/outbound-email-service", () => ({
  sendOutboundEmail: outboundEmailMock.sendOutboundEmail,
}));

import {
  PRODUCT_FEEDBACK_RATE_LIMIT,
  PRODUCT_FEEDBACK_RECIPIENT,
  submitProductFeedback,
} from "@/lib/services/product-feedback-service";

const validInput = {
  actorUserId: "user-1",
  reportType: "bug",
  message: "The task dialog closes unexpectedly.",
  pagePath: "/projects/project-1?taskId=task-7",
  diagnostics: {
    userAgent: "Test Browser",
    viewport: "390x844",
    locale: "fr-FR",
    timeZone: "Europe/Paris",
  },
};

describe("product feedback service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.outboundEmailDelivery.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "DORIAN@EXAMPLE.COM",
      name: "Dorian A.",
      username: "dorian",
      usernameDiscriminator: "1234",
    });
    outboundEmailMock.sendOutboundEmail.mockResolvedValue({
      ok: true,
      delivery: "sent",
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "provider-1",
    });
  });

  test("sends safe, attributable feedback to the fixed owner recipient", async () => {
    const result = await submitProductFeedback(validInput);

    expect(result).toEqual({
      ok: true,
      status: 201,
      data: { delivery: "sent" },
    });
    expect(prismaMock.outboundEmailDelivery.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        templateKey: "product_feedback",
        metadata: {
          path: ["reporterUserId"],
          equals: "user-1",
        },
      }),
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        usernameDiscriminator: true,
      },
    });
    expect(outboundEmailMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "product_feedback",
        to: PRODUCT_FEEDBACK_RECIPIENT,
        subject: "[NexusDash] Bug report from dorian",
        text: expect.stringContaining("dorian#1234"),
        html: expect.stringContaining("390x844"),
        metadata: {
          reporterUserId: "user-1",
          reportType: "bug",
          pagePath: "/projects/project-1?taskId=task-7",
          appVersion: "v0.29.0",
          diagnosticsIncluded: true,
        },
      })
    );
  });

  test("rejects invalid input before reading reporter or delivery state", async () => {
    await expect(
      submitProductFeedback({
        ...validInput,
        reportType: "complaint",
      })
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid-type",
    });
    await expect(
      submitProductFeedback({
        ...validInput,
        message: "short",
      })
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: "message-too-short",
    });
    expect(prismaMock.outboundEmailDelivery.count).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  test("rate limits repeated submissions per reporter", async () => {
    prismaMock.outboundEmailDelivery.count.mockResolvedValueOnce(
      PRODUCT_FEEDBACK_RATE_LIMIT
    );

    await expect(submitProductFeedback(validInput)).resolves.toEqual({
      ok: false,
      status: 429,
      error: "rate-limited",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(outboundEmailMock.sendOutboundEmail).not.toHaveBeenCalled();
  });

  test("normalizes unsafe context and excludes diagnostics when not supplied", async () => {
    await submitProductFeedback({
      ...validInput,
      reportType: "feedback",
      pagePath: "https://attacker.example/collect",
      diagnostics: null,
    });

    expect(outboundEmailMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "[NexusDash] Product feedback from dorian",
        text: expect.stringContaining("Page: /projects"),
        metadata: expect.objectContaining({
          pagePath: "/projects",
          diagnosticsIncluded: false,
        }),
      })
    );
  });

  test("treats empty or invalid diagnostic objects as excluded", async () => {
    await submitProductFeedback({
      ...validInput,
      diagnostics: {
        userAgent: "",
        viewport: "not-a-viewport",
        locale: "\u0000",
        timeZone: "x".repeat(101),
      },
    });

    expect(outboundEmailMock.sendOutboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Diagnostics included: No"),
        metadata: expect.objectContaining({
          diagnosticsIncluded: false,
        }),
      })
    );
  });

  test("keeps provider failures recoverable for the API client", async () => {
    outboundEmailMock.sendOutboundEmail.mockResolvedValueOnce({
      ok: false,
      error: "provider-unavailable",
      deliveryId: "delivery-1",
      provider: "resend",
    });

    await expect(submitProductFeedback(validInput)).resolves.toEqual({
      ok: false,
      status: 503,
      error: "delivery-failed",
    });
  });
});
