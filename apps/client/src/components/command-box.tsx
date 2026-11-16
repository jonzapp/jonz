import { SearchIcon } from 'lucide-react-native';
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type HostInstance, type TextInputKeyPressEvent } from 'react-native';

import { Kbd } from '@/components/kbd';
import { LidBar } from '@/components/lid';
import { SheetRailContext } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { floatShadow, FONT, GROUP_RADIUS, INSET, pressTint, scrim, SHEET_RADIUS, SPACE, TAP, useTheme } from '@/theme';

/** How wide the box is, as wide as a sheet; how far down the window it sits; and the most its list takes before it scrolls. */
const BOX_WIDTH = 512;
const BOX_TOP = '14%';
const LIST_TALL = 400;

/** One thing the box finds: its leading icon or face, its name, what sets it apart (after a kind's lid bar), and what picking it does. */
export interface CommandHit {
  key: string;
  leading: ReactNode;
  title: string;
  meta?: string;
  /** A John's kind colour, drawn before `meta` as a Row draws it. */
  lid?: string;
  go: () => void;
}

/** The hits of one kind (Johns, housemates, pages) under their name. */
export interface CommandGroup {
  label: string;
  hits: readonly CommandHit[];
}

/**
 * The command box (shadcn's Command): type to find anything, then ↑ ↓ and
 * Enter to open it, or click it. Its search at the top with Esc at its end,
 * what it finds under it in named groups, the one it will open tinted as a
 * row is under the mouse, and the keys at its foot. `none` is said when
 * nothing matches. A screen reader hears a combobox and its list of
 * options, the tinted one as the current one. Floats in a `CommandBox`;
 * the style page draws it on the page.
 */
export function CommandCard({
  query,
  onQuery,
  groups,
  placeholder,
  none,
  onClose,
  autoFocus = true,
}: {
  query: string;
  onQuery: (query: string) => void;
  groups: readonly CommandGroup[];
  placeholder: string;
  none: string;
  onClose: () => void;
  /** Its search takes the keys as it opens; not where it's drawn on a page (the style page). */
  autoFocus?: boolean;
}) {
  const words = useWords();
  const { colors, type } = useTheme();
  const list = useId();
  // The tinted hit belongs to what was typed: typing more starts again at the top.
  const [pick, setPick] = useState({ query, at: 0 });
  const at = pick.query === query ? pick.at : 0;
  const hits = groups.flatMap((group) => group.hits);
  const move = (by: number) => setPick({ query, at: Math.min(Math.max(at + by, 0), Math.max(hits.length - 1, 0)) });
  const onKey = (event: TextInputKeyPressEvent) => {
    const key = event.nativeEvent.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      move(key === 'ArrowDown' ? 1 : -1);
    } else if (key === 'Enter') hits[at]?.go();
    else if (key === 'Escape') onClose();
  };
  const optionId = (index: number) => `${list}-${index}`;
  return (
    <View style={[styles.card, { backgroundColor: colors.popover }]} testID="command-card">
      <View style={[styles.search, { borderBottomColor: colors.border }]}>
        <SearchIcon size={20} color={colors.mutedForeground} aria-hidden />
        <TextInput
          autoFocus={autoFocus}
          value={query}
          onChangeText={onQuery}
          onKeyPress={onKey}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={placeholder}
          role="combobox"
          aria-expanded
          {...({ 'aria-controls': list, 'aria-autocomplete': 'list', 'aria-activedescendant': hits.length ? optionId(at) : undefined } as object)}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { fontFamily: type.body.fontFamily, fontSize: type.body.fontSize, color: colors.foreground }]}
          testID="command-input"
        />
        <Kbd>{words('common.keys.esc')}</Kbd>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <View nativeID={list} {...({ role: 'listbox' } as object)} aria-label={placeholder}>
          {hits.length === 0 ? <Meta style={styles.none}>{none}</Meta> : null}
          {groups.map((group) => {
            const first = hits.indexOf(group.hits[0]!);
            return group.hits.length === 0 ? null : (
              <View key={group.label} role="group" aria-label={group.label}>
                <Text aria-hidden style={[type.meta, styles.label, { color: colors.mutedForeground }]}>
                  {group.label}
                </Text>
                {group.hits.map((hit, i) => (
                  <Hit key={hit.key} hit={hit} id={optionId(first + i)} active={first + i === at} onHover={() => setPick({ query, at: first + i })} />
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
      {Platform.OS === 'web' ? <Keys /> : null}
    </View>
  );
}

/** One line of the list: tinted while it's the one Enter opens, kept in view as the arrows move it. */
function Hit({ hit, id, active, onHover }: { hit: CommandHit; id: string; active: boolean; onHover: () => void }) {
  const { colors, type } = useTheme();
  const line = useRef<HostInstance>(null);
  useEffect(() => {
    if (active && Platform.OS === 'web') (line.current as unknown as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  return (
    <Pressable
      ref={line}
      nativeID={id}
      role="option"
      aria-selected={active}
      accessibilityLabel={hit.meta ? `${hit.title}, ${hit.meta}` : hit.title}
      onPress={hit.go}
      onHoverIn={onHover}
      testID={`command-hit-${hit.key}`}
      style={[styles.hit, active && { backgroundColor: pressTint(colors) }]}
    >
      <View style={styles.lead}>{hit.leading}</View>
      <Text style={[type.body, styles.title, { color: colors.foreground }]}>{hit.title}</Text>
      {hit.meta ? (
        <View style={styles.meta}>
          {hit.lid ? <LidBar lid={hit.lid} /> : null}
          <Meta>{hit.meta}</Meta>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The card's foot: the keys that work in it. */
function Keys() {
  const words = useWords();
  const { colors } = useTheme();
  return (
    <View aria-hidden style={[styles.foot, { borderTopColor: colors.border }]}>
      <Kbd>{words('common.keys.up')}</Kbd>
      <Kbd>{words('common.keys.down')}</Kbd>
      <Meta style={styles.hint}>{words('common.command.move')}</Meta>
      <Kbd>{words('common.keys.enter')}</Kbd>
      <Meta style={styles.hint}>{words('common.command.open')}</Meta>
      <Kbd>{words('common.keys.esc')}</Kbd>
      <Meta>{words('common.command.close')}</Meta>
    </View>
  );
}

/**
 * Where the command box floats while it's open: over the page, high up and
 * in the middle of it beside the rail, the page dimmed behind it as behind
 * a sheet. A click beside it or Esc puts it away. `label` is what a screen
 * reader calls it.
 */
export function CommandBox({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const { colors, scheme } = useTheme();
  const rail = useContext(SheetRailContext);
  // A closed react-native-web Modal holds on to focus until it has gone, as a Sheet's does: so a closed box goes at once.
  if (!open) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} aria-label={label}>
      <View style={[styles.fill, { paddingLeft: rail }]}>
        <View
          aria-hidden
          onStartShouldSetResponder={() => true}
          onResponderRelease={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: scrim(colors, scheme) }]}
          testID="command-scrim"
        />
        <View
          role="dialog"
          aria-label={label}
          accessibilityViewIsModal
          testID="command-box"
          style={[styles.box, { borderColor: colors.border, boxShadow: floatShadow(colors, scheme) }]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingTop: BOX_TOP, paddingHorizontal: INSET, alignItems: 'center', pointerEvents: 'box-none' },
  box: { width: '100%', maxWidth: BOX_WIDTH, borderWidth: StyleSheet.hairlineWidth, borderRadius: SHEET_RADIUS, overflow: 'hidden' },
  card: { flexShrink: 1 },
  search: { minHeight: TAP + SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: INSET, borderBottomWidth: StyleSheet.hairlineWidth },
  // The card draws no focus of its own: the tinted line is where the keys are.
  input: { flex: 1, minWidth: 0, minHeight: TAP, paddingVertical: 0, outlineStyle: 'solid', outlineWidth: 0 },
  scroll: { maxHeight: LIST_TALL },
  list: { padding: SPACE.xs },
  label: { fontFamily: FONT.bold, paddingHorizontal: SPACE.md, paddingTop: SPACE.md, paddingBottom: SPACE.xs },
  none: { padding: SPACE.xl, textAlign: 'center' },
  hit: { minHeight: TAP, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: GROUP_RADIUS - SPACE.xs },
  lead: { width: SPACE.xl, alignItems: 'center' },
  title: { flex: 1, minWidth: 0 },
  meta: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.xs, paddingHorizontal: INSET, paddingVertical: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth },
  hint: { marginRight: SPACE.sm },
});
