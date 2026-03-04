export const USERNAME_DISCRIMINATOR_LENGTH = 4;
export const USERNAME_DISCRIMINATOR_SPACE = 10 ** USERNAME_DISCRIMINATOR_LENGTH;

const USERNAME_DISCRIMINATOR_PATTERN = /^\d+$/;

export function isUsernameDiscriminator(
  discriminator: string | null | undefined
): discriminator is string {
  return (
    typeof discriminator === "string" &&
    discriminator.length === USERNAME_DISCRIMINATOR_LENGTH &&
    USERNAME_DISCRIMINATOR_PATTERN.test(discriminator)
  );
}
