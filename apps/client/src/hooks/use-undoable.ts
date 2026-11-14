import { undoable } from '@app/core';
import { useQuery } from '@tanstack/react-query';

import { loadHistory } from '@/api/history';
import { historyKey } from '@/hooks/keys';

/**
 * The house's moves that whoever is looking can still undo (their own while
 * open; anyone's, to an admin, until the month is shared out), for the
 * sheets that offer Undo: a Wall post's and a John's. Under the house, so
 * every move (an undo included) reads it again.
 */
export function useUndoable(houseId: string) {
  return useQuery({ queryKey: historyKey(houseId), queryFn: async () => undoable(await loadHistory(houseId)) });
}
