import type { Metadata } from "next";

import { AgentOnboardingGuide } from "@/components/agent-onboarding/agent-onboarding-guide";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "NexusDash Agent API v1",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AgentApiDocsPage() {
  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          Agent API v1
        </Badge>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            NexusDash agent onboarding
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Hosted docs for the stable, project-scoped API surface used by external agents.
          </p>
        </div>

        <AgentOnboardingGuide />
      </div>
    </main>
  );
}
