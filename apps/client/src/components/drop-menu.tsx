import { withAlpha } from '@app/core';
import type { ReactNode, RefObject } from 'react';
import { Modal, StyleSheet, View, type HostInstance } from 'react-native';

import { GROUP_RADIUS, SPACE, useTheme } from '@/theme';

/** How wide a dropped menu is beside the page. */
const MENU = 240;

/** Where a menu drops from: the bottom of what opened it, and how far its right edge is from the window's. */
export interface MenuPlace {
  top: number;
  right: number;
}

/** Measures what opens a menu, for the menu to drop from under it, its right edge on the opener's. */
export function measurePlace(opener: RefObject<HostInstance | null>, windowWidth: number, then: (place: MenuPlace) => void) {
  opener.current?.measureInWindow((x, y, w, h) => then({ top: y + h, right: windowWidth - x - w }));
}

/**
 * A menu dropped over the page from what opened it, from WIDE where a
 * pointer can reach it (a phone opens the same rows in a Sheet): the Table's
 * This week | October and the title bar's "•••". The page's one thing that
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
            {
              top: place.top + SPACE.xs,
              right: Math.max(place.right, SPACE.sm),
              borderColor: colors.border,
              boxShadow: `0 8px 24px ${withAlpha(scheme === 'dark' ? '#000000' : colors.foreground, scheme === 'dark' ? 0.5 : 0.16)}`,
            },
          ]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU,
    borderRadius: GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
