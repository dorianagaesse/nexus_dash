import {
  getOptionalServerEnv,
  isLiveProductionDeployment,
} from "@/lib/env.server";
import { logServerInfo, logServerWarning } from "@/lib/observability/logger";

const RESEND_API_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_RESEND_FROM_EMAIL = "NexusDash <noreply@nexus-dash.app>";

interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface SendTransactionalEmailSuccess {
  ok: true;
  delivery: "sent" | "skipped";
}

interface SendTransactionalEmailFailure {
  ok: false;
  error: "provider-unavailable" | "provider-rejected";
}

export type SendTransactionalEmailResult =
  | SendTransactionalEmailSuccess
  | SendTransactionalEmailFailure;

function resolveResendFromEmail(): string {
  return getOptionalServerEnv("RESEND_FROM_EMAIL") ?? DEFAULT_RESEND_FROM_EMAIL;
}

function resolveResendApiKey(): string | null {
  return getOptionalServerEnv("RESEND_API_KEY");
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  if (!isLiveProductionDeployment()) {
    logServerInfo(
      "sendTransactionalEmail",
      "Email delivery skipped outside live production deployment.",
      {
        to: input.to,
        subject: input.subject,
        delivery: "skipped",
      }
    );
    return {
      ok: true,
      delivery: "skipped",
    };
  }

  const resendApiKey = resolveResendApiKey();
  if (!resendApiKey) {
    logServerWarning(
      "sendTransactionalEmail",
      "RESEND_API_KEY is missing in production; email delivery unavailable."
    );
    return {
      ok: false,
      error: "provider-unavailable",
    };
  }

  const response = await fetch(RESEND_API_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resolveResendFromEmail(),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text();
    logServerWarning("sendTransactionalEmail", "Resend rejected transactional email.", {
      to: input.to,
      subject: input.subject,
      status: response.status,
      responseText,
    });
    return {
      ok: false,
      error: "provider-rejected",
    };
  }

  return {
    ok: true,
    delivery: "sent",
  };
}
