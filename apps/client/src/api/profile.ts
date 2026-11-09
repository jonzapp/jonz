import { DisplayName } from '@app/core';

import { callV1 } from './v1';

/** Rename yourself: the one profile column a housemate may write. */
export async function setMyName(_userId: string, name: string): Promise<void> {
  await callV1('set_my_name', { name });
}

/** Rename yourself from House: 1 to 60 characters, and a refusal in words. */
export async function renameMe(userId: string, name: string): Promise<void> {
  const parsed = DisplayName.safeParse(name);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  await setMyName(userId, parsed.data);
}
