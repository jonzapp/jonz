#!/usr/bin/env node
// How fast a housemate's tick reaches another screen: today's path
// (Supabase Realtime, postgres_changes) against the API's own stream
// (GET /v1/houses/{houseId}/live). docs/specs/api.md, C3: the app switches
// to the stream only if it is within about 100 ms of today's, at the
// median and the 95th percentile.
//
// Two demo housemates on staging: Sam ticks one of his Johns and takes it
// back, again and again; Alex listens both ways at once, so both paths see
// the same tick from the same place. Each time is from just before Sam's
// tick is sent to the moment Alex hears of it. Sam's John is left as it
// was found.
//
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… API_URL=https://api.staging.jonz.app \
//   DEMO_PASSWORD=… [ROUNDS=40] node scripts/live-latency.mjs
//
// The Staging workflow's "Time live updates" runs it with staging's values.
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { API, CLIENT, quantile, samsJohnIn, signIn, sleep, v1 } from "./live/demo.mjs";

const ROUNDS = Number(process.env.ROUNDS ?? 40);
/** The gap the app may switch within (ms). */
const WITHIN = 100;
const WAIT_MS = 10_000;

/** One listener's arrivals: resolves the wait for the next change after a mark. */
function arrivals() {
  let waiting = null;
  return {
    heard() {
      if (waiting) {
        const { resolve, timer } = waiting;
        waiting = null;
        clearTimeout(timer);
        resolve(performance.now());
      }
    },
    next() {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting = null;
          resolve(null);
        }, WAIT_MS);
        waiting = { resolve, timer };
      });
    },
  };
}

/** The API's stream, read as the app reads it; reopened with Last-Event-ID when it ends. */
function openStream(houseId, token, onChange) {
  let lastId = null;
  let stopped = false;
  let controller;
  (async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const response = await fetch(`${API}/v1/houses/${houseId}/live`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream", "Jonz-Client": CLIENT, ...(lastId ? { "Last-Event-ID": lastId } : {}) },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`stream ${response.status}`);
        const decoder = new TextDecoder();
        let pending = "";
        for await (const chunk of response.body) {
          pending += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, "\n");
          let end;
          while ((end = pending.indexOf("\n\n")) >= 0) {
            const block = pending.slice(0, end);
            pending = pending.slice(end + 2);
            const id = /^id: ?(.*)$/m.exec(block)?.[1];
            if (id) lastId = id;
            if (/^event: ?change$/m.test(block)) onChange();
          }
        }
      } catch (error) {
        if (!stopped) console.warn(`stream: ${error.message}; opening it again`);
      }
      if (!stopped) await sleep(500);
    }
  })();
  return () => {
    stopped = true;
    controller?.abort();
  };
}

const alex = await signIn("alex@demo.jonz.app");
const sam = await signIn("sam@demo.jonz.app");
const { houseId, john } = await samsJohnIn(alex, sam);
const wasDone = Boolean(john.doneAt);
console.log(`House ${houseId}, Sam's John ${john.id} (${wasDone ? "done" : "not done"} to start). ${ROUNDS} rounds.`);

// Alex listens both ways at once.
const realtime = arrivals();
const stream = arrivals();
await alex.client.realtime.setAuth(alex.token);
const filter = `house_id=eq.${houseId}`;
const channel = alex.client.channel(`house:${houseId}`);
for (const table of ["events", "assignments", "disputes"]) {
  channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => realtime.heard());
}
await new Promise((resolve, reject) => {
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") resolve();
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(error ?? new Error(status));
  });
});
const stopStream = openStream(houseId, alex.token, () => stream.heard());
// Both settled: the stream's first answer, and Realtime's join.
await sleep(3_000);

const times = { realtime: [], stream: [] };
const missed = { realtime: 0, stream: 0 };
let done = wasDone;
for (let round = 1; round <= ROUNDS; round += 1) {
  const heardRealtime = realtime.next();
  const heardStream = stream.next();
  const sent = performance.now();
  await v1(sam.token, "POST", `/v1/assignments/${john.id}/${done ? "undo" : "done"}`, done ? undefined : {});
  done = !done;
  const [rt, st] = await Promise.all([heardRealtime, heardStream]);
  if (rt === null) missed.realtime += 1;
  else times.realtime.push(rt - sent);
  if (st === null) missed.stream += 1;
  else times.stream.push(st - sent);
  console.log(`round ${round}: realtime ${rt === null ? "missed" : `${Math.round(rt - sent)} ms`}, stream ${st === null ? "missed" : `${Math.round(st - sent)} ms`}`);
  // Let the burst from one tick pass before the next.
  await sleep(1_500);
}
if (done !== wasDone) await v1(sam.token, "POST", `/v1/assignments/${john.id}/${done ? "undo" : "done"}`, done ? undefined : {});

stopStream();
await alex.client.removeChannel(channel);

const row = (name) => {
  const values = times[name];
  return { median: quantile(values, 0.5), p95: quantile(values, 0.95), heard: values.length, missed: missed[name] };
};
const r = row("realtime");
const s = row("stream");
const ms = (value) => (Number.isFinite(value) ? `${Math.round(value)} ms` : "n/a");
const pass = s.missed === 0 && s.median - r.median <= WITHIN && s.p95 - r.p95 <= WITHIN;
const report = [
  `### Live updates: a tick reaching another screen (${ROUNDS} ticks)`,
  "",
  "| Path | Median | 95th percentile | Heard | Missed |",
  "|---|---|---|---|---|",
  `| Supabase Realtime (today) | ${ms(r.median)} | ${ms(r.p95)} | ${r.heard} | ${r.missed} |`,
  `| Our API's stream | ${ms(s.median)} | ${ms(s.p95)} | ${s.heard} | ${s.missed} |`,
  `| Difference | ${ms(s.median - r.median)} | ${ms(s.p95 - r.p95)} | | |`,
  "",
  pass ? `**Within ${WITHIN} ms: the app can switch.**` : `**Not within ${WITHIN} ms (or the stream missed a tick): keep Realtime for now.**`,
].join("\n");
console.log(`\n${report}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exit(0);
