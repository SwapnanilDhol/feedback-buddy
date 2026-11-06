import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";
import { passkeysOrEmpty } from "@/lib/api";
import { relyingParty } from "@/lib/auth-helpers";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; password?: string }> }) {
  const params = await searchParams;
  let hasPasskeys = false;
  try {
    hasPasskeys = (await passkeysOrEmpty((await relyingParty()).rp_id)).length > 0;
  } catch {
    hasPasskeys = false;
  }
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-[340px]">
        <div className="mb-4 text-[15px] font-semibold">FeedbackBuddy</div>
        <LoginForm hasPasskeys={hasPasskeys} showPassword={!hasPasskeys || params.password === "1"} next={params.next ?? "/"} />
      </div>
    </main>
  );
}
