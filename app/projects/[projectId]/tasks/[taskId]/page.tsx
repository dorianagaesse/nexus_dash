import { redirect } from "next/navigation";

export default async function ProjectTaskRedirectPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;

  redirect(
    `/projects/${encodeURIComponent(projectId)}?taskId=${encodeURIComponent(
      taskId
    )}`
  );
}
