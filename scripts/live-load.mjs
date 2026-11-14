#!/usr/bin/env node
// Many screens on the API's live stream at once (docs/specs/api.md, C3: "A
// load test checks many open streams"). The latency check
// (scripts/live-latency.mjs) times one screen; this one opens STREAMS of
// them on staging and keeps them open past the point where the server ends
// every stream (280 s), so they all open again together with Last-Event-ID.
//
// Staging has one house with people we can sign in as, so every stream is
// the demo house's, shared among its four housemates. Sam ticks one of his
// Johns and takes it back every TICK_MS; one Supabase Realtime listener
// hears the same ticks, as today's yardstick. It passes when every stream
// opens, every tick reaches every stream, and the streams' median and 95th
// percentile are within 100 ms of Realtime's. Sam's John is left as it was
// found.
//
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… API_URL=https://api.staging.jonz.app \
//   DEMO_PASSWORD=… [STREAMS=200] [HOLD_S=330] node scripts/live-load.mjs
//
// The Staging workflow's "Load-test live updates" runs it with staging's values.
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { API, CLIENT, quantile, samsJohnIn, signIn, sleep, v1 } from "./live/demo.mjs";

const STREAMS = Number(process.env.STREAMS ?? 200);
/** How long the streams stay open: past one server end (280 s), so they all open again. */
const HOLD_MS = Number(process.env.HOLD_S ?? 330) * 1_000;
/** Streams open over this long, not all in the same instant. */
const RAMP_MS = 20_000;
const TICK_MS = 4_000;
/** A tick not heard by then is missed. */
const WAIT_MS = 10_000;
/** The gap the streams may be behind Realtime (ms). */
const WITHIN = 100;

const people = await Promise.all(
  ["alex", "sam", "priya", "jo"].map((name) => signIn(`${name}@demo.jonz.app`)),
);
const [alex, sam] = people;
const { houseId, john } = await samsJohnIn(alex, sam);
const wasDone = Boolean(john.doneAt);
console.log(
  `House ${houseId}, Sam's John ${john.id}. ${STREAMS} streams for ${HOLD_MS / 1000} s, a tick every ${TICK_MS / 1000} s.`,
);

/** Each tick: when it was sent, and when each listener first heard of it. */
const ticks = [];
const heardBy = (tick, who) => {
  if (!tick || tick.heard.has(who)) return;
  tick.heard.set(who, performance.now() - tick.sent);
};
const latestTick = () => ticks.at(-1);

// Today's yardstick: one Realtime listener.
await alex.client.realtime.setAuth(alex.token);
const filter = `house_id=eq.${houseId}`;
const channel = alex.client.channel(`house:${houseId}`);
for (const table of ["events", "assignments", "disputes"]) {
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table, filter },
    () => heardBy(latestTick(), "realtime"),
  );
}
await new Promise((resolve, reject) => {
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") resolve();
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
      reject(error ?? new Error(status));
  });
});

/** What happened to the streams, all told. */
const tally = {
  opened: 0,
  reopened: 0,
  refused: new Map(),
  dropped: 0,
  firstByte: [],
};
const refuse = (why) =>
  tally.refused.set(why, (tally.refused.get(why) ?? 0) + 1);

/** Reads an open stream to its end: `first` at its first byte, `block` for each whole event. */
async function readEvents(body, on) {
  let first = true;
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of body) {
    if (first) {
      first = false;
      on.first();
    }
    pending += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, "\n");
    let end;
    while ((end = pending.indexOf("\n\n")) >= 0) {
      on.block(pending.slice(0, end));
      pending = pending.slice(end + 2);
    }
  }
}

/** One screen: the stream read as the app reads it, opened again with Last-Event-ID when it ends. */
function screen(index, token) {
  let lastId = null;
  let stopped = false;
  let controller;
  let opens = 0;
  const done = (async () => {
    while (!stopped) {
      controller = new AbortController();
      const started = performance.now();
      let ended = false;
      try {
        const response = await fetch(`${API}/v1/houses/${houseId}/live`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
            "Jonz-Client": CLIENT,
            ...(lastId ? { "Last-Event-ID": lastId } : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          refuse(`${response.status} ${(await response.text()).slice(0, 80)}`);
        } else {
          await readEvents(response.body, {
            first: () => {
              tally.firstByte.push(performance.now() - started);
              if (opens === 0) tally.opened += 1;
              else tally.reopened += 1;
              opens += 1;
            },
            block: (block) => {
              const id = /^id: ?(.*)$/m.exec(block)?.[1];
              if (id) lastId = id;
              if (/^event: ?change$/m.test(block)) heardBy(latestTick(), index);
            },
          });
          ended = true;
        }
      } catch (error) {
        if (!stopped) {
          tally.dropped += 1;
          console.warn(`stream ${index}: ${error.message}`);
        }
      }
      // The server's `retry: 1000` after a normal end; a little longer after a refusal.
      if (!stopped) await sleep(ended ? 1_000 : 2_000);
    }
  })();
  return async () => {
    stopped = true;
    controller?.abort();
    await done;
  };
}

const stops = [];
for (let index = 0; index < STREAMS; index += 1) {
  stops.push(screen(index, people[index % people.length].token));
  await sleep(RAMP_MS / STREAMS);
}
// Let the last ones settle before the first tick.
await sleep(3_000);
console.log(`${tally.opened} of ${STREAMS} streams open; ticking.`);

const started = performance.now();
let done = wasDone;
let round = 0;
while (performance.now() - started < HOLD_MS) {
  round += 1;
  const tick = { round, sent: performance.now(), heard: new Map() };
  ticks.push(tick);
  await v1(
    sam.token,
    "POST",
    `/v1/assignments/${john.id}/${done ? "undo" : "done"}`,
    done ? undefined : {},
  );
  done = !done;
  await sleep(TICK_MS);
  const streams = [...tick.heard.keys()].filter(
    (key) => key !== "realtime",
  ).length;
  if (round % 5 === 0)
    console.log(
      `tick ${round} (${Math.round((tick.sent - started) / 1000)} s): ${streams}/${STREAMS} streams heard it, realtime ${tick.heard.has("realtime") ? "heard it" : "not yet"}`,
    );
}
// The last tick's stragglers.
await sleep(WAIT_MS - TICK_MS);
if (done !== wasDone)
  await v1(
    sam.token,
    "POST",
    `/v1/assignments/${john.id}/${done ? "undo" : "done"}`,
    done ? undefined : {},
  );

await Promise.all(stops.map((stop) => stop()));
await alex.client.removeChannel(channel);

// Every (stream, tick): heard in time, or missed.
const streamTimes = [];
const realtimeTimes = [];
let streamMissed = 0;
let realtimeMissed = 0;
for (const tick of ticks) {
  const rt = tick.heard.get("realtime");
  if (rt === undefined || rt > WAIT_MS) realtimeMissed += 1;
  else realtimeTimes.push(rt);
  for (let index = 0; index < STREAMS; index += 1) {
    const at = tick.heard.get(index);
    if (at === undefined || at > WAIT_MS) streamMissed += 1;
    else streamTimes.push(at);
  }
}
const ms = (value) =>
  Number.isFinite(value) ? `${Math.round(value)} ms` : "n/a";
const r = {
  median: quantile(realtimeTimes, 0.5),
  p95: quantile(realtimeTimes, 0.95),
};
const s = {
  median: quantile(streamTimes, 0.5),
  p95: quantile(streamTimes, 0.95),
  max: Math.max(...streamTimes),
};
const refusals = [...tally.refused.entries()]
  .map(([why, count]) => `${count} × ${why}`)
  .join("; ");
const allOpened = tally.opened === STREAMS;
const pass =
  allOpened &&
  tally.refused.size === 0 &&
  streamMissed === 0 &&
  s.median - r.median <= WITHIN &&
  s.p95 - r.p95 <= WITHIN;
const report = [
  `### Live updates under load: ${STREAMS} streams, ${ticks.length} ticks, ${Math.round(HOLD_MS / 1000)} s`,
  "",
  "| | |",
  "|---|---|",
  `| Streams opened | ${tally.opened} of ${STREAMS} (first byte: median ${ms(quantile(tally.firstByte, 0.5))}, 95th ${ms(quantile(tally.firstByte, 0.95))}) |`,
  `| Opened again after the server's end | ${tally.reopened} |`,
  `| Refused | ${refusals || "none"} |`,
  `| Dropped mid-stream | ${tally.dropped} |`,
  "",
  "| Path | Median | 95th percentile | Slowest | Heard | Missed |",
  "|---|---|---|---|---|---|",
  `| Supabase Realtime, 1 listener (today) | ${ms(r.median)} | ${ms(r.p95)} | | ${realtimeTimes.length} | ${realtimeMissed} |`,
  `| Our API's stream, ${STREAMS} at once | ${ms(s.median)} | ${ms(s.p95)} | ${ms(s.max)} | ${streamTimes.length} | ${streamMissed} |`,
  `| Difference | ${ms(s.median - r.median)} | ${ms(s.p95 - r.p95)} | | | |`,
  "",
  pass
    ? `**Held up: every stream opened and heard every tick, within ${WITHIN} ms of Realtime.**`
    : `**Didn't hold up (see above): keep Realtime for now.**`,
].join("\n");
console.log(`\n${report}`);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exit(0);
