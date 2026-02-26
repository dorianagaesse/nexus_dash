"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type HomeSignupLiveFeedbackProps = {
  usernameInputId: string;
  passwordInputId: string;
  confirmPasswordInputId: string;
  minPasswordLength: number;
};

type PasswordRule = {
  id: string;
  label: string;
  passed: boolean;
};

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function buildDiscriminatorPreview(username: string): string {
  if (!username) {
    return "000000";
  }

  let hash = 0;
  for (const character of username) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36).padStart(6, "0").slice(0, 6);
}

export function HomeSignupLiveFeedback({
  usernameInputId,
  passwordInputId,
  confirmPasswordInputId,
  minPasswordLength,
}: HomeSignupLiveFeedbackProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  useEffect(() => {
    const usernameInput = document.getElementById(usernameInputId);
    const passwordInput = document.getElementById(passwordInputId);
    const confirmPasswordInput = document.getElementById(confirmPasswordInputId);

    if (
      !(usernameInput instanceof HTMLInputElement) ||
      !(passwordInput instanceof HTMLInputElement) ||
      !(confirmPasswordInput instanceof HTMLInputElement)
    ) {
      return;
    }

    const syncInitialState = () => {
      setUsername(usernameInput.value);
      setPassword(passwordInput.value);
      setConfirmPassword(confirmPasswordInput.value);
    };

    const handleUsernameInput = () => {
      setUsername(usernameInput.value);
    };

    const handlePasswordInput = () => {
      setPassword(passwordInput.value);
    };

    const handleConfirmPasswordInput = () => {
      setConfirmPassword(confirmPasswordInput.value);
    };

    const handlePasswordFocus = () => {
      setIsPasswordFocused(true);
    };

    const handlePasswordBlur = () => {
      setIsPasswordFocused(false);
    };

    syncInitialState();

    usernameInput.addEventListener("input", handleUsernameInput);
    passwordInput.addEventListener("input", handlePasswordInput);
    passwordInput.addEventListener("focus", handlePasswordFocus);
    passwordInput.addEventListener("blur", handlePasswordBlur);
    confirmPasswordInput.addEventListener("input", handleConfirmPasswordInput);

    return () => {
      usernameInput.removeEventListener("input", handleUsernameInput);
      passwordInput.removeEventListener("input", handlePasswordInput);
      passwordInput.removeEventListener("focus", handlePasswordFocus);
      passwordInput.removeEventListener("blur", handlePasswordBlur);
      confirmPasswordInput.removeEventListener("input", handleConfirmPasswordInput);
    };
  }, [confirmPasswordInputId, passwordInputId, usernameInputId]);

  const normalizedUsername = normalizeUsername(username);
  const discriminatorPreview = useMemo(
    () => buildDiscriminatorPreview(normalizedUsername),
    [normalizedUsername]
  );

  const passwordRules: PasswordRule[] = [
    {
      id: "length",
      label: `At least ${minPasswordLength} characters`,
      passed: password.length >= minPasswordLength,
    },
    {
      id: "uppercase",
      label: "At least one uppercase letter",
      passed: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      label: "At least one lowercase letter",
      passed: /[a-z]/.test(password),
    },
    {
      id: "number",
      label: "At least one number",
      passed: /\d/.test(password),
    },
    {
      id: "symbol",
      label: "At least one symbol",
      passed: /[^A-Za-z0-9]/.test(password),
    },
  ];

  const showConfirmPasswordFeedback = confirmPassword.length > 0;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <div className="grid gap-3">
      {normalizedUsername ? (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            Username tag preview:{" "}
            <span className="font-semibold text-foreground">
              {normalizedUsername}#{discriminatorPreview}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Final discriminator is assigned when the account is created.
          </p>
        </div>
      ) : null}

      {isPasswordFocused ? (
        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Password checklist</p>
          <ul className="mt-2 grid gap-1 text-xs">
            {passwordRules.map((rule) => (
              <li
                key={rule.id}
                className={cn(
                  "flex items-center gap-2",
                  rule.passed ? "text-emerald-600" : "text-muted-foreground"
                )}
              >
                <span className="font-semibold" aria-hidden="true">
                  {rule.passed ? "✓" : "•"}
                </span>
                <span>{rule.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showConfirmPasswordFeedback ? (
        <p
          className={cn(
            "text-xs font-medium",
            passwordsMatch ? "text-emerald-600" : "text-destructive"
          )}
          role="status"
          aria-live="polite"
        >
          {passwordsMatch
            ? "Confirm password matches."
            : "Confirm password does not match yet."}
        </p>
      ) : null}
    </div>
  );
}
