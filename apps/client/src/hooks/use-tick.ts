import { HISTORY_COPY } from '@app/core';
import { useState } from 'react';

import { coverJohn, markDone, rollCall } from '@/api/johns';
import { pickPhoto, uploadProof } from '@/api/photos';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { useWords } from '@/hooks/use-words';

/**
 * Ticking one John: as it is, or with a photo receipt from the camera or the
 * library, uploaded first. `problem` is the sentence to show when the photo
 * or the database said no. With `cover`, the John is a housemate's and the
 * tick covers it (cover_john) rather than marking your own done. With
 * `crew`, it's ticked with who did it (the roll call, crew.ts). A tick that
 * lands offers Undo in a toast.
 */
export type TickVia = 'tick' | 'camera' | 'library';

export function useTick(
  houseId: string,
  assignmentId: string,
  { cover = false, crew }: { cover?: boolean; crew?: readonly string[] } = {},
) {
  const words = useWords();
  const done = crew
    ? async (id: string, photoPath?: string) => {
        await rollCall(id, crew, photoPath);
      }
    : cover
      ? coverJohn
      : markDone;
  const move = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const [uploading, setUploading] = useState(false);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  // The way the latest tick went, so only the button tapped looks busy.
  const [via, setVia] = useState<TickVia>('tick');

  async function tickWithPhoto(source: 'camera' | 'library') {
    setPhotoProblem(null);
    setVia(source);
    let uri: string | null;
    try {
      uri = await pickPhoto(source);
    } catch (reason) {
      setPhotoProblem(reason instanceof Error ? reason.message : words('john.row.photoFailed'));
      return;
    }
    if (!uri) return;
    setUploading(true);
    let path: string;
    try {
      path = await uploadProof(houseId, assignmentId, uri);
    } catch {
      setPhotoProblem(words('john.row.photoFailed'));
      return;
    } finally {
      setUploading(false);
    }
    if (await move.run(() => done(assignmentId, path))) offered();
  }

  function offered() {
    offer(cover ? HISTORY_COPY.covered : HISTORY_COPY.ticked, cover ? 'cover' : 'tick', assignmentId);
  }

  async function tick() {
    setPhotoProblem(null);
    setVia('tick');
    const ok = await move.run(() => done(assignmentId));
    if (ok) offered();
    return ok;
  }

  return {
    pending: move.pending,
    uploading,
    busy: move.pending || uploading,
    /** Which way is waiting on the server, if one is: the button to show busy. */
    waiting: move.pending || uploading ? via : null,
    /** Whether another way is waiting, so this way's button holds still (the sheet's buttons aren't one row). */
    held: (way: TickVia) => (move.pending || uploading) && via !== way,
    /** What a busy button says: ticking, or sending the photo first. */
    busyLabel: uploading ? words('john.row.uploading') : words('john.row.ticking'),
    problem: photoProblem ?? move.problem,
    tick,
    tickWithPhoto,
  };
}
