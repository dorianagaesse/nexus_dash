import { getOptionalServerEnv } from "@/lib/env.server";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

const GITHUB_AUTH_ENDPOINT = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const GITHUB_USER_ENDPOINT = "https://api.github.com/user";
const GITHUB_EMAILS_ENDPOINT = "https://api.github.com/user/emails";

export const SOCIAL_OAUTH_STATE_COOKIE = "nexusdash_social_oauth_state";
export const SOCIAL_OAUTH_PROVIDER_COOKIE = "nexusdash_social_oauth_provider";
export const SOCIAL_OAUTH_RETURN_TO_COOKIE = "nexusdash_social_oauth_return_to";
export const SOCIAL_OAUTH_FORM_COOKIE = "nexusdash_social_oauth_form";

export type SocialAuthProvider = "google" | "github";
export type HomeAuthForm = "signin" | "signup";

export interface SocialAuthProviderDescriptor {
  provider: SocialAuthProvider;
  label: string;
}

export interface SocialAuthTokenResponse {
  accessToken: string;
  expiresIn: number | null;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  idToken?: string;
}

export interface SocialAuthUserProfile {
  provider: SocialAuthProvider;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  usernameCandidate: string | null;
}

interface SocialAuthProviderConfig {
  provider: SocialAuthProvider;
  clientId: string;
  clientSecret: string;
  explicitRedirectUri: string | null;
}

const SOCIAL_PROVIDER_DESCRIPTORS: SocialAuthProviderDescriptor[] = [
  { provider: "google", label: "Google" },
  { provider: "github", label: "GitHub" },
];

function readOptionalEnvPair(
  clientIdKey: string,
  clientSecretKey: string
): { clientId: string; clientSecret: string } | null {
  const clientId = getOptionalServerEnv(clientIdKey);
  const clientSecret = getOptionalServerEnv(clientSecretKey);

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

function readProviderConfig(
  provider: SocialAuthProvider
): SocialAuthProviderConfig | null {
  if (provider === "google") {
    const pair = readOptionalEnvPair(
      "AUTH_GOOGLE_CLIENT_ID",
      "AUTH_GOOGLE_CLIENT_SECRET"
    );
    if (!pair) {
      return null;
    }

    return {
      provider,
      clientId: pair.clientId,
      clientSecret: pair.clientSecret,
      explicitRedirectUri: getOptionalServerEnv("AUTH_GOOGLE_REDIRECT_URI"),
    };
  }

  const pair = readOptionalEnvPair(
    "AUTH_GITHUB_CLIENT_ID",
    "AUTH_GITHUB_CLIENT_SECRET"
  );
  if (!pair) {
    return null;
  }

  return {
    provider,
    clientId: pair.clientId,
    clientSecret: pair.clientSecret,
    explicitRedirectUri: getOptionalServerEnv("AUTH_GITHUB_REDIRECT_URI"),
  };
}

export function isSocialAuthProvider(value: string): value is SocialAuthProvider {
  return value === "google" || value === "github";
}

export function normalizeHomeAuthForm(value: string | null): HomeAuthForm {
  return value === "signup" ? "signup" : "signin";
}

export function normalizeReturnToPath(value: string | null): string {
  if (!value) {
    return "/projects";
  }

  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    /[\\\u0000-\u001F]/.test(trimmed)
  ) {
    return "/projects";
  }

  try {
    const parsed = new URL(trimmed, "https://nexusdash.local");
    if (parsed.origin !== "https://nexusdash.local") {
      return "/projects";
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/projects";
  }
}

export function getEnabledSocialAuthProviders(): SocialAuthProviderDescriptor[] {
  return SOCIAL_PROVIDER_DESCRIPTORS.filter(({ provider }) =>
    Boolean(readProviderConfig(provider))
  );
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function getCallbackPath(provider: SocialAuthProvider): string {
  return `/api/auth/oauth/${provider}/callback`;
}

export function resolveSocialOAuthRedirectUri(
  provider: SocialAuthProvider,
  appOrigin?: string
): string {
  const config = readProviderConfig(provider);
  if (!config) {
    throw new Error("social-provider-disabled");
  }

  if (config.explicitRedirectUri) {
    return config.explicitRedirectUri;
  }

  if (!appOrigin) {
    throw new Error("missing-social-redirect-uri");
  }

  const origin = normalizeOrigin(appOrigin);
  if (!origin) {
    throw new Error("invalid-social-redirect-origin");
  }

  return new URL(getCallbackPath(provider), origin).toString();
}

function getRequiredProviderConfig(
  provider: SocialAuthProvider
): SocialAuthProviderConfig {
  const config = readProviderConfig(provider);
  if (!config) {
    throw new Error("social-provider-disabled");
  }

  return config;
}

export function buildSocialOAuthAuthorizationUrl(
  provider: SocialAuthProvider,
  state: string,
  redirectUri: string
): string {
  const config = getRequiredProviderConfig(provider);

  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "select_account",
      scope: "openid email profile",
      state,
    });

    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });

  return `${GITHUB_AUTH_ENDPOINT}?${params.toString()}`;
}

async function postTokenForm(
  url: string,
  body: URLSearchParams,
  headers?: Record<string, string>
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(headers ?? {}),
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok || !payload) {
    throw new Error("token-request-failed");
  }

  if (typeof payload.error === "string") {
    throw new Error(payload.error);
  }

  return payload;
}

export async function exchangeSocialAuthorizationCodeForTokens(
  provider: SocialAuthProvider,
  code: string,
  redirectUri: string
): Promise<SocialAuthTokenResponse> {
  const config = getRequiredProviderConfig(provider);

  if (provider === "google") {
    const payload = await postTokenForm(
      GOOGLE_TOKEN_ENDPOINT,
      new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      })
    );

    if (typeof payload.access_token !== "string") {
      throw new Error("token-response-invalid");
    }

    return {
      accessToken: payload.access_token,
      expiresIn:
        typeof payload.expires_in === "number" ? payload.expires_in : null,
      refreshToken:
        typeof payload.refresh_token === "string"
          ? payload.refresh_token
          : undefined,
      tokenType:
        typeof payload.token_type === "string" ? payload.token_type : undefined,
      scope: typeof payload.scope === "string" ? payload.scope : undefined,
      idToken:
        typeof payload.id_token === "string" ? payload.id_token : undefined,
    };
  }

  const payload = await postTokenForm(
    GITHUB_TOKEN_ENDPOINT,
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
    }),
    {
      Accept: "application/json",
    }
  );

  if (typeof payload.access_token !== "string") {
    throw new Error("token-response-invalid");
  }

  return {
    accessToken: payload.access_token,
    expiresIn: null,
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
    tokenType:
      typeof payload.token_type === "string" ? payload.token_type : undefined,
  };
}

async function fetchJson(
  url: string,
  accessToken: string
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "NexusDash",
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok || !payload) {
    throw new Error("profile-request-failed");
  }

  return payload;
}

export async function fetchSocialUserProfile(
  provider: SocialAuthProvider,
  accessToken: string
): Promise<SocialAuthUserProfile> {
  if (provider === "google") {
    const payload = await fetchJson(GOOGLE_USERINFO_ENDPOINT, accessToken);
    const providerAccountId =
      typeof payload.sub === "string" ? payload.sub : null;

    if (!providerAccountId) {
      throw new Error("profile-response-invalid");
    }

    return {
      provider,
      providerAccountId,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : null,
      image: typeof payload.picture === "string" ? payload.picture : null,
      usernameCandidate:
        typeof payload.given_name === "string"
          ? payload.given_name
          : typeof payload.name === "string"
            ? payload.name
            : typeof payload.email === "string"
              ? payload.email.split("@")[0] ?? null
              : null,
    };
  }

  const userPayload = await fetchJson(GITHUB_USER_ENDPOINT, accessToken);
  const providerAccountId =
    typeof userPayload.id === "number" || typeof userPayload.id === "string"
      ? String(userPayload.id)
      : null;

  if (!providerAccountId) {
    throw new Error("profile-response-invalid");
  }

  let email =
    typeof userPayload.email === "string" ? userPayload.email : null;
  let emailVerified = false;
  const emailsResponse = await fetch(GITHUB_EMAILS_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "NexusDash",
    },
    cache: "no-store",
  });
  const emailsPayload = (await emailsResponse.json().catch(() => null)) as
    | Array<Record<string, unknown>>
    | null;

  if (emailsResponse.ok && Array.isArray(emailsPayload)) {
    const preferredEmail =
      emailsPayload.find(
        (entry) => entry.primary === true && entry.verified === true
      ) ??
      emailsPayload.find(
        (entry) =>
          typeof entry.email === "string" &&
          entry.email === email &&
          entry.verified === true
      ) ??
      emailsPayload.find((entry) => entry.verified === true) ??
      emailsPayload.find((entry) => typeof entry.email === "string");

    if (preferredEmail && typeof preferredEmail.email === "string") {
      email = preferredEmail.email;
      emailVerified = preferredEmail.verified === true;
    }
  }

  return {
    provider,
    providerAccountId,
    email,
    emailVerified,
    name: typeof userPayload.name === "string" ? userPayload.name : null,
    image:
      typeof userPayload.avatar_url === "string"
        ? userPayload.avatar_url
        : null,
    usernameCandidate:
      typeof userPayload.login === "string"
        ? userPayload.login
        : typeof userPayload.name === "string"
          ? userPayload.name
          : email
            ? (email.split("@")[0] ?? null)
            : null,
  };
}

export function getSocialAuthProviderLabel(
  provider: SocialAuthProvider
): string {
  const descriptor = SOCIAL_PROVIDER_DESCRIPTORS.find(
    (entry) => entry.provider === provider
  );

  return descriptor?.label ?? provider;
}
