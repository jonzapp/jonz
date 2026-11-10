import { apiBase } from './base';
import { clientHeader } from './v1';
import { markTooOld } from './too-old';

/**
 * Live updates through our own server (docs/specs/api.md, C3), once
 * EXPO_PUBLIC_LIVE_THROUGH_API is on: the API's stream of a house's changes,
 * `GET /v1/houses/{houseId}/live`, instead of Supabase Realtime.
 */
export const liveThroughApi = process.env.EXPO_PUBLIC_LIVE_THROUGH_API === '1';

/** The longest wait between tries when the API won't answer. */
const MOST_MS = 30_000;

type Options = {
  /** The signed-in person's token, read again for each stream. */
  token: () => Promise<string | null>;
  /** For tests. */
  request?: () => XMLHttpRequest;
};

/**
 * Listens to the house's stream and calls `onChange` for each change. The
 * server ends each stream after a few minutes; the next opens at once with
 * `Last-Event-ID`, and hears straight away if it missed anything. When the
 * API can't be reached it tries again, waiting longer each time. Read over
 * XMLHttpRequest, as the browser's EventSource can't send a token and a
 * phone's fetch can't read a body as it arrives. Returns the way to stop.
 */
export function openLiveStream(houseId: string, onChange: () => void, { token, request = () => new XMLHttpRequest() }: Options): () => void {
  let closed = false;
  let lastId: string | null = null;
  let retryMs = 1_000;
  let failures = 0;
  let xhr: XMLHttpRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const again = (ms: number) => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void connect(), ms);
  };

  /** One event, as the server writes it: lines of `field: value`. */
  const event = (block: string) => {
    let id: string | null = null;
    let name = 'message';
    let data = false;
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'id') id = value;
      else if (field === 'event') name = value;
      else if (field === 'data') data = true;
      else if (field === 'retry' && /^\d+$/.test(value)) retryMs = Number(value);
    }
    if (id !== null) lastId = id;
    if (data && name === 'change') onChange();
  };

  async function connect() {
    const bearer = await token().catch(() => null);
    if (closed) return;
    const current = request();
    xhr = current;
    let seen = 0;
    let pending = '';
    let heard = false;
    const read = () => {
      if (closed || xhr !== current) return;
      const text = current.responseText ?? '';
      if (text.length <= seen) return;
      pending += text.slice(seen).replace(/\r\n?/g, '\n');
      seen = text.length;
      heard = true;
      let end: number;
      while ((end = pending.indexOf('\n\n')) >= 0) {
        event(pending.slice(0, end));
        pending = pending.slice(end + 2);
      }
    };
    current.onprogress = read;
    current.onreadystatechange = () => {
      if (current.readyState === 3) read();
      if (current.readyState !== 4 || closed || xhr !== current) return;
      read();
      // A stream that ran its course opens the next straight away; one
      // refused or unreachable waits a little longer each time.
      // A build the API no longer takes stops listening, and the app turns to Update Jonz.
      if (current.status === 426) {
        markTooOld();
        return;
      }
      if (current.status === 200 && heard) {
        failures = 0;
        again(retryMs);
      } else {
        failures += 1;
        again(Math.min(MOST_MS, 1_000 * 2 ** (failures - 1)));
      }
    };
    current.open('GET', `${apiBase()}/v1/houses/${encodeURIComponent(houseId)}/live`);
    current.setRequestHeader('Accept', 'text/event-stream');
    current.setRequestHeader('Jonz-Client', clientHeader());
    if (bearer) current.setRequestHeader('Authorization', `Bearer ${bearer}`);
    if (lastId !== null) current.setRequestHeader('Last-Event-ID', lastId);
    current.send();
  }

  void connect();
  return () => {
    closed = true;
    clearTimeout(timer);
    const current = xhr;
    xhr = null;
    current?.abort();
  };
}
