import { describe, expect, test } from "vitest";

import {
  readSessionTokenFromCookieReader,
  readSessionTokensFromCookieHeader,
  readSessionTokensFromCookieReader,
} from "@/lib/services/session-service";

describe("session-service", () => {
  test("prefers the current nexusdash cookie over legacy auth cookies", () => {
    const tokens = readSessionTokensFromCookieReader((name) => {
      if (name === "nexusdash.session-token") {
        return "current-token";
      }

      if (name === "authjs.session-token") {
        return "legacy-token";
      }

      return null;
    });

    expect(tokens).toEqual(["current-token", "legacy-token"]);
    expect(
      readSessionTokenFromCookieReader((name) => {
        if (name === "nexusdash.session-token") {
          return "current-token";
        }

        if (name === "authjs.session-token") {
          return "legacy-token";
        }

        return null;
      })
    ).toBe("current-token");
  });

  test("deduplicates repeated session tokens across cookie names", () => {
    const tokens = readSessionTokensFromCookieHeader(
      "authjs.session-token=same-token; nexusdash.session-token=same-token"
    );

    expect(tokens).toEqual(["same-token"]);
  });
});
