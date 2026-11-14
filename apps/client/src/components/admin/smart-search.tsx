import {
  applySuggestion,
  withAlpha,
  dropTag,
  listQueryFromParams,
  listQueryToParams,
  listSuggestions,
  listTags,
  type ListFacet,
  type ListQuery,
  type ListSuggestion,
  type ListWhen,
  type WhenPreset,
} from '@app/core';
import { ClockIcon, HistoryIcon, SearchIcon, TagIcon, XIcon, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputKeyPressEvent } from 'react-native';

import { authStorage } from '@/api/storage';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { useNow } from '@/hooks/use-now';
import { FONT, MARK_GAP, RADIUS, SEARCH_LINE, SPACE, TAP, useTheme } from '@/theme';

/** How long typing rests before the list is searched for it. */
const SETTLE = 400;
/** How many searches a list remembers on this device. */
const RECENT = 5;

const ICON: Record<ListSuggestion['kind'] | 'recent', LucideIcon> = {
  pick: TagIcon,
  when: ClockIcon,
  from: ClockIcon,
  words: SearchIcon,
  recent: HistoryIcon,
};

/** A remembered search: its address, and how it reads. */
interface Recent {
  params: Record<string, string>;
  label: string;
}

function readRecent(key: string): Recent[] {
  try {
    const saved: unknown = JSON.parse(authStorage?.getItem(key) ?? '[]');
    return Array.isArray(saved) ? (saved as Recent[]).slice(0, RECENT) : [];
  } catch {
    return [];
  }
}

/** Remembers a search that has something set, under how it reads. */
function remember(key: string, params: Record<string, string>, label: string) {
  if (Object.keys(params).length > 0) keepRecent(key, { params, label });
}

function keepRecent(key: string, recent: Recent) {
  try {
    const rest = readRecent(key).filter((r) => JSON.stringify(r.params) !== JSON.stringify(recent.params));
    authStorage?.setItem(key, JSON.stringify([recent, ...rest].slice(0, RECENT)));
  } catch {
    // Not remembered (private browsing, say): the search still runs.
  }
}

interface SmartSearchProps {
  /** The list is reading a new search: the box spins until it's in. */
  searching?: boolean;
  /** Typing is waiting to settle into a search (true), or has (false). */
  onPending?: (pending: boolean) => void;
  query: ListQuery;
  facets: readonly ListFacet[];
  onChange: (next: ListQuery) => void;
  placeholder: string;
  /** Where this list keeps its recent searches on this device. */
  recentKey: string;
  defaultWhen?: WhenPreset;
  /** What this list calls When, and whether a moment starts it. */
  when?: ListWhen;
  testID?: string;
}

/**
 * Every admin list's one search box. What's set shows as tags inside it
 * (Who: You, When: Today), each taken away by a tap, or the last one by
 * backspace. Typing searches the list's words as you go, and offers to turn
 * them into a filter instead: "me" offers Who: You, "del" What: Accounts,
 * "29 oct 23:30" a moment to start from. Tapping into the empty box lists
 * every filter there is and your recent searches, so nothing is hidden and
 * the common ones are a tap away. New kinds of filter join the suggestions
 * without another control on the page. The suggestions float over the list
 * under the box, so nothing moves as you type; on a laptop the arrow keys
 * move through them and Return takes the first. Words alone need no
 * suggestion (the list already searches them as you pause), so none shows.
 *
 * From the first key until the list's answer is in, the magnifying glass is
 * a spinner (docs/style/states.md, "Waiting": a spinner only in the control
 * that is busy), so you see at once that it heard you.
 */
export function SmartSearch({
  query,
  facets,
  onChange,
  placeholder,
  recentKey,
  defaultWhen = 'any',
  when = {},
  testID = 'smart-search',
  searching = false,
  onPending,
}: SmartSearchProps) {
  const { colors, type } = useTheme();
  const now = useNow();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [text, setText] = useState(query.q);
  // A search set from elsewhere (Clear, Show more like this) shows in the box.
  const [shownQ, setShownQ] = useState(query.q);
  if (shownQ !== query.q) {
    setShownQ(query.q);
    setText(query.q);
  }
  const [open, setOpen] = useState(false);
  const settle = useSettling(onPending);
  const [lit, setLit] = useState(0);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(closing.current ?? undefined), []);

  const whenLabel = when.label ?? 'When';
  const tags = listTags(query, facets, zone, defaultWhen, whenLabel);
  const suggestions = listSuggestions(text, facets, now, zone, when).filter((s) =>
    s.kind === 'pick' ? query.picks[s.key] !== s.value : s.kind === 'when' ? query.when !== s.when || query.from !== null : true,
  );
  const recent = text.trim() ? [] : readRecent(recentKey);

  function commit(next: ListQuery) {
    settle.stop();
    onChange(next);
    const tagsOf = listTags(next, facets, zone, defaultWhen, whenLabel);
    remember(recentKey, listQueryToParams(next, defaultWhen), [...tagsOf.map((tag) => tag.label), ...(next.q ? [`“${next.q}”`] : [])].join(', '));
  }

  function choose(suggestion: ListSuggestion) {
    const next = applySuggestion({ ...query, q: text }, suggestion);
    setText(next.q);
    setLit(0);
    commit(next);
    if (suggestion.kind === 'words') {
      setOpen(false);
      input.current?.blur();
    } else {
      // Keep typing: another filter, or the words.
      input.current?.focus();
    }
  }

  function typing(next: string) {
    setText(next);
    setLit(0);
    setOpen(true);
    // The list follows the words as you type, once you pause.
    settle.start(() => onChange({ ...query, q: next.trim() }));
  }

  function onKey(e: TextInputKeyPressEvent) {
    const key = e.nativeEvent.key;
    if (key === 'Backspace' && text === '' && tags.length > 0) commit(dropTag(query, tags[tags.length - 1].key, defaultWhen));
    else if (key === 'Escape') setOpen(false);
    else if ((key === 'ArrowDown' && suggestions.length > 0) || key === 'ArrowUp') {
      e.preventDefault();
      setLit((n) => (key === 'ArrowDown' ? Math.min(n + 1, suggestions.length - 1) : Math.max(n - 1, 0)));
    }
  }

  function submit() {
    const best = suggestions[lit];
    if (text.trim() && best) choose(best);
    else {
      commit({ ...query, q: text.trim() });
      setOpen(false);
    }
  }

  function again(recentParams: Record<string, string>) {
    const choices = Object.fromEntries(facets.map((facet) => [facet.key, facet.options.map((option) => option.value)]));
    const next = listQueryFromParams(recentParams, choices, defaultWhen);
    setText(next.q);
    commit(next);
    setOpen(false);
    input.current?.blur();
  }

  return (
    <View style={styles.wrap} testID={testID}>
      <Pressable
        accessible={false}
        onPress={() => input.current?.focus()}
        style={[
          styles.box,
          { backgroundColor: colors.card, borderColor: open ? colors.foreground : colors.mutedForeground },
          open && styles.boxOpen,
        ]}
      >
        <BoxIcon busy={settle.pending || searching} testID={testID} />
        <Tags tags={tags} onDrop={(key) => commit(dropTag(query, key, defaultWhen))} testID={testID} />
        <TextInput
          ref={input}
          value={text}
          onChangeText={typing}
          onKeyPress={onKey}
          onSubmitEditing={submit}
          onFocus={() => {
            if (closing.current) clearTimeout(closing.current);
            setOpen(true);
          }}
          // Later than a tap on a suggestion, which takes the focus away first.
          onBlur={() => {
            closing.current = setTimeout(() => setOpen(false), 200);
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={placeholder}
          aria-expanded={open}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          enterKeyHint="search"
          style={[styles.input, { fontFamily: type.body.fontFamily, fontSize: type.body.fontSize, color: colors.foreground }]}
          testID={`${testID}-input`}
        />
      </Pressable>
      {open && (!text.trim() || suggestions.some((s) => s.kind !== 'words')) ? (
        <Suggestions
          typed={text.trim() !== ''}
          suggestions={suggestions}
          recent={recent}
          filters={[...facets.map((facet) => ({ key: facet.key, label: facet.label })), { key: null, label: whenLabel }]}
          lit={lit}
          onChoose={choose}
          onAgain={again}
          testID={testID}
        />
      ) : null}
    </View>
  );
}

/** The pause after typing before the list is searched: `start` waits and then runs, `stop` gives up waiting. */
function useSettling(onPending?: (pending: boolean) => void) {
  // Typed, not yet searched: the pause before the list asks.
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const settled = () => {
    setPending(false);
    onPending?.(false);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (timer.current) settled();
    timer.current = null;
  };
  const start = (then: () => void) => {
    stop();
    setPending(true);
    onPending?.(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      settled();
      then();
    }, SETTLE);
  };
  return { pending, start, stop };
}

/** What's set, as tags inside the box, each taken away by a tap. */
function Tags({ tags, onDrop, testID }: { tags: ReturnType<typeof listTags>; onDrop: (key: string) => void; testID: string }) {
  const { colors, type } = useTheme();
  return (
    <>
      {tags.map((tag) => (
        <Pressable
          key={tag.key}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${tag.label}`}
          onPress={() => onDrop(tag.key)}
          style={[styles.tag, { backgroundColor: colors.secondary }]}
          testID={`${testID}-tag-${tag.key}`}
        >
          <Text numberOfLines={1} style={[type.body, styles.tagText, { color: colors.foreground }]}>
            {tag.label}
          </Text>
          <XIcon size={16} strokeWidth={3} color={colors.mutedForeground} aria-hidden />
        </Pressable>
      ))}
    </>
  );
}

/**
 * The suggestions, floating over the list under the box. With something
 * typed (`typed`), one list, the lit one tinted; with nothing typed, recent
 * searches, then every filter's choices under its name (`filters`, When's
 * with a null key).
 */
function Suggestions({
  typed,
  suggestions,
  recent,
  filters,
  lit,
  onChoose,
  onAgain,
  testID,
}: {
  typed: boolean;
  suggestions: ListSuggestion[];
  recent: Recent[];
  filters: { key: string | null; label: string }[];
  lit: number;
  onChoose: (suggestion: ListSuggestion) => void;
  onAgain: (params: Record<string, string>) => void;
  testID: string;
}) {
  const { colors, scheme } = useTheme();
  /** A suggestion's row. Under its filter's name, with nothing typed, it's the choice alone: You, under Who. */
  const row = (s: ListSuggestion, i: number | null, under?: string) => (
    <Row
      key={`${s.kind}-${s.label}`}
      title={under && s.label.startsWith(`${under}: `) ? s.label.slice(under.length + 2) : s.label}
      leading={<SuggestionIcon icon={ICON[s.kind]} />}
      tint={i !== null && i === lit && Platform.OS === 'web'}
      onPress={() => onChoose(s)}
      testID={`${testID}-suggestion-${s.kind === 'pick' ? `${s.key}-${s.value}` : s.kind === 'when' ? `when-${s.when}` : s.kind}`}
    />
  );
  const groups = filters
    .map((f) => ({ label: f.label, items: suggestions.filter((s) => (f.key === null ? s.kind === 'when' : s.kind === 'pick' && s.key === f.key)) }))
    .filter((group) => group.items.length > 0);
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          // It floats over the list, as a PickMenu does: a soft shadow lifts it off the rows.
          boxShadow: `0 8px 24px ${withAlpha(scheme === 'dark' ? '#000000' : colors.foreground, scheme === 'dark' ? 0.5 : 0.16)}`,
        },
      ]}
      testID={`${testID}-panel`}
    >
      {typed ? (
        <Group>{suggestions.map((s, i) => row(s, i))}</Group>
      ) : (
        <>
          {recent.length > 0 ? (
            <Section label="Recent">
              <Group>
                {recent.map((r) => (
                  <Row key={r.label} title={r.label} leading={<SuggestionIcon icon={ICON.recent} />} onPress={() => onAgain(r.params)} testID={`${testID}-recent`} />
                ))}
              </Group>
            </Section>
          ) : null}
          {groups.map((group) => (
            <Section key={group.label} label={group.label}>
              <Group>{group.items.map((s) => row(s, null, group.label))}</Group>
            </Section>
          ))}
        </>
      )}
    </View>
  );
}

/** The box's magnifying glass: a spinner from the first key until the list's answer is in. */
function BoxIcon({ busy, testID }: { busy: boolean; testID: string }) {
  const { colors } = useTheme();
  if (busy) return <ActivityIndicator size={20} color={colors.foreground} aria-hidden testID={`${testID}-spinner`} />;
  return <SearchIcon size={20} color={colors.mutedForeground} aria-hidden />;
}

function SuggestionIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { colors } = useTheme();
  return <Icon size={20} color={colors.mutedForeground} aria-hidden />;
}

const styles = StyleSheet.create({
  // Above the list, which the suggestions float over.
  wrap: { gap: SPACE.sm, zIndex: 2 },
  box: {
    minHeight: TAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACE.sm,
    borderWidth: 1,
    borderRadius: RADIUS,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
  },
  // Two points of ink while you type in it, so the box you're in is plain; the padding gives the point back.
  boxOpen: { borderWidth: 2, paddingHorizontal: SPACE.md - 1, paddingVertical: SPACE.xs - 1 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    minHeight: 32,
    paddingLeft: SPACE.sm,
    paddingRight: MARK_GAP,
    borderRadius: RADIUS,
    maxWidth: '100%',
  },
  tagText: { fontFamily: FONT.bold, flexShrink: 1 },
  // The box draws the focus (two points of ink), so the field inside it draws none of its own on the web
  // (a browser's `auto` ring ignores its width, hence solid). It fits beside two tags on a phone, and grows.
  input: { flexGrow: 1, flexBasis: 48, minWidth: 48, minHeight: 36, paddingVertical: 0, outlineStyle: 'solid', outlineWidth: 0 },
  // Under the box and the search line beneath it, the box's width, over the rows.
  panel: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: SPACE.sm + SEARCH_LINE,
    gap: SPACE.lg,
    padding: SPACE.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS,
  },
});
