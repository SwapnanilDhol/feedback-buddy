import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail } from "lucide-react";

import { CategoryTag } from "@/components/category-dot";
import { DeleteFeedbackButton } from "@/components/delete-feedback-button";
import { NoteForm } from "@/components/note-form";
import { BackLink, PageHeader } from "@/components/page-header";
import { RedeliverButton } from "@/components/redeliver-button";
import { StatusMenu } from "@/components/status-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api";
import { categoryLabels, relativeTime } from "@/lib/format";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; fid: string }> }): Promise<Metadata> {
  const { fid } = await params;
  try {
    const { feedback } = await api.feedback(fid);
    return { title: feedback.key };
  } catch {
    return { title: "Not found" };
  }
}

export default async function FeedbackPage({ params }: { params: Promise<{ id: string; fid: string }> }) {
  const { id, fid } = await params;
  const projectPromise = api.project(id).catch((error: unknown) => error);
  let data;
  try {
    data = await api.feedback(fid);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { feedback, deliveries } = data;
  if (feedback.project_id !== id) notFound();
  const projectResult = await projectPromise;
  if (projectResult instanceof Error) throw projectResult;
  const project = (projectResult as Awaited<ReturnType<typeof api.project>>).project;
  const mailto = feedback.reply_email
    ? `mailto:${encodeURIComponent(feedback.reply_email)}?subject=${encodeURIComponent(`Re: your ${project.name} feedback ${feedback.key}`)}`
    : null;
  const failed = deliveries.some((delivery) => delivery.status === "failed" || delivery.status === "exhausted");
  const deliveryTone = { delivered: "text-green-600 dark:text-green-400", pending: "text-amber-600 dark:text-amber-400", failed: "text-red-600 dark:text-red-400", exhausted: "text-red-600 dark:text-red-400" };

  return (
    <>
      <PageHeader
        crumb={<BackLink href={`/p/${project.id}`} label={`${project.name} inbox`} />}
        title={feedback.key}
        meta={`${categoryLabels[feedback.category]} · ${relativeTime(feedback.created_at)} · ${feedback.created_at.replace("T", " ").slice(0, 16)} UTC`}
      >
        <StatusMenu projectId={project.id} feedbackId={feedback.id} status={feedback.status} />
      </PageHeader>

      <Card className="mb-4 gap-0 py-0">
        <div className="px-5 py-4">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{feedback.message}</p>
          {feedback.attachment ? (
            <div className="mt-4">
              <a href={`/api/attachment/${feedback.id}`} target="_blank" rel="noopener" className="grid min-h-40 place-items-center overflow-hidden rounded-md bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied private image, no optimizer */}
                <img src={`/api/attachment/${feedback.id}`} alt="Attached image" className="block max-h-[440px] max-w-full" loading="lazy" />
              </a>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {feedback.attachment.content_type} · {Math.round(feedback.attachment.byte_count / 1024)} KB
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-2.5">
          <CategoryTag category={feedback.category} />
          <span className="text-xs text-muted-foreground">
            {feedback.user.account_status === "paid" ? "Paying customer" : feedback.user.account_status === "free" ? "Free user" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {mailto ? (
              <Button variant="outline" size="sm" asChild>
                <a href={mailto}>
                  <Mail /> Reply by email
                </a>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">No reply email</span>
            )}
            <DeleteFeedbackButton projectId={project.id} feedbackId={feedback.id} />
          </div>
        </div>
      </Card>

      <Card className="mb-4 grid gap-0 py-0 md:grid-cols-2">
        <div className="px-5 py-4">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Context</h3>
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px]">
            <Fact label="Version">
              {feedback.context.app_version} ({feedback.context.build_number})
            </Fact>
            <Fact label="Device">
              {feedback.context.device_family}
              {feedback.context.device_model ? ` · ${feedback.context.device_model}` : ""}
            </Fact>
            <Fact label="OS">{feedback.context.os_version}</Fact>
            <Fact label="Locale">{feedback.context.locale}</Fact>
          </dl>
        </div>
        <div className="border-t border-border px-5 py-4 md:border-t-0 md:border-l">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Person</h3>
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px]">
            <Fact label="Name">{feedback.name ?? "—"}</Fact>
            <Fact label="Email">{feedback.reply_email ?? "—"}</Fact>
            <Fact label="User ID">{feedback.user.id ? <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{feedback.user.id}</code> : "—"}</Fact>
            <Fact label="Account">
              {feedback.user.account_status}
              {feedback.user.plan ? ` · ${feedback.user.plan}` : ""}
            </Fact>
            <Fact label="Entitlements">{feedback.user.entitlements.length ? feedback.user.entitlements.join(", ") : "—"}</Fact>
            {Object.entries(feedback.user.attributes).map(([key, value]) => (
              <Fact key={key} label={key}>
                {value}
              </Fact>
            ))}
          </dl>
        </div>
      </Card>

      <Card className="mb-4 gap-0 py-0">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold">Internal note</div>
        <div className="px-5 py-4">
          <NoteForm projectId={project.id} feedbackId={feedback.id} note={feedback.internal_note ?? ""} />
        </div>
      </Card>

      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
          <span className="text-sm font-semibold">Deliveries</span>
          {failed ? <RedeliverButton projectId={project.id} feedbackId={feedback.id} /> : null}
        </div>
        {deliveries.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-muted-foreground">No destinations were configured when this arrived.</p>
        ) : (
          <ul>
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="flex items-center gap-3 border-t border-border px-5 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{delivery.destination_kind === "slack_webhook" ? "Slack" : delivery.destination_kind === "webhook" ? "Webhook" : delivery.destination_kind === "email" ? "Email" : "Removed destination"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}
                    {delivery.last_error ? ` · ${delivery.last_error}` : ""}
                  </div>
                </div>
                <span className={`text-xs ${deliveryTone[delivery.status]}`}>● {delivery.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        <Link href={`/p/${project.id}`} className="hover:text-foreground">
          ← Back to {project.name}
        </Link>
      </p>
    </>
  );
}
