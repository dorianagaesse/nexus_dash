import { AuthenticatedAppShell } from "@/components/authenticated-app-shell";

export const dynamic = "force-dynamic";

export default async function TodosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
