import { openLiveStream } from './live-stream';

jest.mock('./v1', () => ({ clientHeader: () => 'web/1.0.0' }));

/** Stands in for XMLHttpRequest: the test writes the body as it arrives. */
class FakeRequest {
  static made: FakeRequest[] = [];
  readyState = 0;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  aborted = false;
  onprogress: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  constructor() {
    FakeRequest.made.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send() {}
  abort() {
    this.aborted = true;
  }
  /** Some of the body arrives. */
  write(text: string, status = 200) {
    this.status = status;
    this.readyState = 3;
    this.responseText += text;
    this.onprogress?.();
    this.onreadystatechange?.();
  }
  /** The server ends the stream. */
  end(status = this.status || 200) {
    this.status = status;
    this.readyState = 4;
    this.onreadystatechange?.();
  }
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

function open(token: () => Promise<string | null> = async () => 'token-1') {
  const onChange = jest.fn();
  const stop = openLiveStream('h 1', onChange, { token, request: () => new FakeRequest() as unknown as XMLHttpRequest });
  return { onChange, stop };
}

beforeEach(() => {
  jest.useFakeTimers();
  FakeRequest.made = [];
  process.env.EXPO_PUBLIC_API_URL = 'https://api.jonz.app';
});
afterEach(() => {
  jest.useRealTimers();
  delete process.env.EXPO_PUBLIC_API_URL;
});

describe('openLiveStream', () => {
  it("asks for the house's stream with the person's token, and says so for each change", async () => {
    const { onChange } = open();
    await settle();
    const [request] = FakeRequest.made;
    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://api.jonz.app/v1/houses/h%201/live');
    expect(request.headers).toEqual({ Accept: 'text/event-stream', 'Jonz-Client': 'web/1.0.0', Authorization: 'Bearer token-1' });

    request.write('retry: 1000\n\n: ping\n\n');
    expect(onChange).not.toHaveBeenCalled();
    // An event can arrive in pieces, and with \r\n.
    request.write('id: 7\r\nevent: change\r\nda');
    expect(onChange).not.toHaveBeenCalled();
    request.write('ta: {}\r\n\r\nid: 8\nevent: change\ndata: {}\n\n');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('opens the next stream when one ends, from the last change it heard', async () => {
    open();
    await settle();
    const [first] = FakeRequest.made;
    first.write('retry: 250\n\nid: 9\nevent: change\ndata: {}\n\n');
    first.end();
    await jest.advanceTimersByTimeAsync(249);
    expect(FakeRequest.made).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(FakeRequest.made).toHaveLength(2);
    expect(FakeRequest.made[1].headers['Last-Event-ID']).toBe('9');
  });

  it("waits longer each time the API can't be reached, and starts over once it answers", async () => {
    open();
    await settle();
    FakeRequest.made[0].end(0);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(FakeRequest.made).toHaveLength(2);
    FakeRequest.made[1].write('{"type":"refused"}', 503);
    FakeRequest.made[1].end();
    await jest.advanceTimersByTimeAsync(1_999);
    expect(FakeRequest.made).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(FakeRequest.made).toHaveLength(3);
    FakeRequest.made[2].end(0);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(FakeRequest.made).toHaveLength(4);
    // Heard from at last: the next stream opens as soon as this one ends.
    FakeRequest.made[3].write('retry: 1000\n\n');
    FakeRequest.made[3].end();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(FakeRequest.made).toHaveLength(5);
  });

  it('goes without a token when nobody is signed in, and the API says no', async () => {
    open(async () => {
      throw new Error('offline');
    });
    await settle();
    expect(FakeRequest.made[0].headers.Authorization).toBeUndefined();
  });

  it('stops: the stream is dropped and nothing opens again', async () => {
    const { onChange, stop } = open();
    await settle();
    const [request] = FakeRequest.made;
    stop();
    expect(request.aborted).toBe(true);
    request.write('id: 3\nevent: change\ndata: {}\n\n');
    request.end();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(FakeRequest.made).toHaveLength(1);
    // Nothing reaches a screen that went.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("doesn't open a stream when stopped before the token was read", async () => {
    let give: (value: string) => void = () => undefined;
    const { stop } = open(() => new Promise((resolve) => (give = resolve)));
    stop();
    give('token-1');
    await settle();
    expect(FakeRequest.made).toHaveLength(0);
  });
});
