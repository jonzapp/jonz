import { useState, type ReactNode, type RefObject } from 'react';
import { Modal, StyleSheet, useWindowDimensions, View, type HostInstance } from 'react-native';

import { measureBox } from '@/components/measure-box';
import { floatShadow, GROUP_RADIUS, SPACE, useTheme, WIDE } from '@/theme';

/** How wide a dropped menu is beside the page. */
const MENU = 240;

/**
 * Where a menu floats: under what opened it (`top`, its bottom edge) or over
 * it (`bottom`, its top edge counted from the window's foot), its right edge
 * on the opener's (`right`, from the window's) or its left (`left`); `width`
 * when not the menu's own, and `tall`, the most it may take before it scrolls.
 */
export type MenuPlace = ({ top: number; bottom?: never } | { bottom: number; top?: never }) &
  ({ right: number; left?: never } | { left: number; right?: never }) & { width?: number; tall?: number };

/** Measures what opens a menu, for the menu to drop from under it, its right edge on the opener's. */
export function measurePlace(opener: RefObject<HostInstance | null>, windowWidth: number, then: (place: MenuPlace) => void) {
  opener.current?.measureInWindow((x, y, w, h) => then({ top: y + h, right: windowWidth - x - w }));
}

/**
 * How something floats from its box: the window; the most of it the thing
 * takes before it scrolls; the least it is wide (`least`, else the box's
 * width) or just how wide it is (`width`); and `end` for its right edge on
 * the box's rather than its left.
 */
export interface FloatFit {
  win: { width: number; height: number };
  most: number;
  least?: number;
  width?: number;
  end?: boolean;
}

/**
 * Where a Select's list, a Combobox's card or a Popover floats from its
 * box: under it, or over it when there's more room there, kept inside the
 * window.
 */
export function placeFloat(box: RefObject<HostInstance | null>, fit: FloatFit, then: (place: MenuPlace) => void) {
  const { win, most, least = 0, end = false } = fit;
  measureBox(box, ({ x, y, width: w, height: h }) => {
    const width = fit.width ?? Math.max(w, least);
    const side = end ? { right: win.width - x - w } : { left: width > w ? Math.min(x, win.width - width - SPACE.lg) : x };
    const below = win.height - (y + h) - SPACE.lg;
    const above = y - SPACE.lg;
    const tall = Math.min(most, Math.max(below, above));
    then(below >= Math.min(most, above) ? { top: y + h, ...side, width, tall } : { bottom: win.height - y, ...side, width, tall });
  });
}

/**
 * Whether a card that floats from `box` on a laptop, and is a sheet on a
 * phone, is open, and where it floats (placed by placeFloat with `fit`):
 * a Popover's and a DateField's. `show` opens it, `close` puts it away.
 */
export function useFloatOrSheet(box: RefObject<HostInstance | null>, fit: Omit<FloatFit, 'win'>) {
  const win = useWindowDimensions();
  const wide = win.width >= WIDE;
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const show = () => {
    if (!wide) {
      setOpen(true);
      return;
    }
    placeFloat(box, { ...fit, win }, (at) => {
      setPlace(at);
      setOpen(true);
    });
  };
  const close = () => {
    setOpen(false);
    setPlace(null);
  };
  return { wide, open, place, show, close };
}

/**
 * A menu dropped over the page from what opened it: the title bar's "•••"
 * from WIDE, where a pointer can reach it (a phone opens those rows in a
 * Sheet), a Select's list on any screen, and a Popover on a laptop. The
 * page's one thing that floats, lifted by a soft shadow. A tap anywhere else puts it away, as a
 * sheet's scrim does, and so does Escape.
 */
export function DropMenu({
  place,
  onClose,
  label,
  children,
  testID,
}: {
  place: MenuPlace;
  onClose: () => void;
  label?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { colors, scheme } = useTheme();
  // On the web a closed react-native-web Modal holds on to focus until it has gone, as the Sheet's does, so a closed menu goes at once: the caller drops it.
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} aria-label={label}>
      <View style={StyleSheet.absoluteFill}>
        <View
          aria-hidden
          onStartShouldSetResponder={() => true}
          onResponderRelease={onClose}
          style={StyleSheet.absoluteFill}
          testID={testID ? `${testID}-away` : undefined}
        />
        <View
          testID={testID ? `${testID}-menu` : undefined}
          style={[
            styles.menu,
            at(place),
            { borderColor: colors.border, boxShadow: floatShadow(colors, scheme) },
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** The menu's edges in the window: a little clear of what opened it, never against the window's side. */
function at(place: MenuPlace) {
  return {
    top: place.top === undefined ? undefined : place.top + SPACE.xs,
    bottom: place.bottom === undefined ? undefined : place.bottom + SPACE.xs,
    right: place.right === undefined ? undefined : Math.max(place.right, SPACE.sm),
    left: place.left === undefined ? undefined : Math.max(place.left, SPACE.sm),
    width: place.width ?? MENU,
    maxHeight: place.tall,
  };
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    borderRadius: GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
