import { NEW_JOHN, type JohnDef, type Words } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ComponentType } from 'react';

import { LookProvider } from '@/hooks/look';
import { testQueryClient } from '@/testing/query';

// Rendering one house page (or a few) in the router for a test, with a
// fresh cache and the look, and the John list the House pages' tests share.

/** Two Johns on the house's list: the bins every week, the bathroom every other, with a photo. */
export const BINS: JohnDef = { ...NEW_JOHN, id: 'j1', name: 'Bins', category: 'bins', points: 1, dueDow: 4, dueTime: '07:00' };
export const BATH: JohnDef = {
  ...NEW_JOHN,
  id: 'j2',
  name: 'Bathroom',
  category: 'bathroom',
  points: 4,
  everyWeeks: 2,
  needsPhoto: true,
};

/**
 * Open `initialUrl` among `routes` (file paths under app, as renderRouter
 * takes them: `'house/index'`, `'house/people/[userId]'`). Returns the cache.
 */
export async function renderPages(routes: Record<string, ComponentType>, initialUrl: string) {
  const client = testQueryClient();
  await renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={client}>
          <LookProvider>
            <Slot />
          </LookProvider>
        </QueryClientProvider>
      ),
      ...routes,
    },
    { initialUrl },
  );
  return client;
}

/** Until the page's first read is in: nothing on it is still waiting (whatever its label). */
export async function untilRead(words: Words) {
  await waitFor(() => {
    expect(screen.queryByLabelText(words('common.shell.reading'))).toBeNull();
    expect(screen.queryAllByTestId('waiting', { includeHiddenElements: true })).toHaveLength(0);
  });
}
