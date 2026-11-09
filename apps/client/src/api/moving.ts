import { CreateHouse } from '@app/core';

import { callV1 } from './v1';

// Bring Jonz to your next house (docs/specs/moving-on.md): your moving-out
// date, and once you've left, starting your next house from the old list.
// The database decides each one; a refusal throws the sentence to show.

/** Say the day you move out (the house's local date), or null for staying after all. */
export async function setMovingOut(on: string | null) {
  await callV1('set_moving_out', { on });
}

/** The house you left most recently, while it can still come with you: its name and how many Johns it has. */
export interface MovingOn {
  fromHouse: string;
  houseName: string;
  johns: number;
  /**
   * The House Pass you bought, if you did: 'waiting' while it comes with
   * you, 'moved' once it's on your next house, 'left' when you left it with
   * the old one, 'lapsed' when it waited too long. Null without one.
   */
  pass: 'waiting' | 'moved' | 'left' | 'lapsed' | null;
  /** The day (the old house's own) its extras last until, once your Pass has gone with you. */
  houseKeepsUntil: string | null;
}

/** What the Moving on screen offers, or null when you haven't just left a house. */
export async function movingOn(): Promise<MovingOn | null> {
  const [row] = await callV1('moving_on', {});
  return row
    ? {
        fromHouse: row.fromHouseId,
        houseName: row.houseName,
        johns: row.johns,
        pass: (row.passState as MovingOn['pass']) ?? null,
        houseKeepsUntil: row.housePassUntil,
      }
    : null;
}

/** Leave the House Pass you're carrying with the house you left: it runs to the end of what was paid. */
export async function leavePass() {
  await callV1('leave_pass', {});
}

/** A new house with the John list of the one you left, with you as its admin. */
export async function startHouseFrom(fromHouse: string, input: CreateHouse): Promise<string> {
  const parsed = CreateHouse.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { name, timezone, currency, weekStarts } = parsed.data;
  return callV1('start_house_from', { fromId: fromHouse, name, timezone, currency, weekStarts });
}
