"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AtSign,
  BookOpenText,
  Bot,
  Globe,
  KeyRound,
  Layers3,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { AGENT_SCOPE_DEFINITIONS } from "@/lib/agent-access";
import {
  AGENT_API_ENDPOINTS,
  AGENT_BASE_URL_PLACEHOLDER,
  AGENT_LIMITATIONS,
  buildAgentDocumentationUrls,
  buildAgentAttentionExample,
  buildAgentProjectEnvBlock,
  buildAgentAttachmentUploadExample,
  buildAgentContextAttachmentUploadExample,
  buildAgentContextUpdateExample,
  buildAgentTokenExchangeExample,
  buildAgentProjectReadExample,
  buildAgentRoadmapCreateExample,
  buildAgentSmokeTestExample,
  buildAgentTaskArchiveExample,
  buildAgentTaskCommentExample,
  buildAgentTaskCreateExample,
  buildAgentTaskReorderExample,
  buildAgentTaskUpdateExample,
  buildAgentContextCreateExample,
} from "@/lib/agent-onboarding";
import { AgentOnboardingSection } from "@/components/agent-onboarding/agent-onboarding-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AgentOnboardingGuideProps {
  initialAppOrigin?: string | null;
  collapsible?: boolean;
}

interface AgentGuideSection {
  title: string;
  description: ReactNode;
  icon?: LucideIcon;
  content: ReactNode;
  contentClassName?: string;
}

const introItems: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
  description: ReactNode;
}> = [
  {
    icon: Bot,
    title: "Provision per project",
    description:
      "Create credentials from Project Settings > Agent access. Each credential stays scoped to one project and one explicit scope set.",
  },
  {
    icon: KeyRound,
    title: "Exchange before calling",
    description: (
      <>
        Agents do not use browser login. They exchange the one-time API key for a short-lived
        bearer token at <code>/api/auth/agent/token</code>.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Call only the stable surface",
    description:
      "This v1 guide covers the supported agent routes only: project read, epics, roadmap phases and events, task routes, context-card routes, attention reads for your own mentions and assignments, and the documented attachment upload flow already validated in preview-like environments.",
  },
];

const guideSectionOrder = [
  "quickstart",
  "authenticationFlow",
  "scopeModel",
  "endpoints",
  "attention",
  "readExample",
  "createExamples",
  "updateLifecycleExamples",
  "binaryUploadExamples",
  "limitations",
  "smokeTest",
] as const;

type GuideSectionId = (typeof guideSectionOrder)[number];

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
    <pre className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-border/70 bg-slate-950 px-3 py-3 text-[11px] leading-6 text-slate-50 sm:px-4 sm:text-xs">
      <code className="block min-w-max">{value}</code>
    </pre>
  );
}

function buildGuideSections({
  docsLinks,
  envBlock,
  tokenExchangeExample,
}: {
  docsLinks: ReturnType<typeof buildAgentDocumentationUrls>;
  envBlock: string;
  tokenExchangeExample: string;
}): Record<GuideSectionId, AgentGuideSection> {
  const documentationActions = (
    <>
      <Button asChild variant="outline" className="rounded-full px-4">
        <a href={docsLinks.docsUrl}>Rendered docs</a>
      </Button>
      <Button asChild variant="outline" className="rounded-full px-4">
        <a href={docsLinks.openApiUrl}>OpenAPI JSON</a>
      </Button>
    </>
  );

  return {
    quickstart: {
      title: "Quickstart environment",
      icon: BookOpenText,
      description:
        "Give external agents a small, explicit bootstrap block instead of making users clone the repository.",
      contentClassName: "space-y-3",
      content: (
        <>
          <div className="flex flex-wrap gap-2">{documentationActions}</div>
          <CodeBlock value={envBlock} />
          <p className="text-xs text-muted-foreground">
            Replace <code>NEXUSDASH_PROJECT_ID</code> and <code>NEXUSDASH_API_KEY</code> with
            project-specific values copied from the owner-facing agent access panel.
          </p>
        </>
      ),
    },
    authenticationFlow: {
      title: "Authentication flow",
      icon: Globe,
      description:
        "Exchange once per runtime session, then send the bearer token on each project, roadmap, task, context-card, or attention request.",
      contentClassName: "space-y-4",
      content: (
        <>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>1. Owner creates a project-scoped credential.</p>
            <p>2. Agent receives the one-time raw API key out of band.</p>
            <p>3. Agent exchanges that key for a short-lived bearer token.</p>
            <p>4. Agent sends bearer auth on the scoped project routes.</p>
            <p>5. Binary files use the direct-upload attachment routes instead of inline HTML.</p>
          </div>
          <CodeBlock value={tokenExchangeExample} />
        </>
      ),
    },
    scopeModel: {
      title: "Scope model",
      icon: Layers3,
      description:
        "Keep credentials narrow. Delete scopes stay separate from read and write. The project credential form offers one-click presets; the recommended preset grants read + write without any delete scope.",
      contentClassName: "grid gap-3",
      content: (
        <>
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
              <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
            </div>
          ))}
        </>
      ),
    },
    endpoints: {
      title: "Supported endpoints",
      description: "Only these routes are documented as stable for agent callers in v1.",
      contentClassName: "grid gap-3",
      content: (
        <>
          {AGENT_API_ENDPOINTS.map((endpoint) => (
            <div
              key={`${endpoint.method}-${endpoint.path}`}
              className="min-w-0 rounded-xl border border-border/60 bg-card/70 px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
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
                    <code className="break-all [overflow-wrap:anywhere]">{endpoint.path}</code>
                  </p>
                  <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
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
        </>
      ),
    },
    attention: {
      title: "Attention discovery",
      icon: AtSign,
      description:
        "Discover when you are mentioned or assigned with the attention:read scope. Both routes return only the calling credential's own events.",
      contentClassName: "space-y-4",
      content: (
        <>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              1. List mentions and assignments; filter with eventType, artifactType,
              state (assignments only), since/until, limit, order, and cursor.
            </p>
            <p>
              2. Poll incrementally: keep the newest occurredAt you have seen, pass it as
              since=, page through nextCursor with the same order, and deduplicate by the
              stable item id across overlapping windows.
            </p>
            <p>
              3. Follow each item&apos;s source reference (taskId, comment id, meeting note
              id) — those reads need task:read on top of attention:read — and re-check
              currentState so you do not act on archived or completed work.
            </p>
            <p>
              4. Handle revocation: a 401 re-exchanges the API key once; if the exchange
              fails, the credential was revoked, expired, or rotated — stop and ask the
              owner for a new key.
            </p>
          </div>
          <CodeBlock value={buildAgentAttentionExample()} />
        </>
      ),
    },
    readExample: {
      title: "Read example",
      description:
        "Once you hold a bearer token, use it against the project-scoped read routes.",
      content: <CodeBlock value={buildAgentProjectReadExample()} />,
    },
    createExamples: {
      title: "Create examples",
      description: (
        <>
          Use <code>application/json</code> for agent-first write flows unless you are
          intentionally using a browser-oriented multipart form.
        </>
      ),
      contentClassName: "space-y-4",
      content: (
        <>
          <CodeBlock value={buildAgentTaskCreateExample()} />
          <CodeBlock value={buildAgentRoadmapCreateExample()} />
          <CodeBlock value={buildAgentContextCreateExample()} />
        </>
      ),
    },
    updateLifecycleExamples: {
      title: "Update and lifecycle examples",
      description: "Task status changes happen through reorder, not task patch.",
      contentClassName: "space-y-4",
      content: (
        <>
          <CodeBlock value={buildAgentTaskUpdateExample()} />
          <CodeBlock value={buildAgentTaskCommentExample()} />
          <CodeBlock value={buildAgentTaskReorderExample()} />
          <CodeBlock value={buildAgentTaskArchiveExample()} />
          <CodeBlock value={buildAgentContextUpdateExample()} />
        </>
      ),
    },
    binaryUploadExamples: {
      title: "Binary upload examples",
      description:
        "Tasks and context cards both use the signed direct-upload flow for images and other binary files.",
      contentClassName: "space-y-4",
      content: (
        <>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Task attachment
            </p>
            <CodeBlock value={buildAgentAttachmentUploadExample()} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Context-card attachment
            </p>
            <CodeBlock value={buildAgentContextAttachmentUploadExample()} />
          </div>
        </>
      ),
    },
    limitations: {
      title: "Agent limitations",
      description: "These sharp edges are intentional v1 boundaries, not hidden behavior.",
      contentClassName: "space-y-2 text-sm text-muted-foreground",
      content: (
        <>
          {AGENT_LIMITATIONS.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </>
      ),
    },
    smokeTest: {
      title: "Copy-paste smoke test",
      description: "Use this as a first validation pass in a fresh external agent runtime.",
      content: <CodeBlock value={buildAgentSmokeTestExample()} />,
    },
  };
}

function FlatGuideSectionCard({ section }: { section: AgentGuideSection }) {
  const { title, description, icon: Icon, content, contentClassName } = section;

  return (
    <Card className="min-w-0 border-border/60 bg-background/70">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
          <CardTitle className="text-xl">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={contentClassName}>{content}</CardContent>
    </Card>
  );
}

export function AgentOnboardingGuide({
  initialAppOrigin = AGENT_BASE_URL_PLACEHOLDER,
  collapsible = false,
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
  const sections = buildGuideSections({ docsLinks, envBlock, tokenExchangeExample });

  if (collapsible) {
    return (
      <div className="space-y-6">
        <AgentOnboardingSection title="How agent access works" icon={Bot}>
          <div className="grid gap-3">
            {introItems.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-xl border border-border/60 bg-card/70 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm font-medium">{title}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </AgentOnboardingSection>

        {guideSectionOrder.map((id) => {
          const section = sections[id];

          return (
            <AgentOnboardingSection
              key={id}
              title={section.title}
              description={section.description}
              icon={section.icon}
              contentClassName={section.contentClassName}
            >
              {section.content}
            </AgentOnboardingSection>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {introItems.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="min-w-0 border-border/60 bg-card/70">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{title}</CardTitle>
              </div>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <FlatGuideSectionCard section={sections.quickstart} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <FlatGuideSectionCard section={sections.authenticationFlow} />
        <FlatGuideSectionCard section={sections.scopeModel} />
      </div>

      <FlatGuideSectionCard section={sections.endpoints} />

      <FlatGuideSectionCard section={sections.attention} />

      <div className="grid gap-6 xl:grid-cols-2">
        <FlatGuideSectionCard section={sections.readExample} />
        <FlatGuideSectionCard section={sections.createExamples} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <FlatGuideSectionCard section={sections.updateLifecycleExamples} />
        <FlatGuideSectionCard section={sections.binaryUploadExamples} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <FlatGuideSectionCard section={sections.limitations} />
        <FlatGuideSectionCard section={sections.smokeTest} />
      </div>
    </div>
  );
}
