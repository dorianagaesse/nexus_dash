import { ArrowRight, CalendarDays, LayoutGrid, KanbanSquare } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const highlights = [
  {
    title: "Project Hub",
    description: "Centralize projects with focused dashboards and quick access.",
    icon: LayoutGrid,
  },
  {
    title: "Kanban Flow",
    description: "Track work across Backlog, In Progress, Blocked, and Done.",
    icon: KanbanSquare,
  },
  {
    title: "Calendar Sync",
    description: "Surface upcoming meetings from your Google Calendar.",
    icon: CalendarDays,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container flex min-h-screen flex-col justify-center gap-10 py-16">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">Dark mode ready</Badge>
            <Badge variant="outline">Prisma + SQLite</Badge>
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              NexusDash is your focused command center for personal projects.
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
              Build momentum with a single workspace for projects, Kanban tasks,
              technical resources, and calendar awareness.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/projects">
                Start a new project
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="secondary">View setup checklist</Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <Card key={item.title}>
              <CardHeader className="space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <item.icon className="h-5 w-5 text-foreground" />
                </div>
                <CardTitle className="text-xl">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
