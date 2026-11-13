import { useRef } from 'react';
import { useWindowDimensions } from 'react-native';

import type { ButtonIcon } from '@/components/button';
import { DropMenu, type MenuPlace } from '@/components/drop-menu';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Sheet } from '@/components/sheet';
import { useTheme, WIDE } from '@/theme';

/** One thing a screen's menu can do. `tone="hazard"` for one that strikes something out. */
export interface MenuAction {
  label: string;
  icon?: ButtonIcon;
  onPress: () => void;
  tone?: 'ink' | 'hazard';
  testID?: string;
}

/**
 * The "•••" menu (TitleBar's MoreButton opens it): one row per action, in a
 * small sheet on a phone and, from WIDE, dropped from the "•••" over the page
 * (`place`, from MoreButton), as the Table's This week | October is. Choosing one puts the menu away, and the action runs once the
 * menu has gone (on iOS, when its slide out ends), so an action that opens a
 * sheet of its own (a confirm) never meets this one on its way out.
 */
export function ActionMenu({
  visible,
  onClose,
  actions,
  place,
  testID,
}: {
  visible: boolean;
  /** Where the "•••" is, to drop from it from WIDE; without it the menu is a sheet. */
  place?: MenuPlace | null;
  onClose: () => void;
  actions: readonly MenuAction[];
  testID?: string;
}) {
  const { colors } = useTheme();
  const width = useWindowDimensions().width;
  const chosen = useRef<(() => void) | null>(null);

  function dismissed() {
    const run = chosen.current;
    chosen.current = null;
    run?.();
  }

  const drops = width >= WIDE && place != null;
  const rows = (
    <Group>
      {actions.map(({ label, icon: Icon, onPress, tone = 'ink', testID: actionID }) => (
        <Row
          key={label}
          title={label}
          tone={tone}
          leading={Icon ? <Icon size={24} color={tone === 'hazard' ? colors.hazard : colors.foreground} aria-hidden /> : undefined}
          onPress={() => {
            if (drops) {
              // Nothing slides out of the way, so the action runs as the menu goes.
              onClose();
              onPress();
              return;
            }
            chosen.current = onPress;
            onClose();
          }}
          testID={actionID}
        />
      ))}
    </Group>
  );
  if (drops)
    return visible ? (
      <DropMenu place={place} onClose={onClose} testID={testID}>
        {rows}
      </DropMenu>
    ) : null;
  return (
    <Sheet visible={visible} onClose={onClose} onDismissed={dismissed} flush testID={testID}>
      {rows}
    </Sheet>
  );
}
