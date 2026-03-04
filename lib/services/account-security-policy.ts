import { randomInt } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 20;
export const USERNAME_DISCRIMINATOR_LENGTH = 4;

const MAX_EMAIL_LENGTH = 320;
const USERNAME_DISCRIMINATOR_SPACE = 10 ** USERNAME_DISCRIMINATOR_LENGTH;
const USERNAME_DISCRIMINATOR_PATTERN = /^\d+$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9._]+$/;
const PASSWORD_UPPERCASE_PATTERN = /[A-Z]/;
const PASSWORD_LOWERCASE_PATTERN = /[a-z]/;
const PASSWORD_NUMBER_PATTERN = /\d/;
const PASSWORD_SYMBOL_PATTERN = /[^A-Za-z0-9]/;

export type PasswordLengthValidationResult =
  | "ok"
  | "password-too-short"
  | "password-too-long";

export function normalizeEmail(emailRaw: string): string {
  return emailRaw.trim().toLowerCase();
}

export function normalizeUsername(usernameRaw: string): string {
  return usernameRaw.trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

export function validateUsername(username: string): boolean {
  return (
    username.length >= MIN_USERNAME_LENGTH &&
    username.length <= MAX_USERNAME_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}

export function validateUsernameDiscriminator(discriminator: string): boolean {
  return (
    discriminator.length === USERNAME_DISCRIMINATOR_LENGTH &&
    USERNAME_DISCRIMINATOR_PATTERN.test(discriminator)
  );
}

export function validatePasswordLength(
  password: string
): PasswordLengthValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "password-too-short";
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return "password-too-long";
  }

  return "ok";
}

export function validatePasswordRequirements(password: string): boolean {
  return (
    PASSWORD_UPPERCASE_PATTERN.test(password) &&
    PASSWORD_LOWERCASE_PATTERN.test(password) &&
    PASSWORD_NUMBER_PATTERN.test(password) &&
    PASSWORD_SYMBOL_PATTERN.test(password)
  );
}

export function generateUsernameDiscriminator(): string {
  return randomInt(0, USERNAME_DISCRIMINATOR_SPACE)
    .toString()
    .padStart(USERNAME_DISCRIMINATOR_LENGTH, "0");
}
