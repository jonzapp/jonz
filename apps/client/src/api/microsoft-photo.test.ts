import type { Session } from '@supabase/supabase-js';

import { keepMicrosoftPhoto, wantsMicrosoftPhoto } from './microsoft-photo';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: { auth: { onAuthStateChange: jest.fn() } } }));

const UPLOAD = 'https://jonz.app/files/up/avatars/u1/photo-1.jpg?token=t';
const LINK = 'https://jonz.app/files/photo/avatars/u1/photo-1.jpg';

const rpc = callV1 as jest.Mock;
const fetchMock = jest.fn();

function session(identities: { provider: string; identity_data?: Record<string, unknown> }[], token: string | null = 'ms'): Session {
  return { user: { id: 'u1', identities }, provider_token: token } as unknown as Session;
}
const azure = { provider: 'azure', identity_data: { email: 'a@outlook.com' } };

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  rpc.mockImplementation(async (name: string) => (name === 'file_upload' ? { path: 'u1/photo-1.jpg', upload: UPLOAD, link: LINK } : null));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('wantsMicrosoftPhoto', () => {
  it('only for a Microsoft account with no Google photo alongside', () => {
    expect(wantsMicrosoftPhoto(session([azure]))).toBe(true);
    expect(wantsMicrosoftPhoto(session([{ provider: 'google', identity_data: { avatar_url: 'https://x' } }]))).toBe(false);
    expect(wantsMicrosoftPhoto(session([azure, { provider: 'google', identity_data: { picture: 'https://x' } }]))).toBe(false);
  });
});

describe('keepMicrosoftPhoto', () => {
  it("copies Graph's photo to a new place of yours and points your profile at it", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ 'content-type': 'image/jpeg' }), arrayBuffer: async () => new ArrayBuffer(4) })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    await keepMicrosoftPhoto(session([azure], 'token-1'));
    expect(fetchMock).toHaveBeenCalledWith('https://graph.microsoft.com/v1.0/me/photos/240x240/$value', {
      headers: { Authorization: 'Bearer token-1' },
    });
    expect(rpc).toHaveBeenCalledWith('file_upload', { kind: 'photo', type: 'image/jpeg' });
    expect(fetchMock).toHaveBeenLastCalledWith(UPLOAD, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: expect.any(ArrayBuffer) });
    expect(rpc).toHaveBeenLastCalledWith('set_my_photo', { photo: LINK });
  });

  it('leaves the initials when the account has no photo, and tries a token once', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    await keepMicrosoftPhoto(session([azure], 'token-2'));
    await keepMicrosoftPhoto(session([azure], 'token-2'));
    expect(fetchMock).toHaveBeenCalledTimes(2); // the sized photo, then the original, once
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does nothing without a Microsoft token, and never throws', async () => {
    await keepMicrosoftPhoto(session([azure], null));
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(keepMicrosoftPhoto(session([azure], 'token-3'))).resolves.toBeUndefined();
  });
});
