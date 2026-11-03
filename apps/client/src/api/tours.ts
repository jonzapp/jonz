import type { ToursSaved } from '@app/core';

import { supabase } from '@/api/supabase';

/**
 * Saves which tours you've taken on your account (its metadata, under
 * `tours`), so a phone and a laptop agree. Supabase merges the keys it's
 * given into what's there, so nothing else in the metadata changes.
 */
export async function saveToursSaved(tours: ToursSaved): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { tours } });
  if (error) throw error;
}
