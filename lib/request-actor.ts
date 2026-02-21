function normalizeUserId(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getActorHeaderUserId(headers: Headers): string | null {
  return normalizeUserId(headers.get("x-nexus-user-id"));
}

