import {
  FAMILY_COPY,
  familyWaits,
  formatMoney,
  HOUSE_KINDS,
  KIND_SWITCH_COPY,
  memberCan,
  nextFirst,
  switchWords,
  type HouseKind,
} from '@app/core';
import { HouseIcon } from 'lucide-react-native';
import { useState } from 'react';

import { setHouseKind } from '@/api/settings';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { ChoiceRow } from '@/components/setup/choice-row';
import { useToast } from '@/components/toast';
import type { HouseView } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { useNow } from '@/hooks/use-now';

/**
 * Rules' Who lives here (docs/specs/family-houses.md, "Switching a house"):
 * housemates or a family, for everyone to read. An admin picks the other one
 * and says yes on a sheet that tells them what changes. A house with money in
 * it becomes a family on the 1st, once the month is settled up; the family
 * row says so until then, and picking housemates keeps it as it is.
 */
export function KindSwitch({ houseId, view }: { houseId: string; view: HouseView }) {
  const toast = useToast();
  const now = useNow();
  const move = useMove(houseId);
  const [asking, setAsking] = useState<HouseKind | null>(null);
  const { house, rules } = view.snapshot;
  const admin = memberCan(view.me, 'house.settings');
  const waiting = house.nextKind ?? null;
  const shown: HouseKind = waiting?.kind ?? house.kind;
  const meta = (kind: HouseKind) =>
    waiting && waiting.kind === kind
      ? KIND_SWITCH_COPY.waits(switchWords(waiting.on).day, switchWords(waiting.on).month)
      : FAMILY_COPY.kindBody[kind];

  function done(kind: HouseKind, on: string | null) {
    setAsking(null);
    if (on) toast.show(KIND_SWITCH_COPY.later(switchWords(on).day));
    else toast.show(KIND_SWITCH_COPY.done[kind]);
  }

  function pick(kind: HouseKind) {
    if (kind === shown) return;
    // Picking what the house still is drops a change that was waiting: nothing to ask.
    if (waiting && kind === house.kind) {
      void move.run(() => setHouseKind(houseId, kind)).then((ok) => {
        if (ok) toast.show(KIND_SWITCH_COPY.done.kept);
      });
      return;
    }
    setAsking(kind);
  }

  const cap = formatMoney(house.pocketCapMinor || 1000, rules.currency);
  const later = familyWaits(rules) ? switchWords(nextFirst(now, rules.timezone)) : null;
  const sheet =
    asking === 'family'
      ? {
          title: KIND_SWITCH_COPY.toFamilyTitle(house.name),
          body: later ? KIND_SWITCH_COPY.toFamilyLater(later.day, later.month, cap) : KIND_SWITCH_COPY.toFamilyNow(cap),
          confirm: KIND_SWITCH_COPY.toFamily,
        }
      : {
          title: KIND_SWITCH_COPY.toHousematesTitle(house.name),
          body: KIND_SWITCH_COPY.toHousemates,
          confirm: KIND_SWITCH_COPY.toHousematesConfirm,
        };

  return (
    <Section label={KIND_SWITCH_COPY.label} testID="kind-switch">
      {admin ? (
        <Group>
          {HOUSE_KINDS.map((kind) => (
            <ChoiceRow
              key={kind}
              role="radio"
              label={FAMILY_COPY.kinds[kind]}
              meta={meta(kind)}
              metaLines={2}
              checked={kind === shown}
              disabled={move.pending}
              onPress={() => pick(kind)}
              testID={`kind-${kind}`}
            />
          ))}
        </Group>
      ) : (
        <Group>
          <Row title={FAMILY_COPY.kinds[shown]} meta={meta(shown)} metaLines={2} testID="kind-now" />
        </Group>
      )}
      <ConfirmSheet
        visible={asking !== null}
        title={sheet.title}
        body={sheet.body}
        confirmLabel={sheet.confirm}
        icon={HouseIcon}
        tone="primary"
        busy={move.pending}
        problem={move.problem}
        onConfirm={() => {
          const kind = asking!;
          let on: string | null = null;
          void move
            .run(async () => {
              on = await setHouseKind(houseId, kind);
            })
            .then((ok) => {
              if (ok) done(kind, on);
            });
        }}
        onClose={() => setAsking(null)}
        testID="kind-sheet"
      />
    </Section>
  );
}
