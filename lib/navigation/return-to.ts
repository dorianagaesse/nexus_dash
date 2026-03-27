export function normalizeReturnToPath(
  value: string | null | undefined,
  fallback = "/projects"
): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    /[\\\u0000-\u001F]/.test(trimmed)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, "https://nexusdash.local");
    if (parsed.origin !== "https://nexusdash.local") {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function appendQueryToPath(
  path: string,
  query: Record<string, string | null | undefined>
): string {
  const parsed = new URL(path, "https://nexusdash.local");

  for (const [key, value] of Object.entries(query)) {
    if (!value) {
      parsed.searchParams.delete(key);
      continue;
    }

    parsed.searchParams.set(key, value);
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
