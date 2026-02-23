import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSessionUserIdFromServer();

  return children;
}
