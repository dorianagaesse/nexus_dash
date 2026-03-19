import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  generateUsernameDiscriminator,
  normalizeEmail,
  normalizeUsername,
  validateEmail,
  validateUsername,
} from "@/lib/services/account-security-policy";
import { createSessionForUser } from "@/lib/services/session-service";
import {
  exchangeSocialAuthorizationCodeForTokens,
  fetchSocialUserProfile,
  type SocialAuthProvider,
  type SocialAuthUserProfile,
} from "@/lib/social-auth";

const MAX_USERNAME_GENERATION_ATTEMPTS = 12;

type SocialAuthFailureCode =
  | "social-provider-disabled"
  | "social-email-unavailable"
  | "social-email-unverified"
  | "social-auth-failed";

interface SocialAuthSuccess {
  ok: true;
  data: {
    userId: string;
    emailVerified: boolean;
    sessionToken: string;
    expiresAt: Date;
    isNewUser: boolean;
    provider: SocialAuthProvider;
  };
}

interface SocialAuthFailure {
  ok: false;
  error: SocialAuthFailureCode;
}

export type SocialAuthResult = SocialAuthSuccess | SocialAuthFailure;

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function readUniqueConstraintTargets(error: unknown): string[] {
  if (!error || typeof error !== "object") {
    return [];
  }

  const candidate = error as {
    meta?: {
      target?: string[] | string;
    };
  };

  const targets = candidate.meta?.target;
  if (Array.isArray(targets)) {
    return targets.filter((target): target is string => typeof target === "string");
  }

  return typeof targets === "string" ? [targets] : [];
}

function isUsernameDiscriminatorConstraint(error: unknown): boolean {
  const targets = readUniqueConstraintTargets(error);
  return (
    targets.length > 0 &&
    targets.includes("username") &&
    targets.includes("usernameDiscriminator")
  );
}

function isEmailConstraint(error: unknown): boolean {
  return readUniqueConstraintTargets(error).includes("email");
}

function isProviderAccountConstraint(error: unknown): boolean {
  const targets = readUniqueConstraintTargets(error);
  return (
    targets.includes("providerAccountId") ||
    (targets.includes("provider") && targets.includes("providerAccountId"))
  );
}

function normalizeUsernameCandidate(rawValue: string | null): string {
  const normalized = normalizeUsername(rawValue ?? "")
    .replace(/[^a-z0-9._]+/g, ".")
    .replace(/[._]{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "");

  if (validateUsername(normalized)) {
    return normalized;
  }

  const withoutSeparators = normalized.replace(/[^a-z0-9]+/g, "");
  if (validateUsername(withoutSeparators)) {
    return withoutSeparators;
  }

  const fallbackBase = withoutSeparators || "user";
  const padded = `${fallbackBase}${"user".slice(
    0,
    Math.max(0, MIN_USERNAME_LENGTH - fallbackBase.length)
  )}`;

  return padded.slice(0, MAX_USERNAME_LENGTH);
}

async function issueSession(input: {
  userId: string;
  emailVerified: boolean;
  provider: SocialAuthProvider;
  isNewUser: boolean;
}): Promise<SocialAuthSuccess> {
  const session = await createSessionForUser(input.userId);

  return {
    ok: true,
    data: {
      userId: input.userId,
      emailVerified: input.emailVerified,
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt,
      provider: input.provider,
      isNewUser: input.isNewUser,
    },
  };
}

async function createUserFromSocialProfile(
  tx: Prisma.TransactionClient,
  profile: SocialAuthUserProfile
): Promise<{ userId: string; emailVerified: boolean }> {
  const email = normalizeEmail(profile.email ?? "");
  const username = normalizeUsernameCandidate(
    profile.usernameCandidate ?? profile.name ?? profile.email
  );

  for (let attempt = 0; attempt < MAX_USERNAME_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const createdUser = await tx.user.create({
        data: {
          email,
          emailVerified: profile.emailVerified ? new Date() : null,
          image: profile.image,
          name: profile.name ?? username,
          passwordHash: null,
          username,
          usernameDiscriminator: generateUsernameDiscriminator(),
          accounts: {
            create: {
              type: "oauth",
              provider: profile.provider,
              providerAccountId: profile.providerAccountId,
            },
          },
        },
        select: {
          id: true,
          emailVerified: true,
        },
      });

      return {
        userId: createdUser.id,
        emailVerified: Boolean(createdUser.emailVerified),
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error) && isUsernameDiscriminatorConstraint(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("username-generation-exhausted");
}

async function linkProviderToExistingUser(input: {
  tx: Prisma.TransactionClient;
  userId: string;
  profile: SocialAuthUserProfile;
  existingEmailVerified: boolean;
  existingName: string | null;
  existingImage: string | null;
}): Promise<{ userId: string; emailVerified: boolean }> {
  try {
    await input.tx.account.create({
      data: {
        userId: input.userId,
        type: "oauth",
        provider: input.profile.provider,
        providerAccountId: input.profile.providerAccountId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error) && isProviderAccountConstraint(error)) {
      const existingAccount = await input.tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: input.profile.provider,
            providerAccountId: input.profile.providerAccountId,
          },
        },
        select: {
          userId: true,
          user: {
            select: {
              emailVerified: true,
            },
          },
        },
      });

      if (existingAccount) {
        return {
          userId: existingAccount.userId,
          emailVerified: Boolean(existingAccount.user.emailVerified),
        };
      }
    }

    throw error;
  }

  const shouldUpdateProfile =
    (!input.existingName && input.profile.name) ||
    (!input.existingImage && input.profile.image) ||
    (!input.existingEmailVerified && input.profile.emailVerified);

  if (shouldUpdateProfile) {
    const updated = await input.tx.user.update({
      where: { id: input.userId },
      data: {
        ...(input.profile.name && !input.existingName
          ? { name: input.profile.name }
          : {}),
        ...(input.profile.image && !input.existingImage
          ? { image: input.profile.image }
          : {}),
        ...(!input.existingEmailVerified && input.profile.emailVerified
          ? { emailVerified: new Date() }
          : {}),
      },
      select: {
        id: true,
        emailVerified: true,
      },
    });

    return {
      userId: updated.id,
      emailVerified: Boolean(updated.emailVerified),
    };
  }

  return {
    userId: input.userId,
    emailVerified: input.existingEmailVerified,
  };
}

function providerFailure(error: SocialAuthFailureCode): SocialAuthFailure {
  return { ok: false, error };
}

async function resolveExistingUserByEmailForProvider(input: {
  tx: Prisma.TransactionClient;
  email: string;
  profile: SocialAuthUserProfile;
}): Promise<{
  userId: string;
  emailVerified: boolean;
  isNewUser: boolean;
}> {
  const existingUser = await input.tx.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      emailVerified: true,
      name: true,
      image: true,
    },
  });

  if (existingUser) {
    const linked = await linkProviderToExistingUser({
      tx: input.tx,
      userId: existingUser.id,
      profile: {
        ...input.profile,
        email: input.email,
      },
      existingEmailVerified: Boolean(existingUser.emailVerified),
      existingName: existingUser.name,
      existingImage: existingUser.image,
    });

    return {
      ...linked,
      isNewUser: false,
    };
  }

  const created = await createUserFromSocialProfile(input.tx, {
    ...input.profile,
    email: input.email,
  });

  return {
    ...created,
    isNewUser: true,
  };
}

export async function authenticateWithSocialProvider(input: {
  provider: SocialAuthProvider;
  code: string;
  redirectUri: string;
}): Promise<SocialAuthResult> {
  let profile: SocialAuthUserProfile;

  try {
    const tokens = await exchangeSocialAuthorizationCodeForTokens(
      input.provider,
      input.code,
      input.redirectUri
    );
    profile = await fetchSocialUserProfile(input.provider, tokens.accessToken);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "social-provider-disabled"
    ) {
      return providerFailure("social-provider-disabled");
    }

    return providerFailure("social-auth-failed");
  }

  const email = normalizeEmail(profile.email ?? "");
  const emailLooksValid = validateEmail(email);

  if (!emailLooksValid) {
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      select: {
        userId: true,
        user: {
          select: {
            emailVerified: true,
          },
        },
      },
    });

    if (!existingAccount) {
      return providerFailure("social-email-unavailable");
    }

    return issueSession({
      userId: existingAccount.userId,
      emailVerified: Boolean(existingAccount.user.emailVerified),
      provider: input.provider,
      isNewUser: false,
    });
  }

  if (!profile.emailVerified) {
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      select: {
        userId: true,
        user: {
          select: {
            emailVerified: true,
          },
        },
      },
    });

    if (!existingAccount) {
      return providerFailure("social-email-unverified");
    }

    return issueSession({
      userId: existingAccount.userId,
      emailVerified: Boolean(existingAccount.user.emailVerified),
      provider: input.provider,
      isNewUser: false,
    });
  }

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          emailVerified: true,
          name: true,
          image: true,
        },
      },
    },
  });

  if (existingAccount) {
    const shouldUpdateProfile =
      (!existingAccount.user.name && Boolean(profile.name)) ||
      (!existingAccount.user.image && Boolean(profile.image));

    const userRecord = shouldUpdateProfile
      ? await prisma.user.update({
          where: { id: existingAccount.userId },
          data: {
            ...(!existingAccount.user.name && profile.name
              ? { name: profile.name }
              : {}),
            ...(!existingAccount.user.image && profile.image
              ? { image: profile.image }
              : {}),
          },
          select: {
            id: true,
            emailVerified: true,
          },
        })
      : {
          id: existingAccount.userId,
          emailVerified: existingAccount.user.emailVerified,
        };

    return issueSession({
      userId: userRecord.id,
      emailVerified: Boolean(userRecord.emailVerified),
      provider: input.provider,
      isNewUser: false,
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      return resolveExistingUserByEmailForProvider({
        tx,
        email,
        profile,
      });
    });

    return issueSession({
      userId: result.userId,
      emailVerified: Boolean(result.emailVerified),
      provider: input.provider,
      isNewUser: result.isNewUser,
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error) && isEmailConstraint(error)) {
      const retriedResult = await prisma.$transaction(async (tx) =>
        resolveExistingUserByEmailForProvider({
          tx,
          email,
          profile,
        })
      );

      return issueSession({
        userId: retriedResult.userId,
        emailVerified: Boolean(retriedResult.emailVerified),
        provider: input.provider,
        isNewUser: retriedResult.isNewUser,
      });
    }

    if (isUniqueConstraintViolation(error) && isProviderAccountConstraint(error)) {
      return providerFailure("social-auth-failed");
    }

    throw error;
  }
}
