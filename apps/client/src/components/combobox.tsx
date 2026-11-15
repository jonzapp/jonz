import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type HostInstance } from 'react-native';

import { Alert } from '@/components/alert';
import { DropMenu, placeFloat, type MenuPlace } from '@/components/drop-menu';
import { FieldLabel } from '@/components/field';
import { nearEnd } from '@/components/near-end';
import { SearchBox } from '@/components/search-box';
import { SelectBox } from '@/components/select';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { INSET, SPACE, useTheme, WIDE } from '@/theme';

/** How wide a dropped Combobox is at least, and the most of the window it takes before it scrolls. */
const COMBO_MIN = 420;
const COMBO_TALL = 440;

/** The search at a Combobox's top: what's typed, and its placeholder, which is its spoken name. */
export interface ComboSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testID?: string;
}

/**
 * Type to search, then pick one from a long list (shadcn's Combobox; the
 * house's time zone): the same box as a Select, with its name over it and
 * `hint` under it. On a laptop it drops a card from the box (over it, near
 * the window's foot, as a Select's list), a search at its top and the list
 * under it; on a phone the same opens as a sheet,
 * titled with the name and `description`. `children` draws the list, given
 * a way to put it away once one is picked; `onNearEnd` shows more of it as
 * a scroll nears the end. `testID` names the box, `listTestID` the sheet or
 * the dropped card.
 */
export function Combobox({
  label,
  shown,
  hint,
  problem,
  disabled = false,
  search,
  description,
  onNearEnd,
  testID,
  listTestID,
  children,
}: {
  label: string;
  shown: string;
  hint?: string;
  problem?: string;
  disabled?: boolean;
  search: ComboSearch;
  description?: string;
  onNearEnd?: () => void;
  testID?: string;
  listTestID?: string;
  children: (close: () => void) => ReactNode;
}) {
  const win = useWindowDimensions();
  const wide = win.width >= WIDE;
  const box = useRef<HostInstance>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const close = () => {
    setOpen(false);
    setPlace(null);
    search.onChange('');
  };
  const show = () => {
    if (!wide) {
      setOpen(true);
      return;
    }
    placeFloat(box, { win, least: COMBO_MIN, most: COMBO_TALL }, (at) => {
      setPlace(at);
      setOpen(true);
    });
  };
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <SelectBox boxRef={box} label={hint ? `${label}, ${hint}` : label} shown={shown} open={open} onPress={show} disabled={disabled} testID={testID} />
      {problem ? <Alert message={problem} /> : hint ? <Meta>{hint}</Meta> : null}
      {wide ? (
        open && place ? (
          <DropMenu place={place} onClose={close} label={label} testID={listTestID ? `${listTestID}-drop` : undefined}>
            <Dropped search={search} onNearEnd={onNearEnd} testID={listTestID}>
              {children(close)}
            </Dropped>
          </DropMenu>
        ) : null
      ) : (
        <Sheet visible={open} title={label} description={description} onClose={close} onNearEnd={onNearEnd} flush testID={listTestID}>
          <View style={styles.pad}>
            <SearchBox {...search} />
          </View>
          {children(close)}
        </Sheet>
      )}
    </View>
  );
}

/** The dropped card: the search, then the list, scrolling under it. */
function Dropped({ search, onNearEnd, testID, children }: { search: ComboSearch; onNearEnd?: () => void; testID?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.dropped, { backgroundColor: colors.popover }]}>
      <View style={styles.pad}>
        <SearchBox {...search} />
      </View>
      <ScrollView scrollEventThrottle={onNearEnd ? 200 : undefined} onScroll={nearEnd(onNearEnd)} contentContainerStyle={styles.scrolled}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  pad: { paddingHorizontal: INSET },
  dropped: { flexShrink: 1, paddingTop: INSET, gap: SPACE.sm },
  scrolled: { paddingBottom: INSET },
});
