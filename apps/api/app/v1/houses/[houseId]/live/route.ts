import { corsFor } from "@app/core";
import { asProblem, newRequestId, notSetUpProblem, problemResponse } from "@app/server";
import { v1Instance } from "v1";

import { env } from "@/lib/env";
import { listen, type LiveChange } from "@/lib/live";
import { V1_HANDLERS } from "@/lib/v1/handlers";

/**
 * `GET /v1/houses/{houseId}/live`: the house's changes as they happen, as
 * server-sent events (docs/specs/api.md, C3). Each `change` event says only
 * that the house changed, with its id; the app reads the house again through
 * /v1. A stream lasts until just before the function's time limit; the app
 * opens the next with `Last-Event-ID`, and hears at once if it missed
 * anything in between. Who may listen is house_live's to say: a member.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** How long one stream stays open, a little inside maxDuration. */
export const STREAM_MS = 280_000;
/** A comment now and then, so nothing between closes a quiet stream. */
const PING_MS = 20_000;

type Params = { params: Promise<{ houseId: string }> };

const encoder = new TextEncoder();
const changeEvent = (id: number) => encoder.encode(`id: ${id}\nevent: change\ndata: {}\n\n`);

/** Staging's site and its previews call their API from another origin. */
function cors(request: Request): Record<string, string> {
  return corsFor(request.headers.get("origin"), env.allowedOrigins(), { methods: "GET, OPTIONS", headers: "Authorization, Last-Event-ID, Jonz-Client", expose: "request-id" });
}

export const OPTIONS = (request: Request) => new Response(null, { status: 204, headers: cors(request) });

/** A refusal, with the CORS headers a browser needs to read it. */
function refused(request: Request, response: Response): Response {
  for (const [key, value] of Object.entries(cors(request))) response.headers.set(key, value);
  return response;
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const requestId = newRequestId();
  const { houseId } = await params;
  const raw = request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after");
  const after = raw && /^\d{1,15}$/.test(raw) ? Number(raw) : undefined;

  const ready = v1Instance(process.env, V1_HANDLERS);
  if (!ready) return refused(request, problemResponse(notSetUpProblem(), { status: 503, requestId }));

  // Listen before asking what was missed, so nothing falls between the two.
  const heard: LiveChange[] = [];
  let send: ((change: LiveChange) => void) | null = null;
  let stop: () => void = () => {};
  let latest: number | null;
  try {
    const { execute } = await ready;
    stop = await listen(houseId, (change) => (send ? send(change) : heard.push(change)));
    const result = await execute(
      "house_live",
      { authorization: request.headers.get("authorization"), client: request.headers.get("jonz-client"), requestId, via: "api" },
      { houseId, ...(after === undefined ? {} : { after }) },
    );
    latest = (result.body as { latest: number | null }).latest;
  } catch (error) {
    stop();
    return refused(request, problemResponse(asProblem(error), { requestId }));
  }

  let ping: ReturnType<typeof setInterval> | undefined;
  let end: ReturnType<typeof setTimeout> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let last = after ?? 0;
      let open = true;
      const finish = () => {
        if (!open) return;
        open = false;
        clearInterval(ping);
        clearTimeout(end);
        stop();
        try {
          controller.close();
        } catch {
          // Already closed by the other side.
        }
      };
      send = (change) => {
        if (!open || change.id <= last) return;
        last = change.id;
        controller.enqueue(changeEvent(change.id));
      };
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      // Missed while away: one change says so. A first stream hears nothing it already read.
      if (after !== undefined && latest !== null) send({ house: houseId, id: latest });
      else if (latest !== null) last = Math.max(last, latest);
      for (const change of heard.splice(0)) send(change);
      ping = setInterval(() => open && controller.enqueue(encoder.encode(": ping\n\n")), PING_MS);
      end = setTimeout(finish, STREAM_MS);
      request.signal.addEventListener("abort", finish);
    },
    cancel() {
      clearInterval(ping);
      clearTimeout(end);
      stop();
    },
  });

  return new Response(body, {
    headers: {
      ...cors(request),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "request-id": requestId,
    },
  });
}
