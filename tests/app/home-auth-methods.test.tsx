// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { HomeAuthMethods } from "@/app/home-auth-methods";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("HomeAuthMethods", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("progressively reveals email auth and offers a path back", () => {
    act(() => {
      root.render(
        <HomeAuthMethods
          providerOptions={<a href="/oauth">Continue with Google</a>}
        >
          <form aria-label="Email sign in">
            <input aria-label="Email address" />
          </form>
        </HomeAuthMethods>
      );
    });

    const continueButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Continue with email")
    );
    const providerRegion = container.querySelector(
      '[data-state="provider-options"]'
    );

    expect(continueButton).toBeTruthy();
    expect(providerRegion?.classList.contains("hidden")).toBe(false);
    expect(container.querySelector("#home-email-auth-form")?.classList).toContain(
      "hidden"
    );

    act(() => continueButton?.click());

    expect(container.querySelector('[data-state="email-expanded"]')?.classList).toContain(
      "hidden"
    );
    expect(container.querySelector("#home-email-auth-form")?.classList).not.toContain(
      "hidden"
    );

    const backButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Other sign-in options")
    );
    act(() => backButton?.click());

    expect(container.querySelector("#home-email-auth-form")?.classList).toContain(
      "hidden"
    );
  });

  test("starts with email visible when recovery context requires it", () => {
    act(() => {
      root.render(
        <HomeAuthMethods
          defaultEmailExpanded
          providerOptions={<a href="/oauth">Continue with GitHub</a>}
        >
          <form aria-label="Email sign in" />
        </HomeAuthMethods>
      );
    });

    expect(container.querySelector("#home-email-auth-form")?.classList).not.toContain(
      "hidden"
    );
  });
});
