import "server-only";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

// Live updates through our own server (docs/specs/api.md, C3). Each change
// to what a house's screens show is sent on one of a few private Realtime
// Broadcast channels (migration live_changes: `live:0` … `live:15`). Only the
// API listens, on the service role, which those channels let in and nobody
// else: one connection per instance, carrying every house, passed to the
// streams this instance has open for that house.

/** How many channels houses are spread across (public.live_topic). */
const LIVE_SHARDS = 16;

export interface LiveChange {
  house: string;
  id: number;
}

type Listener = (change: LiveChange) => void;

const listeners = new Map<string, Set<Listener>>();
let ready: Promise<void> | null = null;
let client: SupabaseClient | null = null;
let channels: RealtimeChannel[] = [];

function deliver(payload: unknown) {
  const change = payload as Partial<LiveChange> | null;
  if (!change || typeof change.house !== "string" || typeof change.id !== "number") return;
  for (const listener of listeners.get(change.house) ?? []) listener({ house: change.house, id: change.id });
}

/** Subscribes this instance to every shard, once; a dropped connection subscribes again on the next stream. */
function connect(): Promise<void> {
  ready ??= (async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Live updates need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // A legacy service-role key is a JWT, which Realtime reads as the
    // connection's token. A new secret key ("sb_secret_…") isn't: handed to
    // setAuth, Realtime lets the private channels subscribe but never
    // delivers to them, so it rides as the apikey alone (checked against the
    // local stack, 2026-11-10).
    if (!key.startsWith("sb_")) await client.realtime.setAuth(key);
    channels = await Promise.all(
      Array.from(
        { length: LIVE_SHARDS },
        (_, shard) =>
          new Promise<RealtimeChannel>((resolve, reject) => {
            const channel = client!
              .channel(`live:${shard}`, { config: { private: true } })
              .on("broadcast", { event: "change" }, ({ payload }) => deliver(payload));
            channel.subscribe((status, error) => {
              if (status === "SUBSCRIBED") resolve(channel);
              else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                ready = null;
                reject(error ?? new Error(`live:${shard} ${status}`));
              } else if (status === "CLOSED") ready = null;
            });
          }),
      ),
    );
  })();
  ready.catch(() => {
    ready = null;
    void close();
  });
  return ready;
}

async function close() {
  const old = client;
  const gone = channels;
  client = null;
  channels = [];
  if (old) await Promise.all(gone.map((channel) => old.removeChannel(channel)));
}

/** Hears each change to `house` until the returned function is called. Resolves once this instance is listening. */
export async function listen(house: string, listener: Listener): Promise<() => void> {
  let set = listeners.get(house);
  if (!set) listeners.set(house, (set = new Set()));
  set.add(listener);
  const stop = () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(house);
  };
  try {
    await connect();
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}

/** For tests: hand a change to this instance's streams as Realtime would. */
export const deliverForTest = deliver;
