import type { ReactNode } from 'react';

import { DangerZone } from '@/components/danger-zone';
import { Section } from '@/components/section';

/**
 * The rows of an Ask Jonz card (a house's MovesCard and the owner's
 * OwnerMovesCard), split by whether each can be taken back: the ones that
 * can under the card's label, the ones that can't (`dangerous`, from core's
 * isDangerous) after them in a DangerZone. A card of only those keeps its
 * own label in the zone. `row` draws one item, with its index on the card.
 */
export function MoveList<T>({
  label,
  meta,
  items,
  dangerous,
  row,
  testID,
}: {
  label: string;
  meta: string;
  items: readonly T[];
  dangerous: (item: T) => boolean;
  row: (item: T, at: number) => ReactNode;
  testID?: string;
}) {
  const all = items.map((item, at) => ({ item, at }));
  const safe = all.filter((x) => !dangerous(x.item));
  const danger = all.filter((x) => dangerous(x.item));
  return (
    <>
      {safe.length > 0 ? (
        <Section label={label} right={meta} testID={testID}>
          {safe.map((x) => row(x.item, x.at))}
        </Section>
      ) : null}
      {danger.length > 0 ? (
        <DangerZone label={safe.length > 0 ? undefined : label} right={safe.length > 0 ? undefined : meta} testID={testID ? `${testID}-danger` : undefined}>
          {danger.map((x) => row(x.item, x.at))}
        </DangerZone>
      ) : null}
    </>
  );
}

/** Whether any ticked row can't be taken back: the card's button is then a hazard button. */
export function anyDangerous<T>(items: readonly T[], ticked: readonly number[], dangerous: (item: T) => boolean): boolean {
  return ticked.some((at) => dangerous(items[at]));
}
