import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  getSocialAuthProviderLabel,
  type HomeAuthForm,
  type SocialAuthProvider,
} from "@/lib/social-auth";
import { cn } from "@/lib/utils";

interface HomeSocialProviderButtonProps {
  provider: SocialAuthProvider;
  form: HomeAuthForm;
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
    >
      <path
        d="M21.8 12.23c0-.72-.06-1.24-.2-1.79H12v3.38h5.64c-.11.84-.7 2.11-2.02 2.96l-.02.11 2.9 2.2.2.02c1.86-1.68 2.94-4.15 2.94-6.88Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.08-.89 6.78-2.41l-3.08-2.33c-.83.56-1.95.95-3.7.95-2.71 0-5-1.75-5.82-4.16l-.1.01-3.01 2.29-.03.09A10.22 10.22 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.18 14.05A6.09 6.09 0 0 1 5.85 12c0-.71.12-1.39.32-2.05l-.01-.14-3.05-2.32-.1.05A9.9 9.9 0 0 0 2 12c0 1.59.39 3.1 1.1 4.46l3.08-2.4Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.79c2.2 0 3.69.93 4.54 1.71l3.31-3.17C17.07 1.83 14.75 1 12 1 8.04 1 4.62 3.23 3 6.54l3.16 2.4C7 6.54 9.29 5.79 12 5.79Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="currentColor"
    >
      <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.22.72-.5 0-.24-.01-1.03-.01-1.86-2.92.62-3.53-1.23-3.53-1.23-.48-1.2-1.16-1.51-1.16-1.51-.95-.64.07-.63.07-.63 1.05.07 1.6 1.05 1.6 1.05.93 1.56 2.43 1.11 3.02.85.1-.66.36-1.11.66-1.36-2.33-.26-4.78-1.14-4.78-5.07 0-1.12.41-2.03 1.08-2.75-.11-.27-.47-1.35.1-2.82 0 0 .88-.28 2.88 1.05a10.2 10.2 0 0 1 5.24 0c2-1.33 2.88-1.05 2.88-1.05.57 1.47.21 2.55.1 2.82.67.72 1.08 1.63 1.08 2.75 0 3.94-2.45 4.8-4.79 5.06.37.32.71.95.71 1.93 0 1.39-.01 2.5-.01 2.84 0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z" />
    </svg>
  );
}

function ProviderIcon({ provider }: { provider: SocialAuthProvider }) {
  return provider === "google" ? <GoogleIcon /> : <GitHubIcon />;
}

export function HomeSocialProviderButton({
  provider,
  form,
}: HomeSocialProviderButtonProps) {
  const label = getSocialAuthProviderLabel(provider);

  return (
    <Button
      asChild
      variant="outline"
      className={cn(
        "h-11 w-full justify-center rounded-xl border-border/70 bg-background/80 font-medium"
      )}
    >
      <Link href={`/api/auth/oauth/${provider}?form=${form}&returnTo=/projects`}>
        <ProviderIcon provider={provider} />
        Continue with {label}
      </Link>
    </Button>
  );
}
