import { requireSessionUserIdFromServer } from "@/lib/auth/server-guard";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSessionUserIdFromServer();

  return children;
}
