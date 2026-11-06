import { Sidebar } from "@/components/sidebar";
import { api } from "@/lib/api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const projects = await api.projects();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar projects={projects} />
      <main className="w-full min-w-0 max-w-[960px] flex-1 px-4 pt-4 pb-12 md:px-9 md:pt-6 md:pb-16">{children}</main>
    </div>
  );
}
