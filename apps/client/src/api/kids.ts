import { AddKid } from '@app/core';

import { callV1 } from './v1';

/**
 * A parent adds a child who won't sign in (family step 4). Through apps/api,
 * which makes the child's account and puts them in the family
 * (lib/moves/kids.ts there). Answers the child's id.
 */
export async function addKid(houseId: string, name: string, bornYear: number): Promise<string> {
  const { userId } = await callV1('add_kid', { ...AddKid.parse({ name, bornYear }), houseId });
  return userId;
}
