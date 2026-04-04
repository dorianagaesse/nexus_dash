import { headers } from "next/headers";

import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";
import { AgentOnboardingGuide } from "@/components/agent-onboarding/agent-onboarding-guide";
import { AccountSettingsShell } from "@/components/account/account-settings-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveRequestOriginFromHeaders } from "@/lib/http/request-origin";

export default async function AccountDeveloperSettingsPage() {
  await requireSessionUserIdFromServer();
  const requestOrigin = resolveRequestOriginFromHeaders(await headers());

  return (
    <AccountSettingsShell
      activeTab="developers"
      title="Developer onboarding"
      description="Use hosted docs and project-scoped credentials to connect external agents to NexusDash."
    >
      <Card className="border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle className="text-xl">Where credentials live</CardTitle>
          <CardDescription>
            Account settings teaches the model, while each project still owns the actual
            credential lifecycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Open any project as an owner.</p>
          <p>2. Go to Project settings &gt; Agent access.</p>
          <p>3. Create a credential, copy the one-time key, and place it in your agent runtime.</p>
        </CardContent>
      </Card>

      <AgentOnboardingGuide initialAppOrigin={requestOrigin} />
    </AccountSettingsShell>
  );
}
