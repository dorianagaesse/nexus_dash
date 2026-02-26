"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type HomeSignupUsernameSuffixProps = {
  usernameInputId: string;
};

type HomeSignupEmailFeedbackProps = {
  emailInputId: string;
};

type HomeSignupPasswordFeedbackProps = {
  passwordInputId: string;
  confirmPasswordInputId: string;
  minPasswordLength: number;
};

type PasswordHint = {
  id: "length" | "uppercase" | "lowercase" | "number" | "symbol";
  shortLabel: string;
  longLabel: string;
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

export function HomeSignupUsernameSuffix({
  usernameInputId,
}: HomeSignupUsernameSuffixProps) {
  const [username, setUsername] = useState("");

  useEffect(() => {
    const usernameInput = document.getElementById(usernameInputId);
    if (!(usernameInput instanceof HTMLInputElement)) {
      return;
    }

    const syncInitialState = () => {
      setUsername(usernameInput.value);
    };

    const handleUsernameInput = () => {
      setUsername(usernameInput.value);
    };

    syncInitialState();
    usernameInput.addEventListener("input", handleUsernameInput);

    return () => {
      usernameInput.removeEventListener("input", handleUsernameInput);
    };
  }, [usernameInputId]);

  const normalizedUsername = normalizeUsername(username);
  const discriminatorPreview = useMemo(
    () => buildDiscriminatorPreview(normalizedUsername),
    [normalizedUsername]
  );

  if (!normalizedUsername) {
    return null;
  }

  return (
    <span
      className="pointer-events-none absolute inset-y-0 right-3 flex select-none items-center text-sm font-medium text-muted-foreground"
      aria-hidden="true"
    >
      #{discriminatorPreview}
    </span>
  );
}

export function HomeSignupEmailFeedback({
  emailInputId,
}: HomeSignupEmailFeedbackProps) {
  const [hasTypeMismatch, setHasTypeMismatch] = useState(false);
  const [isTouched, setIsTouched] = useState(false);

  useEffect(() => {
    const emailInput = document.getElementById(emailInputId);
    if (!(emailInput instanceof HTMLInputElement)) {
      return;
    }

    const syncInitialState = () => {
      setHasTypeMismatch(
        emailInput.value.length > 0 ? emailInput.validity.typeMismatch : false
      );
    };

    const handleEmailInput = () => {
      setHasTypeMismatch(
        emailInput.value.length > 0 ? emailInput.validity.typeMismatch : false
      );
    };

    const handleEmailBlur = () => {
      setIsTouched(true);
    };

    syncInitialState();
    emailInput.addEventListener("input", handleEmailInput);
    emailInput.addEventListener("blur", handleEmailBlur);

    return () => {
      emailInput.removeEventListener("input", handleEmailInput);
      emailInput.removeEventListener("blur", handleEmailBlur);
    };
  }, [emailInputId]);

  const showInvalidEmail = isTouched && hasTypeMismatch;

  return (
    <p
      className={cn(
        "min-h-5 text-xs font-medium",
        showInvalidEmail ? "text-destructive" : "invisible"
      )}
      role="status"
      aria-live="polite"
    >
      Enter a valid email address.
    </p>
  );
}

export function HomeSignupPasswordFeedback({
  passwordInputId,
  confirmPasswordInputId,
  minPasswordLength,
}: HomeSignupPasswordFeedbackProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  useEffect(() => {
    const passwordInput = document.getElementById(passwordInputId);
    const confirmPasswordInput = document.getElementById(confirmPasswordInputId);

    if (
      !(passwordInput instanceof HTMLInputElement) ||
      !(confirmPasswordInput instanceof HTMLInputElement)
    ) {
      return;
    }

    const syncInitialState = () => {
      setPassword(passwordInput.value);
      setConfirmPassword(confirmPasswordInput.value);
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

    passwordInput.addEventListener("input", handlePasswordInput);
    passwordInput.addEventListener("focus", handlePasswordFocus);
    passwordInput.addEventListener("blur", handlePasswordBlur);
    confirmPasswordInput.addEventListener("input", handleConfirmPasswordInput);

    return () => {
      passwordInput.removeEventListener("input", handlePasswordInput);
      passwordInput.removeEventListener("focus", handlePasswordFocus);
      passwordInput.removeEventListener("blur", handlePasswordBlur);
      confirmPasswordInput.removeEventListener("input", handleConfirmPasswordInput);
    };
  }, [confirmPasswordInputId, passwordInputId]);

  const passwordHints: PasswordHint[] = [
    {
      id: "length",
      shortLabel: "8+",
      longLabel: `At least ${minPasswordLength} characters`,
      passed: password.length >= minPasswordLength,
    },
    {
      id: "uppercase",
      shortLabel: "A-Z",
      longLabel: "At least one uppercase letter",
      passed: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      shortLabel: "a-z",
      longLabel: "At least one lowercase letter",
      passed: /[a-z]/.test(password),
    },
    {
      id: "number",
      shortLabel: "0-9",
      longLabel: "At least one number",
      passed: /\d/.test(password),
    },
    {
      id: "symbol",
      shortLabel: "#",
      longLabel: "At least one symbol",
      passed: /[^A-Za-z0-9]/.test(password),
    },
  ];

  const hasConfirmPasswordInput = confirmPassword.length > 0;
  const passwordsMismatch = hasConfirmPasswordInput && password !== confirmPassword;

  return (
    <div className="grid gap-1">
      <div className="min-h-6">
        <div
          className={cn(
            "flex flex-wrap items-center gap-1 transition-opacity",
            isPasswordFocused ? "opacity-100" : "opacity-0"
          )}
          aria-live="polite"
        >
          {passwordHints.map((hint) => (
            <span
              key={hint.id}
              title={hint.longLabel}
              className={cn(
                "select-none rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
                hint.passed
                  ? "border-emerald-500/40 text-emerald-600"
                  : "border-border/70 text-muted-foreground"
              )}
            >
              {hint.shortLabel}
            </span>
          ))}
        </div>
      </div>
      <p
        className={cn(
          "min-h-5 text-xs font-medium",
          passwordsMismatch ? "text-destructive" : "invisible"
        )}
        role="status"
        aria-live="polite"
      >
        Passwords do not match.
      </p>
    </div>
  );
}
