import { Suspense } from "react";

import { Sidebar, SidebarSkeleton } from "@/components/sidebar";
import { api } from "@/lib/api";

async function SidebarData() {
  const projects = await api.projects();
  return <Sidebar projects={projects} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarData />
      </Suspense>
      <main className="w-full min-w-0 max-w-[960px] flex-1 px-4 pt-4 pb-12 md:px-9 md:pt-6 md:pb-16">{children}</main>
    </div>
  );
}
