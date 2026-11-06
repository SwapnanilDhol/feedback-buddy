import { ApiError, api } from "@/lib/api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Streams a feedback image through the dashboard so the browser never needs the admin token. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) return new Response("Not found", { status: 404 });
  try {
    const upstream = await api.attachment(id);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return new Response("Not found", { status: error instanceof ApiError ? error.status : 502 });
  }
}
