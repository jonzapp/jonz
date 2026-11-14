import { apiBase } from './base';
import { clientHeader } from './v1';
import { markTooOld } from './too-old';

/** The longest wait between tries when the API won't answer. */
const MOST_MS = 30_000;

type Options = {
  /** The signed-in person's token, read again for each stream. */
  token: () => Promise<string | null>;
  /** For tests. */
  request?: () => XMLHttpRequest;
};

/**
 * Live updates through our own server (docs/specs/api.md, C3): the API's
 * stream of a house's changes, `GET /v1/houses/{houseId}/live`. Listens to
 * the house's stream and calls `onChange` for each change. The
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

  const event = (block: string) => {
    const heard = readEvent(block);
    if (heard.retryMs !== null) retryMs = heard.retryMs;
    if (heard.id !== null) lastId = heard.id;
    if (heard.change) onChange();
  };

  // A stream that ran its course opens the next straight away; one
  // refused or unreachable waits a little longer each time.
  // A build the API no longer takes stops listening, and the app turns to Update Jonz.
  const ended = (status: number, heard: boolean) => {
    if (status === 426) return markTooOld();
    failures = status === 200 && heard ? 0 : failures + 1;
    again(failures === 0 ? retryMs : Math.min(MOST_MS, 1_000 * 2 ** (failures - 1)));
  };

  async function connect() {
    const bearer = await token().catch(() => null);
    if (closed) return;
    const current = request();
    xhr = current;
    const blocks = blockReader(current);
    const read = () => {
      if (closed || xhr !== current) return;
      for (const block of blocks.take()) event(block);
    };
    current.onprogress = read;
    current.onreadystatechange = () => {
      if (current.readyState === 3) read();
      if (current.readyState !== 4 || closed || xhr !== current) return;
      read();
      ended(current.status, blocks.heard);
    };
    send(current, `${apiBase()}/v1/houses/${encodeURIComponent(houseId)}/live`, { bearer, lastId });
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

/** One event, as the server writes it: lines of `field: value`. */
function readEvent(block: string): { id: string | null; change: boolean; retryMs: number | null } {
  let id: string | null = null;
  let name = 'message';
  let data = false;
  let retryMs: number | null = null;
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
  return { id, change: data && name === 'change', retryMs };
}

/** Reads a stream's body as it arrives: `take` gives the whole events new since the last take. */
function blockReader(current: XMLHttpRequest) {
  let seen = 0;
  let pending = '';
  const reader = {
    /** Whether anything has arrived at all. */
    heard: false,
    take(): string[] {
      const text = current.responseText ?? '';
      if (text.length <= seen) return [];
      pending += text.slice(seen).replace(/\r\n?/g, '\n');
      seen = text.length;
      reader.heard = true;
      const blocks = pending.split('\n\n');
      pending = blocks.pop() ?? '';
      return blocks;
    },
  };
  return reader;
}

function send(current: XMLHttpRequest, url: string, { bearer, lastId }: { bearer: string | null; lastId: string | null }) {
  current.open('GET', url);
  current.setRequestHeader('Accept', 'text/event-stream');
  current.setRequestHeader('Jonz-Client', clientHeader());
  if (bearer) current.setRequestHeader('Authorization', `Bearer ${bearer}`);
  if (lastId !== null) current.setRequestHeader('Last-Event-ID', lastId);
  current.send();
}
