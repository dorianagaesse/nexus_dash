"use client";

import { useEffect, useState } from "react";
import {
  BookOpenText,
  Bot,
  Globe,
  KeyRound,
  Layers3,
  ShieldCheck,
} from "lucide-react";

import { AGENT_SCOPE_DEFINITIONS } from "@/lib/agent-access";
import {
  AGENT_API_ENDPOINTS,
  AGENT_BASE_URL_PLACEHOLDER,
  AGENT_LIMITATIONS,
  buildAgentDocumentationUrls,
  buildAgentProjectEnvBlock,
  buildAgentAttachmentUploadExample,
  buildAgentContextUpdateExample,
  buildAgentTokenExchangeExample,
  buildAgentProjectReadExample,
  buildAgentSmokeTestExample,
  buildAgentTaskArchiveExample,
  buildAgentTaskCreateExample,
  buildAgentTaskReorderExample,
  buildAgentTaskUpdateExample,
  buildAgentContextCreateExample,
} from "@/lib/agent-onboarding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AgentOnboardingGuideProps {
  initialAppOrigin?: string | null;
}

function buildMethodTone(method: string): string {
  switch (method) {
    case "GET":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200";
    case "POST":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
    case "PATCH":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200";
    case "DELETE":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "";
  }
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border/70 bg-slate-950 px-4 py-3 text-xs leading-6 text-slate-50">
      <code>{value}</code>
    </pre>
  );
}

export function AgentOnboardingGuide({
  initialAppOrigin = AGENT_BASE_URL_PLACEHOLDER,
}: AgentOnboardingGuideProps) {
  const [runtimeAppOrigin, setRuntimeAppOrigin] = useState(initialAppOrigin);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setRuntimeAppOrigin(window.location.origin);
  }, []);

  const docsLinks = buildAgentDocumentationUrls(runtimeAppOrigin);
  const envBlock = buildAgentProjectEnvBlock({
    appOrigin: runtimeAppOrigin,
  });
  const tokenExchangeExample = buildAgentTokenExchangeExample(runtimeAppOrigin);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Provision per project</CardTitle>
            </div>
            <CardDescription>
              Create credentials from Project Settings &gt; Agent access. Each credential stays
              scoped to one project and one explicit scope set.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-border/60 bg-card/70">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Exchange before calling</CardTitle>
            </div>
            <CardDescription>
              Agents do not use browser login. They exchange the one-time API key for a
              short-lived bearer token at <code>/api/auth/agent/token</code>.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-border/60 bg-card/70">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Call only the stable surface</CardTitle>
            </div>
            <CardDescription>
              This v1 guide covers the supported agent routes only: project read, task routes,
              context-card routes, and the documented attachment upload flow already validated in
              preview-like environments.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border/60 bg-background/70">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BookOpenText className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-xl">Quickstart environment</CardTitle>
              </div>
              <CardDescription>
                Give external agents a small, explicit bootstrap block instead of making users
                clone the repository.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-full px-4">
                <a href={docsLinks.docsUrl}>Rendered docs</a>
              </Button>
              <Button asChild variant="outline" className="rounded-full px-4">
                <a href={docsLinks.openApiUrl}>OpenAPI JSON</a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock value={envBlock} />
          <p className="text-xs text-muted-foreground">
            Replace <code>NEXUSDASH_PROJECT_ID</code> and <code>NEXUSDASH_API_KEY</code> with
            project-specific values copied from the owner-facing agent access panel.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="border-border/60 bg-background/70">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-xl">Authentication flow</CardTitle>
            </div>
            <CardDescription>
              Exchange once per runtime session, then send the bearer token on each project,
              task, or context-card request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Owner creates a project-scoped credential.</p>
              <p>2. Agent receives the one-time raw API key out of band.</p>
              <p>3. Agent exchanges that key for a short-lived bearer token.</p>
              <p>4. Agent sends bearer auth on the scoped project routes.</p>
              <p>5. Binary files use the direct-upload attachment routes instead of inline HTML.</p>
            </div>
            <CodeBlock value={tokenExchangeExample} />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-xl">Scope model</CardTitle>
            </div>
            <CardDescription>
              Keep credentials narrow. Delete scopes stay separate from read and write.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {AGENT_SCOPE_DEFINITIONS.map((definition) => (
              <div
                key={definition.scope}
                className="rounded-xl border border-border/60 bg-card/70 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{definition.label}</p>
                  <Badge variant="outline" className="rounded-full">
                    {definition.scope}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {definition.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-background/70">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">Supported endpoints</CardTitle>
          <CardDescription>
            Only these routes are documented as stable for agent callers in v1.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {AGENT_API_ENDPOINTS.map((endpoint) => (
            <div
              key={`${endpoint.method}-${endpoint.path}`}
              className="rounded-xl border border-border/60 bg-card/70 px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className={buildMethodTone(endpoint.method)}>
                      {endpoint.method}
                    </Badge>
                    <p className="text-sm font-medium">{endpoint.title}</p>
                    <Badge variant="outline" className="rounded-full">
                      {endpoint.tag}
                    </Badge>
                    {endpoint.requestContentType ? (
                      <Badge variant="outline" className="rounded-full">
                        {endpoint.requestContentType}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <code>{endpoint.path}</code>
                  </p>
                  <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {endpoint.requiredScopes.length === 0 ? (
                    <Badge variant="outline" className="rounded-full">
                      Token exchange
                    </Badge>
                  ) : (
                    endpoint.requiredScopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="rounded-full">
                        {scope}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              {endpoint.notes?.length ? (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {endpoint.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle className="text-xl">Read example</CardTitle>
            <CardDescription>
              Once you hold a bearer token, use it against the project-scoped read routes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock value={buildAgentProjectReadExample()} />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle className="text-xl">Create examples</CardTitle>
            <CardDescription>
              Use <code>application/json</code> for agent-first write flows unless you are
              intentionally using a browser-oriented multipart form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CodeBlock value={buildAgentTaskCreateExample()} />
            <CodeBlock value={buildAgentContextCreateExample()} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle className="text-xl">Update and lifecycle examples</CardTitle>
            <CardDescription>
              Task status changes happen through reorder, not task patch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CodeBlock value={buildAgentTaskUpdateExample()} />
            <CodeBlock value={buildAgentTaskReorderExample()} />
            <CodeBlock value={buildAgentTaskArchiveExample()} />
            <CodeBlock value={buildAgentContextUpdateExample()} />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle className="text-xl">Binary upload example</CardTitle>
            <CardDescription>
              Images and other binary files use the signed direct-upload flow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock value={buildAgentAttachmentUploadExample()} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle className="text-xl">Agent limitations</CardTitle>
            <CardDescription>
              These sharp edges are intentional v1 boundaries, not hidden behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {AGENT_LIMITATIONS.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle className="text-xl">Copy-paste smoke test</CardTitle>
            <CardDescription>
              Use this as a first validation pass in a fresh external agent runtime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock value={buildAgentSmokeTestExample()} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
