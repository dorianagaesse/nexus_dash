import { Prisma } from "@prisma/client";

import { getOutboundEmailRuntimeConfig } from "@/lib/env.server";
import { logServerError, logServerInfo, logServerWarning } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import {
  normalizeEmail,
  validateEmail,
} from "@/lib/services/account-security-policy";
import type { OutboundEmailTemplateKey } from "@/lib/services/outbound-email-templates";

const RESEND_API_ENDPOINT = "https://api.resend.com/emails";
const MAX_ERROR_MESSAGE_LENGTH = 1000;

export interface SendOutboundEmailInput {
  templateKey: OutboundEmailTemplateKey;
  to: string;
  subject: string;
  text: string;
  html: string;
  metadata?: Prisma.InputJsonObject;
}

interface SendOutboundEmailSuccess {
  ok: true;
  delivery: "sent" | "skipped";
  deliveryId: string;
  provider: "resend";
  providerMessageId: string | null;
}

interface SendOutboundEmailFailure {
  ok: false;
  error:
    | "invalid-recipient"
    | "delivery-record-failed"
    | "provider-unavailable"
    | "provider-rejected";
  deliveryId: string | null;
  provider: "resend";
  providerStatus?: number;
}

export type SendOutboundEmailResult =
  | SendOutboundEmailSuccess
  | SendOutboundEmailFailure;

function truncateErrorMessage(message: string): string {
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`
    : message;
}

function getProviderMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = (payload as { id?: unknown }).id;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

async function readProviderResponse(response: Response): Promise<{
  providerMessageId: string | null;
  responseText: string;
}> {
  const responseText = await response.text();
  if (!responseText) {
    return {
      providerMessageId: null,
      responseText: "",
    };
  }

  try {
    return {
      providerMessageId: getProviderMessageId(JSON.parse(responseText)),
      responseText,
    };
  } catch {
    return {
      providerMessageId: null,
      responseText,
    };
  }
}

async function markDeliveryFailed(input: {
  deliveryId: string;
  errorCode: SendOutboundEmailFailure["error"];
  errorMessage: string;
  providerStatus?: number;
}): Promise<void> {
  await prisma.outboundEmailDelivery.update({
    where: { id: input.deliveryId },
    data: {
      status: "failed",
      providerStatus: input.providerStatus,
      errorCode: input.errorCode,
      errorMessage: truncateErrorMessage(input.errorMessage),
      completedAt: new Date(),
    },
  });
}

export async function sendOutboundEmail(
  input: SendOutboundEmailInput
): Promise<SendOutboundEmailResult> {
  const config = getOutboundEmailRuntimeConfig();
  const recipientEmail = normalizeEmail(input.to);
  if (!validateEmail(recipientEmail)) {
    return {
      ok: false,
      error: "invalid-recipient",
      deliveryId: null,
      provider: config.provider,
    };
  }

  let deliveryId: string;
  try {
    const delivery = await prisma.outboundEmailDelivery.create({
      data: {
        templateKey: input.templateKey,
        provider: config.provider,
        fromEmail: config.fromEmail,
        recipientEmail,
        subject: input.subject,
        status: "pending",
        metadata: input.metadata ?? Prisma.JsonNull,
      },
      select: {
        id: true,
      },
    });
    deliveryId = delivery.id;
  } catch (error) {
    logServerError("sendOutboundEmail.createDelivery", error, {
      templateKey: input.templateKey,
      provider: config.provider,
    });
    return {
      ok: false,
      error: "delivery-record-failed",
      deliveryId: null,
      provider: config.provider,
    };
  }

  if (!config.shouldDeliver) {
    await prisma.outboundEmailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "skipped",
        completedAt: new Date(),
      },
    });

    logServerInfo("sendOutboundEmail", "Outbound email delivery skipped.", {
      deliveryId,
      templateKey: input.templateKey,
      provider: config.provider,
      deliveryMode: config.deliveryMode,
    });

    return {
      ok: true,
      delivery: "skipped",
      deliveryId,
      provider: config.provider,
      providerMessageId: null,
    };
  }

  if (!config.apiKey) {
    await markDeliveryFailed({
      deliveryId,
      errorCode: "provider-unavailable",
      errorMessage: "RESEND_API_KEY is missing while delivery is enabled.",
    });

    logServerWarning(
      "sendOutboundEmail",
      "Outbound email provider key is missing while delivery is enabled.",
      {
        deliveryId,
        templateKey: input.templateKey,
        provider: config.provider,
      }
    );

    return {
      ok: false,
      error: "provider-unavailable",
      deliveryId,
      provider: config.provider,
    };
  }

  await prisma.outboundEmailDelivery.update({
    where: { id: deliveryId },
    data: {
      lastAttemptAt: new Date(),
    },
  });

  let response: Response;
  try {
    response = await fetch(RESEND_API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: [recipientEmail],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider fetch failed.";
    await markDeliveryFailed({
      deliveryId,
      errorCode: "provider-unavailable",
      errorMessage: message,
    });

    logServerWarning("sendOutboundEmail", "Outbound email provider unavailable.", {
      deliveryId,
      templateKey: input.templateKey,
      provider: config.provider,
    });

    return {
      ok: false,
      error: "provider-unavailable",
      deliveryId,
      provider: config.provider,
    };
  }

  const providerResponse = await readProviderResponse(response);
  if (!response.ok) {
    await markDeliveryFailed({
      deliveryId,
      errorCode: "provider-rejected",
      errorMessage:
        providerResponse.responseText || `Provider rejected request: ${response.status}`,
      providerStatus: response.status,
    });

    logServerWarning("sendOutboundEmail", "Outbound email provider rejected send.", {
      deliveryId,
      templateKey: input.templateKey,
      provider: config.provider,
      providerStatus: response.status,
    });

    return {
      ok: false,
      error: "provider-rejected",
      deliveryId,
      provider: config.provider,
      providerStatus: response.status,
    };
  }

  try {
    await prisma.outboundEmailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "sent",
        providerMessageId: providerResponse.providerMessageId,
        providerStatus: response.status,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    logServerError("sendOutboundEmail.markSent", error, {
      deliveryId,
      templateKey: input.templateKey,
      provider: config.provider,
      providerStatus: response.status,
    });
  }

  logServerInfo("sendOutboundEmail", "Outbound email sent.", {
    deliveryId,
    templateKey: input.templateKey,
    provider: config.provider,
    providerStatus: response.status,
  });

  return {
    ok: true,
    delivery: "sent",
    deliveryId,
    provider: config.provider,
    providerMessageId: providerResponse.providerMessageId,
  };
}
