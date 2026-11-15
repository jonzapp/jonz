import type { ReactNode, RefObject } from 'react';
import { Modal, StyleSheet, View, type HostInstance } from 'react-native';

import { floatShadow, GROUP_RADIUS, SPACE, useTheme } from '@/theme';

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
 * A menu dropped over the page from what opened it: the title bar's "•••"
 * from WIDE, where a pointer can reach it (a phone opens those rows in a
 * Sheet), and a Select's list on any screen. The page's one thing that
 * floats, lifted by a soft shadow. A tap anywhere else puts it away, as a
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
