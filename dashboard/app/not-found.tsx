import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">That page or feedback item does not exist.</p>
        <Link href="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to overview
        </Link>
      </div>
    </main>
  );
}
