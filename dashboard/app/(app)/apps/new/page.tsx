import type { Metadata } from "next";

import { NewAppForm } from "@/components/new-app-form";
import { BackLink, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "New app" };

export default function NewAppPage() {
  return (
    <>
      <PageHeader crumb={<BackLink href="/" label="Overview" />} title="New app" meta="One project per app. You get a public key to paste into the app." />
      <NewAppForm />
    </>
  );
}
