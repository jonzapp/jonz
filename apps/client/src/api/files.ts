import { ApiRequestError } from './base';

// Pictures go through our own address (docs/specs/api.md, C3): /v1 hands
// out a link to put one at (proof_upload, file_upload), and the bytes go
// there. Supabase Storage is behind it; the app never talks to it.

/** Puts a picture's bytes where an upload link says. Throws a sentence when it doesn't go. */
export async function putFile(upload: string, bytes: ArrayBuffer, type: 'image/jpeg' | 'image/png'): Promise<void> {
  const response = await fetch(upload, { method: 'PUT', headers: { 'Content-Type': type }, body: bytes });
  if (response.ok) return;
  if (response.status === 413) throw new ApiRequestError('That picture is too big. Try a smaller one.', 413);
  throw new ApiRequestError('The picture didn’t upload. Try again.', response.status);
}
