import { getAppMetadataSummary } from "@/lib/app-metadata";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_FEEDBACK_MAX_MESSAGE_LENGTH,
  PRODUCT_FEEDBACK_MIN_MESSAGE_LENGTH,
} from "@/lib/product-feedback";
import {
  normalizeEmail,
  validateEmail,
  validateUsernameDiscriminator,
} from "@/lib/services/account-security-policy";
import {
  buildProductFeedbackEmail,
  type ProductFeedbackEmailDiagnostics,
} from "@/lib/services/outbound-email-templates";
import { sendOutboundEmail } from "@/lib/services/outbound-email-service";

export const PRODUCT_FEEDBACK_RECIPIENT = "dorian.agaesse@gmail.com";
export const PRODUCT_FEEDBACK_RATE_LIMIT = 5;
const PRODUCT_FEEDBACK_RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PAGE_PATH_LENGTH = 500;
const MAX_USER_AGENT_LENGTH = 500;
const MAX_LOCALE_LENGTH = 40;
const MAX_TIME_ZONE_LENGTH = 100;
const VIEWPORT_PATTERN = /^\d{2,5}x\d{2,5}$/;

export interface ProductFeedbackInput {
  actorUserId: string;
  reportType: unknown;
  message: unknown;
  pagePath: unknown;
  diagnostics: unknown;
}

type ProductFeedbackError =
  | "invalid-type"
  | "message-too-short"
  | "message-too-long"
  | "reporter-not-found"
  | "reporter-email-invalid"
  | "rate-limited"
  | "delivery-failed";

type ProductFeedbackResult =
  | {
      ok: true;
      status: 201;
      data: {
        delivery: "sent" | "skipped";
      };
    }
  | {
      ok: false;
      status: 400 | 404 | 429 | 503;
      error: ProductFeedbackError;
    };

function normalizePagePath(value: unknown): string {
  if (typeof value !== "string") {
    return "/projects";
  }

  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.length > MAX_PAGE_PATH_LENGTH
  ) {
    return "/projects";
  }

  return trimmed;
}

function readBoundedDiagnostic(
  value: unknown,
  maximumLength: number
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!normalized || normalized.length > maximumLength) {
    return null;
  }

  return normalized;
}

function normalizeDiagnostics(value: unknown): ProductFeedbackEmailDiagnostics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const viewport = readBoundedDiagnostic(candidate.viewport, 20);
  const diagnostics: ProductFeedbackEmailDiagnostics = {
    userAgent: readBoundedDiagnostic(candidate.userAgent, MAX_USER_AGENT_LENGTH),
    viewport: viewport && VIEWPORT_PATTERN.test(viewport) ? viewport : null,
    locale: readBoundedDiagnostic(candidate.locale, MAX_LOCALE_LENGTH),
    timeZone: readBoundedDiagnostic(candidate.timeZone, MAX_TIME_ZONE_LENGTH),
  };

  return Object.values(diagnostics).some((entry) => entry !== null)
    ? diagnostics
    : null;
}

function buildUsernameTag(input: {
  username: string | null;
  usernameDiscriminator: string | null;
}): string | null {
  if (
    !input.username ||
    !input.usernameDiscriminator ||
    !validateUsernameDiscriminator(input.usernameDiscriminator)
  ) {
    return null;
  }

  return `${input.username}#${input.usernameDiscriminator}`;
}

export async function submitProductFeedback(
  input: ProductFeedbackInput
): Promise<ProductFeedbackResult> {
  const actorUserId = input.actorUserId.trim();
  if (input.reportType !== "bug" && input.reportType !== "feedback") {
    return { ok: false, status: 400, error: "invalid-type" };
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length < PRODUCT_FEEDBACK_MIN_MESSAGE_LENGTH) {
    return { ok: false, status: 400, error: "message-too-short" };
  }
  if (message.length > PRODUCT_FEEDBACK_MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 400, error: "message-too-long" };
  }

  const recentSubmissionCount = await prisma.outboundEmailDelivery.count({
    where: {
      templateKey: "product_feedback",
      createdAt: {
        gte: new Date(Date.now() - PRODUCT_FEEDBACK_RATE_WINDOW_MS),
      },
      metadata: {
        path: ["reporterUserId"],
        equals: actorUserId,
      },
    },
  });
  if (recentSubmissionCount >= PRODUCT_FEEDBACK_RATE_LIMIT) {
    return { ok: false, status: 429, error: "rate-limited" };
  }

  const reporter = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      usernameDiscriminator: true,
    },
  });
  if (!reporter) {
    return { ok: false, status: 404, error: "reporter-not-found" };
  }

  const reporterEmail = normalizeEmail(reporter.email ?? "");
  if (!validateEmail(reporterEmail)) {
    return { ok: false, status: 400, error: "reporter-email-invalid" };
  }

  const pagePath = normalizePagePath(input.pagePath);
  const diagnostics = normalizeDiagnostics(input.diagnostics);
  const usernameTag = buildUsernameTag(reporter);
  const reporterDisplayName =
    reporter.username ??
    reporter.name ??
    reporterEmail.split("@", 1)[0] ??
    "NexusDash user";
  const appVersion = getAppMetadataSummary().versionLabel;
  const email = buildProductFeedbackEmail({
    reportType: input.reportType,
    message,
    reporterDisplayName,
    reporterEmail,
    reporterUsernameTag: usernameTag,
    pagePath,
    appVersion,
    diagnostics,
  });

  const delivery = await sendOutboundEmail({
    templateKey: "product_feedback",
    to: PRODUCT_FEEDBACK_RECIPIENT,
    ...email,
    metadata: {
      reporterUserId: reporter.id,
      reportType: input.reportType,
      pagePath,
      appVersion,
      diagnosticsIncluded: diagnostics !== null,
    },
  });

  if (!delivery.ok) {
    return { ok: false, status: 503, error: "delivery-failed" };
  }

  return {
    ok: true,
    status: 201,
    data: {
      delivery: delivery.delivery,
    },
  };
}
