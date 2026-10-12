import process from "node:process";
import { randomInt } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

// Keep the username shape, normalization, and discriminator rules in sync with
// lib/services/account-security-policy.ts and
// lib/services/social-auth-service.ts (normalizeUsernameCandidate). The
// mention grammar in lib/mention.ts parses the same dot-separated shape.
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;
const USERNAME_PATTERN = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;
const USERNAME_DISCRIMINATOR_LENGTH = 4;
const USERNAME_DISCRIMINATOR_SPACE = 10 ** USERNAME_DISCRIMINATOR_LENGTH;
const USERNAME_DISCRIMINATOR_PATTERN = /^\d{4}$/;
const MAX_USERNAME_ATTEMPTS = 12;

export function isValidBackfillUsername(username) {
  return (
    typeof username === "string" &&
    username.length >= MIN_USERNAME_LENGTH &&
    username.length <= MAX_USERNAME_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}

export function generateUsernameDiscriminator() {
  return randomInt(0, USERNAME_DISCRIMINATOR_SPACE)
    .toString()
    .padStart(USERNAME_DISCRIMINATOR_LENGTH, "0");
}

function isValidDiscriminator(discriminator) {
  return (
    typeof discriminator === "string" &&
    USERNAME_DISCRIMINATOR_PATTERN.test(discriminator)
  );
}

/**
 * Derive a policy-valid username from an account's existing handle, display
 * name, or email local part. Mirrors the social sign-in candidate
 * normalization so backfilled handles match what signup would assign.
 */
export function buildBackfillUsername(rawValue) {
  const normalized = String(rawValue ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, ".")
    .replace(/[._]{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "");

  if (isValidBackfillUsername(normalized)) {
    return normalized;
  }

  const withoutSeparators = normalized.replace(/[^a-z0-9]+/g, "");
  if (isValidBackfillUsername(withoutSeparators)) {
    return withoutSeparators;
  }

  const fallbackBase = withoutSeparators || "user";
  const padded = `${fallbackBase}${"user".slice(
    0,
    Math.max(0, MIN_USERNAME_LENGTH - fallbackBase.length)
  )}`;

  return padded.slice(0, MAX_USERNAME_LENGTH);
}

function getEmailLocalPart(email) {
  if (typeof email !== "string" || !email.includes("@")) {
    return null;
  }

  return email.split("@", 1)[0] || null;
}

function isUniqueConstraintViolation(error) {
  return Boolean(error) && typeof error === "object" && error.code === "P2002";
}

/**
 * Assign a username and username discriminator to every account missing a
 * tag, preserving existing handles and display names. Idempotent: accounts
 * already tagged are never selected, and concurrent runs cannot overwrite a
 * tag that appeared after the scan.
 */
export async function backfillUsernameTags(prisma, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const users = await prisma.user.findMany({
    where: {
      OR: [{ username: null }, { usernameDiscriminator: null }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      usernameDiscriminator: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const report = {
    dryRun,
    scanned: users.length,
    updated: [],
    skipped: [],
    failures: [],
  };

  for (const user of users) {
    const username = buildBackfillUsername(
      user.username ?? user.name ?? getEmailLocalPart(user.email) ?? "member"
    );
    const preservedDiscriminator = isValidDiscriminator(
      user.usernameDiscriminator
    )
      ? user.usernameDiscriminator
      : null;

    let assigned = false;
    for (let attempt = 0; attempt < MAX_USERNAME_ATTEMPTS; attempt += 1) {
      const discriminator =
        attempt === 0 && preservedDiscriminator
          ? preservedDiscriminator
          : generateUsernameDiscriminator();

      if (dryRun) {
        report.updated.push({ userId: user.id, username, discriminator });
        assigned = true;
        break;
      }

      try {
        const result = await prisma.user.updateMany({
          where: {
            id: user.id,
            OR: [{ username: null }, { usernameDiscriminator: null }],
          },
          data: { username, usernameDiscriminator: discriminator },
        });

        if (result.count === 0) {
          report.skipped.push(user.id);
        } else {
          report.updated.push({ userId: user.id, username, discriminator });
        }
        assigned = true;
        break;
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          continue;
        }

        report.failures.push({
          userId: user.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      report.failures.push({
        userId: user.id,
        reason: "discriminator-space-exhausted",
      });
    }
  }

  return report;
}

export function formatBackfillReport(report) {
  const lines = [
    `Username tag backfill${report.dryRun ? " (dry run)" : ""}: ` +
      `scanned ${report.scanned}, updated ${report.updated.length}, ` +
      `skipped ${report.skipped.length}, failed ${report.failures.length}`,
  ];
  for (const entry of report.updated) {
    lines.push(
      `- assigned ${entry.username}#${entry.discriminator} to ${entry.userId}`
    );
  }
  for (const userId of report.skipped) {
    lines.push(`- skipped ${userId} (already tagged)`);
  }
  for (const failure of report.failures) {
    lines.push(`- failed ${failure.userId}: ${failure.reason}`);
  }
  return lines.join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const connectionUrl = new URL(databaseUrl);
  if (
    connectionUrl.searchParams.get("sslmode")?.toLowerCase() === "require" &&
    !connectionUrl.searchParams.has("uselibpqcompat")
  ) {
    connectionUrl.searchParams.set("uselibpqcompat", "true");
  }

  const pool = new pg.Pool({ connectionString: connectionUrl.toString() });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: true }),
  });

  try {
    const report = await backfillUsernameTags(prisma, { dryRun });
    console.log(formatBackfillReport(report));
    process.exitCode = report.failures.length > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}
