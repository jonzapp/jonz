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

/** What a stream was asked for: the house, and the last change the app heard, if it says. */
interface Asked {
  houseId: string;
  after: number | undefined;
  requestId: string;
}

/** A house being listened to: what was heard before the stream opened, and the latest change it missed. */
interface Tuned {
  heard: LiveChange[];
  latest: number | null;
  stop: () => void;
  /** Where changes go from now on: the open stream. */
  to: (send: (change: LiveChange) => void) => void;
}

type Execute = Awaited<NonNullable<ReturnType<typeof v1Instance>>>["execute"];

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const requestId = newRequestId();
  const { houseId } = await params;
  const raw = request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after");
  const asked: Asked = { houseId, after: raw && /^\d{1,15}$/.test(raw) ? Number(raw) : undefined, requestId };

  const ready = v1Instance(process.env, V1_HANDLERS);
  if (!ready) return refused(request, problemResponse(notSetUpProblem(), { status: 503, requestId }));

  let tuned: Tuned;
  try {
    tuned = await tuneIn(request, asked, (await ready).execute);
  } catch (error) {
    return refused(request, problemResponse(asProblem(error), { requestId }));
  }

  return new Response(streamOf(request, asked, tuned), {
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

/**
 * Listens to the house, then asks what was missed (house_live, which also
 * says whether this person may listen): in that order, so nothing falls
 * between the two.
 */
async function tuneIn(request: Request, asked: Asked, execute: Execute): Promise<Tuned> {
  const { houseId, after, requestId } = asked;
  const heard: LiveChange[] = [];
  let send: ((change: LiveChange) => void) | null = null;
  const stop = await listen(houseId, (change) => (send ? send(change) : heard.push(change)));
  try {
    const result = await execute(
      "house_live",
      { authorization: request.headers.get("authorization"), client: request.headers.get("jonz-client"), requestId, via: "api" },
      { houseId, ...(after === undefined ? {} : { after }) },
    );
    const latest = (result.body as { latest: number | null }).latest;
    return { heard, latest, stop, to: (next) => (send = next) };
  } catch (error) {
    stop();
    throw error;
  }
}

/** The stream itself: what was missed, then each change as it's heard, a ping now and then, until its time is up. */
function streamOf(request: Request, asked: Asked, tuned: Tuned): ReadableStream<Uint8Array> {
  const { houseId, after } = asked;
  const { latest, stop } = tuned;
  let ping: ReturnType<typeof setInterval> | undefined;
  let end: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<Uint8Array>({
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
      const send = (change: LiveChange) => {
        if (!open || change.id <= last) return;
        last = change.id;
        controller.enqueue(changeEvent(change.id));
      };
      tuned.to(send);
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      // Missed while away: one change says so. A first stream hears nothing it already read.
      if (after !== undefined && latest !== null) send({ house: houseId, id: latest });
      else if (latest !== null) last = Math.max(last, latest);
      for (const change of tuned.heard.splice(0)) send(change);
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
}
