import { Prisma } from "@prisma/client";
import type { ContentDomain, VersionedContent } from "@/lib/content-revision";

/** Call after project authorization, inside the same transaction as the edit. */
export async function lockContentRevision(input: {
  db: Prisma.TransactionClient;
  domain: ContentDomain;
  projectId: string;
  id: string;
  expectedRevision?: number;
}): Promise<"matched" | "conflict" | "missing"> {
  if (input.expectedRevision === undefined) return "matched";
  const table = input.domain === "task" ? Prisma.sql`"Task"`
    : input.domain === "meeting-note" ? Prisma.sql`"ProjectMeetingNote"`
      : Prisma.sql`"Resource"`;
  const type = input.domain === "context-card" ? Prisma.sql`AND "type" = 'context-card'` : Prisma.empty;
  const rows = await input.db.$queryRaw<{ contentRevision: number }[]>(Prisma.sql`
    SELECT "contentRevision" FROM ${table}
    WHERE "id" = ${input.id} AND "projectId" = ${input.projectId} ${type}
    FOR UPDATE
  `);
  if (!rows.length) return "missing";
  return rows[0].contentRevision === input.expectedRevision ? "matched" : "conflict";
}

export function editConflict<T extends VersionedContent>(current: T) {
  return { ok: false as const, status: 412, error: "edit-conflict", current };
}
