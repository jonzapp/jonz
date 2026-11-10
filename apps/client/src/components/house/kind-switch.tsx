import { familyWaits, formatMoney, HOUSE_KINDS, memberCan, nextFirst, switchWords, type HouseKind } from '@app/core';
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
import { useWords } from '@/hooks/use-words';

/**
 * Rules' Who lives here (docs/specs/family-houses.md, "Switching a house"):
 * housemates or a family, for everyone to read. An admin picks the other one
 * and says yes on a sheet that tells them what changes. A house with money in
 * it becomes a family on the 1st, once the month is settled up; the family
 * row says so until then, and picking housemates keeps it as it is.
 */
export function KindSwitch({ houseId, view }: { houseId: string; view: HouseView }) {
  const words = useWords();
  const toast = useToast();
  const now = useNow();
  const move = useMove(houseId);
  const [asking, setAsking] = useState<HouseKind | null>(null);
  const { house, rules } = view.snapshot;
  const admin = memberCan(view.me, 'house:write');
  const waiting = house.nextKind ?? null;
  const shown: HouseKind = waiting?.kind ?? house.kind;
  const meta = (kind: HouseKind) =>
    waiting && waiting.kind === kind
      ? words('house.kindSwitch.waits', { on: switchWords(waiting.on).day, month: switchWords(waiting.on).month })
      : words(`house.family.kindBody.${kind}` as const);

  function done(kind: HouseKind, on: string | null) {
    setAsking(null);
    if (on) toast.show(words('house.kindSwitch.later', { on: switchWords(on).day }));
    else toast.show(words(`house.kindSwitch.done.${kind}` as const));
  }

  function pick(kind: HouseKind) {
    if (kind === shown) return;
    // Picking what the house still is drops a change that was waiting: nothing to ask.
    if (waiting && kind === house.kind) {
      void move.run(() => setHouseKind(houseId, kind)).then((ok) => {
        if (ok) toast.show(words('house.kindSwitch.done.kept'));
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
          title: words('house.kindSwitch.toFamilyTitle', { house: house.name }),
          body: later ? words('house.kindSwitch.toFamilyLater', { on: later.day, month: later.month, cap }) : words('house.kindSwitch.toFamilyNow', { cap }),
          confirm: words('house.kindSwitch.toFamily'),
        }
      : {
          title: words('house.kindSwitch.toHousematesTitle', { house: house.name }),
          body: words('house.kindSwitch.toHousemates'),
          confirm: words('house.kindSwitch.toHousematesConfirm'),
        };

  return (
    <Section label={words('house.kindSwitch.label')} testID="kind-switch">
      {admin ? (
        <Group>
          {HOUSE_KINDS.map((kind) => (
            <ChoiceRow
              key={kind}
              role="radio"
              label={words(`house.family.kinds.${kind}` as const)}
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
          <Row title={words(`house.family.kinds.${shown}` as const)} meta={meta(shown)} metaLines={2} testID="kind-now" />
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
        busyLabel={words('common.busy.switching')}
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
