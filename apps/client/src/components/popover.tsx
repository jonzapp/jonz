import { useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View, type HostInstance } from 'react-native';

import { DropMenu, useFloatOrSheet } from '@/components/drop-menu';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { SPACE, useTheme } from '@/theme';

/** How wide a popover is, and the most of the window it takes before it scrolls. */
const POP_WIDTH = 380;
const POP_TALL = 560;

/**
 * Explains a number or a rule in a few lines, opened from what you tapped
 * (shadcn's Popover). On a laptop a small card floats beside it, its right
 * edge on the opener's, under it or over it near the window's foot, with a
 * soft shadow; on a phone the same opens as a sheet. `title` and
 * `description` head it, then `children`. `opener` draws what opens it,
 * given a way to open it and whether it's open. A tap anywhere else or
 * Escape puts it away. `testID` names the sheet or the card.
 */
export function Popover({
  title,
  description,
  opener,
  children,
  testID,
}: {
  title: string;
  description?: string;
  opener: (open: () => void, isOpen: boolean) => ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const win = useWindowDimensions();
  const box = useRef<HostInstance>(null);
  const { wide, open, place, show, close } = useFloatOrSheet(box, { most: POP_TALL, width: Math.min(POP_WIDTH, win.width - 2 * SPACE.lg), end: true });
  return (
    <>
      <View ref={box} collapsable={false}>
        <Opener draw={opener} open={show} isOpen={open} />
      </View>
      {wide ? (
        open && place ? (
          <DropMenu place={place} onClose={close} label={title} testID={testID}>
            <PopoverCard title={title} description={description} testID={testID}>
              {children}
            </PopoverCard>
          </DropMenu>
        ) : null
      ) : (
        <Sheet visible={open} title={title} description={description} onClose={close} flush testID={testID}>
          {children}
        </Sheet>
      )}
    </>
  );
}

/** What opens a popover, drawn by its caller. */
function Opener({ draw, open, isOpen }: { draw: (open: () => void, isOpen: boolean) => ReactNode; open: () => void; isOpen: boolean }) {
  return draw(open, isOpen);
}

/** The card a popover is on a laptop: its title and description over what it explains, scrolling when there's more than fits. */
function PopoverCard({ title, description, testID, children }: { title: string; description?: string; testID?: string; children: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.popover }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={type.rowTitle}>
            {title}
          </Text>
          {description ? <Meta>{description}</Meta> : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexShrink: 1 },
  body: { paddingVertical: SPACE.lg, gap: SPACE.md },
  head: { gap: SPACE.xs, paddingHorizontal: SPACE.lg },
});
