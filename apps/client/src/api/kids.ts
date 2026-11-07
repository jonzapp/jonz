import { AddKid, AddKidResponse } from '@app/core';

import { apiPost } from './http';

/**
 * A parent adds a child who won't sign in (family step 4). Through apps/api,
 * which makes the child's account and puts them in the family
 * (lib/moves/kids.ts there). Answers the child's id.
 */
export async function addKid(name: string, bornYear: number): Promise<string> {
  const { userId } = await apiPost('/api/kids', AddKid.parse({ name, bornYear }), AddKidResponse);
  return userId;
}
