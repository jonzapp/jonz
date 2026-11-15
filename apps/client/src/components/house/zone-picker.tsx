import { dateIn, findZones, offsetLabel, utcOffset, zoneChoices, zoneClock, zonePlace, type ZoneChoice } from '@app/core';
import { CheckIcon, MapPinIcon, SmartphoneIcon, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Combobox } from '@/components/combobox';
import { GroupItem } from '@/components/group';
import { ListFoot } from '@/components/list-foot';
import { OutlineGroup } from '@/components/outline';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Body, Meta } from '@/components/text';
import { Waiting } from '@/components/waiting';
import { useNow } from '@/hooks/use-now';
import { useTimeZones } from '@/hooks/use-time-zones';
import { useWords } from '@/hooks/use-words';
import { deviceTimeZone } from '@/locale';
import { INSET, SECTION_GAP, SPACE, TABULAR, useTheme } from '@/theme';

/** How many zones the list shows at first, and adds as you near its end. */
const PAGE = 60;

/**
 * The house's time zone, a Combobox in the House group (Search by city, 14
 * Nov; Kit to shadcn's breadth, 15 Nov): "Time zone" over the box with the
 * place in it ("London, United Kingdom"), its offset and its time now under
 * it. It opens the zones with a search box: a card dropped from the box on
 * a laptop, a sheet on a phone.
 */
export function ZoneField({
  value,
  onChange,
  disabled = false,
  problem,
}: {
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  problem?: string;
}) {
  const words = useWords();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(PAGE);
  const search = (next: string) => {
    setQuery(next);
    setCount(PAGE);
  };
  return (
    <GroupItem>
      <Combobox
        label={words('house.rules.timezone')}
        shown={zonePlace(value, words)}
        hint={zoneClock(value, now, words)}
        problem={problem}
        disabled={disabled}
        search={{ value: query, onChange: search, placeholder: words('house.zone.search'), testID: 'zone-search' }}
        description={words('house.zone.description')}
        onNearEnd={() => setCount((shown) => shown + PAGE)}
        testID="rules-timezone"
        listTestID="zone-picker"
      >
        {(close) => (
          <ZoneList
            value={value}
            query={query}
            count={count}
            more={() => setCount(count + PAGE)}
            onPick={(zone) => {
              close();
              if (zone !== value) onChange(zone);
            }}
          />
        )}
      </Combobox>
    </GroupItem>
  );
}

/**
 * The zones: the zone set now and this phone's, then every zone A to Z, or
 * those the search finds (a city, a country or its code), each with its
 * offset and its time now, so you can check it's the one. The list comes
 * from the database (public.time_zones()), read once.
 */
function ZoneList({ value, query, count, more, onPick }: { value: string; query: string; count: number; more: () => void; onPick: (zone: string) => void }) {
  const words = useWords();
  const now = useNow();
  const zones = useTimeZones(true);
  const choices = useMemo(() => zoneChoices(zones.data ?? [], { at: now, keep: value }, words), [zones.data, now, words, value]);
  const found = useMemo(() => findZones(choices, query), [choices, query]);
  return (
    <Waiting ready={zones.isSuccess} failed={zones.isError} onRetry={() => void zones.refetch()} outline={<OutlineGroup rows={6} lead="none" end />}>
      {() => (
        <View style={styles.lists}>
          {query.trim() ? null : <Suggested value={value} known={zones.data ?? []} now={now} onPick={onPick} />}
          <Found found={found} count={count} query={query} value={value} now={now} onPick={onPick} more={more} />
        </View>
      )}
    </Waiting>
  );
}

/** The zone the house has now, and this phone's when it's another the database knows. */
function Suggested({ value, known, now, onPick }: { value: string; known: readonly string[]; now: Date; onPick: (zone: string) => void }) {
  const words = useWords();
  const phone = deviceTimeZone();
  const offset = (zone: string) => offsetLabel(utcOffset(zone, now));
  return (
    <Section label={words('house.zone.suggested')} testID="zone-suggested">
      <View accessibilityRole="radiogroup" accessibilityLabel={words('house.zone.suggested')}>
        <ZoneRow zone={value} meta={words('house.zone.setNow', { offset: offset(value) })} icon={MapPinIcon} now={now} chosen onPick={onPick} />
        {phone !== value && known.includes(phone) ? (
          <ZoneRow zone={phone} meta={words('house.zone.yourPhone', { offset: offset(phone) })} icon={SmartphoneIcon} now={now} chosen={false} onPick={onPick} />
        ) : null}
      </View>
    </Section>
  );
}

/** Every zone A to Z, or those the search finds; a part at a time, the rest as you scroll. */
function Found({
  found,
  count,
  query,
  value,
  now,
  onPick,
  more,
}: {
  found: readonly ZoneChoice[];
  count: number;
  query: string;
  value: string;
  now: Date;
  onPick: (zone: string) => void;
  more: () => void;
}) {
  const words = useWords();
  const asked = query.trim();
  if (found.length === 0) {
    return (
      <Meta style={styles.pad} testID="zone-none">
        {words('house.zone.none', { query: asked })}
      </Meta>
    );
  }
  const label = asked ? words('house.zone.found', { n: found.length }) : words('house.zone.all');
  return (
    <View>
      <Section label={label} testID="zone-list">
        <View accessibilityRole="radiogroup" accessibilityLabel={label}>
          {found.slice(0, count).map((choice) => (
            <ZoneRow key={choice.zone} zone={choice.zone} meta={offsetLabel(choice.offset)} now={now} chosen={choice.zone === value} onPick={onPick} />
          ))}
        </View>
      </Section>
      {found.length > PAGE ? <ListFoot more={{ has: count < found.length, busy: false, failed: false, load: more }} testID="zone-foot" /> : null}
    </View>
  );
}

/** One zone to pick: its place, its offset (and why it's suggested), and its time now; the chosen one ticked. */
function ZoneRow({
  zone,
  meta,
  icon: Icon,
  now,
  chosen,
  onPick,
}: {
  zone: string;
  meta: string;
  icon?: LucideIcon;
  now: Date;
  chosen: boolean;
  onPick: (zone: string) => void;
}) {
  const words = useWords();
  const { colors } = useTheme();
  const time = dateIn(now, 'time', zone, words);
  return (
    <Row
      title={zonePlace(zone, words)}
      meta={meta}
      leading={Icon ? <Icon size={20} color={colors.foreground} aria-hidden /> : undefined}
      trailing={
        <View style={styles.trail}>
          <Body style={styles.time}>{time}</Body>
          {chosen ? <CheckIcon size={20} color={colors.foreground} aria-hidden /> : <View style={styles.noCheck} />}
        </View>
      }
      selected={chosen}
      onPress={() => onPick(zone)}
      accessibilityLabel={`${zonePlace(zone, words)}, ${meta}, ${time}`}
      testID={`zone-${zone}`}
    />
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: INSET },
  lists: { gap: SECTION_GAP },
  trail: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  time: { ...TABULAR },
  noCheck: { width: 20 },
});
