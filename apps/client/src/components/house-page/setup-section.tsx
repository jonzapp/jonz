import { ASK_USAGE_COPY, FOCUS_SHELL_COPY, HOUSE_LOWER_COPY, houseSetupValues, localDate, memberCan } from '@app/core';
import { GaugeIcon, ListTodoIcon, PlaneIcon, ScrollTextIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import type { HouseView } from '@/hooks/use-house';
import { useAskUsage } from '@/hooks/use-ask-usage';
import { useAway } from '@/hooks/use-away';
import { useJohnList } from '@/hooks/use-john-list';
import { useReadOnFocus } from '@/hooks/use-refresh';
import { useTheme } from '@/theme';
import { TourSpot } from '@/components/tour/tour-spot';

/**
 * House setup: a row to each of the house's setup pages, each showing what
 * it's set to now: the Johns and their effort (the groups are on that
 * page too), the money rules (and the admins who can change them), and who's
 * away next (with your own days), and what's left of your Ask Jonz this
 * week. Changing any of them changes the house
 * for everyone, so it says so. History is on the Wall.
 */
export function SetupSection({ houseId, userId, view }: { houseId: string; userId: string; view: HouseView }) {
  const pending = <PendingMeta />;
  const list = useJohnList(houseId);
  const away = useAway(houseId, view.snapshot);
  // Neither comes over Realtime, and a housemate may have changed either.
  useReadOnFocus(list.refetch, { skipFirst: true });
  useReadOnFocus(away.refetch, { skipFirst: true });
  const usage = useAskUsage(houseId);

  const values = houseSetupValues({
    rules: view.snapshot.rules,
    kind: view.snapshot.house.kind,
    johns: list.data?.johns,
    groups: list.data?.groups.length,
    away: away.data?.periods,
    today: away.data?.today ?? localDate(view.now, view.snapshot.rules.timezone),
    members: view.snapshot.members,
    me: userId,
    admin: memberCan(view.me, 'johns:write'),
  });

  return (
    <TourSpot id="house.setup">
      <Section label={FOCUS_SHELL_COPY.setup} right={HOUSE_LOWER_COPY.setupNote} testID="setup-section">
        <Row
          leading={<RowIcon icon={ListTodoIcon} />}
          title={HOUSE_LOWER_COPY.johns}
          meta={values.johns ?? pending}
          href="/house/johns"
          chevron
          testID="to-johns"
        />
        <Row
          leading={<RowIcon icon={ScrollTextIcon} />}
          title={HOUSE_LOWER_COPY.rules}
          meta={values.rules}
          href="/house/rules"
          chevron
          testID="to-rules"
        />
        <Row
          leading={<RowIcon icon={PlaneIcon} />}
          title={HOUSE_LOWER_COPY.away}
          meta={values.away ?? pending}
          href="/house/away"
          chevron
          testID="to-away"
        />
        <Row
          leading={<RowIcon icon={GaugeIcon} />}
          title={ASK_USAGE_COPY.title}
          meta={usage.data ? ASK_USAGE_COPY.rowMeta(usage.data.left) : pending}
          href="/house/ask-usage"
          chevron
          testID="to-ask-usage"
        />
      </Section>
    </TourSpot>
  );
}

/**
 * A meta line's room while its value is still being read: an empty line as
 * tall as Meta's, so a row is as tall before its read lands as after it and
 * nothing below it moves.
 */
export function PendingMeta() {
  const { type } = useTheme();
  return <View aria-hidden style={{ height: type.meta.lineHeight }} />;
}
