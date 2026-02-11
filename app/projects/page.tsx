import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectsPage() {
  return (
    <main className="container py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Badge variant="secondary" className="w-fit">
          Project space
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <Card>
          <CardHeader>
            <CardTitle>Ready for TASK-002 and beyond</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Project CRUD implementation is the next milestone. This route is now
              wired so the landing page CTA is functional.
            </p>
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
