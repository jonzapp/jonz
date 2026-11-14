import { dateIn, findZones, offsetLabel, utcOffset, zoneChoices, zoneClock, zonePlace, type ZoneChoice } from '@app/core';
import { CheckIcon, ChevronRightIcon, MapPinIcon, SmartphoneIcon, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Alert } from '@/components/alert';
import { Hairline, useRowInset } from '@/components/group';
import { ListFoot } from '@/components/list-foot';
import { OutlineGroup } from '@/components/outline';
import { Row } from '@/components/row';
import { SearchBox } from '@/components/search-box';
import { Section } from '@/components/section';
import { Sheet } from '@/components/sheet';
import { Body, Meta, RowTitle } from '@/components/text';
import { Waiting } from '@/components/waiting';
import { useNow } from '@/hooks/use-now';
import { useTimeZones } from '@/hooks/use-time-zones';
import { useWords } from '@/hooks/use-words';
import { deviceTimeZone } from '@/locale';
import { INSET, ROW_GAP, ROW_MIN, SECTION_GAP, SPACE, TABULAR, useTheme } from '@/theme';

/** How many zones the list shows at first, and adds as you near its end. */
const PAGE = 60;

/**
 * The house's time zone as a row in the House group (Search by city, 14
 * Nov): "Time zone" with its offset and its time now under it, the place
 * ("London, United Kingdom") and a chevron. It opens the picker.
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
  const { colors } = useTheme();
  const inset = useRowInset();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const label = words('house.rules.timezone');
  const place = zonePlace(value, words);
  const clock = zoneClock(value, now, words);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${place}, ${clock}`}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => setOpen(true)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        testID="rules-timezone"
        style={[styles.field, { paddingHorizontal: inset }, pressed && { backgroundColor: colors.secondary }, disabled && styles.off]}
      >
        <Hairline />
        <View style={styles.fieldWords}>
          <RowTitle numberOfLines={1}>{label}</RowTitle>
          <Meta>{clock}</Meta>
        </View>
        <Body style={styles.fieldValue}>{place}</Body>
        <ChevronRightIcon size={20} color={colors.mutedForeground} aria-hidden />
      </Pressable>
      {problem ? (
        <View style={[styles.problem, { paddingHorizontal: inset }]}>
          <Alert message={problem} />
        </View>
      ) : null}
      <ZonePicker
        visible={open}
        value={value}
        onClose={() => setOpen(false)}
        onPick={(zone) => {
          setOpen(false);
          if (zone !== value) onChange(zone);
        }}
      />
    </>
  );
}

/**
 * The sheet of zones: a search box (a city, a country or its code), then
 * the zone set now and this phone's, then every zone A to Z, each with its
 * offset and its time now, so you can check it's the one. The list comes
 * from the database (public.time_zones()), read once.
 */
function ZonePicker({ visible, value, onClose, onPick }: { visible: boolean; value: string; onClose: () => void; onPick: (zone: string) => void }) {
  const words = useWords();
  const now = useNow();
  const zones = useTimeZones(visible);
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(PAGE);
  const choices = useMemo(() => zoneChoices(zones.data ?? [], { at: now, keep: value }, words), [zones.data, now, words, value]);
  const found = useMemo(() => findZones(choices, query), [choices, query]);
  const search = (next: string) => {
    setQuery(next);
    setCount(PAGE);
  };
  return (
    <Sheet
      visible={visible}
      title={words('house.rules.timezone')}
      description={words('house.zone.description')}
      onClose={onClose}
      onDismissed={() => search('')}
      onNearEnd={() => setCount((shown) => (shown < found.length ? shown + PAGE : shown))}
      flush
      testID="zone-picker"
    >
      <View style={styles.pad}>
        <SearchBox value={query} onChange={search} placeholder={words('house.zone.search')} testID="zone-search" />
      </View>
      <Waiting ready={zones.isSuccess} failed={zones.isError} onRetry={() => void zones.refetch()} outline={<OutlineGroup rows={6} lead="none" end />}>
        {() => (
          <View style={styles.lists}>
            {query.trim() ? null : <Suggested value={value} known={zones.data ?? []} now={now} onPick={onPick} />}
            <Found found={found} count={count} query={query} value={value} now={now} onPick={onPick} more={() => setCount(count + PAGE)} />
          </View>
        )}
      </Waiting>
    </Sheet>
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
  field: { minHeight: ROW_MIN, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, paddingVertical: SPACE.sm },
  fieldWords: { flexShrink: 0, maxWidth: '55%' },
  fieldValue: { flex: 1, minWidth: 0, textAlign: 'right' },
  off: { opacity: 0.5 },
  problem: { paddingBottom: INSET },
  pad: { paddingHorizontal: INSET },
  lists: { gap: SECTION_GAP },
  trail: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  time: { ...TABULAR },
  noCheck: { width: 20 },
});
