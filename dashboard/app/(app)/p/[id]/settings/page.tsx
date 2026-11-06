import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppIcon } from "@/components/app-icon";
import { CopyButton } from "@/components/copy-button";
import { BackLink, PageHeader } from "@/components/page-header";
import { DestinationsPanel } from "@/components/settings-destinations";
import { KeysPanel } from "@/components/settings-keys";
import { ProjectForm } from "@/components/settings-project";
import { Card } from "@/components/ui/card";
import { ApiError, SDK_DEFAULT_ENDPOINT, api, apiBaseUrl } from "@/lib/api";
import { swiftSnippet } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const { project } = await api.project(id);
    return { title: `${project.name} settings` };
  } catch {
    return { title: "Not found" };
  }
}

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await api.project(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { project, keys, destinations } = data;
  const activePrefix = keys.find((key) => !key.revoked_at)?.prefix ?? "fb_pub_";
  const snippet = swiftSnippet(`${activePrefix}…`, apiBaseUrl(), SDK_DEFAULT_ENDPOINT);

  return (
    <>
      <PageHeader crumb={<BackLink href={`/p/${project.id}`} label={`${project.name} inbox`} />} title={`${project.name} settings`} meta={project.bundle_id ?? project.slug} icon={<AppIcon project={project} size="xl" />} />

      <Card className="mb-4 gap-0 py-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
          <span className="text-sm font-semibold">Integrate</span>
          <CopyButton text={snippet} label="Copy" />
        </div>
        <div className="px-5 py-4">
          <p className="mb-2.5 text-[13px] text-muted-foreground">
            Add the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">FeedbackBuddy</code> Swift package, then:
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono text-xs leading-relaxed">{snippet}</pre>
          <p className="mt-2 text-xs text-muted-foreground">The key is abbreviated; use the full key from when it was created, or create a new one below.</p>
        </div>
      </Card>

      <KeysPanel projectId={project.id} keys={keys} />
      <DestinationsPanel projectId={project.id} destinations={destinations} />
      <ProjectForm project={project} />
    </>
  );
}
